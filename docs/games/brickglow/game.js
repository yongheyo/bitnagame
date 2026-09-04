(() => {
  const COLS = 8;
  const ROWS = 5;
  const START_LIVES = 3;
  const PADDLE_W = 88;
  const PADDLE_H = 14;
  const BALL_R = 8;
  const BRICK_PAD = 4;
  const SPEED0 = 240;
  const SPEED_GAIN = 8;
  const KEY_SPEED = 420;

  const BRICK_PALETTE = [
    { fill: 0xff7aa8, glow: 0xffb3d0 },
    { fill: 0x7eb0ff, glow: 0xb3d0ff },
    { fill: 0x7ef0c3, glow: 0xb8ffe0 },
    { fill: 0xffd56a, glow: 0xffe6a8 },
    { fill: 0xc59bff, glow: 0xdbc0ff },
  ];

  const scoreEl = document.getElementById("score");
  const livesEl = document.getElementById("lives");
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

  function showEndOverlay(won, score) {
    if (!overlayEl || !overlayTitle || !overlaySub) return;
    overlayTitle.textContent = won ? "클리어!" : "게임 오버";
    overlaySub.textContent = "점수 " + score;
    overlayEl.hidden = false;
    overlayEl.setAttribute("aria-hidden", "false");
  }

  class BrickGlowScene extends Phaser.Scene {
    constructor() {
      super("BrickGlow");
      this.score = 0;
      this.lives = START_LIVES;
      this.ended = false;
      this.launched = false;
      this.bricksLeft = 0;
      this.gen = 0;
      this.paddle = null;
      this.ball = null;
      this.bricks = null;
      this.trail = null;
      this.cursors = null;
      this.keys = null;
      this.pointerDown = false;
      this.ballSpeed = SPEED0;
    }

    create() {
      sceneRef = this;
      this.gen = resetGen;

      const W = this.scale.width;
      const H = this.scale.height;

      const bg = this.add.graphics();
      bg.fillStyle(0x111527, 1);
      bg.fillRect(0, 0, W, H);
      bg.fillStyle(0x1a2450, 0.35);
      bg.fillCircle(W * 0.5, H * 0.28, Math.min(W, H) * 0.42);
      bg.setDepth(0);

      this.trail = this.add.graphics().setDepth(5);

      this.bricks = this.physics.add.staticGroup();
      this.buildBricks();

      this.paddle = this.add
        .rectangle(W / 2, H - 36, PADDLE_W, PADDLE_H, 0x6c8cff)
        .setStrokeStyle(2, 0xb8c8ff)
        .setDepth(10);
      this.physics.add.existing(this.paddle, false);
      this.paddle.body.setImmovable(true);
      this.paddle.body.setAllowGravity(false);
      this.paddle.body.setCollideWorldBounds(true);

      this.paddleGlow = this.add
        .rectangle(this.paddle.x, this.paddle.y + 2, PADDLE_W + 10, PADDLE_H + 10, 0x6c8cff, 0.22)
        .setDepth(9);

      this.ball = this.add.circle(W / 2, this.paddle.y - 22, BALL_R, 0xfff6d0).setDepth(12);
      this.ball.setStrokeStyle(2, 0xffe08a);
      this.physics.add.existing(this.ball);
      this.ball.body.setCircle(BALL_R);
      this.ball.body.setBounce(1, 1);
      this.ball.body.setCollideWorldBounds(true);
      this.ball.body.onWorldBounds = true;
      this.ball.body.setAllowGravity(false);
      this.ball.body.setMaxVelocity(420, 420);

      this.ballHalo = this.add.circle(this.ball.x, this.ball.y, BALL_R + 6, 0xffe08a, 0.28).setDepth(11);

      this.physics.world.setBoundsCollision(true, true, true, false);
      this.physics.world.on("worldbounds", (body, up, down, left, right) => {
        if (body.gameObject !== this.ball) return;
        if (down) this.loseLife();
      });

      this.physics.add.collider(this.ball, this.paddle, this.onPaddleHit, null, this);
      this.physics.add.collider(this.ball, this.bricks, this.onBrickHit, null, this);

      if (this.input.keyboard) {
        this.cursors = this.input.keyboard.createCursorKeys();
        this.keys = this.input.keyboard.addKeys("A,D,SPACE,W");
        this.input.keyboard.on("keydown-SPACE", () => {
          unlockAudio();
          this.tryLaunch();
        });
      }

      this.input.on("pointerdown", (p) => {
        unlockAudio();
        this.pointerDown = true;
        this.movePaddleTo(p.x);
        if (!this.launched && !this.ended) this.tryLaunch();
      });
      this.input.on("pointermove", (p) => {
        if (p.isDown || this.pointerDown) this.movePaddleTo(p.x);
        else if (!this.launched) this.movePaddleTo(p.x);
      });
      this.input.on("pointerup", () => {
        this.pointerDown = false;
      });

      this.score = 0;
      this.lives = START_LIVES;
      this.ended = false;
      this.launched = false;
      this.ballSpeed = SPEED0;
      this.syncHud();
      hideOverlay();
      this.resetBall();
    }

    hardReset() {
      this.gen = resetGen;
      if (this.tweens) this.tweens.killAll();
      if (this.time) this.time.removeAllEvents();
      this.ended = false;
      this.launched = false;
      this.pointerDown = false;
      this.score = 0;
      this.lives = START_LIVES;
      this.ballSpeed = SPEED0;
      hideOverlay();
      this.rebuildBricks();
      this.resetBall();
      this.syncHud();
      sfx("click");
    }

    buildBricks() {
      const W = this.scale.width;
      const top = 52;
      const side = 18;
      const bw = (W - side * 2 - BRICK_PAD * (COLS - 1)) / COLS;
      const bh = 18;
      this.bricksLeft = 0;

      for (let r = 0; r < ROWS; r++) {
        const pal = BRICK_PALETTE[r % BRICK_PALETTE.length];
        for (let c = 0; c < COLS; c++) {
          const x = side + c * (bw + BRICK_PAD) + bw / 2;
          const y = top + r * (bh + BRICK_PAD) + bh / 2;

          const glow = this.add
            .rectangle(x, y, bw + 6, bh + 6, pal.glow, 0.28)
            .setDepth(2);

          const brick = this.add
            .rectangle(x, y, bw, bh, pal.fill)
            .setStrokeStyle(2, 0xffffff55)
            .setDepth(3);
          brick.setData("glow", glow);
          brick.setData("points", (ROWS - r) * 10);
          brick.setData("row", r);

          const gloss = this.add
            .rectangle(x, y - bh * 0.22, bw * 0.72, bh * 0.28, 0xffffff, 0.28)
            .setDepth(4);
          brick.setData("gloss", gloss);

          this.physics.add.existing(brick, true);
          this.bricks.add(brick);
          this.bricksLeft += 1;
        }
      }
    }

    rebuildBricks() {
      if (this.bricks) {
        this.bricks.getChildren().slice().forEach((b) => {
          const glow = b.getData("glow");
          const gloss = b.getData("gloss");
          if (glow && glow.destroy) glow.destroy();
          if (gloss && gloss.destroy) gloss.destroy();
          b.destroy();
        });
        this.bricks.clear(true, true);
      }
      this.buildBricks();
    }

    syncHud() {
      if (scoreEl) scoreEl.textContent = String(this.score);
      if (livesEl) livesEl.textContent = String(this.lives);
    }

    movePaddleTo(x) {
      if (!this.paddle || this.ended) return;
      const half = PADDLE_W / 2;
      const W = this.scale.width;
      const nx = Phaser.Math.Clamp(x, half + 4, W - half - 4);
      this.paddle.x = nx;
      this.paddle.body.updateFromGameObject();
      if (this.paddleGlow) {
        this.paddleGlow.x = nx;
        this.paddleGlow.y = this.paddle.y + 2;
      }
      if (!this.launched && this.ball) {
        this.ball.x = nx;
        this.ball.y = this.paddle.y - 22;
        this.ball.body.reset(this.ball.x, this.ball.y);
        if (this.ballHalo) {
          this.ballHalo.x = this.ball.x;
          this.ballHalo.y = this.ball.y;
        }
      }
    }

    resetBall() {
      if (!this.ball || !this.paddle) return;
      this.launched = false;
      this.ball.body.setVelocity(0, 0);
      this.ball.x = this.paddle.x;
      this.ball.y = this.paddle.y - 22;
      this.ball.body.reset(this.ball.x, this.ball.y);
      if (this.ballHalo) {
        this.ballHalo.x = this.ball.x;
        this.ballHalo.y = this.ball.y;
        this.ballHalo.setAlpha(0.28);
      }
      if (this.trail) this.trail.clear();
    }

    tryLaunch() {
      if (this.ended || this.launched || !this.ball) return;
      this.launched = true;
      const angle = Phaser.Math.DegToRad(Phaser.Math.Between(-55, -125));
      this.ball.body.setVelocity(
        Math.cos(angle) * this.ballSpeed,
        Math.sin(angle) * this.ballSpeed
      );
      sfx("move");
    }

    onPaddleHit(ball, paddle) {
      if (!this.launched || this.ended) return;
      const offset = (ball.x - paddle.x) / (PADDLE_W / 2);
      const clamped = Phaser.Math.Clamp(offset, -1, 1);
      const angle = Phaser.Math.DegToRad(-90 + clamped * 55);
      const spd = Math.max(this.ballSpeed, Math.hypot(ball.body.velocity.x, ball.body.velocity.y));
      ball.body.setVelocity(Math.cos(angle) * spd, Math.sin(angle) * spd);
      sfx("slide");
      this.tweens.add({
        targets: paddle,
        scaleY: 1.25,
        duration: 60,
        yoyo: true,
      });
    }

    onBrickHit(ball, brick) {
      if (!brick || !brick.active) return;
      const points = brick.getData("points") || 10;
      this.score += points;
      this.syncHud();
      this.bricksLeft = Math.max(0, this.bricksLeft - 1);
      this.ballSpeed = Math.min(400, SPEED0 + (COLS * ROWS - this.bricksLeft) * SPEED_GAIN);
      sfx("match");

      const glow = brick.getData("glow");
      const gloss = brick.getData("gloss");
      const x = brick.x;
      const y = brick.y;
      const tint = brick.fillColor || 0xffffff;

      this.spawnBrickBurst(x, y, tint);

      this.tweens.add({
        targets: [brick, glow, gloss].filter(Boolean),
        scaleX: 1.15,
        scaleY: 1.15,
        alpha: 0,
        duration: 140,
        ease: "Cubic.Out",
        onComplete: () => {
          if (glow && glow.destroy) glow.destroy();
          if (gloss && gloss.destroy) gloss.destroy();
          brick.destroy();
        },
      });

      const v = ball.body.velocity;
      const cur = Math.hypot(v.x, v.y) || 1;
      ball.body.setVelocity((v.x / cur) * this.ballSpeed, (v.y / cur) * this.ballSpeed);

      if (this.bricksLeft <= 0) {
        this.winGame();
      }
    }

    spawnBrickBurst(x, y, tint) {
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2 + Math.random() * 0.3;
        const dist = 18 + Math.random() * 22;
        const dot = this.add.circle(x, y, 2.5 + Math.random() * 2, tint, 0.95).setDepth(20);
        this.tweens.add({
          targets: dot,
          x: x + Math.cos(ang) * dist,
          y: y + Math.sin(ang) * dist,
          alpha: 0,
          scale: 0.2,
          duration: 220 + Math.random() * 120,
          ease: "Cubic.Out",
          onComplete: () => dot.destroy(),
        });
      }
      const flash = this.add.circle(x, y, 10, 0xffffff, 0.65).setDepth(19);
      this.tweens.add({
        targets: flash,
        scale: 2.4,
        alpha: 0,
        duration: 160,
        onComplete: () => flash.destroy(),
      });
    }

    loseLife() {
      if (this.ended || !this.launched) return;
      this.launched = false;
      this.lives -= 1;
      this.syncHud();
      sfx("over");
      if (this.lives <= 0) {
        this.failGame();
        return;
      }
      this.resetBall();
    }

    winGame() {
      if (this.ended) return;
      this.ended = true;
      this.launched = false;
      if (this.ball && this.ball.body) this.ball.body.setVelocity(0, 0);
      sfx("win");
      showEndOverlay(true, this.score);
    }

    failGame() {
      if (this.ended) return;
      this.ended = true;
      this.launched = false;
      if (this.ball && this.ball.body) this.ball.body.setVelocity(0, 0);
      sfx("over");
      showEndOverlay(false, this.score);
    }

    update(_, dt) {
      if (this.ended || !this.paddle) return;

      let dx = 0;
      if (this.cursors) {
        if (this.cursors.left.isDown) dx -= 1;
        if (this.cursors.right.isDown) dx += 1;
      }
      if (this.keys) {
        if (this.keys.A.isDown) dx -= 1;
        if (this.keys.D.isDown) dx += 1;
      }
      if (dx !== 0) {
        this.movePaddleTo(this.paddle.x + dx * KEY_SPEED * (dt / 1000));
      }

      if (this.ballHalo && this.ball) {
        this.ballHalo.x = this.ball.x;
        this.ballHalo.y = this.ball.y;
      }
      if (this.paddleGlow && this.paddle) {
        this.paddleGlow.x = this.paddle.x;
        this.paddleGlow.y = this.paddle.y + 2;
      }

      if (this.trail && this.ball && this.launched) {
        this.trail.fillStyle(0xffe08a, 0.18);
        this.trail.fillCircle(this.ball.x, this.ball.y, BALL_R * 0.7);
        if (!this._trailAcc) this._trailAcc = 0;
        this._trailAcc += dt;
        if (this._trailAcc > 90) {
          this._trailAcc = 0;
          this.trail.clear();
        }
      }

      if (this.launched && this.ball && this.ball.y > this.scale.height + 24) {
        this.loseLife();
        return;
      }

      if (this.launched && this.ball && this.ball.body) {
        const vx = this.ball.body.velocity.x;
        const vy = this.ball.body.velocity.y;
        if (Math.abs(vy) < 60) {
          this.ball.body.setVelocityY((vy < 0 ? -1 : 1) * Math.max(90, Math.abs(vy) + 40));
        }
        const spd = Math.hypot(vx, vy);
        if (spd > 10 && Math.abs(spd - this.ballSpeed) > 30) {
          this.ball.body.setVelocity((vx / spd) * this.ballSpeed, (vy / spd) * this.ballSpeed);
        }
      }
    }
  }

  function hardReset() {
    unlockAudio();
    if (scoreEl) scoreEl.textContent = "0";
    if (livesEl) livesEl.textContent = String(START_LIVES);
    hideOverlay();
    resetGen += 1;

    if (!gameRef) return;
    const scene = gameRef.scene.getScene("BrickGlow") || sceneRef;
    if (!scene) return;

    if (scene.tweens) scene.tweens.killAll();
    if (scene.time) scene.time.removeAllEvents();
    scene.ended = false;
    scene.launched = false;
    scene.gen = resetGen;

    if (scene.sys && scene.sys.isActive() && typeof scene.hardReset === "function") {
      scene.hardReset();
      return;
    }
    if (scene.sys && scene.sys.isActive()) {
      scene.scene.restart();
    }
  }

  window.__bitnaBrickGlowReset = hardReset;

  const boot = () => {
    const el = document.getElementById("game-container");
    if (!el) return;

    const avail = el.clientWidth || Math.min(window.innerWidth - 24, 480);
    const w = Math.max(280, Math.min(480, avail));
    const h = Math.round(w * 1.28);
    el.style.width = w + "px";
    el.style.height = h + "px";
    el.style.margin = "0 auto";

    gameRef = new Phaser.Game({
      type: Phaser.AUTO,
      parent: "game-container",
      width: w,
      height: h,
      backgroundColor: "#111527",
      physics: {
        default: "arcade",
        arcade: {
          gravity: { y: 0 },
          debug: false,
        },
      },
      scene: [BrickGlowScene],
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
