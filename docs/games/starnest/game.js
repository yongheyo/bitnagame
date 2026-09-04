(() => {
  const W = 360;
  const H = 480;
  const SAVE_KEY = "bitnagame-starnest";
  const OFFLINE_RATIO = 0.5;
  const OFFLINE_CAP_MS = 8 * 60 * 60 * 1000;
  const TAP_CD_MS = 280;

  const el = {
    dust: document.getElementById("dust"),
    rate: document.getElementById("rate"),
    dist: document.getElementById("dist"),
    offline: document.getElementById("offline-overlay"),
    offlineAmt: document.getElementById("offline-amt"),
    offlineClaim: document.getElementById("offline-claim"),
    upGather: document.getElementById("up-gather"),
    upHull: document.getElementById("up-hull"),
    upDrone: document.getElementById("up-drone"),
    lvGather: document.getElementById("lv-gather"),
    lvHull: document.getElementById("lv-hull"),
    lvDrone: document.getElementById("lv-drone"),
    costGather: document.getElementById("cost-gather"),
    costHull: document.getElementById("cost-hull"),
    costDrone: document.getElementById("cost-drone"),
  };

  function sfx(name) {
    try {
      window.BitnaGameAudio && window.BitnaGameAudio.play(name);
    } catch (_) {}
  }

  function gatherRate(lv) {
    return 1 + lv * 0.55;
  }
  function gatherCost(lv) {
    return Math.floor(12 * Math.pow(1.55, lv));
  }
  function hullDist(lv) {
    return Math.floor(10 + lv * 18);
  }
  function hullCost(lv) {
    return Math.floor(20 * Math.pow(1.6, lv));
  }
  function droneMult(lv) {
    return 1 + lv * 0.5;
  }
  function droneCost(lv) {
    return Math.floor(15 * Math.pow(1.58, lv));
  }

  function loadState() {
    const base = {
      dust: 0,
      gatherLv: 0,
      hullLv: 0,
      droneLv: 0,
      lastSeen: Date.now(),
    };
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return base;
      const p = JSON.parse(raw);
      return {
        dust: Math.max(0, Number(p.dust) || 0),
        gatherLv: Math.max(0, Math.floor(Number(p.gatherLv) || 0)),
        hullLv: Math.max(0, Math.floor(Number(p.hullLv) || 0)),
        droneLv: Math.max(0, Math.floor(Number(p.droneLv) || 0)),
        lastSeen: Number(p.lastSeen) || Date.now(),
      };
    } catch (_) {
      return base;
    }
  }

  function saveState(st) {
    try {
      localStorage.setItem(
        SAVE_KEY,
        JSON.stringify({
          dust: st.dust,
          gatherLv: st.gatherLv,
          hullLv: st.hullLv,
          droneLv: st.droneLv,
          lastSeen: Date.now(),
        })
      );
    } catch (_) {}
  }

  const state = loadState();
  let pendingOffline = 0;
  let tapReadyAt = 0;
  let gameRef = null;
  let sceneRef = null;

  (function calcOffline() {
    const elapsed = Math.max(0, Date.now() - state.lastSeen);
    const capped = Math.min(elapsed, OFFLINE_CAP_MS);
    const rate = gatherRate(state.gatherLv);
    pendingOffline = Math.floor((capped / 1000) * rate * OFFLINE_RATIO);
    if (pendingOffline < 1) pendingOffline = 0;
  })();

  function fmt(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
    if (n >= 1e4) return (n / 1e3).toFixed(1) + "K";
    return String(Math.floor(n));
  }

  function syncHud() {
    el.dust.textContent = fmt(state.dust);
    el.rate.textContent = gatherRate(state.gatherLv).toFixed(1);
    el.dist.textContent = String(hullDist(state.hullLv));
    el.lvGather.textContent = String(state.gatherLv);
    el.lvHull.textContent = String(state.hullLv);
    el.lvDrone.textContent = String(state.droneLv);
    el.costGather.textContent = fmt(gatherCost(state.gatherLv));
    el.costHull.textContent = fmt(hullCost(state.hullLv));
    el.costDrone.textContent = fmt(droneCost(state.droneLv));
    const canG = state.dust >= gatherCost(state.gatherLv);
    const canH = state.dust >= hullCost(state.hullLv);
    const canD = state.dust >= droneCost(state.droneLv);
    el.upGather.disabled = !canG;
    el.upHull.disabled = !canH;
    el.upDrone.disabled = !canD;
    el.upGather.classList.toggle("can-buy", canG);
    el.upHull.classList.toggle("can-buy", canH);
    el.upDrone.classList.toggle("can-buy", canD);
  }

  function showOffline() {
    if (pendingOffline <= 0) {
      el.offline.hidden = true;
      el.offline.setAttribute("aria-hidden", "true");
      return;
    }
    el.offlineAmt.textContent = fmt(pendingOffline);
    el.offline.hidden = false;
    el.offline.setAttribute("aria-hidden", "false");
  }

  function claimOffline() {
    if (pendingOffline <= 0) return;
    state.dust += pendingOffline;
    pendingOffline = 0;
    saveState(state);
    syncHud();
    showOffline();
    sfx("win");
    if (sceneRef) sceneRef.flashUpgrade(0xfff4a3);
  }

  function tryUpgrade(kind) {
    let cost = 0;
    if (kind === "gather") cost = gatherCost(state.gatherLv);
    else if (kind === "hull") cost = hullCost(state.hullLv);
    else if (kind === "drone") cost = droneCost(state.droneLv);
    else return;
    if (state.dust < cost) {
      sfx("invalid");
      return;
    }
    state.dust -= cost;
    if (kind === "gather") state.gatherLv += 1;
    else if (kind === "hull") {
      state.hullLv += 1;
      if (sceneRef) sceneRef.refreshShip();
    } else state.droneLv += 1;
    saveState(state);
    syncHud();
    sfx("match");
    if (sceneRef) sceneRef.flashUpgrade(kind === "hull" ? 0x8eb6ff : 0x7c5cff);
  }

  function manualTap() {
    const now = Date.now();
    if (now < tapReadyAt) return;
    tapReadyAt = now + TAP_CD_MS;
    const gain = droneMult(state.droneLv);
    state.dust += gain;
    saveState(state);
    syncHud();
    sfx("click");
    if (sceneRef) sceneRef.spawnTapFx();
  }

  class StarNestScene extends Phaser.Scene {
    constructor() {
      super("StarNest");
    }

    create() {
      sceneRef = this;
      this.add.rectangle(W / 2, H / 2, W, H, 0x070b18);
      // stars
      for (let i = 0; i < 40; i++) {
        const s = this.add.circle(
          Phaser.Math.Between(8, W - 8),
          Phaser.Math.Between(8, H - 8),
          Phaser.Math.FloatBetween(0.6, 1.8),
          0xffffff,
          Phaser.Math.FloatBetween(0.25, 0.85)
        );
        this.tweens.add({
          targets: s,
          alpha: { from: s.alpha, to: 0.15 },
          duration: Phaser.Math.Between(900, 2200),
          yoyo: true,
          repeat: -1,
        });
      }
      this.shipRoot = this.add.container(W / 2, H / 2 - 20);
      this.refreshShip();
      const hit = this.add.circle(W / 2, H / 2 - 20, 72, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
      hit.on("pointerdown", () => manualTap());
      this.time.addEvent({
        delay: 100,
        loop: true,
        callback: () => {
          const add = gatherRate(state.gatherLv) * 0.1;
          state.dust += add;
          if (Math.random() < 0.12) this.spawnIdleParticle();
          syncHud();
        },
      });
      this.time.addEvent({
        delay: 2000,
        loop: true,
        callback: () => saveState(state),
      });
    }

    refreshShip() {
      if (!this.shipRoot) return;
      if (this._floatTween) {
        this._floatTween.stop();
        this._floatTween = null;
      }
      this.shipRoot.removeAll(true);
      this.shipRoot.y = H / 2 - 20;
      const stage = Math.min(6, state.hullLv);
      const bodyW = 36 + stage * 6;
      const bodyH = 54 + stage * 8;
      const color = [0x5b8cff, 0x7c5cff, 0x3dd6c6, 0xffb84d, 0xff6bb5, 0xe8f0ff, 0xfff4a3][stage];
      const hull = this.add.ellipse(0, 0, bodyW, bodyH, color).setStrokeStyle(2, 0xffffff, 0.45);
      const cabin = this.add.circle(0, -bodyH * 0.18, 8 + stage, 0x0b1020, 0.85);
      const wingL = this.add.triangle(-bodyW * 0.55, 8, 0, -10 - stage, 18 + stage, 16, 0, 14, color).setAlpha(0.9);
      const wingR = this.add.triangle(bodyW * 0.55, 8, 0, -10 - stage, 0, 14, 18 + stage, 16, color).setAlpha(0.9);
      const flame = this.add.triangle(0, bodyH * 0.52, -6 - stage * 0.5, 0, 6 + stage * 0.5, 0, 0, 14 + stage, 0xff8a3d);
      this.tweens.add({
        targets: flame,
        scaleY: { from: 0.85, to: 1.25 },
        alpha: { from: 0.7, to: 1 },
        duration: 220,
        yoyo: true,
        repeat: -1,
      });
      this.shipRoot.add([wingL, wingR, hull, cabin, flame]);
      this._floatTween = this.tweens.add({
        targets: this.shipRoot,
        y: this.shipRoot.y - 6,
        duration: 1400,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }

    spawnTapFx() {
      for (let i = 0; i < 6; i++) {
        const p = this.add.circle(W / 2, H / 2 - 20, Phaser.Math.Between(2, 4), 0xfff4a3, 0.95);
        this.tweens.add({
          targets: p,
          x: W / 2 + Phaser.Math.Between(-50, 50),
          y: H / 2 - 20 + Phaser.Math.Between(-60, 20),
          alpha: 0,
          duration: 320,
          onComplete: () => p.destroy(),
        });
      }
    }

    spawnIdleParticle() {
      const p = this.add.circle(W / 2 + Phaser.Math.Between(-20, 20), H / 2 + 40, 2, 0x8eb6ff, 0.8);
      this.tweens.add({
        targets: p,
        y: p.y - 70,
        alpha: 0,
        duration: 700,
        onComplete: () => p.destroy(),
      });
    }

    flashUpgrade(color) {
      const flash = this.add.rectangle(W / 2, H / 2, W, H, color, 0.22).setDepth(20);
      this.tweens.add({
        targets: flash,
        alpha: 0,
        duration: 280,
        onComplete: () => flash.destroy(),
      });
    }
  }

  function boot() {
    const host = document.getElementById("game-container");
    if (!host) return;
    const boxW = Math.max(260, Math.min(W, window.innerWidth - 24));
    const boxH = Math.round((boxW / W) * H);
    host.style.width = boxW + "px";
    host.style.height = boxH + "px";
    host.style.maxWidth = "100%";
    host.style.margin = "0 auto";
    host.style.overflow = "hidden";
    gameRef = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host,
      width: W,
      height: H,
      backgroundColor: "#070b18",
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: W,
        height: H,
      },
      scene: [StarNestScene],
    });
    if (gameRef.scale) gameRef.scale.refresh();
  }

  el.offlineClaim.addEventListener("click", (e) => {
    e.preventDefault();
    claimOffline();
  });
  el.upGather.addEventListener("click", (e) => {
    e.preventDefault();
    tryUpgrade("gather");
  });
  el.upHull.addEventListener("click", (e) => {
    e.preventDefault();
    tryUpgrade("hull");
  });
  el.upDrone.addEventListener("click", (e) => {
    e.preventDefault();
    tryUpgrade("drone");
  });

  window.addEventListener("beforeunload", () => saveState(state));
  syncHud();
  showOffline();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
