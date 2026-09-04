(() => {
  const N = 4;
  const PAD = 10;
  const MOVE_MS = 130;
  const SWIPE_MIN = 28;

  const movesEl = document.getElementById("moves");
  const overlayEl = document.getElementById("game-overlay");
  const overlayTitle = document.getElementById("overlay-title");
  const overlaySub = document.getElementById("overlay-sub");

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
  }

  function showClearOverlay(moves) {
    if (!overlayEl || !overlayTitle || !overlaySub) return;
    overlayTitle.textContent = "완료!";
    overlaySub.textContent = "이동 " + moves + "회";
    overlayEl.hidden = false;
    overlayEl.setAttribute("aria-hidden", "false");
  }

  class SlidingScene extends Phaser.Scene {
    constructor() {
      super("Sliding");
      this.board = [];
      this.sprites = [];
      this.blank = { r: N - 1, c: N - 1 };
      this.moves = 0;
      this.busy = false;
      this.cleared = false;
      this.cell = 0;
      this.originX = 0;
      this.originY = 0;
      this.boardPx = 0;
      this.gen = 0;
      this._swipeArmed = false;
      this._sx = 0;
      this._sy = 0;
    }

    create() {
      sceneRef = this;
      this.gen = resetGen;

      const W = this.scale.width;
      const H = this.scale.height;
      this.cell = Math.floor((Math.min(W, H) - PAD * (N + 1)) / N);
      this.boardPx = this.cell * N + PAD * (N + 1);
      this.originX = (W - this.boardPx) / 2;
      this.originY = (H - this.boardPx) / 2;

      this.add
        .rectangle(W / 2, H / 2, this.boardPx + 8, this.boardPx + 8, 0x1a2140)
        .setStrokeStyle(2, 0x4a5a8a);

      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const { x, y } = this.pos(r, c);
          this.add
            .rectangle(x, y, this.cell, this.cell, (r + c) % 2 ? 0x222a45 : 0x1c233b)
            .setStrokeStyle(1, 0x3d4666);
        }
      }

      this.tileLayer = this.add.container(0, 0);

      // Swipe on the board: move the tile that slides into the blank.
      this.input.on("pointerdown", (p) => {
        unlockAudio();
        this._swipeArmed = true;
        this._sx = p.x;
        this._sy = p.y;
      });
      this.input.on("pointerup", (p) => {
        if (!this._swipeArmed) return;
        this._swipeArmed = false;
        if (this.busy || this.cleared) return;
        const dx = p.x - this._sx;
        const dy = p.y - this._sy;
        if (Math.hypot(dx, dy) < SWIPE_MIN) return;
        const dir =
          Math.abs(dx) > Math.abs(dy)
            ? dx > 0
              ? "right"
              : "left"
            : dy > 0
              ? "down"
              : "up";
        this.trySwipe(dir);
      });
      this.input.on("pointerupoutside", () => {
        this._swipeArmed = false;
      });

      this.shuffleBoard(false);
    }

    hardReset() {
      this.gen = resetGen;
      if (this.tweens) this.tweens.killAll();
      if (this.time) this.time.removeAllEvents();
      this.busy = false;
      this.cleared = false;
      this._swipeArmed = false;
      hideOverlay();
      this.shuffleBoard(true);
    }

    pos(r, c) {
      return {
        x: this.originX + PAD + c * (this.cell + PAD) + this.cell / 2,
        y: this.originY + PAD + r * (this.cell + PAD) + this.cell / 2,
      };
    }

    colorFor(n) {
      const hue = 200 + ((n * 12) % 80);
      return Phaser.Display.Color.HSLToColor(hue / 360, 0.55, 0.48).color;
    }

    makeTile(n, r, c) {
      const { x, y } = this.pos(r, c);
      const bg = this.add
        .rectangle(0, 0, this.cell - 2, this.cell - 2, this.colorFor(n), 1)
        .setStrokeStyle(2, 0xffffff33)
        .setInteractive({ useHandCursor: true });
      const fontSize = Math.max(22, Math.floor(this.cell * 0.42));
      const label = this.add
        .text(0, 0, String(n), {
          fontFamily: "Noto Sans KR, sans-serif",
          fontSize: fontSize + "px",
          fontStyle: "bold",
          color: "#ffffff",
        })
        .setOrigin(0.5);
      const cont = this.add.container(x, y, [bg, label]);
      cont.n = n;
      cont.r = r;
      cont.c = c;
      this.tileLayer.add(cont);

      bg.on("pointerdown", () => {
        unlockAudio();
        // Mark so a short tap does not also fire as a swipe move.
        this._tapTile = cont;
      });
      bg.on("pointerup", () => {
        if (this._tapTile === cont) {
          this._tapTile = null;
          this._swipeArmed = false;
          this.onTap(cont);
        }
      });
      return cont;
    }

    clearSprites() {
      if (this.sprites && this.sprites.length) {
        this.sprites.forEach((s) => {
          if (s && s.destroy) s.destroy();
        });
      }
      this.sprites = [];
      if (this.tileLayer) this.tileLayer.removeAll(true);
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

    // Classic 15-puzzle solvability: for even N, blank row from bottom matters.
    solvable(flat) {
      const inv = this.inversionCount(flat);
      const blankRowFromBottom = N - Math.floor(flat.indexOf(0) / N);
      if (N % 2 === 1) return inv % 2 === 0;
      if (blankRowFromBottom % 2 === 0) return inv % 2 === 1;
      return inv % 2 === 0;
    }

    isIdentity(flat) {
      return flat.every((v, i) => (i === N * N - 1 ? v === 0 : v === i + 1));
    }

    shuffleBoard(playClick) {
      if (this.tweens) this.tweens.killAll();
      if (this.time) this.time.removeAllEvents();

      this.busy = false;
      this.cleared = false;
      this._swipeArmed = false;
      this._tapTile = null;
      hideOverlay();

      let flat;
      do {
        flat = [...Array(N * N).keys()];
        Phaser.Utils.Array.Shuffle(flat);
      } while (!this.solvable(flat) || this.isIdentity(flat));

      this.board = [];
      for (let r = 0; r < N; r++) {
        this.board[r] = [];
        for (let c = 0; c < N; c++) {
          const v = flat[r * N + c];
          this.board[r][c] = v;
          if (v === 0) this.blank = { r, c };
        }
      }

      this.moves = 0;
      if (movesEl) movesEl.textContent = "0";
      this.rebuild();
      if (playClick) sfx("click");
    }

    findTileAt(r, c) {
      return this.sprites.find((s) => s && s.r === r && s.c === c) || null;
    }

    // Swipe direction: which tile slides into the blank (opposite of blank motion).
    trySwipe(dir) {
      if (this.busy || this.cleared) return;
      const br = this.blank.r;
      const bc = this.blank.c;
      let tr = br;
      let tc = bc;
      if (dir === "left") tc = bc + 1;
      else if (dir === "right") tc = bc - 1;
      else if (dir === "up") tr = br + 1;
      else if (dir === "down") tr = br - 1;
      if (tr < 0 || tr >= N || tc < 0 || tc >= N) return;
      const tile = this.findTileAt(tr, tc);
      if (tile) this.onTap(tile);
    }

    onTap(tile) {
      if (!tile || this.busy || this.cleared) return;
      const br = this.blank.r;
      const bc = this.blank.c;
      const dr = Math.abs(tile.r - br);
      const dc = Math.abs(tile.c - bc);
      if (dr + dc !== 1) return;

      const myGen = this.gen;
      this.busy = true;
      const tr = tile.r;
      const tc = tile.c;
      this.board[br][bc] = tile.n;
      this.board[tr][tc] = 0;
      this.blank = { r: tr, c: tc };
      tile.r = br;
      tile.c = bc;
      this.moves += 1;
      if (movesEl) movesEl.textContent = String(this.moves);
      sfx("move");

      const target = this.pos(br, bc);
      this.tweens.add({
        targets: tile,
        x: target.x,
        y: target.y,
        duration: MOVE_MS,
        ease: "Sine.Out",
        onComplete: () => {
          if (this.gen !== myGen) return;
          this.busy = false;
          if (this.isSolved()) {
            this.cleared = true;
            sfx("win");
            showClearOverlay(this.moves);
          }
        },
      });
    }
  }

  function hardSlidingReset() {
    unlockAudio();
    if (movesEl) movesEl.textContent = "0";
    hideOverlay();
    resetGen += 1;

    if (!gameRef) return;
    const scene = gameRef.scene.getScene("Sliding") || sceneRef;
    if (!scene) return;

    if (scene.tweens) scene.tweens.killAll();
    if (scene.time) scene.time.removeAllEvents();
    scene.busy = false;
    scene.cleared = false;
    scene.gen = resetGen;

    if (scene.sys && scene.sys.isActive() && typeof scene.hardReset === "function") {
      scene.hardReset();
      return;
    }
    if (scene.sys && scene.sys.isActive()) {
      scene.scene.restart();
      return;
    }
    if (typeof scene.shuffleBoard === "function") scene.shuffleBoard(true);
  }

  // Bitna + legacy PlayHub aliases — both work while cleared/busy via resetGen.
  window.__bitnaSlidingReset = hardSlidingReset;
  window.__playhubSlidingReset = hardSlidingReset;

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
      scene: [SlidingScene],
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
        hardSlidingReset();
      });
    };
    // Always-visible controls + clear overlay — hard reset even while cleared/busy.
    bindReset("btn-new");
    bindReset("btn-shuffle");
    bindReset("overlay-new");
    bindReset("overlay-shuffle");
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
