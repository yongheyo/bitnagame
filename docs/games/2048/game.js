(() => {
  const SIZE = 4;
  const PAD = 12;
  const BEST_KEY = "playhub-2048-best";
  let best = Number(localStorage.getItem(BEST_KEY) || 0);
  const scoreEl = document.getElementById("score");
  const bestEl = document.getElementById("best");
  bestEl.textContent = String(best);

  let gameRef = null;

  class Game2048 extends Phaser.Scene {
    constructor() {
      super("Game2048");
      this.grid = [];
      this.tiles = [];
      this.score = 0;
      this.busy = false;
      this.over = false;
      this.won = false;
      this.cell = 0;
      this.originX = 0;
      this.originY = 0;
    }

    create() {
      const W = this.scale.width;
      const H = this.scale.height;
      this.cell = Math.floor((Math.min(W, H) - PAD * 5) / SIZE);
      const board = this.cell * SIZE + PAD * (SIZE + 1);
      this.originX = (W - board) / 2;
      this.originY = (H - board) / 2 + 4;

      this.add.rectangle(W / 2, H / 2, board + 8, board + 8, 0x1d2238).setStrokeStyle(2, 0x3a4466);
      for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
          const x = this.originX + PAD + c * (this.cell + PAD) + this.cell / 2;
          const y = this.originY + PAD + r * (this.cell + PAD) + this.cell / 2;
          this.add.rectangle(x, y, this.cell, this.cell, 0x2a314d, 1).setStrokeStyle(1, 0x3d4666);
        }
      }

      this.tileLayer = this.add.container(0, 0);
      this.msgText = this.add
        .text(W / 2, H / 2, "", {
          fontFamily: "Noto Sans KR, sans-serif",
          fontSize: "28px",
          fontStyle: "bold",
          color: "#ffffff",
          backgroundColor: "#000000aa",
          padding: { x: 16, y: 12 },
          align: "center",
        })
        .setOrigin(0.5)
        .setDepth(20)
        .setVisible(false);

      this.input.keyboard.on("keydown", (e) => {
        if (window.PlayHubAudio) window.PlayHubAudio.unlock();
        const map = {
          ArrowLeft: "left",
          ArrowRight: "right",
          ArrowUp: "up",
          ArrowDown: "down",
          a: "left",
          d: "right",
          w: "up",
          s: "down",
        };
        if (map[e.key]) {
          e.preventDefault();
          this.tryMove(map[e.key]);
        }
      });

      let sx = 0;
      let sy = 0;
      this.input.on("pointerdown", (p) => {
        if (window.PlayHubAudio) window.PlayHubAudio.unlock();
        sx = p.x;
        sy = p.y;
      });
      this.input.on("pointerup", (p) => {
        const dx = p.x - sx;
        const dy = p.y - sy;
        if (Math.hypot(dx, dy) < 24) return;
        if (Math.abs(dx) > Math.abs(dy)) this.tryMove(dx > 0 ? "right" : "left");
        else this.tryMove(dy > 0 ? "down" : "up");
      });

      // Button is bound once in boot via window.__playhub2048Reset — do not stack listeners here.
      this.newGame();
    }

    newGame() {
      // Kill pending animateTo/tryMove timers that would restore the old board after reset.
      this.time.removeAllEvents();
      this.tweens.killAll();

      if (this.tiles && this.tiles.length) {
        this.tiles.forEach((row) => row.forEach((t) => t && t.destroy()));
      }
      this.tiles = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
      if (this.tileLayer) this.tileLayer.removeAll(true);

      this.grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
      this.score = 0;
      scoreEl.textContent = "0";
      this.busy = false;
      this.over = false;
      this.won = false;
      if (this.msgText) this.msgText.setVisible(false);

      this.spawn();
      this.spawn();
      this.syncHud();
    }

    syncHud() {
      scoreEl.textContent = String(this.score);
      if (this.score > best) {
        best = this.score;
        localStorage.setItem(BEST_KEY, String(best));
        bestEl.textContent = String(best);
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

    makeTile(r, c, v) {
      const { x, y } = this.cellPos(r, c);
      const bg = this.add
        .rectangle(0, 0, this.cell - 2, this.cell - 2, this.colorFor(v), 1)
        .setStrokeStyle(1, 0xffffff22);
      const label = this.add
        .text(0, 0, String(v), {
          fontFamily: "Noto Sans KR, sans-serif",
          fontSize: v >= 1000 ? "28px" : v >= 100 ? "34px" : "40px",
          fontStyle: "bold",
          color: this.textColor(v),
        })
        .setOrigin(0.5);
      const cont = this.add.container(x, y, [bg, label]);
      cont.setData("value", v);
      cont.bg = bg;
      cont.label = label;
      this.tileLayer.add(cont);
      cont.setScale(0);
      this.tweens.add({ targets: cont, scale: 1, duration: 120, ease: "Back.Out" });
      return cont;
    }

    updateTileVisual(tile, v) {
      tile.setData("value", v);
      tile.bg.setFillStyle(this.colorFor(v));
      tile.label.setText(String(v));
      tile.label.setColor(this.textColor(v));
      tile.label.setFontSize(v >= 1000 ? "28px" : v >= 100 ? "34px" : "40px");
    }

    spawn() {
      const empty = [];
      for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
          if (!this.grid[r][c]) empty.push([r, c]);
        }
      }
      if (!empty.length) return;
      const [r, c] = Phaser.Utils.Array.GetRandom(empty);
      const v = Math.random() < 0.9 ? 2 : 4;
      this.grid[r][c] = v;
      this.tiles[r][c] = this.makeTile(r, c, v);
    }

    slideLine(values) {
      const filtered = values.filter((v) => v !== 0);
      const out = [];
      let scoreGain = 0;
      let i = 0;
      while (i < filtered.length) {
        if (i + 1 < filtered.length && filtered[i] === filtered[i + 1]) {
          const merged = filtered[i] * 2;
          out.push(merged);
          scoreGain += merged;
          i += 2;
        } else {
          out.push(filtered[i]);
          i += 1;
        }
      }
      while (out.length < SIZE) out.push(0);
      return { line: out, scoreGain };
    }

    tryMove(dir) {
      if (this.busy || this.over) return;
      const prev = this.grid.map((row) => row.slice());
      let scoreGain = 0;
      const next = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));

      if (dir === "left" || dir === "right") {
        for (let r = 0; r < SIZE; r++) {
          let line = this.grid[r].slice();
          if (dir === "right") line.reverse();
          const res = this.slideLine(line);
          if (dir === "right") res.line.reverse();
          next[r] = res.line;
          scoreGain += res.scoreGain;
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
        }
      }

      const changed = JSON.stringify(prev) !== JSON.stringify(next);
      if (!changed) return;

      if (window.PlayHubAudio) window.PlayHubAudio.play("move");
      this.busy = true;
      this.score += scoreGain;
      this.syncHud();
      this.animateTo(next, () => {
        this.grid = next;
        this.spawn();
        if (!this.won && this.grid.some((row) => row.includes(2048))) {
          this.won = true;
          this.msgText.setText("2048 달성!\n계속 플레이하세요").setVisible(true);
          this.time.delayedCall(1600, () => this.msgText.setVisible(false));
        }
        if (!this.canMove()) {
          this.over = true;
          this.msgText.setText("게임 오버\n새 게임을 눌러 주세요").setVisible(true);
        }
        this.busy = false;
      });
    }

    animateTo(next, done) {
      this.tiles.forEach((row) => row.forEach((t) => t && t.destroy()));
      this.tiles = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
      for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
          if (next[r][c]) this.tiles[r][c] = this.makeTile(r, c, next[r][c]);
        }
      }
      this.time.delayedCall(130, done);
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

  window.__playhub2048Reset = () => {
    scoreEl.textContent = "0";
    if (!gameRef) return;
    const scene = gameRef.scene.getScene("Game2048");
    if (!scene) return;
    // Cancel in-flight move timers before remount so they cannot restore the old board.
    if (scene.time) scene.time.removeAllEvents();
    if (scene.tweens) scene.tweens.killAll();
    if (scene.sys && scene.sys.isActive()) {
      scene.scene.restart();
      return;
    }
    if (typeof scene.newGame === "function") scene.newGame();
  };

  const boot = () => {
    const el = document.getElementById("game-container");
    // Fixed square size; Scale.NONE avoids FIT letterbox / pointer interference with HTML button.
    const w = Math.max(280, Math.min(480, el.clientWidth || 360));
    el.style.width = w + "px";
    el.style.height = w + "px";
    el.style.margin = "0 auto";

    gameRef = new Phaser.Game({
      type: Phaser.AUTO,
      parent: "game-container",
      width: w,
      height: w,
      backgroundColor: "#111527",
      scene: [Game2048],
      scale: {
        mode: Phaser.Scale.NONE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      input: {
        activePointers: 3,
      },
    });

    const btn = document.getElementById("btn-new");
    if (btn && !btn.dataset.phaserBound) {
      btn.dataset.phaserBound = "1";
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        window.__playhub2048Reset();
      });
    }
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
