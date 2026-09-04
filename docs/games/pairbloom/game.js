(() => {
  const BEST_KEY = "bitnagame-pairbloom-best-moves";
  const SIZE = 4;
  const PAIRS = 8;
  const W = 360;
  const H = 420;
  const PALETTE = [
    { color: 0xff6b9a, symbol: "◆" },
    { color: 0x5b8cff, symbol: "●" },
    { color: 0x3dd6c6, symbol: "▲" },
    { color: 0xffb84d, symbol: "★" },
    { color: 0xb388ff, symbol: "■" },
    { color: 0x7dffb3, symbol: "✚" },
    { color: 0xff8e53, symbol: "✦" },
    { color: 0x6ec6ff, symbol: "◉" },
  ];

  const el = {
    moves: document.getElementById("moves"),
    best: document.getElementById("best"),
    overlay: document.getElementById("game-overlay"),
    title: document.getElementById("overlay-title"),
    sub: document.getElementById("overlay-sub"),
    overlayNew: document.getElementById("overlay-new"),
    btnNew: document.getElementById("btn-new"),
  };

  function sfx(name) {
    try {
      window.BitnaGameAudio && window.BitnaGameAudio.play(name);
    } catch (_) {}
  }

  function readBest() {
    const n = parseInt(localStorage.getItem(BEST_KEY) || "", 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  function writeBest(moves) {
    const cur = readBest();
    if (cur == null || moves < cur) localStorage.setItem(BEST_KEY, String(moves));
  }

  let gameRef = null;
  let hardReset = null;

  class PairBloomScene extends Phaser.Scene {
    constructor() {
      super("PairBloom");
    }

    create() {
      this.moves = 0;
      this.matched = 0;
      this.over = false;
      this.busy = false;
      this.open = [];
      this.cards = [];

      this.add.rectangle(W / 2, H / 2, W, H, 0x0b1020);
      this.deal();
      this.syncHud();
      this.hideOverlay();
      hardReset = () => this.resetGame();
    }

    deal() {
      this.cards.forEach((c) => c.container.destroy());
      this.cards = [];
      this.open = [];
      this.matched = 0;
      this.moves = 0;
      this.over = false;
      this.busy = false;

      const deck = [];
      for (let i = 0; i < PAIRS; i++) {
        deck.push(i, i);
      }
      Phaser.Utils.Array.Shuffle(deck);

      const pad = 12;
      const gap = 8;
      const cw = (W - pad * 2 - gap * (SIZE - 1)) / SIZE;
      const ch = (H - pad * 2 - gap * (SIZE - 1)) / SIZE;

      deck.forEach((pairId, idx) => {
        const r = Math.floor(idx / SIZE);
        const c = idx % SIZE;
        const x = pad + c * (cw + gap) + cw / 2;
        const y = pad + r * (ch + gap) + ch / 2;
        const meta = PALETTE[pairId];

        const container = this.add.container(x, y);
        const back = this.add.rectangle(0, 0, cw - 2, ch - 2, 0x243056).setStrokeStyle(2, 0x8eb6ff, 0.55);
        const face = this.add.rectangle(0, 0, cw - 2, ch - 2, meta.color).setStrokeStyle(2, 0xffffff, 0.35);
        const label = this.add.text(0, 0, meta.symbol, {
          fontFamily: "system-ui, sans-serif",
          fontSize: Math.floor(Math.min(cw, ch) * 0.42) + "px",
          color: "#ffffff",
        }).setOrigin(0.5);
        face.setVisible(false);
        label.setVisible(false);
        container.add([back, face, label]);
        container.setSize(cw - 2, ch - 2);
        container.setInteractive(new Phaser.Geom.Rectangle(-(cw - 2) / 2, -(ch - 2) / 2, cw - 2, ch - 2), Phaser.Geom.Rectangle.Contains);

        const card = {
          container,
          back,
          face,
          label,
          pairId,
          flipped: false,
          matched: false,
        };
        container.on("pointerdown", () => this.onCard(card));
        this.cards.push(card);
      });
      this.syncHud();
    }

    onCard(card) {
      if (this.over || this.busy || card.flipped || card.matched) return;
      this.flipUp(card);
      this.open.push(card);
      sfx("click");
      if (this.open.length < 2) return;
      this.moves += 1;
      this.syncHud();
      const [a, b] = this.open;
      this.open = [];
      if (a.pairId === b.pairId) {
        a.matched = b.matched = true;
        this.matched += 1;
        this.tweens.add({ targets: [a.container, b.container], scale: 1.08, yoyo: true, duration: 120 });
        sfx("match");
        if (this.matched >= PAIRS) this.winGame();
      } else {
        this.busy = true;
        sfx("invalid");
        this.time.delayedCall(500, () => {
          this.flipDown(a);
          this.flipDown(b);
          this.busy = false;
        });
      }
    }

    flipUp(card) {
      card.flipped = true;
      this.tweens.add({
        targets: card.container,
        scaleX: 0,
        duration: 90,
        onComplete: () => {
          card.back.setVisible(false);
          card.face.setVisible(true);
          card.label.setVisible(true);
          this.tweens.add({ targets: card.container, scaleX: 1, duration: 90 });
        },
      });
    }

    flipDown(card) {
      if (card.matched) return;
      this.tweens.add({
        targets: card.container,
        scaleX: 0,
        duration: 90,
        onComplete: () => {
          card.face.setVisible(false);
          card.label.setVisible(false);
          card.back.setVisible(true);
          card.flipped = false;
          this.tweens.add({ targets: card.container, scaleX: 1, duration: 90 });
        },
      });
    }

    winGame() {
      if (this.over) return;
      this.over = true;
      writeBest(this.moves);
      this.syncHud();
      sfx("win");
      const best = readBest();
      this.showOverlay("전부 맞춤!", `이동 ${this.moves}회 · 베스트 ${best ?? this.moves}`);
    }

    showOverlay(title, sub) {
      el.title.textContent = title;
      el.sub.textContent = sub;
      el.overlay.hidden = false;
      el.overlay.setAttribute("aria-hidden", "false");
    }

    hideOverlay() {
      el.overlay.hidden = true;
      el.overlay.setAttribute("aria-hidden", "true");
    }

    syncHud() {
      el.moves.textContent = String(this.moves);
      const best = readBest();
      el.best.textContent = best == null ? "—" : String(best);
    }

    resetGame() {
      this.hideOverlay();
      this.deal();
      sfx("click");
    }
  }

  function boot() {
    const host = document.getElementById("game-container");
    if (!host) return;
    const start = () => {
      if (gameRef) {
        gameRef.destroy(true);
        gameRef = null;
      }
      host.innerHTML = "";
      gameRef = new Phaser.Game({
        type: Phaser.AUTO,
        parent: host,
        width: W,
        height: H,
        backgroundColor: "#0b1020",
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
        scene: [PairBloomScene],
      });
    };
    requestAnimationFrame(() => requestAnimationFrame(start));
  }

  function newGame() {
    if (hardReset) hardReset();
    else boot();
  }

  el.btnNew.addEventListener("click", (e) => {
    e.preventDefault();
    newGame();
  });
  el.overlayNew.addEventListener("click", (e) => {
    e.preventDefault();
    newGame();
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
