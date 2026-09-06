(() => {
  const ELIXIR_MAX = 10;
  const ELIXIR_START = 5;
  const ELIXIR_RATE = 1.0;
  const ELIXIR_RATE_W5 = 1.15;
  const BASE_MAX_HP = 100;
  const LANE_Y_RATIO = 0.58;
  const DEPLOY_X_RATIO = 0.22;
  const BASE_X_RATIO = 0.08;
  const ENEMY_SPAWN_X_RATIO = 0.95;
  const TOTAL_WAVES = 5;
  const DESIGN_W = 720;
  const DESIGN_H = 302;

  const HEROES = [
    {
      id: "shield",
      name: "빛방패",
      cost: 3,
      hp: 120,
      dmg: 8,
      range: 80,
      atkCd: 1.0,
      speed: 0,
      color: 0x6c8cff,
      kind: "melee",
      aoe: false,
      slow: 0,
    },
    {
      id: "spear",
      name: "빛창",
      cost: 4,
      hp: 55,
      dmg: 18,
      range: 220,
      atkCd: 1.0,
      speed: 0,
      color: 0xffd166,
      kind: "ranged",
      aoe: false,
      slow: 0,
    },
    {
      id: "ring",
      name: "빛고리",
      cost: 5,
      hp: 40,
      dmg: 6,
      range: 140,
      atkCd: 1.0,
      speed: 0,
      color: 0xb967ff,
      kind: "aoe",
      aoe: true,
      aoeRadius: 90,
      slow: 0.3,
      slowDur: 1.5,
    },
  ];

  // WAVE_DEFS: spawn queue built from groups {hp,count,dmg,speed,color?}
  const WAVE_DEFS = [
    {
      gap: 1400,
      groups: [{ hp: 20, count: 6, dmg: 5, speed: 44, color: 0xff5d8f }],
    },
    {
      gap: 1100,
      groups: [
        { hp: 24, count: 5, dmg: 5, speed: 44, color: 0xff5d8f },
        { hp: 14, count: 4, dmg: 4, speed: 72, color: 0xff9f43 },
      ],
    },
    {
      gap: 900,
      groups: [{ hp: 28, count: 10, dmg: 6, speed: 48, color: 0xff5d8f }],
    },
    {
      gap: 1000,
      groups: [
        { hp: 30, count: 6, dmg: 6, speed: 46, color: 0xff5d8f },
        { hp: 80, count: 2, dmg: 12, speed: 28, color: 0xc44569, w: 30, h: 36 },
      ],
    },
    {
      gap: 850,
      groups: [
        { hp: 32, count: 8, dmg: 6, speed: 48, color: 0xff5d8f },
        { hp: 18, count: 4, dmg: 5, speed: 74, color: 0xff9f43 },
        { hp: 150, count: 1, dmg: 20, speed: 26, color: 0xff2e63, w: 34, h: 42 },
      ],
    },
  ];

  function buildQueue(def) {
    const q = [];
    for (const g of def.groups) {
      for (let i = 0; i < g.count; i++) q.push({ ...g });
    }
    return q;
  }

  const elixirEl = document.getElementById("elixir");
  const waveEl = document.getElementById("wave");
  const baseHpEl = document.getElementById("base-hp");
  const pausePill = document.getElementById("pause-pill");
  const overlayEl = document.getElementById("game-overlay");
  const overlayTitle = document.getElementById("overlay-title");
  const overlaySub = document.getElementById("overlay-sub");
  const btnAuto = document.getElementById("btn-auto");
  const btnPause = document.getElementById("btn-pause");
  const cardEls = [0, 1, 2].map((i) => document.getElementById("card-" + i));

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

  function showEndOverlay(won, wave) {
    if (!overlayEl || !overlayTitle || !overlaySub) return;
    if (won) {
      overlayTitle.textContent = "전선 사수 성공!";
      overlaySub.textContent = "웨이브 " + TOTAL_WAVES + "까지 모두 막았습니다.";
    } else {
      overlayTitle.textContent = "기지 파괴";
      overlaySub.textContent = "웨이브 " + wave + "에서 방어에 실패했습니다.";
    }
    overlayEl.hidden = false;
    overlayEl.setAttribute("aria-hidden", "false");
  }

  function flashCardInsufficient(heroIdx) {
    const el = cardEls.find((c) => c && Number(c.dataset.hero) === heroIdx) || cardEls[0];
    if (!el) return;
    el.classList.add("flash-deny");
    sfx("invalid");
    window.setTimeout(() => el.classList.remove("flash-deny"), 250);
  }

  class LineGuardScene extends Phaser.Scene {
    constructor() {
      super("LineGuard");
    }

    create() {
      sceneRef = this;
      this.gen = resetGen;
      this.ended = false;
      this.paused = false;
      this.autoDeploy = true;
      this.elixir = ELIXIR_START;
      this.baseHp = BASE_MAX_HP;
      this.wave = 1;
      this.handOrder = [0, 1, 2];
      this.heroes = [];
      this.enemies = [];
      this.projectiles = [];
      this.spawnQueue = [];
      this.spawnTimer = 0;
      this.waveClearDelay = 0;
      this.betweenWaves = false;

      const W = this.scale.width;
      const H = this.scale.height;
      this.laneY = H * LANE_Y_RATIO;
      this.baseX = W * BASE_X_RATIO;
      this.deployX = W * DEPLOY_X_RATIO;
      this.spawnX = W * ENEMY_SPAWN_X_RATIO;

      this.add.rectangle(W / 2, H / 2, W, H, 0x111527);
      this.add.rectangle(W / 2, H * 0.28, W, H * 0.56, 0x1a2240);
      this.add.rectangle(W / 2, H * 0.78, W, H * 0.44, 0x161b2e);
      this.add.rectangle(W / 2, this.laneY, W * 0.92, 36, 0x2a3358).setStrokeStyle(2, 0x3d4a78);
      this.baseGfx = this.add.rectangle(this.baseX, this.laneY, 36, 64, 0x7ef0c3);
      this.baseGfx.setStrokeStyle(2, 0xc8ffe8);
      this.add
        .text(this.baseX, this.laneY - 48, "기지", {
          fontFamily: "sans-serif",
          fontSize: "12px",
          color: "#c8ffe8",
        })
        .setOrigin(0.5);

      this.elixirBarBg = this.add.rectangle(W / 2, 18, W * 0.7, 10, 0x1e2438);
      this.elixirBar = this.add.rectangle(W / 2 - (W * 0.7) / 2, 18, 0, 8, 0x7ef0c3).setOrigin(0, 0.5);

      this.statusText = this.add
        .text(W / 2, 36, "", {
          fontFamily: "sans-serif",
          fontSize: "13px",
          color: "#a8b0d0",
        })
        .setOrigin(0.5);

      this.startWave(1);
      this.syncHud();
      this.syncHandUi();
      if (btnAuto) {
        btnAuto.classList.add("is-on");
        btnAuto.setAttribute("aria-pressed", "true");
        btnAuto.textContent = "자동배치 ON";
      }
      hideOverlay();
      if (pausePill) pausePill.hidden = true;
      if (btnPause) btnPause.textContent = "일시정지";
    }

    elixirRate() {
      return this.wave >= 5 ? ELIXIR_RATE_W5 : ELIXIR_RATE;
    }

    startWave(n) {
      this.wave = n;
      const def = WAVE_DEFS[n - 1] || WAVE_DEFS[WAVE_DEFS.length - 1];
      this.waveDef = def;
      this.spawnQueue = buildQueue(def);
      this.spawnTimer = 400;
      this.betweenWaves = false;
      this.waveClearDelay = 0;
      this.statusText.setText("웨이브 " + n + " 시작");
      sfx("match");
      this.syncHud();
    }

    syncHud() {
      if (elixirEl) elixirEl.textContent = this.elixir.toFixed(1);
      if (waveEl) waveEl.textContent = String(this.wave);
      if (baseHpEl) baseHpEl.textContent = String(Math.max(0, Math.ceil(this.baseHp)));
      const W = this.scale.width;
      const maxW = W * 0.7;
      this.elixirBar.width = Math.max(0, (this.elixir / ELIXIR_MAX) * maxW);
    }

    syncHandUi() {
      cardEls.forEach((el, i) => {
        if (!el) return;
        const heroIdx = this.handOrder[i];
        const hero = HEROES[heroIdx];
        el.dataset.hero = String(heroIdx);
        el.innerHTML = hero.name + '<br /><span class="cost">비용 ' + hero.cost + "</span>";
        el.classList.toggle("front", i === 0);
        const can = this.elixir + 1e-6 >= hero.cost && !this.ended && !this.paused;
        el.classList.toggle("is-disabled", !can);
        el.disabled = !can;
      });
    }

    tryDeploy(heroIdx, fromAuto) {
      if (this.ended || this.paused) return false;
      const hero = HEROES[heroIdx];
      if (!hero) return false;
      if (fromAuto && this.handOrder[0] !== heroIdx) return false;
      if (this.elixir < hero.cost) {
        if (fromAuto) flashCardInsufficient(heroIdx);
        else {
          flashCardInsufficient(heroIdx);
        }
        return false;
      }

      this.elixir -= hero.cost;
      this.spawnHero(heroIdx);
      const pos = this.handOrder.indexOf(heroIdx);
      if (pos >= 0) {
        this.handOrder.splice(pos, 1);
        this.handOrder.push(heroIdx);
      }
      sfx("click");
      this.syncHud();
      this.syncHandUi();
      return true;
    }

    spawnHero(heroIdx) {
      const def = HEROES[heroIdx];
      const slot = this.heroes.length % 4;
      const yOff = (slot - 1.5) * 10;
      const xJitter = (slot % 2) * 14;
      const x = this.deployX + xJitter + Phaser.Math.Between(-6, 18);
      const y = this.laneY + yOff;

      let body;
      if (def.kind === "aoe") {
        body = this.add.circle(x, y, 16, def.color);
      } else if (def.kind === "ranged") {
        body = this.add.rectangle(x, y, 18, 28, def.color);
      } else {
        body = this.add.rectangle(x, y, 26, 34, def.color);
      }
      body.setStrokeStyle(2, 0xffffff);

      const label = this.add
        .text(x, y - 26, def.name, {
          fontFamily: "sans-serif",
          fontSize: "10px",
          color: "#f4f6ff",
        })
        .setOrigin(0.5);

      const hpBarBg = this.add.rectangle(x, y + 22, 28, 4, 0x333a55);
      const hpBar = this.add.rectangle(x - 14, y + 22, 28, 3, 0x7ef0c3).setOrigin(0, 0.5);

      this.heroes.push({
        def,
        body,
        label,
        hpBarBg,
        hpBar,
        hp: def.hp,
        maxHp: def.hp,
        cd: 0,
        alive: true,
      });
    }

    spawnEnemy(spec) {
      const y = this.laneY + Phaser.Math.Between(-8, 8);
      const bw = spec.w || 22;
      const bh = spec.h || 28;
      const body = this.add.rectangle(this.spawnX, y, bw, bh, spec.color || 0xff5d8f);
      body.setStrokeStyle(2, 0xffb0c4);
      const hpBarBg = this.add.rectangle(this.spawnX, y + 20, 24, 4, 0x333a55);
      const hpBar = this.add.rectangle(this.spawnX - 12, y + 20, 24, 3, 0xff7eb6).setOrigin(0, 0.5);

      this.enemies.push({
        body,
        hpBarBg,
        hpBar,
        hp: spec.hp,
        maxHp: spec.hp,
        dmg: spec.dmg,
        speed: spec.speed,
        slowMul: 1,
        slowT: 0,
        atkCd: 0,
        alive: true,
      });
    }

    update(time, delta) {
      if (this.ended) return;
      const dt = Math.min(delta, 50) / 1000;
      if (this.paused) {
        this.syncHandUi();
        return;
      }

      if (this.elixir < ELIXIR_MAX) {
        this.elixir = Math.min(ELIXIR_MAX, this.elixir + this.elixirRate() * dt);
      }

      if (this.autoDeploy && !this.betweenWaves) {
        const front = this.handOrder[0];
        const cost = HEROES[front].cost;
        if (this.elixir >= cost) {
          this.tryDeploy(front, true);
        } else {
          // flash only occasionally while holding insufficient elixir
          if (!this._denyFlashAt || time > this._denyFlashAt) {
            flashCardInsufficient(front);
            this._denyFlashAt = time + 900;
          }
        }
      }

      if (!this.betweenWaves && this.spawnQueue.length > 0) {
        this.spawnTimer -= delta;
        if (this.spawnTimer <= 0) {
          this.spawnEnemy(this.spawnQueue.shift());
          this.spawnTimer = this.waveDef.gap;
        }
      }

      this.updateCombat(dt);
      this.syncHud();
      this.syncHandUi();

      if (
        !this.betweenWaves &&
        this.spawnQueue.length <= 0 &&
        this.enemies.every((e) => !e.alive)
      ) {
        if (this.wave >= TOTAL_WAVES) {
          this.rewardWaveElixir();
          this.endGame(true);
        } else {
          this.betweenWaves = true;
          this.waveClearDelay = 1.2;
          this.rewardWaveElixir();
          this.statusText.setText("웨이브 " + this.wave + " 클리어!");
          sfx("win");
        }
      }

      if (this.betweenWaves) {
        this.waveClearDelay -= dt;
        if (this.waveClearDelay <= 0) {
          this.startWave(this.wave + 1);
        }
      }
    }

    updateCombat(dt) {
      for (const h of this.heroes) {
        if (!h.alive) continue;
        h.cd = Math.max(0, h.cd - dt);
        if (h.cd > 0) continue;

        const hx = h.body.x;
        const hy = h.body.y;
        const range = h.def.range;
        let targets = this.enemies.filter((e) => {
          if (!e.alive) return false;
          const dx = e.body.x - hx;
          const dy = e.body.y - hy;
          return Math.hypot(dx, dy) <= range && e.body.x >= hx - 10;
        });
        if (!targets.length) continue;

        targets.sort((a, b) => a.body.x - b.body.x);
        h.cd = h.def.atkCd;

        if (h.def.aoe) {
          const primary = targets[0];
          const r = h.def.aoeRadius || 60;
          for (const e of this.enemies) {
            if (!e.alive) continue;
            if (Math.hypot(e.body.x - primary.body.x, e.body.y - primary.body.y) <= r) {
              this.damageEnemy(e, h.def.dmg);
              if (h.def.slow > 0) {
                e.slowMul = 1 - h.def.slow;
                e.slowT = h.def.slowDur || 1;
              }
            }
          }
          const pulse = this.add.circle(primary.body.x, primary.body.y, 8, h.def.color, 0.45);
          this.tweens.add({
            targets: pulse,
            radius: r,
            alpha: 0,
            duration: 280,
            onComplete: () => pulse.destroy(),
          });
        } else if (h.def.kind === "ranged") {
          const t = targets[0];
          this.fireBolt(hx, hy, t, h.def.dmg, h.def.color);
        } else {
          this.damageEnemy(targets[0], h.def.dmg);
          h.body.setFillStyle(0xffffff);
          this.time.delayedCall(60, () => {
            if (h.alive) h.body.setFillStyle(h.def.color);
          });
        }
      }

      for (const p of this.projectiles) {
        if (!p.alive) continue;
        if (!p.target || !p.target.alive) {
          p.alive = false;
          p.gfx.destroy();
          continue;
        }
        const tx = p.target.body.x;
        const ty = p.target.body.y;
        const dx = tx - p.gfx.x;
        const dy = ty - p.gfx.y;
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
        if (e.slowT > 0) {
          e.slowT -= dt;
          if (e.slowT <= 0) e.slowMul = 1;
        }
        e.atkCd = Math.max(0, e.atkCd - dt);

        let blocked = null;
        let best = 1e9;
        for (const h of this.heroes) {
          if (!h.alive) continue;
          const dx = e.body.x - h.body.x;
          if (dx > 0 && dx < 28 && Math.abs(e.body.y - h.body.y) < 28) {
            if (dx < best) {
              best = dx;
              blocked = h;
            }
          }
        }

        if (blocked) {
          if (e.atkCd <= 0) {
            this.damageHero(blocked, e.dmg);
            e.atkCd = 0.8;
          }
        } else if (e.body.x <= this.baseX + 28) {
          if (e.atkCd <= 0) {
            this.baseHp -= e.dmg;
            e.atkCd = 0.9;
            this.baseGfx.setFillStyle(0xffaaaa);
            this.time.delayedCall(80, () => {
              if (!this.ended) this.baseGfx.setFillStyle(0x7ef0c3);
            });
            if (this.baseHp <= 0) {
              this.baseHp = 0;
              this.endGame(false);
            }
          }
        } else {
          e.body.x -= e.speed * e.slowMul * dt;
          e.hpBarBg.x = e.body.x;
          e.hpBar.x = e.body.x - 12;
        }
      }
    }

    fireBolt(x, y, target, dmg, color) {
      const gfx = this.add.circle(x, y, 4, color);
      this.projectiles.push({
        gfx,
        target,
        dmg,
        speed: 320,
        alive: true,
      });
    }

    damageEnemy(e, dmg) {
      if (!e.alive) return;
      e.hp -= dmg;
      const ratio = Math.max(0, e.hp / e.maxHp);
      e.hpBar.width = 24 * ratio;
      if (e.hp <= 0) {
        e.alive = false;
        e.body.destroy();
        e.hpBar.destroy();
        e.hpBarBg.destroy();
      }
    }

    damageHero(h, dmg) {
      if (!h.alive) return;
      h.hp -= dmg;
      const ratio = Math.max(0, h.hp / h.maxHp);
      h.hpBar.width = 28 * ratio;
      if (h.hp <= 0) {
        h.alive = false;
        h.body.destroy();
        h.label.destroy();
        h.hpBar.destroy();
        h.hpBarBg.destroy();
      }
    }

    rewardWaveElixir() {
      const before = this.elixir;
      this.elixir = Math.min(ELIXIR_MAX, this.elixir + 1);
      this.syncHud();
      this.popElixirPlus();
    }

    popElixirPlus() {
      if (!elixirEl) return;
      let pop = document.getElementById("elixir-pop");
      if (!pop) {
        const hud = document.querySelector(".lg-hud");
        if (!hud) return;
        pop = document.createElement("span");
        pop.id = "elixir-pop";
        pop.className = "elixir-pop";
        pop.setAttribute("aria-hidden", "true");
        hud.appendChild(pop);
      }
      pop.textContent = "+1";
      pop.classList.remove("show");
      // reflow
      void pop.offsetWidth;
      pop.classList.add("show");
      window.setTimeout(() => pop.classList.remove("show"), 400);
    }

    endGame(won) {
      if (this.ended) return;
      this.ended = true;
      this.statusText.setText(won ? "승리!" : "패배");
      showEndOverlay(won, this.wave);
      sfx(won ? "win" : "move");
      this.syncHandUi();
    }

    setPaused(v) {
      this.paused = !!v;
      if (pausePill) pausePill.hidden = !this.paused;
      if (btnPause) btnPause.textContent = this.paused ? "계속하기" : "일시정지";
      this.syncHandUi();
    }

    togglePause() {
      if (this.ended) return;
      this.setPaused(!this.paused);
    }

    setAuto(v) {
      this.autoDeploy = !!v;
      if (btnAuto) {
        btnAuto.classList.toggle("is-on", this.autoDeploy);
        btnAuto.setAttribute("aria-pressed", this.autoDeploy ? "true" : "false");
        btnAuto.textContent = this.autoDeploy ? "자동배치 ON" : "자동배치 OFF";
      }
    }
  }

  window.__bitnaLineGuardReset = function () {
    unlockAudio();
    hideOverlay();
    resetGen++;
    const scene = sceneRef;
    if (!scene || !scene.scene) return;
    if (typeof scene.scene.restart === "function") {
      scene.scene.restart();
      return;
    }
  };

  window.__bitnaLineGuardTogglePause = function () {
    unlockAudio();
    if (sceneRef && typeof sceneRef.togglePause === "function") {
      sceneRef.togglePause();
    }
  };

  window.__bitnaLineGuardToggleAuto = function () {
    unlockAudio();
    if (sceneRef) {
      sceneRef.setAuto(!sceneRef.autoDeploy);
    }
  };

  window.__bitnaLineGuardDeploy = function (heroIdx) {
    unlockAudio();
    if (sceneRef && typeof sceneRef.tryDeploy === "function") {
      sceneRef.tryDeploy(heroIdx, false);
    }
  };

  const boot = () => {
    const el = document.getElementById("game-container");
    if (!el) return;

    // Parent CSS sizes the display box; FIT scales the fixed 720×302 logical size into it.
    el.style.width = "100%";
    el.style.height = "100%";
    el.style.margin = "0 auto";
    el.style.maxWidth = "100%";
    el.style.overflow = "hidden";

    gameRef = new Phaser.Game({
      type: Phaser.AUTO,
      parent: "game-container",
      width: DESIGN_W,
      height: DESIGN_H,
      backgroundColor: "#111527",
      scene: [LineGuardScene],
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: DESIGN_W,
        height: DESIGN_H,
      },
      input: {
        activePointers: 3,
      },
    });
    if (gameRef.scale) gameRef.scale.refresh();

    const bind = (id, fn) => {
      const btn = document.getElementById(id);
      if (!btn || btn.dataset.phaserBound) return;
      btn.dataset.phaserBound = "1";
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        fn();
      });
    };

    bind("btn-restart", () => window.__bitnaLineGuardReset());
    bind("overlay-restart", () => window.__bitnaLineGuardReset());
    bind("btn-pause", () => window.__bitnaLineGuardTogglePause());
    bind("btn-auto", () => window.__bitnaLineGuardToggleAuto());

    cardEls.forEach((el) => {
      if (!el || el.dataset.phaserBound) return;
      el.dataset.phaserBound = "1";
      el.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const idx = Number(el.dataset.hero);
        if (!Number.isNaN(idx)) window.__bitnaLineGuardDeploy(idx);
      });
    });
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
