(() => {
  const N = 4;
  const movesEl = document.getElementById("moves");

  class SlidingScene extends Phaser.Scene {
    constructor() {
      super("Sliding");
      this.board = [];
      this.sprites = [];
      this.blank = { r: N - 1, c: N - 1 };
      this.moves = 0;
      this.busy = false;
      this.cell = 0;
      this.originX = 0;
      this.originY = 0;
      this.pad = 8;
    }

    create() {
      const W = this.scale.width;
      const H = this.scale.height;
      this.cell = Math.floor((Math.min(W, H) - this.pad * (N + 1)) / N);
      const boardSize = this.cell * N + this.pad * (N + 1);
      this.originX = (W - boardSize) / 2;
      this.originY = (H - boardSize) / 2;

      this.add.rectangle(W / 2, H / 2, boardSize + 6, boardSize + 6, 0x1a2140).setStrokeStyle(2, 0x4a5a8a);

      this.msg = this.add.text(W / 2, H / 2, "", {
        fontFamily: "Noto Sans KR, sans-serif",
        fontSize: "30px",
        fontStyle: "bold",
        color: "#ffffff",
        backgroundColor: "#000000aa",
        padding: { x: 18, y: 12 },
        align: "center",
      }).setOrigin(0.5).setDepth(30).setVisible(false);

      document.getElementById("btn-shuffle").onclick = () => this.shuffle(true);
      this.shuffle(true);
    }

    pos(r, c) {
      return {
        x: this.originX + this.pad + c * (this.cell + this.pad) + this.cell / 2,
        y: this.originY + this.pad + r * (this.cell + this.pad) + this.cell / 2,
      };
    }

    colorFor(n) {
      const hue = 200 + (n * 12) % 80;
      return Phaser.Display.Color.HSLToColor(hue / 360, 0.55, 0.48).color;
    }

    makeTile(n, r, c) {
      const { x, y } = this.pos(r, c);
      const bg = this.add.rectangle(0, 0, this.cell - 2, this.cell - 2, this.colorFor(n), 1)
        .setStrokeStyle(2, 0xffffff33)
        .setInteractive({ useHandCursor: true });
      const label = this.add.text(0, 0, String(n), {
        fontFamily: "Noto Sans KR, sans-serif",
        fontSize: "36px",
        fontStyle: "bold",
        color: "#ffffff",
      }).setOrigin(0.5);
      const cont = this.add.container(x, y, [bg, label]);
      cont.n = n;
      cont.r = r;
      cont.c = c;
      bg.on("pointerdown", () => { if (window.PlayHubAudio) window.PlayHubAudio.unlock(); this.onTap(cont); });
      return cont;
    }

    clearSprites() {
      this.sprites.forEach((s) => s && s.destroy());
      this.sprites = [];
    }

    rebuild() {
      this.clearSprites();
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const n = this.board[r][c];
          if (n === 0) continue;
          this.sprites.push(this.makeTile(n, r, c));
        }
      }
    }

    isSolved() {
      let k = 1;
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          if (r === N - 1 && c === N - 1) return this.board[r][c] === 0;
          if (this.board[r][c] !== k++) return false;
        }
      }
      return true;
    }

    inversionCount(arr) {
      let inv = 0;
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          if (arr[i] && arr[j] && arr[i] > arr[j]) inv++;
        }
      }
      return inv;
    }

    solvable(flat) {
      const inv = this.inversionCount(flat);
      const blankRowFromBottom = N - Math.floor(flat.indexOf(0) / N);
      if (N % 2 === 1) return inv % 2 === 0;
      if (blankRowFromBottom % 2 === 0) return inv % 2 === 1;
      return inv % 2 === 0;
    }

    shuffle(resetMoves) {
      if (this.busy) return;
      this.msg.setVisible(false);
      let flat;
      do {
        flat = [...Array(N * N).keys()];
        Phaser.Utils.Array.Shuffle(flat);
      } while (!this.solvable(flat) || flat.every((v, i) => (i === N * N - 1 ? v === 0 : v === i + 1)));

      this.board = [];
      for (let r = 0; r < N; r++) {
        this.board[r] = [];
        for (let c = 0; c < N; c++) {
          const v = flat[r * N + c];
          this.board[r][c] = v;
          if (v === 0) this.blank = { r, c };
        }
      }
      if (resetMoves) this.moves = 0;
      movesEl.textContent = String(this.moves);
      this.rebuild();
    }

    onTap(tile) {
      if (this.busy) return;
      const br = this.blank.r, bc = this.blank.c;
      const dr = Math.abs(tile.r - br), dc = Math.abs(tile.c - bc);
      if (dr + dc !== 1) return;

      this.busy = true;
      const tr = tile.r, tc = tile.c;
      this.board[br][bc] = tile.n;
      this.board[tr][tc] = 0;
      this.blank = { r: tr, c: tc };
      tile.r = br;
      tile.c = bc;
      this.moves += 1;
      movesEl.textContent = String(this.moves);
      if (window.PlayHubAudio) window.PlayHubAudio.play("move");

      const target = this.pos(br, bc);
      this.tweens.add({
        targets: tile,
        x: target.x,
        y: target.y,
        duration: 120,
        ease: "Sine.Out",
        onComplete: () => {
          this.busy = false;
          if (this.isSolved()) {
            this.msg.setText("완료!\n이동 " + this.moves + "회").setVisible(true);
          }
        },
      });
    }
  }

  const boot = () => {
    const el = document.getElementById("game-container");
    const w = Math.min(480, el.clientWidth || 360);
    new Phaser.Game({
      type: Phaser.AUTO,
      parent: "game-container",
      width: w,
      height: w,
      backgroundColor: "#111527",
      scene: [SlidingScene],
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
