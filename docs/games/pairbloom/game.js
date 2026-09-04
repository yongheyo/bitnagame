(() => {
  const N = 4;
  const PAIRS = 8;
  const PAD = 10;
  const FLIP_MS = 160;
  const MISMATCH_MS = 500;
  const BEST_KEY = "bitnagame-pairbloom-best";

  // Original procedural symbols + palette (no third-party assets)
  const DECK = [
    { id: 0, glyph: "◆", fill: 0xff7aa8, glow: 0xffb3d0 },
    { id: 1, glyph: "●", fill: 0x7eb0ff, glow: 0xb3d0ff },
    { id: 2, glyph: "▲", fill: 0x7ef0c3, glow: 0xb8ffe0 },
    { id: 3, glyph: "★", fill: 0xffd56a, glow: 0xffe6a8 },
    { id: 4, glyph: "✦", fill: 0xc59bff, glow: 0xdbc0ff },
    { id: 5, glyph: "◈", fill: 0xff9a6c, glow: 0xffc4a8 },
    { id: 6, glyph: "◇", fill: 0x6ce0ff, glow: 0xa8f0ff },
    { id: 7, glyph: "✿", fill: 0xff6ab5, glow: 0xffc0e0 },
  ];

  const movesEl = document.getElementById("moves");
  const bestEl = document.getElementById("best");
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

  function loadBest() {
    const v = parseInt(localStorage.getItem(BEST_KEY) || "", 10);
    return Number.isFinite(v) && v > 0 ? v : null;
  }

  function saveBest(moves) {
    const prev = loadBest();
    if (prev == null || moves < prev) {
      localStorage.setItem(BEST_KEY, String(moves));
      return moves;
    }
    return prev;
  }

  function syncBestHud() {
    const b = loadBest();
    if (bestEl) bestEl.textContent = b == null ? "—" : String(b);
  }

  function hideOverlay() {
    if (!overlayEl) return;
    overlayEl.hidden = true;
    overlayEl.setAttribute("aria-hidden", "true");
  }

  function showWinOverlay(moves, best) {
    if (!overlayEl || !overlayTitle || !overlaySub) return;
    overlayTitle.textContent = "완료!";
    const bestTxt = best != null ? " · 최고 " + best : "";
    overlaySub.textContent = "이동 " + moves + "회" + bestTxt;
    overlayEl.hidden = false;
    overlayEl.setAttribute("aria-hidden", "false");
  }

  class PairBloomScene extends Phaser.Scene {
    constructor() {
      super("PairBloom");
      this.cards = [];
      this.open = [];
      this.matched = 0;
      this.moves = 0;
      this.busy = false;
      this.cleared = false;
      this.gen = 0;
      this.cell = 0;
      this.originX = 0;
      this.originY = 0;
      this.boardPx = 0;
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

      const bg = this.add.graphics();
      bg.fillStyle(0x111527, 1);
      bg.fillRect(0, 0, W, H);
      bg.fillStyle(0x2a1a45, 0.4);
      bg.fillCircle(W * 0.3, H * 0.35, Math.min(W, H) * 0.38);
      bg.fillStyle(0x1a3050, 0.35);
      bg.fillCircle(W * 0.72, H * 0.62, Math.min(W, H) * 0.34);

      this.add
        .rectangle(W / 2, H / 2, this.boardPx + 10, this.boardPx + 10, 0x1a2140)
        .setStrokeStyle(2, 0x4a5a8a);

      this.cardLayer = this.add.container(0, 0);
      this.dealBoard(false);
      syncBestHud();
    }

    hardReset() {
      this.gen = resetGen;
      if (this.tweens) this.tweens.killAll();
      if (this.time) this.time.removeAllEvents();
      this.busy = false;
      this.cleared = false;
      this.open = [];
      hideOverlay();
      this.dealBoard(true);
    }

    pos(r, c) {
      return {
        x: this.originX + PAD + c * (this.cell + PAD) + this.cell / 2,
        y: this.originY + PAD + r * (this.cell + PAD) + this.cell / 2,
      };
    }

    makeDeckIds() {
      const ids = [];
      for (let i = 0; i < PAIRS; i++) {
        ids.push(i, i);
      }
      Phaser.Utils.Array.Shuffle(ids);
      return ids;
    }

    clearCards() {
      if (this.cards && this.cards.length) {
        this.cards.forEach((c) => {
          if (c && c.destroy) c.destroy();
        });
      }
      this.cards = [];
      if (this.cardLayer) this.cardLayer.removeAll(true);
    }

    dealBoard(playClick) {
      if (this.tweens) this.tweens.killAll();
      if (this.time) this.time.removeAllEvents();

      this.busy = false;
      this.cleared = false;
      this.open = [];
      this.matched = 0;
      this.moves = 0;
      if (movesEl) movesEl.textContent = "0";
      hideOverlay();
      this.clearCards();

      const ids = this.makeDeckIds();
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const id = ids[r * N + c];
          this.cards.push(this.makeCard(id, r, c));
        }
      }
      if (playClick) sfx("click");
    }

    makeCard(pairId, r, c) {
      const { x, y } = this.pos(r, c);
      const size = this.cell - 4;
      const meta = DECK[pairId % DECK.length];

      const back = this.add
        .rectangle(0, 0, size, size, 0x2a3358)
        .setStrokeStyle(2, 0x7a88c0);
      const petal = this.add.circle(0, 0, size * 0.18, 0x9aa8e0, 0.85);
      const ring = this.add.circle(0, 0, size * 0.28, 0x4a5a8a, 0.35);

      const face = this.add
        .rectangle(0, 0, size, size, meta.fill)
        .setStrokeStyle(2, 0xffffff55)
        .setVisible(false);
      const faceGlow = this.add
        .rectangle(0, 0, size + 6, size + 6, meta.glow, 0.3)
        .setVisible(false);
      const fontSize = Math.max(22, Math.floor(size * 0.42));
      const glyph = this.add
        .text(0, 0, meta.glyph, {
          fontFamily: "Noto Sans KR, Apple Color Emoji, sans-serif",
          fontSize: fontSize + "px",
          fontStyle: "bold",
          color: "#ffffff",
        })
        .setOrigin(0.5)
        .setVisible(false);

      const hit = this.add
        .rectangle(0, 0, size, size, 0xffffff, 0.001)
        .setInteractive({ useHandCursor: true });

      const cont = this.add.container(x, y, [faceGlow, back, petal, ring, face, glyph, hit]);
      cont.pairId = pairId;
      cont.r = r;
      cont.c = c;
      cont.faceUp = false;
      cont.matched = false;
      cont.backParts = [back, petal, ring];
      cont.faceParts = [face, faceGlow, glyph];
      cont.hit = hit;
      this.cardLayer.add(cont);

      hit.on("pointerdown", () => {
        unlockAudio();
        this.onTap(cont);
      });

      return cont;
    }

    setFace(card, up, animate, onDone) {
      if (!card) {
        if (onDone) onDone();
        return;
      }
      const doSwap = () => {
        card.faceUp = up;
        card.backParts.forEach((p) => p && p.setVisible(!up));
        card.faceParts.forEach((p) => p && p.setVisible(up));
        card.setScale(1, 1);
        if (onDone) onDone();
      };

      if (!animate) {
        doSwap();
        return;
      }

      this.tweens.add({
        targets: card,
        scaleX: 0.05,
        duration: FLIP_MS,
        ease: "Sine.In",
        onComplete: () => {
          card.faceUp = up;
          card.backParts.forEach((p) => p && p.setVisible(!up));
          card.faceParts.forEach((p) => p && p.setVisible(up));
          this.tweens.add({
            targets: card,
            scaleX: 1,
            duration: FLIP_MS,
            ease: "Sine.Out",
            onComplete: () => {
              if (onDone) onDone();
            },
          });
        },
      });
    }

    onTap(card) {
      if (!card || this.busy || this.cleared || card.matched || card.faceUp) return;
      if (this.open.length >= 2) return;

      const myGen = this.gen;
      this.busy = true;
      sfx("slide");
      this.setFace(card, true, true, () => {
        if (this.gen !== myGen) return;
        this.open.push(card);
        if (this.open.length < 2) {
          this.busy = false;
          return;
        }

        this.moves += 1;
        if (movesEl) movesEl.textContent = String(this.moves);

        const [a, b] = this.open;
        if (a.pairId === b.pairId) {
          a.matched = true;
          b.matched = true;
          this.matched += 1;
          this.open = [];
          sfx("match");
          this.pulseMatch(a);
          this.pulseMatch(b);
          this.busy = false;
          if (this.matched >= PAIRS) {
            this.cleared = true;
            const best = saveBest(this.moves);
            syncBestHud();
            sfx("win");
            showWinOverlay(this.moves, best);
          }
        } else {
          sfx("invalid");
          this.time.delayedCall(MISMATCH_MS, () => {
            if (this.gen !== myGen) return;
            let pending = 2;
            const done = () => {
              pending -= 1;
              if (pending <= 0) {
                this.open = [];
                this.busy = false;
              }
            };
            this.setFace(a, false, true, done);
            this.setFace(b, false, true, done);
          });
        }
      });
    }

    pulseMatch(card) {
      this.tweens.add({
        targets: card,
        scaleX: 1.08,
        scaleY: 1.08,
        duration: 120,
        yoyo: true,
        ease: "Sine.Out",
      });
      const flash = this.add
        .circle(card.x, card.y, this.cell * 0.35, 0xffffff, 0.45)
        .setDepth(30);
      this.tweens.add({
        targets: flash,
        scale: 1.6,
        alpha: 0,
        duration: 280,
        ease: "Cubic.Out",
        onComplete: () => flash.destroy(),
      });
    }
  }

  function hardReset() {
    unlockAudio();
    if (movesEl) movesEl.textContent = "0";
    hideOverlay();
    resetGen += 1;
    syncBestHud();

    if (!gameRef) return;
    const scene = gameRef.scene.getScene("PairBloom") || sceneRef;
    if (!scene) return;

    if (scene.tweens) scene.tweens.killAll();
    if (scene.time) scene.time.removeAllEvents();
    scene.busy = false;
    scene.cleared = false;
    scene.open = [];
    scene.gen = resetGen;

    if (scene.sys && scene.sys.isActive() && typeof scene.hardReset === "function") {
      scene.hardReset();
      return;
    }
    if (scene.sys && scene.sys.isActive()) {
      scene.scene.restart();
    }
  }

  window.__bitnaPairBloomReset = hardReset;

  const boot = () => {
    const el = document.getElementById("game-container");
    if (!el) return;

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
      scene: [PairBloomScene],
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
        hardReset();
      });
    };
    bindReset("btn-new");
    bindReset("overlay-new");
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
