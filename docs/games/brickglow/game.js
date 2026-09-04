(() => {
  const COLS = 8;
  const ROWS = 5;
  const START_LIVES = 3;
  const W = 360;
  const H = 520;
  const BRICK_COLORS = [0x5b8cff, 0x7c5cff, 0xff6bb5, 0xffb84d, 0x3dd6c6];

  const el = {
    score: document.getElementById("score"),
    lives: document.getElementById("lives"),
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

  let gameRef = null;
  let hardReset = null;

  class BrickGlowScene extends Phaser.Scene {
    constructor() {
      super("BrickGlow");
    }

    create() {
      this.score = 0;
      this.lives = START_LIVES;
      this.over = false;
      this.busy = false;
      this.ballSpeed = 220;
      this.launched = false;
      this.keys = this.input.keyboard ? this.input.keyboard.addKeys("LEFT,RIGHT,A,D,SPACE") : null;

      this.add.rectangle(W / 2, H / 2, W, H, 0x0b1020).setDepth(0);

      this.bricks = this.physics.add.staticGroup();
      this.buildBricks();

      this.paddle = this.add.rectangle(W / 2, H - 36, 88, 14, 0xe8f0ff).setStrokeStyle(2, 0x8eb6ff);
      this.physics.add.existing(this.paddle, false);
      this.paddle.body.setImmovable(true);
      this.paddle.body.setAllowGravity(false);
      this.paddle.body.setCollideWorldBounds(true);

      this.ball = this.add.circle(W / 2, H - 56, 8, 0xfff4a3).setStrokeStyle(2, 0xffd24d);
      this.physics.add.existing(this.ball);
      this.ball.body.setCircle(8);
      this.ball.body.setBounce(1, 1);
      this.ball.body.setCollideWorldBounds(true);
      this.ball.body.onWorldBounds = true;
      this.ball.body.setAllowGravity(false);
      this.ball.body.setMaxVelocity(420, 420);

      this.physics.world.on("worldbounds", (body, up, down) => {
        if (body.gameObject !== this.ball || this.over) return;
        if (down) this.loseLife();
      });

      this.physics.add.collider(this.ball, this.paddle, this.onPaddleHit, null, this);
      this.physics.add.collider(this.ball, this.bricks, this.onBrickHit, null, this);

      this.input.on("pointermove", (p) => {
        if (this.over) return;
        this.paddle.x = Phaser.Math.Clamp(p.x, 44, W - 44);
        this.paddle.body.updateFromGameObject();
        if (!this.launched) {
          this.ball.x = this.paddle.x;
          this.ball.y = this.paddle.y - 20;
          this.ball.body.reset(this.ball.x, this.ball.y);
        }
      });

      this.input.on("pointerdown", () => {
        if (this.over) return;
        this.launchBall();
      });

      this.syncHud();
      this.hideOverlay();
      hardReset = () => this.resetGame();
    }

    buildBricks() {
      this.bricks.clear(true, true);
      const top = 56;
      const gapX = 4;
      const gapY = 6;
      const bw = (W - 24 - gapX * (COLS - 1)) / COLS;
      const bh = 18;
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const x = 12 + c * (bw + gapX) + bw / 2;
          const y = top + r * (bh + gapY) + bh / 2;
          const color = BRICK_COLORS[r % BRICK_COLORS.length];
          const brick = this.add.rectangle(x, y, bw, bh, color).setStrokeStyle(1, 0xffffff, 0.35);
          brick.setData("hp", 1);
          brick.setData("value", (ROWS - r) * 10);
          this.physics.add.existing(brick, true);
          this.bricks.add(brick);
        }
      }
    }

    launchBall() {
      if (this.launched || this.over) return;
      this.launched = true;
      const angle = Phaser.Math.FloatBetween(-0.6, 0.6);
      const vx = Math.sin(angle) * this.ballSpeed;
      const vy = -Math.cos(angle) * this.ballSpeed;
      this.ball.body.setVelocity(vx, vy);
      sfx("click");
    }

    onPaddleHit(ball, paddle) {
      if (!this.launched || this.over) return;
      const offset = (ball.x - paddle.x) / (paddle.width / 2);
      const speed = Math.min(420, this.ballSpeed + 8);
      this.ballSpeed = speed;
      ball.body.setVelocity(offset * speed, -Math.abs(ball.body.velocity.y || speed));
      this.tweens.add({ targets: paddle, scaleY: 1.25, yoyo: true, duration: 70 });
      sfx("move");
    }

    onBrickHit(ball, brick) {
      if (this.over) return;
      const x = brick.x;
      const y = brick.y;
      const color = brick.fillColor;
      const value = brick.getData("value") || 10;
      brick.destroy();
      this.score += value;
      this.ballSpeed = Math.min(420, this.ballSpeed + 4);
      this.spawnBreakFx(x, y, color);
      this.syncHud();
      sfx("match");
      if (this.bricks.countActive(true) === 0) this.winGame();
    }

    spawnBreakFx(x, y, color) {
      for (let i = 0; i < 8; i++) {
        const p = this.add.circle(x, y, Phaser.Math.Between(2, 4), color, 0.9);
        this.tweens.add({
          targets: p,
          x: x + Phaser.Math.Between(-40, 40),
          y: y + Phaser.Math.Between(-30, 30),
          alpha: 0,
          duration: 280,
          onComplete: () => p.destroy(),
        });
      }
    }

    loseLife() {
      if (this.over || this.busy) return;
      this.busy = true;
      this.lives -= 1;
      this.syncHud();
      sfx("invalid");
      this.launched = false;
      this.ball.body.setVelocity(0, 0);
      this.ball.x = this.paddle.x;
      this.ball.y = this.paddle.y - 20;
      this.ball.body.reset(this.ball.x, this.ball.y);
      if (this.lives <= 0) {
        this.busy = false;
        this.failGame();
        return;
      }
      this.time.delayedCall(200, () => {
        this.busy = false;
      });
    }

    winGame() {
      if (this.over) return;
      this.over = true;
      this.ball.body.setVelocity(0, 0);
      sfx("win");
      this.showOverlay("클리어!", `점수 ${this.score}`);
    }

    failGame() {
      if (this.over) return;
      this.over = true;
      this.ball.body.setVelocity(0, 0);
      sfx("over");
      this.showOverlay("게임 오버", `점수 ${this.score}`);
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
      el.score.textContent = String(this.score);
      el.lives.textContent = String(this.lives);
    }

    resetGame() {
      this.score = 0;
      this.lives = START_LIVES;
      this.over = false;
      this.busy = false;
      this.ballSpeed = 220;
      this.launched = false;
      this.hideOverlay();
      this.buildBricks();
      this.paddle.x = W / 2;
      this.paddle.body.updateFromGameObject();
      this.ball.body.setVelocity(0, 0);
      this.ball.x = this.paddle.x;
      this.ball.y = this.paddle.y - 20;
      this.ball.body.reset(this.ball.x, this.ball.y);
      this.syncHud();
      sfx("click");
    }

    update() {
      if (this.over) return;
      if (this.keys) {
        const left = this.keys.LEFT.isDown || this.keys.A.isDown;
        const right = this.keys.RIGHT.isDown || this.keys.D.isDown;
        if (left) this.paddle.x = Math.max(44, this.paddle.x - 7);
        if (right) this.paddle.x = Math.min(W - 44, this.paddle.x + 7);
        this.paddle.body.updateFromGameObject();
        if (!this.launched) {
          this.ball.x = this.paddle.x;
          this.ball.y = this.paddle.y - 20;
          this.ball.body.reset(this.ball.x, this.ball.y);
        }
        if (Phaser.Input.Keyboard.JustDown(this.keys.SPACE)) this.launchBall();
      }
      // keep ball from getting stuck horizontal
      if (this.launched && Math.abs(this.ball.body.velocity.y) < 60) {
        this.ball.body.velocity.y = (this.ball.body.velocity.y >= 0 ? 1 : -1) * 120;
      }
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
      // Clamp host to viewport so FIT never paints past the right edge at ~390px
      const maxW = Math.min(W, host.parentElement ? host.parentElement.clientWidth : host.clientWidth || W);
      const boxW = Math.max(260, Math.min(W, maxW || W, window.innerWidth - 24));
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
        backgroundColor: "#0b1020",
        physics: { default: "arcade", arcade: { debug: false } },
        scale: {
          mode: Phaser.Scale.FIT,
          autoCenter: Phaser.Scale.CENTER_BOTH,
          width: W,
          height: H,
        },
        scene: [BrickGlowScene],
      });
      if (gameRef.scale) gameRef.scale.refresh();
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
