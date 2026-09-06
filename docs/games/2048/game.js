(() => {
  const SIZE = 4;
  const PAD = 12;
  const MOVE_MS = 110;
  const MERGE_POP_MS = 140;
  const SPAWN_MS = 130;
  const BEST_KEY = "bitnagame-2048-best";
  const LEGACY_BEST_KEY = "playhub-2048-best";
  if (localStorage.getItem(BEST_KEY) == null) {
    const legacyBest = localStorage.getItem(LEGACY_BEST_KEY);
    if (legacyBest != null) localStorage.setItem(BEST_KEY, legacyBest);
  }
  const DIR_MAP = {
    ArrowLeft: "left",
    ArrowRight: "right",
    ArrowUp: "up",
    ArrowDown: "down",
    a: "left",
    d: "right",
    w: "up",
    s: "down",
    A: "left",
    D: "right",
    W: "up",
    S: "down",
  };

  let best = Number(localStorage.getItem(BEST_KEY) || 0);
  const scoreEl = document.getElementById("score");
  const bestEl = document.getElementById("best");
  const overlayEl = document.getElementById("game-overlay");
  const overlayTitle = document.getElementById("overlay-title");
  const overlaySub = document.getElementById("overlay-sub");
  const overlayContinue = document.getElementById("overlay-continue");
  if (bestEl) bestEl.textContent = String(best);

  let gameRef = null;
  let sceneRef = null;
  let resetGen = 0;

  function sfx(name) {
    if (window.BitnaGameAudio) window.BitnaGameAudio.play(name);
  }

  function unlockAudio() {
    if (window.BitnaGameAudio) window.BitnaGameAudio.unlock();
  }

  function hideOverlay() {
    if (!overlayEl) return;
    overlayEl.hidden = true;
    overlayEl.setAttribute("aria-hidden", "true");
    if (overlayContinue) overlayContinue.hidden = true;
  }

  function showOverlay(kind) {
    if (!overlayEl || !overlayTitle || !overlaySub) return;
    if (kind === "win") {
      overlayTitle.textContent = "2048 달성!";
      overlaySub.textContent = "계속 플레이할 수 있어요";
      if (overlayContinue) overlayContinue.hidden = false;
    } else {
      overlayTitle.textContent = "게임 오버";
      overlaySub.textContent = "더 이상 이동할 수 없어요";
      if (overlayContinue) overlayContinue.hidden = true;
    }
    overlayEl.hidden = false;
    overlayEl.setAttribute("aria-hidden", "false");
  }

  class Game2048 extends Phaser.Scene {
    constructor() {
      super("Game2048");
      this.grid = [];
      this.tiles = [];
      this.score = 0;
      this.busy = false;
      this.over = false;
      this.won = false;
      this.winBannerShown = false;
      this.cell = 0;
      this.originX = 0;
      this.originY = 0;
      this.boardPx = 0;
      this.gen = 0;
    }

    create() {
      sceneRef = this;
      this.gen = resetGen;

      const W = this.scale.width;
      const H = this.scale.height;
      this.cell = Math.floor((Math.min(W, H) - PAD * 5) / SIZE);
      this.boardPx = this.cell * SIZE + PAD * (SIZE + 1);
      this.originX = (W - this.boardPx) / 2;
      this.originY = (H - this.boardPx) / 2;

      this.add
        .rectangle(W / 2, H / 2, this.boardPx + 10, this.boardPx + 10, 0x1d2238)
        .setStrokeStyle(2, 0x3a4466);

      for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
          const { x, y } = this.cellPos(r, c);
          this.add
            .rectangle(x, y, this.cell, this.cell, 0x2a314d, 1)
            .setStrokeStyle(1, 0x3d4666);
        }
      }

      this.tileLayer = this.add.container(0, 0);

      if (this.input.keyboard) {
        this.input.keyboard.on("keydown", (e) => {
          unlockAudio();
          const dir = DIR_MAP[e.key];
          if (!dir) return;
          e.preventDefault();
          this.tryMove(dir);
        });
      }

      let sx = 0;
      let sy = 0;
      let tracking = false;
      this.input.on("pointerdown", (p) => {
        unlockAudio();
        tracking = true;
        sx = p.x;
        sy = p.y;
      });
      this.input.on("pointerup", (p) => {
        if (!tracking) return;
        tracking = false;
        const dx = p.x - sx;
        const dy = p.y - sy;
        if (Math.hypot(dx, dy) < 28) return;
        if (Math.abs(dx) > Math.abs(dy)) this.tryMove(dx > 0 ? "right" : "left");
        else this.tryMove(dy > 0 ? "down" : "up");
      });
      this.input.on("pointerupoutside", () => {
        tracking = false;
      });

      this.newGame(false);
    }

    hardReset() {
      this.gen = resetGen;
      if (this.tweens) this.tweens.killAll();
      if (this.time) this.time.removeAllEvents();
      this.busy = false;
      this.over = false;
      this.won = false;
      this.winBannerShown = false;
      hideOverlay();
      this.newGame(true);
    }

    newGame(fromHard) {
      if (this.tweens) this.tweens.killAll();
      if (this.time) this.time.removeAllEvents();

      if (this.tiles && this.tiles.length) {
        this.tiles.forEach((row) =>
          row.forEach((t) => {
            if (t) t.destroy();
          })
        );
      }
      this.tiles = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
      if (this.tileLayer) this.tileLayer.removeAll(true);

      this.grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
      this.score = 0;
      if (scoreEl) scoreEl.textContent = "0";
      this.busy = false;
      this.over = false;
      this.won = false;
      this.winBannerShown = false;
      hideOverlay();

      this.spawn(true);
      this.spawn(true);
      this.syncHud();
      if (fromHard) sfx("click");
    }

    syncHud() {
      if (scoreEl) scoreEl.textContent = String(this.score);
      if (this.score > best) {
        best = this.score;
        localStorage.setItem(BEST_KEY, String(best));
        if (bestEl) bestEl.textContent = String(best);
      }
    }

    cellPos(r, c) {
      return {
        x: this.originX + PAD + c * (this.cell + PAD) + this.cell / 2,
        y: this.originY + PAD + r * (this.cell + PAD) + this.cell / 2,
      };
    }

    colorFor(v) {
      const map = {
        2: 0xeee4da,
        4: 0xede0c8,
        8: 0xf2b179,
        16: 0xf59563,
        32: 0xf67c5f,
        64: 0xf65e3b,
        128: 0xedcf72,
        256: 0xedcc61,
        512: 0xedc850,
        1024: 0xedc53f,
        2048: 0xedc22e,
      };
      return map[v] || 0x3c3a32;
    }

    textColor(v) {
      return v <= 4 ? "#776e65" : "#f9f6f2";
    }

    fontSizeFor(v) {
      if (v >= 1000) return Math.max(18, Math.floor(this.cell * 0.32));
      if (v >= 100) return Math.max(22, Math.floor(this.cell * 0.4));
      return Math.max(26, Math.floor(this.cell * 0.48));
    }

    makeTile(r, c, v, animateIn) {
      const { x, y } = this.cellPos(r, c);
      const bg = this.add
        .rectangle(0, 0, this.cell - 2, this.cell - 2, this.colorFor(v), 1)
        .setStrokeStyle(1, 0xffffff22);
      const label = this.add
        .text(0, 0, String(v), {
          fontFamily: "Noto Sans KR, Pretendard, sans-serif",
          fontSize: this.fontSizeFor(v) + "px",
          fontStyle: "bold",
          color: this.textColor(v),
        })
        .setOrigin(0.5);
      const cont = this.add.container(x, y, [bg, label]);
      cont.setData("value", v);
      cont.bg = bg;
      cont.label = label;
      cont.row = r;
      cont.col = c;
      this.tileLayer.add(cont);
      if (animateIn) {
        cont.setScale(0);
        this.tweens.add({
          targets: cont,
          scale: 1,
          duration: SPAWN_MS,
          ease: "Back.Out",
        });
      }
      return cont;
    }

    updateTileVisual(tile, v) {
      tile.setData("value", v);
      tile.bg.setFillStyle(this.colorFor(v));
      tile.label.setText(String(v));
      tile.label.setColor(this.textColor(v));
      tile.label.setFontSize(this.fontSizeFor(v) + "px");
    }

    spawn(animateIn) {
      const empty = [];
      for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
          if (!this.grid[r][c]) empty.push([r, c]);
        }
      }
      if (!empty.length) return null;
      const [r, c] = Phaser.Utils.Array.GetRandom(empty);
      const v = Math.random() < 0.9 ? 2 : 4;
      this.grid[r][c] = v;
      this.tiles[r][c] = this.makeTile(r, c, v, animateIn !== false);
      return [r, c];
    }

    /** Slide one line toward index 0; returns result + merge metadata. */
    slideLine(values) {
      const filtered = [];
      for (let i = 0; i < values.length; i++) {
        if (values[i] !== 0) filtered.push({ value: values[i], from: i });
      }
      const out = Array(SIZE).fill(0);
      const moves = [];
      let scoreGain = 0;
      let i = 0;
      let slot = 0;
      while (i < filtered.length) {
        if (i + 1 < filtered.length && filtered[i].value === filtered[i + 1].value) {
          const merged = filtered[i].value * 2;
          out[slot] = merged;
          scoreGain += merged;
          moves.push({
            from: filtered[i].from,
            to: slot,
            value: filtered[i].value,
            merge: true,
            mergedValue: merged,
          });
          moves.push({
            from: filtered[i + 1].from,
            to: slot,
            value: filtered[i + 1].value,
            merge: true,
            mergedValue: merged,
            secondary: true,
          });
          i += 2;
        } else {
          out[slot] = filtered[i].value;
          moves.push({
            from: filtered[i].from,
            to: slot,
            value: filtered[i].value,
            merge: false,
          });
          i += 1;
        }
        slot += 1;
      }
      return { line: out, scoreGain, moves };
    }

    /**
     * Build next grid + list of visual moves in row/col space.
     * Each visual move: { fr, fc, tr, tc, value, merge, mergedValue, secondary }
     */
    planMove(dir) {
      const next = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
      const visuals = [];
      let scoreGain = 0;

      const pushVisual = (fr, fc, tr, tc, m) => {
        visuals.push({
          fr,
          fc,
          tr,
          tc,
          value: m.value,
          merge: !!m.merge,
          mergedValue: m.mergedValue || 0,
          secondary: !!m.secondary,
        });
      };

      if (dir === "left" || dir === "right") {
        for (let r = 0; r < SIZE; r++) {
          let line = this.grid[r].slice();
          if (dir === "right") line.reverse();
          const res = this.slideLine(line);
          if (dir === "right") res.line.reverse();
          next[r] = res.line;
          scoreGain += res.scoreGain;
          res.moves.forEach((m) => {
            const fromC = dir === "right" ? SIZE - 1 - m.from : m.from;
            const toC = dir === "right" ? SIZE - 1 - m.to : m.to;
            pushVisual(r, fromC, r, toC, m);
          });
        }
      } else {
        for (let c = 0; c < SIZE; c++) {
          let line = [];
          for (let r = 0; r < SIZE; r++) line.push(this.grid[r][c]);
          if (dir === "down") line.reverse();
          const res = this.slideLine(line);
          if (dir === "down") res.line.reverse();
          for (let r = 0; r < SIZE; r++) next[r][c] = res.line[r];
          scoreGain += res.scoreGain;
          res.moves.forEach((m) => {
            const fromR = dir === "down" ? SIZE - 1 - m.from : m.from;
            const toR = dir === "down" ? SIZE - 1 - m.to : m.to;
            pushVisual(fromR, c, toR, c, m);
          });
        }
      }

      const changed = visuals.some((v) => v.fr !== v.tr || v.fc !== v.tc || v.merge);
      return { next, visuals, scoreGain, changed };
    }

    tryMove(dir) {
      if (this.busy || this.over) return;
      const plan = this.planMove(dir);
      if (!plan.changed) return;

      const gen = this.gen;
      this.busy = true;
      this.score += plan.scoreGain;
      this.syncHud();

      if (plan.scoreGain > 0) sfx("merge");
      else sfx("move");

      this.animatePlan(plan, () => {
        if (this.gen !== gen) return;
        this.grid = plan.next;
        this.rebuildTilesFromGrid(false);
        this.spawn(true);

        if (!this.won && this.grid.some((row) => row.includes(2048))) {
          this.won = true;
          this.winBannerShown = true;
          sfx("win");
          showOverlay("win");
          this.time.delayedCall(2200, () => {
            if (this.gen !== gen) return;
            if (!this.over) hideOverlay();
          });
        }

        if (!this.canMove()) {
          this.over = true;
          sfx("over");
          showOverlay("over");
        }
        this.busy = false;
      });
    }

    rebuildTilesFromGrid(animateIn) {
      if (this.tiles && this.tiles.length) {
        this.tiles.forEach((row) =>
          row.forEach((t) => {
            if (t) t.destroy();
          })
        );
      }
      this.tiles = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
      if (this.tileLayer) this.tileLayer.removeAll(true);
      for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
          if (this.grid[r][c]) {
            this.tiles[r][c] = this.makeTile(r, c, this.grid[r][c], !!animateIn);
          }
        }
      }
    }

    animatePlan(plan, done) {
      const gen = this.gen;
      const moving = [];
      const mergeTargets = new Map();

      // Detach tiles from grid slots; animate using existing sprites.
      const oldTiles = this.tiles;
      this.tiles = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));

      plan.visuals.forEach((v) => {
        const tile = oldTiles[v.fr][v.fc];
        if (!tile) return;
        oldTiles[v.fr][v.fc] = null;
        tile.row = v.tr;
        tile.col = v.tc;
        moving.push({ tile, v });
        if (v.merge && !v.secondary) {
          mergeTargets.set(v.tr + "," + v.tc, v.mergedValue);
        }
      });

      // Destroy any leftover (shouldn't happen)
      oldTiles.forEach((row) =>
        row.forEach((t) => {
          if (t) t.destroy();
        })
      );

      let pending = moving.length;
      if (!pending) {
        done();
        return;
      }

      const finishOne = () => {
        pending -= 1;
        if (pending > 0) return;
        if (this.gen !== gen) return;

        // After slides: destroy secondary merge sprites, update primary to merged value + pop
        const seen = new Set();
        moving.forEach(({ tile, v }) => {
          if (v.merge && v.secondary) {
            tile.destroy();
            return;
          }
          const key = v.tr + "," + v.tc;
          if (v.merge) {
            const mv = mergeTargets.get(key) || v.mergedValue;
            this.updateTileVisual(tile, mv);
            tile.setScale(1);
            this.tweens.add({
              targets: tile,
              scale: 1.16,
              duration: MERGE_POP_MS / 2,
              yoyo: true,
              ease: "Quad.Out",
            });
          }
          if (!seen.has(key)) {
            seen.add(key);
            this.tiles[v.tr][v.tc] = tile;
          }
        });

        this.time.delayedCall(MERGE_POP_MS + 10, () => {
          if (this.gen !== gen) return;
          done();
        });
      };

      moving.forEach(({ tile, v }) => {
        const dest = this.cellPos(v.tr, v.tc);
        const dist = Math.hypot(dest.x - tile.x, dest.y - tile.y);
        if (dist < 0.5) {
          tile.x = dest.x;
          tile.y = dest.y;
          finishOne();
          return;
        }
        this.tweens.add({
          targets: tile,
          x: dest.x,
          y: dest.y,
          duration: MOVE_MS,
          ease: "Quad.Out",
          onComplete: finishOne,
        });
      });
    }

    canMove() {
      for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
          if (!this.grid[r][c]) return true;
          const v = this.grid[r][c];
          if (c + 1 < SIZE && this.grid[r][c + 1] === v) return true;
          if (r + 1 < SIZE && this.grid[r + 1][c] === v) return true;
        }
      }
      return false;
    }
  }

  window.__bitna2048Reset = () => {
    unlockAudio();
    if (scoreEl) scoreEl.textContent = "0";
    hideOverlay();
    resetGen += 1;

    if (!gameRef) return;
    const scene = gameRef.scene.getScene("Game2048") || sceneRef;
    if (!scene) return;

    if (scene.tweens) scene.tweens.killAll();
    if (scene.time) scene.time.removeAllEvents();
    scene.busy = false;
    scene.over = false;
    scene.won = false;
    scene.winBannerShown = false;
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

    // Fixed logical square; parent CSS sizes the box; FIT scales into it.
    const LOGICAL = 720;

    gameRef = new Phaser.Game({
      type: Phaser.AUTO,
      parent: "game-container",
      width: LOGICAL,
      height: LOGICAL,
      backgroundColor: "#111527",
      scene: [Game2048],
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: LOGICAL,
        height: LOGICAL,
      },
      input: {
        activePointers: 3,
      },
    });
    if (gameRef.scale) gameRef.scale.refresh();

    const btn = document.getElementById("btn-new");
    if (btn && !btn.dataset.phaserBound) {
      btn.dataset.phaserBound = "1";
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        window.__bitna2048Reset();
      });
    }

    if (overlayContinue && !overlayContinue.dataset.bound) {
      overlayContinue.dataset.bound = "1";
      overlayContinue.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        hideOverlay();
      });
    }

    const overlayNew = document.getElementById("overlay-new");
    if (overlayNew && !overlayNew.dataset.bound) {
      overlayNew.dataset.bound = "1";
      overlayNew.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        window.__bitna2048Reset();
      });
    }
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
