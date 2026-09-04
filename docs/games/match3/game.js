(() => {
  const COLS = 8;
  const ROWS = 8;
  const COLORS = [0xff5d8f, 0x6c8cff, 0x7ef0c3, 0xffd166, 0xb967ff];
  const GOAL = 1000;
  const START_MOVES = 30;
  const SWAP_MS = 140;
  const CLEAR_MS = 160;
  const FALL_BASE = 180;
  const SWIPE_MIN = 24;

  const scoreEl = document.getElementById("score");
  const movesEl = document.getElementById("moves");
  const goalEl = document.getElementById("goal");
  const overlayEl = document.getElementById("game-overlay");
  const overlayTitle = document.getElementById("overlay-title");
  const overlaySub = document.getElementById("overlay-sub");

  if (goalEl) goalEl.textContent = String(GOAL);

  let gameRef = null;
  let sceneRef = null;
  let resetGen = 0;

  function sfx(name) {
    if (window.PlayHubAudio) window.PlayHubAudio.play(name);
  }

  function unlockAudio() {
    if (window.PlayHubAudio) window.PlayHubAudio.unlock();
  }

  function hideOverlay() {
    if (!overlayEl) return;
    overlayEl.hidden = true;
    overlayEl.setAttribute("aria-hidden", "true");
  }

  function showEndOverlay(won, score) {
    if (!overlayEl || !overlayTitle || !overlaySub) return;
    overlayTitle.textContent = won ? "목표 달성!" : "이동 종료";
    overlaySub.textContent = "점수 " + score;
    overlayEl.hidden = false;
    overlayEl.setAttribute("aria-hidden", "false");
  }

  class Match3Scene extends Phaser.Scene {
    constructor() {
      super("Match3");
      this.grid = [];
      this.gems = [];
      this.score = 0;
      this.movesLeft = START_MOVES;
      this.busy = false;
      this.selected = null;
      this.cell = 0;
      this.pad = 4;
      this.originX = 0;
      this.originY = 0;
      this.ended = false;
      this.gen = 0;
      this._dragFrom = null;
      this._dragPointerId = null;
      this._sx = 0;
      this._sy = 0;
    }

    create() {
      sceneRef = this;
      this.gen = resetGen;

      const W = this.scale.width;
      const H = this.scale.height;
      const boardW = Math.min(W, H) - 16;
      this.cell = Math.floor((boardW - this.pad * (COLS + 1)) / COLS);
      const size = this.cell * COLS + this.pad * (COLS + 1);
      this.originX = (W - size) / 2;
      this.originY = (H - size) / 2;

      this.add
        .rectangle(W / 2, H / 2, size + 8, size + 8, 0x171c33)
        .setStrokeStyle(2, 0x44507a);

      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const p = this.pos(r, c);
          this.add.rectangle(
            p.x,
            p.y,
            this.cell,
            this.cell,
            (r + c) % 2 ? 0x222a45 : 0x1c233b
          );
        }
      }

      this.input.on("pointerdown", () => unlockAudio());

      this.newGame(false);
    }

    pos(r, c) {
      return {
        x: this.originX + this.pad + c * (this.cell + this.pad) + this.cell / 2,
        y: this.originY + this.pad + r * (this.cell + this.pad) + this.cell / 2,
      };
    }

    randColor(a, b) {
      let v;
      do {
        v = Phaser.Math.Between(0, COLORS.length - 1);
      } while (v === a || v === b);
      return v;
    }

    makeGem(r, c, color) {
      const p = this.pos(r, c);
      const g = this.add
        .circle(p.x, p.y, this.cell * 0.38, COLORS[color], 1)
        .setStrokeStyle(2, 0xffffff44)
        .setData("r", r)
        .setData("c", c)
        .setData("color", color)
        .setInteractive({ useHandCursor: true });

      const shine = this.add.circle(
        p.x - this.cell * 0.12,
        p.y - this.cell * 0.12,
        this.cell * 0.1,
        0xffffff,
        0.35
      );
      g.shine = shine;

      g.on("pointerdown", (pointer) => this.onGemPointerDown(g, pointer));
      g.on("pointerup", (pointer) => this.onGemPointerUp(g, pointer));
      g.on("pointerover", () => {
        if (!this.busy && !this.ended && this._dragFrom) g.setScale(1.05);
      });
      g.on("pointerout", () => {
        if (
          this.selected &&
          this.selected.r === g.getData("r") &&
          this.selected.c === g.getData("c")
        ) {
          return;
        }
        if (g.active) g.setScale(1);
      });

      return g;
    }

    onGemPointerDown(gem, pointer) {
      if (this.busy || this.ended || !gem.active) return;
      const cell = { r: gem.getData("r"), c: gem.getData("c") };
      this._dragFrom = cell;
      this._dragPointerId = pointer.id;
      this._sx = pointer.x;
      this._sy = pointer.y;

      if (this.selected) {
        if (this.selected.r === cell.r && this.selected.c === cell.c) {
          this.clearSelect();
          return;
        }
        if (this.isAdjacent(this.selected, cell)) {
          const a = this.selected;
          this.clearSelect();
          this._dragFrom = null;
          this.trySwap(a, cell);
          return;
        }
      }
      this.select(cell);
    }

    onGemPointerUp(gem, pointer) {
      if (this.busy || this.ended || !gem.active) return;
      if (!this._dragFrom) return;
      if (this._dragPointerId != null && pointer.id !== this._dragPointerId) return;

      const from = this._dragFrom;
      const to = { r: gem.getData("r"), c: gem.getData("c") };
      const dx = pointer.x - this._sx;
      const dy = pointer.y - this._sy;
      this._dragFrom = null;
      this._dragPointerId = null;

      if (from.r === to.r && from.c === to.c) {
        // Directional swipe from the selected/start gem onto empty board space.
        if (Math.hypot(dx, dy) >= SWIPE_MIN) {
          const dir =
            Math.abs(dx) > Math.abs(dy)
              ? dx > 0
                ? { r: 0, c: 1 }
                : { r: 0, c: -1 }
              : dy > 0
                ? { r: 1, c: 0 }
                : { r: -1, c: 0 };
          const nbr = { r: from.r + dir.r, c: from.c + dir.c };
          if (
            nbr.r >= 0 &&
            nbr.r < ROWS &&
            nbr.c >= 0 &&
            nbr.c < COLS &&
            this.isAdjacent(from, nbr)
          ) {
            this.clearSelect();
            this.trySwap(from, nbr);
          }
        }
        return;
      }

      if (!this.isAdjacent(from, to)) return;
      this.clearSelect();
      this.trySwap(from, to);
    }

    destroyGem(g) {
      if (!g) return;
      if (g.shine) {
        g.shine.destroy();
        g.shine = null;
      }
      g.destroy();
    }

    clearBoard() {
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          this.destroyGem(this.gems[r] && this.gems[r][c]);
        }
      }
      this.gems = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
      this.grid = Array.from({ length: ROWS }, () => Array(COLS).fill(-1));
    }

    fillInitial() {
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const left =
            c >= 2 && this.grid[r][c - 1] === this.grid[r][c - 2]
              ? this.grid[r][c - 1]
              : -1;
          const up =
            r >= 2 && this.grid[r - 1][c] === this.grid[r - 2][c]
              ? this.grid[r - 1][c]
              : -1;
          const color = this.randColor(left, up);
          this.grid[r][c] = color;
          this.gems[r][c] = this.makeGem(r, c, color);
        }
      }
    }

    syncHud() {
      if (scoreEl) scoreEl.textContent = String(this.score);
      if (movesEl) movesEl.textContent = String(this.movesLeft);
    }

    hardReset() {
      this.gen = resetGen;
      if (this.tweens) this.tweens.killAll();
      if (this.time) this.time.removeAllEvents();
      this.busy = false;
      this.ended = false;
      this.selected = null;
      this._dragFrom = null;
      this._dragPointerId = null;
      hideOverlay();
      this.newGame(true);
    }

    newGame(fromHard) {
      const myGen = this.gen;
      if (this.tweens) this.tweens.killAll();
      if (this.time) this.time.removeAllEvents();

      this.clearBoard();
      this.score = 0;
      this.movesLeft = START_MOVES;
      this.busy = false;
      this.selected = null;
      this.ended = false;
      this._dragFrom = null;
      this._dragPointerId = null;
      hideOverlay();
      this.fillInitial();
      this.syncHud();
      if (fromHard) sfx("click");

      this.time.delayedCall(40, () => {
        if (this.gen !== myGen) return;
        this.resolveBoard();
      });
    }

    isAdjacent(a, b) {
      return Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;
    }

    select(cell) {
      this.clearSelect();
      this.selected = cell;
      const g = this.gems[cell.r][cell.c];
      if (g) {
        g.setStrokeStyle(3, 0xffffff);
        g.setScale(1.08);
      }
    }

    clearSelect() {
      if (this.selected) {
        const row = this.gems[this.selected.r];
        const g = row && row[this.selected.c];
        if (g) {
          g.setStrokeStyle(2, 0xffffff44);
          g.setScale(1);
        }
      }
      this.selected = null;
    }

    trySwap(a, b) {
      if (this.busy || this.ended) return;
      if (!this.isAdjacent(a, b)) return;
      const myGen = this.gen;
      this.busy = true;
      this.swapCells(a, b);
      this.animateSwap(a, b, () => {
        if (this.gen !== myGen) return;
        if (!this.findMatches().length) {
          this.swapCells(a, b);
          this.animateSwap(a, b, () => {
            if (this.gen !== myGen) return;
            this.busy = false;
          });
          return;
        }
        this.movesLeft -= 1;
        this.syncHud();
        sfx("move");
        this.resolveBoard();
      });
    }

    swapCells(a, b) {
      const t = this.grid[a.r][a.c];
      this.grid[a.r][a.c] = this.grid[b.r][b.c];
      this.grid[b.r][b.c] = t;
      const g1 = this.gems[a.r][a.c];
      const g2 = this.gems[b.r][b.c];
      this.gems[a.r][a.c] = g2;
      this.gems[b.r][b.c] = g1;
      if (g1) {
        g1.setData("r", b.r);
        g1.setData("c", b.c);
      }
      if (g2) {
        g2.setData("r", a.r);
        g2.setData("c", a.c);
      }
    }

    animateSwap(a, b, done) {
      const g1 = this.gems[b.r][b.c];
      const g2 = this.gems[a.r][a.c];
      const p1 = this.pos(b.r, b.c);
      const p2 = this.pos(a.r, a.c);
      let left = 2;
      let finished = false;
      const finish = () => {
        if (finished) return;
        if (--left === 0) {
          finished = true;
          done();
        }
      };
      this.time.delayedCall(SWAP_MS + 400, () => {
        if (!finished) {
          finished = true;
          left = 0;
          done();
        }
      });
      [
        [g1, p1],
        [g2, p2],
      ].forEach(([g, p]) => {
        if (!g) {
          finish();
          return;
        }
        this.tweens.add({
          targets: g,
          x: p.x,
          y: p.y,
          duration: SWAP_MS,
          ease: "Sine.Out",
          onUpdate: () => {
            if (g.shine) {
              g.shine.x = g.x - this.cell * 0.12;
              g.shine.y = g.y - this.cell * 0.12;
            }
          },
          onComplete: () => {
            g.x = p.x;
            g.y = p.y;
            if (g.shine) {
              g.shine.x = g.x - this.cell * 0.12;
              g.shine.y = g.y - this.cell * 0.12;
            }
            finish();
          },
        });
      });
    }

    findMatches() {
      const marked = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
      for (let r = 0; r < ROWS; r++) {
        let run = 1;
        for (let c = 1; c <= COLS; c++) {
          if (c < COLS && this.grid[r][c] === this.grid[r][c - 1] && this.grid[r][c] >= 0) {
            run++;
          } else {
            if (run >= 3) for (let k = 0; k < run; k++) marked[r][c - 1 - k] = true;
            run = 1;
          }
        }
      }
      for (let c = 0; c < COLS; c++) {
        let run = 1;
        for (let r = 1; r <= ROWS; r++) {
          if (r < ROWS && this.grid[r][c] === this.grid[r - 1][c] && this.grid[r][c] >= 0) {
            run++;
          } else {
            if (run >= 3) for (let k = 0; k < run; k++) marked[r - 1 - k][c] = true;
            run = 1;
          }
        }
      }
      const list = [];
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (marked[r][c]) list.push({ r, c });
        }
      }
      return list;
    }

    resolveBoard() {
      const myGen = this.gen;
      const matches = this.findMatches();
      if (!matches.length) {
        this.busy = false;
        this.checkEnd();
        return;
      }
      this.busy = true;
      // Score = cleared gems × 10 (locked spec)
      this.score += matches.length * 10;
      sfx("match");
      this.syncHud();

      let pending = matches.length;
      let advanced = false;
      const advance = () => {
        if (advanced || this.gen !== myGen) return;
        advanced = true;
        this.collapseAndRefill();
      };
      this.time.delayedCall(CLEAR_MS + 900, advance);

      matches.forEach(({ r, c }) => {
        const g = this.gems[r][c];
        this.grid[r][c] = -1;
        this.gems[r][c] = null;
        if (!g) {
          if (--pending === 0) advance();
          return;
        }
        this.tweens.add({
          targets: [g, g.shine].filter(Boolean),
          scale: 0,
          alpha: 0,
          duration: CLEAR_MS,
          ease: "Back.In",
          onComplete: () => {
            this.destroyGem(g);
            if (--pending === 0) advance();
          },
        });
      });
    }

    collapseAndRefill() {
      const myGen = this.gen;
      for (let c = 0; c < COLS; c++) {
        const stack = [];
        for (let r = ROWS - 1; r >= 0; r--) {
          if (this.grid[r][c] >= 0) {
            stack.push({ color: this.grid[r][c], gem: this.gems[r][c] });
          }
        }
        for (let r = ROWS - 1; r >= 0; r--) {
          const idx = ROWS - 1 - r;
          if (idx < stack.length) {
            const item = stack[idx];
            this.grid[r][c] = item.color;
            this.gems[r][c] = item.gem;
            if (item.gem) {
              item.gem.setData("r", r);
              item.gem.setData("c", c);
            }
          } else {
            this.grid[r][c] = -1;
            this.gems[r][c] = null;
          }
        }
        for (let r = 0; r < ROWS; r++) {
          if (this.grid[r][c] < 0) {
            const color = Phaser.Math.Between(0, COLORS.length - 1);
            this.grid[r][c] = color;
            const g = this.makeGem(r, c, color);
            const startY = this.originY - (ROWS - r) * (this.cell + this.pad);
            g.y = startY;
            if (g.shine) g.shine.y = startY - this.cell * 0.12;
            this.gems[r][c] = g;
          }
        }
      }

      let moving = 0;
      let continued = false;
      const cont = () => {
        if (continued || this.gen !== myGen) return;
        continued = true;
        this.time.delayedCall(40, () => {
          if (this.gen !== myGen) return;
          this.resolveBoard();
        });
      };

      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const g = this.gems[r][c];
          if (!g) continue;
          const p = this.pos(r, c);
          if (Math.abs(g.x - p.x) < 1 && Math.abs(g.y - p.y) < 1) continue;
          moving++;
          this.tweens.add({
            targets: g,
            x: p.x,
            y: p.y,
            duration: FALL_BASE + (ROWS - r) * 12,
            ease: "Bounce.Out",
            onUpdate: () => {
              if (g.shine) {
                g.shine.x = g.x - this.cell * 0.12;
                g.shine.y = g.y - this.cell * 0.12;
              }
            },
            onComplete: () => {
              if (g.shine) {
                g.shine.x = g.x - this.cell * 0.12;
                g.shine.y = g.y - this.cell * 0.12;
              }
              moving--;
              if (moving === 0) cont();
            },
          });
        }
      }
      if (moving === 0) cont();
      else this.time.delayedCall(2500, cont);
    }

    checkEnd() {
      if (this.ended) return;
      if (this.score >= GOAL) {
        this.ended = true;
        sfx("win");
        showEndOverlay(true, this.score);
      } else if (this.movesLeft <= 0) {
        this.ended = true;
        showEndOverlay(false, this.score);
      }
    }
  }

  window.__playhubMatch3Reset = () => {
    unlockAudio();
    if (scoreEl) scoreEl.textContent = "0";
    if (movesEl) movesEl.textContent = String(START_MOVES);
    hideOverlay();
    resetGen += 1;

    if (!gameRef) return;
    const scene = gameRef.scene.getScene("Match3") || sceneRef;
    if (!scene) return;

    if (scene.tweens) scene.tweens.killAll();
    if (scene.time) scene.time.removeAllEvents();
    scene.busy = false;
    scene.ended = false;
    scene.selected = null;
    scene._dragFrom = null;
    scene._dragPointerId = null;
    scene.gen = resetGen;

    if (scene.sys && scene.sys.isActive() && typeof scene.hardReset === "function") {
      scene.hardReset();
      return;
    }
    if (scene.sys && scene.sys.isActive()) {
      scene.scene.restart();
      return;
    }
    if (typeof scene.newGame === "function") scene.newGame(true);
  };

  const boot = () => {
    const el = document.getElementById("game-container");
    if (!el) return;

    // Fixed square; Scale.NONE avoids FIT letterbox / pointer interference with HTML controls.
    const avail = el.clientWidth || Math.min(window.innerWidth - 24, 480);
    const w = Math.max(280, Math.min(480, avail));
    el.style.width = w + "px";
    el.style.height = w + "px";
    el.style.margin = "0 auto";

    gameRef = new Phaser.Game({
      type: Phaser.AUTO,
      parent: "game-container",
      width: w,
      height: w,
      backgroundColor: "#111527",
      scene: [Match3Scene],
      scale: {
        mode: Phaser.Scale.NONE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      input: {
        activePointers: 3,
      },
    });

    const bindReset = (id) => {
      const btn = document.getElementById(id);
      if (!btn || btn.dataset.phaserBound) return;
      btn.dataset.phaserBound = "1";
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        window.__playhubMatch3Reset();
      });
    };
    bindReset("btn-new");
    bindReset("overlay-new");
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
