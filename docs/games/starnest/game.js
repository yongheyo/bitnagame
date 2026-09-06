(() => {
  const W = 360, H = 640;
  const SAVE_KEY = "bitnagame-starnest";
  const SAVE_V = 2;
  const HP_MAX = 100;
  const OFFLINE_RATIO = 0.5;
  const OFFLINE_CAP_MS = 8 * 60 * 60 * 1000;
  const WAVE_REWARD = [0, 25, 40, 60, 85, 120];
  const ATK_DMG = [0, 10, 14, 19, 25, 32];
  const ATK_COST = [0, 20, 45, 80, 130]; // cost to go FROM level to level+1
  const ROBOT_COST = [30, 60, 100, 150, 220];
  const WAVES = [
    null,
    { n: 5, hp: 10, spd: 80, dmg: 10, gap: 1.2, bossHp: 50, bossSpd: 40, bossDmg: 30 },
    { n: 7, hp: 15, spd: 85, dmg: 10, gap: 1.1, bossHp: 80, bossSpd: 42, bossDmg: 35 },
    { n: 9, hp: 20, spd: 90, dmg: 12, gap: 1.0, bossHp: 120, bossSpd: 45, bossDmg: 40 },
    { n: 11, hp: 28, spd: 95, dmg: 12, gap: 0.95, bossHp: 170, bossSpd: 48, bossDmg: 45 },
    { n: 14, hp: 35, spd: 100, dmg: 15, gap: 0.9, bossHp: 240, bossSpd: 50, bossDmg: 50 },
  ];

  const el = {
    credits: document.getElementById("credits"),
    wave: document.getElementById("wave"),
    hp: document.getElementById("hp"),
    overlay: document.getElementById("result-overlay"),
    title: document.getElementById("result-title"),
    sub: document.getElementById("result-sub"),
    btnRetry: document.getElementById("btn-retry"),
    btnPrev: document.getElementById("btn-prev"),
    btnHangar: document.getElementById("btn-hangar"),
    btnStart: document.getElementById("btn-start"),
    panelUp: document.getElementById("panel-upgrade"),
    panelSlot: document.getElementById("panel-slots"),
    panelRobot: document.getElementById("panel-robots"),
    offline: document.getElementById("offline-overlay"),
    offlineAmt: document.getElementById("offline-amt"),
    offlineClaim: document.getElementById("offline-claim"),
    hangar: document.getElementById("hangar"),
    combatUi: document.getElementById("combat-ui"),
  };

  function sfx(n) {
    try { window.BitnaGameAudio && window.BitnaGameAudio.play(n); } catch (_) {}
  }

  function defaultState() {
    return {
      v: SAVE_V,
      credits: 0,
      atkLv: 1,
      slot1Turret: false,
      hasTurretInv: true,
      robotsHired: 0,
      bestWave: 0,
      lastSeen: Date.now(),
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return defaultState();
      const p = JSON.parse(raw);
      if (!p || p.v !== SAVE_V) return defaultState();
      return {
        v: SAVE_V,
        credits: Math.max(0, Number(p.credits) || 0),
        atkLv: Math.min(5, Math.max(1, Math.floor(Number(p.atkLv) || 1))),
        slot1Turret: !!p.slot1Turret,
        hasTurretInv: p.hasTurretInv !== false && !p.slot1Turret ? true : !!p.hasTurretInv || !!p.slot1Turret,
        robotsHired: Math.min(5, Math.max(0, Math.floor(Number(p.robotsHired) || 0))),
        bestWave: Math.min(5, Math.max(0, Math.floor(Number(p.bestWave) || 0))),
        lastSeen: Number(p.lastSeen) || Date.now(),
      };
    } catch (_) {
      return defaultState();
    }
  }

  function saveState() {
    try {
      localStorage.setItem(
        SAVE_KEY,
        JSON.stringify({
          v: SAVE_V,
          credits: state.credits,
          atkLv: state.atkLv,
          slot1Turret: state.slot1Turret,
          hasTurretInv: state.hasTurretInv,
          robotsHired: state.robotsHired,
          bestWave: state.bestWave,
          lastSeen: Date.now(),
        })
      );
    } catch (_) {}
  }

  const state = loadState();
  if (state.slot1Turret) state.hasTurretInv = false;
  let pendingOffline = 0;
  let currentWave = Math.min(5, Math.max(1, state.bestWave + 1));
  let sceneRef = null;
  let gameRef = null;
  let mode = "hangar"; // hangar | combat

  function offlineRewardBase() {
    const w = state.bestWave > 0 ? state.bestWave : 1;
    return WAVE_REWARD[w] || 25;
  }

  (function calcOffline() {
    const elapsed = Math.max(0, Date.now() - state.lastSeen);
    const capped = Math.min(elapsed, OFFLINE_CAP_MS);
    const perMin = offlineRewardBase() / 2;
    pendingOffline = Math.floor((capped / 60000) * perMin * OFFLINE_RATIO);
    if (pendingOffline < 1) pendingOffline = 0;
  })();

  function syncHud() {
    if (el.credits) el.credits.textContent = String(Math.floor(state.credits));
    if (el.wave) el.wave.textContent = String(currentWave);
    syncPanels();
  }

  function syncPanels() {
    const atkNext = document.getElementById("atk-next");
    const atkCost = document.getElementById("atk-cost");
    const atkLv = document.getElementById("atk-lv");
    const btnAtk = document.getElementById("btn-atk-up");
    if (atkLv) atkLv.textContent = String(state.atkLv);
    if (atkNext) atkNext.textContent = state.atkLv >= 5 ? "MAX" : String(ATK_DMG[state.atkLv + 1]);
    if (atkCost) atkCost.textContent = state.atkLv >= 5 ? "-" : String(ATK_COST[state.atkLv]);
    if (btnAtk) {
      btnAtk.disabled = state.atkLv >= 5 || state.credits < ATK_COST[state.atkLv];
    }
    const robotN = document.getElementById("robot-n");
    const robotCost = document.getElementById("robot-cost");
    const btnRobot = document.getElementById("btn-robot");
    if (robotN) robotN.textContent = String(state.robotsHired);
    if (robotCost) robotCost.textContent = state.robotsHired >= 5 ? "MAX" : String(ROBOT_COST[state.robotsHired]);
    if (btnRobot) btnRobot.disabled = state.robotsHired >= 5 || state.credits < ROBOT_COST[state.robotsHired];

    for (let i = 1; i <= 6; i++) {
      const slot = document.getElementById("slot-" + i);
      if (!slot) continue;
      slot.classList.remove("locked", "empty", "equipped");
      if (i > 1) {
        slot.classList.add("locked");
        slot.textContent = i + " 잠금";
      } else if (state.slot1Turret) {
        slot.classList.add("equipped");
        slot.textContent = "1 터렛 장착";
      } else {
        slot.classList.add("empty");
        slot.textContent = "1 비어 있음";
      }
    }
    const inv = document.getElementById("inv-turret");
    const btnEquip = document.getElementById("btn-equip");
    if (inv) inv.textContent = state.hasTurretInv ? "시작 터렛 ×1" : (state.slot1Turret ? "장착됨" : "없음");
    if (btnEquip) btnEquip.disabled = !state.hasTurretInv || state.slot1Turret;
  }

  function showHangar() {
    mode = "hangar";
    if (el.hangar) el.hangar.hidden = false;
    if (el.combatUi) el.combatUi.hidden = true;
    if (el.overlay) {
      el.overlay.hidden = true;
      el.overlay.setAttribute("aria-hidden", "true");
    }
    syncHud();
  }

  function showCombat() {
    mode = "combat";
    if (el.hangar) el.hangar.hidden = true;
    if (el.combatUi) el.combatUi.hidden = false;
    syncHud();
  }

  function showResult(won, reward) {
    if (!el.overlay) return;
    el.overlay.hidden = false;
    el.overlay.setAttribute("aria-hidden", "false");
    if (won) {
      el.title.textContent = "웨이브 " + currentWave + " 클리어!";
      el.sub.textContent = "크레딧 +" + reward + " · 보유 " + Math.floor(state.credits);
      if (el.btnPrev) el.btnPrev.hidden = true;
      if (el.btnRetry) el.btnRetry.hidden = true;
      if (el.btnHangar) el.btnHangar.hidden = false;
    } else {
      el.title.textContent = "패배";
      el.sub.textContent = "웨이브 " + currentWave + "에서 격파되었습니다.";
      if (el.btnRetry) el.btnRetry.hidden = false;
      if (el.btnPrev) el.btnPrev.hidden = currentWave <= 1;
      if (el.btnHangar) el.btnHangar.hidden = false;
    }
  }

  function claimOffline() {
    if (pendingOffline <= 0) return;
    state.credits += pendingOffline;
    pendingOffline = 0;
    saveState();
    syncHud();
    if (el.offline) {
      el.offline.hidden = true;
      el.overlay && el.offline.setAttribute("aria-hidden", "true");
    }
    sfx("win");
  }

  function showOffline() {
    if (!el.offline) return;
    if (pendingOffline <= 0) {
      el.offline.hidden = true;
      return;
    }
    el.offlineAmt.textContent = String(pendingOffline);
    el.offline.hidden = false;
    el.offline.setAttribute("aria-hidden", "false");
  }

  class StarNestScene extends Phaser.Scene {
    constructor() {
      super("StarNest");
    }

    create() {
      sceneRef = this;
      this.shipY = H * 0.88;
      this.shipX = W / 2;
      this.ended = true;
      this.enemies = [];
      this.projectiles = [];
      this.spawnLeft = 0;
      this.spawnTimer = 0;
      this.phase = "idle";
      this.waveSpec = null;
      this.shipHp = HP_MAX;
      this.atkCd = 0;
      this.turretCd = 0;

      this.add.rectangle(W / 2, H / 2, W, H, 0x070b18);
      for (let i = 0; i < 50; i++) {
        this.add.circle(
          Phaser.Math.Between(4, W - 4),
          Phaser.Math.Between(4, H - 4),
          Phaser.Math.FloatBetween(0.5, 1.6),
          0xffffff,
          Phaser.Math.FloatBetween(0.2, 0.7)
        );
      }
      this.ship = this.add.ellipse(this.shipX, this.shipY, 42, 56, 0x7b93ff).setStrokeStyle(2, 0xffffff, 0.5);
      this.flame = this.add.triangle(this.shipX, this.shipY + 34, -6, 0, 6, 0, 0, 14, 0xff8a3d);
      this.tweens.add({
        targets: this.flame,
        scaleY: { from: 0.85, to: 1.25 },
        alpha: { from: 0.7, to: 1 },
        duration: 200,
        yoyo: true,
        repeat: -1,
      });
      this.hpBarBg = this.add.rectangle(this.shipX, this.shipY - 42, 48, 6, 0x333a55);
      this.hpBar = this.add.rectangle(this.shipX - 24, this.shipY - 42, 48, 4, 0x7ef0c3).setOrigin(0, 0.5);
      this.status = this.add.text(W / 2, 28, "정비 중", { fontFamily: "sans-serif", fontSize: "14px", color: "#a8b0d0" }).setOrigin(0.5);
    }

    startWave(n) {
      this.ended = false;
      this.enemies.forEach((e) => { if (e.body) e.body.destroy(); if (e.hpBar) e.hpBar.destroy(); if (e.hpBarBg) e.hpBarBg.destroy(); });
      this.enemies = [];
      this.projectiles.forEach((p) => p.gfx && p.gfx.destroy());
      this.projectiles = [];
      this.waveSpec = WAVES[n];
      this.spawnLeft = this.waveSpec.n;
      this.spawnTimer = 0.3;
      this.phase = "normal";
      this.shipHp = HP_MAX;
      this.atkCd = 0;
      this.turretCd = 0;
      this.syncHp();
      this.status.setText("웨이브 " + n);
      sfx("match");
      if (el.hp) el.hp.textContent = String(this.shipHp);
    }

    syncHp() {
      const r = Math.max(0, this.shipHp / HP_MAX);
      this.hpBar.width = 48 * r;
      if (el.hp) el.hp.textContent = String(Math.max(0, Math.ceil(this.shipHp)));
    }

    pickTarget() {
      const alive = this.enemies.filter((e) => e.alive);
      if (!alive.length) return null;
      alive.sort((a, b) => {
        if (b.body.y !== a.body.y) return b.body.y - a.body.y;
        return Math.abs(a.body.x - this.shipX) - Math.abs(b.body.x - this.shipX);
      });
      return alive[0];
    }

    fireAt(target, dmg, color) {
      const gfx = this.add.circle(this.shipX, this.shipY - 28, 3.5, color);
      this.projectiles.push({ gfx, target, dmg, speed: 600, alive: true });
    }

    spawnNormal() {
      const spec = this.waveSpec;
      const x = Phaser.Math.Between(40, W - 40);
      const body = this.add.rectangle(x, -10, 20, 24, 0xff5d8f).setStrokeStyle(1, 0xffb0c4);
      const hpBarBg = this.add.rectangle(x, 6, 22, 3, 0x333a55);
      const hpBar = this.add.rectangle(x - 11, 6, 22, 2, 0xff7eb6).setOrigin(0, 0.5);
      this.enemies.push({
        body, hpBarBg, hpBar, hp: spec.hp, maxHp: spec.hp, dmg: spec.dmg, speed: spec.spd, boss: false, alive: true,
      });
    }

    spawnBoss() {
      const spec = this.waveSpec;
      const body = this.add.rectangle(W / 2, 40, 48, 40, 0xff2e63).setStrokeStyle(2, 0xffb0c4);
      const hpBarBg = this.add.rectangle(W / 2, 18, 56, 5, 0x333a55);
      const hpBar = this.add.rectangle(W / 2 - 28, 18, 56, 4, 0xffd166).setOrigin(0, 0.5);
      this.enemies.push({
        body, hpBarBg, hpBar, hp: spec.bossHp, maxHp: spec.bossHp, dmg: spec.bossDmg, speed: spec.bossSpd, boss: true, alive: true,
      });
      this.status.setText("보스!");
      sfx("click");
    }

    damageEnemy(e, dmg) {
      if (!e.alive) return;
      e.hp -= dmg;
      e.hpBar.width = Math.max(0, (e.hp / e.maxHp) * (e.boss ? 56 : 22));
      if (e.hp <= 0) {
        e.alive = false;
        const wasBoss = e.boss;
        e.body.destroy();
        e.hpBar.destroy();
        e.hpBarBg.destroy();
        if (wasBoss) this.onClear();
      }
    }

    hitShip(dmg) {
      this.shipHp -= dmg;
      this.syncHp();
      this.ship.setFillStyle(0xffaaaa);
      this.time.delayedCall(80, () => { if (!this.ended) this.ship.setFillStyle(0x7b93ff); });
      if (this.shipHp <= 0) {
        this.shipHp = 0;
        this.onDefeat();
      }
    }

    onClear() {
      if (this.ended) return;
      this.ended = true;
      this.phase = "idle";
      const reward = WAVE_REWARD[currentWave] || 0;
      state.credits += reward;
      if (currentWave > state.bestWave) state.bestWave = currentWave;
      saveState();
      syncHud();
      sfx("win");
      showResult(true, reward);
      if (currentWave < 5) currentWave += 1;
    }

    onDefeat() {
      if (this.ended) return;
      this.ended = true;
      this.phase = "idle";
      saveState();
      sfx("invalid");
      showResult(false, 0);
    }

    update(_, delta) {
      if (this.ended || this.phase === "idle") return;
      const dt = Math.min(delta, 50) / 1000;

      if (this.phase === "normal") {
        if (this.spawnLeft > 0) {
          this.spawnTimer -= dt;
          if (this.spawnTimer <= 0) {
            this.spawnNormal();
            this.spawnLeft--;
            this.spawnTimer = this.waveSpec.gap;
          }
        } else if (this.enemies.every((e) => !e.alive)) {
          this.phase = "boss";
          this.spawnBoss();
        }
      }

      this.atkCd = Math.max(0, this.atkCd - dt);
      this.turretCd = Math.max(0, this.turretCd - dt);
      const target = this.pickTarget();
      if (target && this.atkCd <= 0) {
        this.fireAt(target, ATK_DMG[state.atkLv], 0xfff4a3);
        this.atkCd = 1.0;
      }
      if (state.slot1Turret && target && this.turretCd <= 0) {
        this.fireAt(target, 6, 0x7ef0c3);
        this.turretCd = 1.5;
      }

      for (const p of this.projectiles) {
        if (!p.alive) continue;
        if (!p.target || !p.target.alive) {
          p.alive = false;
          p.gfx.destroy();
          continue;
        }
        const dx = p.target.body.x - p.gfx.x;
        const dy = p.target.body.y - p.gfx.y;
        const dist = Math.hypot(dx, dy) || 1;
        const step = p.speed * dt;
        if (step >= dist) {
          this.damageEnemy(p.target, p.dmg);
          p.alive = false;
          p.gfx.destroy();
        } else {
          p.gfx.x += (dx / dist) * step;
          p.gfx.y += (dy / dist) * step;
        }
      }
      this.projectiles = this.projectiles.filter((p) => p.alive);

      for (const e of this.enemies) {
        if (!e.alive) continue;
        const dx = this.shipX - e.body.x;
        const dy = this.shipY - e.body.y;
        const dist = Math.hypot(dx, dy) || 1;
        if (dist < 28) {
          this.hitShip(e.dmg);
          e.alive = false;
          e.body.destroy();
          e.hpBar.destroy();
          e.hpBarBg.destroy();
          if (e.boss && !this.ended) {
            // boss reached = deal dmg already; if still alive continue? boss not cleared
          }
          continue;
        }
        e.body.x += (dx / dist) * e.speed * dt;
        e.body.y += (dy / dist) * e.speed * dt;
        e.hpBarBg.x = e.body.x;
        e.hpBarBg.y = e.body.y - (e.boss ? 22 : 14);
        e.hpBar.x = e.body.x - (e.boss ? 28 : 11);
        e.hpBar.y = e.hpBarBg.y;
      }
    }
  }

  function bootPhaser() {
    const host = document.getElementById("game-container");
    if (!host) return;
    // Parent CSS sizes the display box; FIT scales the fixed 360×640 logical size into it.
    host.style.width = "100%";
    host.style.height = "100%";
    host.style.maxWidth = "100%";
    host.style.margin = "0 auto";
    host.style.overflow = "hidden";
    gameRef = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host,
      width: W,
      height: H,
      backgroundColor: "#070b18",
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: W, height: H },
      scene: [StarNestScene],
    });
    if (gameRef.scale) gameRef.scale.refresh();
  }

  function startCombat() {
    showCombat();
    if (el.overlay) {
      el.overlay.hidden = true;
      el.overlay.setAttribute("aria-hidden", "true");
    }
    if (sceneRef) sceneRef.startWave(currentWave);
    syncHud();
  }

  // wire UI
  if (el.btnStart) el.btnStart.addEventListener("click", (e) => { e.preventDefault(); startCombat(); });
  if (el.btnRetry) el.btnRetry.addEventListener("click", (e) => { e.preventDefault(); startCombat(); });
  if (el.btnPrev) el.btnPrev.addEventListener("click", (e) => {
    e.preventDefault();
    if (currentWave > 1) currentWave -= 1;
    startCombat();
  });
  if (el.btnHangar) el.btnHangar.addEventListener("click", (e) => { e.preventDefault(); showHangar(); });
  if (el.offlineClaim) el.offlineClaim.addEventListener("click", (e) => { e.preventDefault(); claimOffline(); });

  const btnAtk = document.getElementById("btn-atk-up");
  if (btnAtk) btnAtk.addEventListener("click", (e) => {
    e.preventDefault();
    if (state.atkLv >= 5) return;
    const cost = ATK_COST[state.atkLv];
    if (state.credits < cost) { sfx("invalid"); return; }
    state.credits -= cost;
    state.atkLv += 1;
    saveState();
    syncHud();
    sfx("match");
  });
  const btnEquip = document.getElementById("btn-equip");
  if (btnEquip) btnEquip.addEventListener("click", (e) => {
    e.preventDefault();
    if (!state.hasTurretInv || state.slot1Turret) { sfx("invalid"); return; }
    state.slot1Turret = true;
    state.hasTurretInv = false;
    saveState();
    syncHud();
    sfx("click");
  });
  const btnRobot = document.getElementById("btn-robot");
  if (btnRobot) btnRobot.addEventListener("click", (e) => {
    e.preventDefault();
    if (state.robotsHired >= 5) return;
    const cost = ROBOT_COST[state.robotsHired];
    if (state.credits < cost) { sfx("invalid"); return; }
    state.credits -= cost;
    state.robotsHired += 1;
    saveState();
    syncHud();
    sfx("click");
  });

  document.querySelectorAll("[data-panel]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const id = btn.getAttribute("data-panel");
      ["panel-upgrade", "panel-slots", "panel-robots"].forEach((pid) => {
        const p = document.getElementById(pid);
        if (p) p.hidden = p.id !== id;
      });
    });
  });

  window.addEventListener("beforeunload", () => saveState());
  syncHud();
  showOffline();
  showHangar();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootPhaser);
  else bootPhaser();
})();
