(() => {
  const COLS = 8, ROWS = 8;
  const COLORS = [0xff5d8f, 0x6c8cff, 0x7ef0c3, 0xffd166, 0xb967ff, 0xff8c42];
  const GOAL = 1500, START_MOVES = 30;
  const scoreEl = document.getElementById("score");
  const movesEl = document.getElementById("moves");
  const goalEl = document.getElementById("goal");
  goalEl.textContent = String(GOAL);

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
      this._busyTimer = null;
    }

    create() {
      const W = this.scale.width, H = this.scale.height;
      const boardW = Math.min(W, H) - 16;
      this.cell = Math.floor((boardW - this.pad * (COLS + 1)) / COLS);
      const size = this.cell * COLS + this.pad * (COLS + 1);
      this.originX = (W - size) / 2;
      this.originY = (H - size) / 2;

      this.add.rectangle(W / 2, H / 2, size + 8, size + 8, 0x171c33).setStrokeStyle(2, 0x44507a);
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const p = this.pos(r, c);
          this.add.rectangle(p.x, p.y, this.cell, this.cell, (r + c) % 2 ? 0x222a45 : 0x1c233b);
        }
      }

      this.msg = this.add.text(W / 2, H / 2, "", {
        fontFamily: "Noto Sans KR, sans-serif",
        fontSize: "28px",
        fontStyle: "bold",
        color: "#fff",
        backgroundColor: "#000000bb",
        padding: { x: 16, y: 12 },
        align: "center",
      }).setOrigin(0.5).setDepth(40).setVisible(false);

      document.getElementById("btn-new").onclick = () => this.newGame();
      this.newGame();
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
      const g = this.add.circle(p.x, p.y, this.cell * 0.38, COLORS[color], 1)
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

      // Per-gem handlers avoid Scale.FIT pointer/CSS mismatch from scene cellAt
      g.on("pointerdown", (pointer) => this.onGemPointerDown(g, pointer));
      g.on("pointerup", (pointer) => this.onGemPointerUp(g, pointer));
      g.on("pointerover", () => {
        if (!this.busy && !this.ended && this._dragFrom) g.setScale(1.05);
      });
      g.on("pointerout", () => {
        if (this.selected && this.selected.r === g.getData("r") && this.selected.c === g.getData("c")) return;
        if (g.active) g.setScale(1);
      });

      return g;
    }

    onGemPointerDown(gem, pointer) {
      if (this.busy || this.ended || !gem.active) return;
      const cell = { r: gem.getData("r"), c: gem.getData("c") };
      this._dragFrom = cell;
      this._dragPointerId = pointer.id;

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

      const to = { r: gem.getData("r"), c: gem.getData("c") };
      const from = this._dragFrom;
      this._dragFrom = null;
      this._dragPointerId = null;

      if (from.r === to.r && from.c === to.c) return;
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
          const left = c >= 2 && this.grid[r][c - 1] === this.grid[r][c - 2] ? this.grid[r][c - 1] : -1;
          const up = r >= 2 && this.grid[r - 1][c] === this.grid[r - 2][c] ? this.grid[r - 1][c] : -1;
          const color = this.randColor(left, up);
          this.grid[r][c] = color;
          this.gems[r][c] = this.makeGem(r, c, color);
        }
      }
    }

    syncHud() {
      scoreEl.textContent = String(this.score);
      movesEl.textContent = String(this.movesLeft);
    }

    unlockBusy() {
      this.busy = false;
      if (this._busyTimer) {
        this._busyTimer.remove(false);
        this._busyTimer = null;
      }
    }

    armBusySafety(ms) {
      if (this._busyTimer) this._busyTimer.remove(false);
      this._busyTimer = this.time.delayedCall(ms || 4000, () => {
        this._busyTimer = null;
        this.busy = false;
      });
    }

    newGame() {
      this.tweens.killAll();
      if (this._busyTimer) {
        this._busyTimer.remove(false);
        this._busyTimer = null;
      }
      this.clearBoard();
      this.score = 0;
      this.movesLeft = START_MOVES;
      this.busy = false;
      this.selected = null;
      this.ended = false;
      this._dragFrom = null;
      this._dragPointerId = null;
      this.msg.setVisible(false);
      this.fillInitial();
      this.syncHud();
      this.time.delayedCall(50, () => this.resolveBoard());
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
        const g = this.gems[this.selected.r] && this.gems[this.selected.r][this.selected.c];
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
      this.busy = true;
      this.armBusySafety(5000);
      this.swapCells(a, b);
      this.animateSwap(a, b, () => {
        if (!this.findMatches().length) {
          this.swapCells(a, b);
          this.animateSwap(a, b, () => {
            this.unlockBusy();
          });
          return;
        }
        this.movesLeft -= 1;
        this.syncHud();
        this.resolveBoard();
      });
    }

    swapCells(a, b) {
      const t = this.grid[a.r][a.c];
      this.grid[a.r][a.c] = this.grid[b.r][b.c];
      this.grid[b.r][b.c] = t;
      const g1 = this.gems[a.r][a.c], g2 = this.gems[b.r][b.c];
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
      const g1 = this.gems[b.r][b.c], g2 = this.gems[a.r][a.c];
      const p1 = this.pos(b.r, b.c), p2 = this.pos(a.r, a.c);
      let left = 2;
      let finished = false;
      const finish = () => {
        if (finished) return;
        if (--left === 0) {
          finished = true;
          done();
        }
      };
      // Safety: if tweens never complete, still unlock the swap chain
      this.time.delayedCall(800, () => {
        if (!finished) {
          finished = true;
          left = 0;
          done();
        }
      });
      [[g1, p1], [g2, p2]].forEach(([g, p]) => {
        if (!g) {
          finish();
          return;
        }
        this.tweens.add({
          targets: g,
          x: p.x,
          y: p.y,
          duration: 140,
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
          if (c < COLS && this.grid[r][c] === this.grid[r][c - 1] && this.grid[r][c] >= 0) run++;
          else {
            if (run >= 3) for (let k = 0; k < run; k++) marked[r][c - 1 - k] = true;
            run = 1;
          }
        }
      }
      for (let c = 0; c < COLS; c++) {
        let run = 1;
        for (let r = 1; r <= ROWS; r++) {
          if (r < ROWS && this.grid[r][c] === this.grid[r - 1][c] && this.grid[r][c] >= 0) run++;
          else {
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
      const matches = this.findMatches();
      if (!matches.length) {
        this.unlockBusy();
        this.checkEnd();
        return;
      }
      this.busy = true;
      this.armBusySafety(6000);
      this.score += matches.length * 10 + Math.max(0, matches.length - 3) * 5;
      this.syncHud();
      let pending = matches.length;
      let advanced = false;
      const advance = () => {
        if (advanced) return;
        advanced = true;
        this.collapseAndRefill();
      };
      this.time.delayedCall(1200, advance);
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
          duration: 160,
          onComplete: () => {
            this.destroyGem(g);
            if (--pending === 0) advance();
          },
        });
      });
    }

    collapseAndRefill() {
      for (let c = 0; c < COLS; c++) {
        const stack = [];
        for (let r = ROWS - 1; r >= 0; r--) {
          if (this.grid[r][c] >= 0) stack.push({ color: this.grid[r][c], gem: this.gems[r][c] });
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
        if (continued) return;
        continued = true;
        this.time.delayedCall(40, () => this.resolveBoard());
      };
      this.armBusySafety(6000);

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
            duration: 180 + (ROWS - r) * 12,
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
        this.msg.setText("목표 달성!\n점수 " + this.score).setVisible(true);
      } else if (this.movesLeft <= 0) {
        this.ended = true;
        this.msg.setText("이동 종료\n점수 " + this.score).setVisible(true);
      }
    }
  }

  const boot = () => {
    const el = document.getElementById("game-container");
    // Fixed square size; Scale.NONE avoids FIT letterbox pointer bugs
    const w = Math.max(280, Math.min(480, el.clientWidth || 360));
    el.style.width = w + "px";
    el.style.height = w + "px";
    el.style.margin = "0 auto";
    new Phaser.Game({
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
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
