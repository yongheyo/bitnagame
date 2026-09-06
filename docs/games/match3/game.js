(() => {
  const COLS = 8;
  const ROWS = 8;
  // 5 gameplay colors mapped to pastel jewel styles (gloss + facets)
  const COLORS = [0xff7aa8, 0x7eb0ff, 0x7ef0c3, 0xffd56a, 0xc59bff];
  const GOAL = 1000;
  const START_MOVES = 30;
  const SWAP_MS = 220;
  const CLEAR_MS = 180;
  const FALL_BASE = 200;
  const SWIPE_MIN = 24;
  const TEX = 128;

  const scoreEl = document.getElementById("score");
  const movesEl = document.getElementById("moves");
  const goalEl = document.getElementById("goal");
  const overlayEl = document.getElementById("game-overlay");
  const overlayTitle = document.getElementById("overlay-title");
  const overlaySub = document.getElementById("overlay-sub");

  if (goalEl) goalEl.textContent = String(GOAL);

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
    overlayTitle.textContent = won ? "목표 달성!" : "이동 종료";
    overlaySub.textContent = "점수 " + score;
    overlayEl.hidden = false;
    overlayEl.setAttribute("aria-hidden", "false");
  }

  function lerpColor(a, b, t) {
    const ar = (a >> 16) & 0xff;
    const ag = (a >> 8) & 0xff;
    const ab = a & 0xff;
    const br = (b >> 16) & 0xff;
    const bg = (b >> 8) & 0xff;
    const bb = b & 0xff;
    const r = (ar + (br - ar) * t) | 0;
    const g = (ag + (bg - ag) * t) | 0;
    const bl = (ab + (bb - ab) * t) | 0;
    return (r << 16) | (g << 8) | bl;
  }

  function lighten(c, amt) {
    return lerpColor(c, 0xffffff, amt);
  }

  function darken(c, amt) {
    return lerpColor(c, 0x000000, amt);
  }

  /** Jewel facet recipes — 5 pastel cute looks (rose, sky, mint, topaz, lilac). */
  const JEWEL_STYLES = [
    { base: 0xff7aa8, mid: 0xffb3d0, dark: 0xd94a7a, tip: 0xffe8f2, sides: 6 },
    { base: 0x7eb0ff, mid: 0xb3d0ff, dark: 0x3d6fd4, tip: 0xe8f2ff, sides: 8 },
    { base: 0x6ee8b8, mid: 0xa8f5d4, dark: 0x2fad7a, tip: 0xe6fff4, sides: 6 },
    { base: 0xffd56a, mid: 0xffe6a8, dark: 0xd4a020, tip: 0xfff8e0, sides: 4 },
    { base: 0xc59bff, mid: 0xdbc0ff, dark: 0x8a55d4, tip: 0xf3eaff, sides: 6 },
  ];

  class Match3Scene extends Phaser.Scene {
    constructor() {
      super("Match3");
      this.grid = [];
      this.gems = [];
      this.score = 0;
      this.movesLeft = START_MOVES;
      this.busy = false;
      this.selected = null;
      this.cell = 0;
      this.pad = 4;
      this.originX = 0;
      this.originY = 0;
      this.ended = false;
      this.gen = 0;
      this._dragFrom = null;
      this._dragPointerId = null;
      this._sx = 0;
      this._sy = 0;
      this.combo = 0;
      this.fxDepth = 40;
      this.gemDepthBase = 10;
    }

    preload() {
      // textures generated in create after graphics ready
    }

    create() {
      sceneRef = this;
      this.gen = resetGen;
      this.combo = 0;

      this.buildTextures();

      const W = this.scale.width;
      const H = this.scale.height;
      const boardW = Math.min(W, H) - 16;
      this.cell = Math.floor((boardW - this.pad * (COLS + 1)) / COLS);
      const size = this.cell * COLS + this.pad * (COLS + 1);
      this.originX = (W - size) / 2;
      this.originY = (H - size) / 2;

      this.add
        .rectangle(W / 2, H / 2, size + 8, size + 8, 0x171c33)
        .setStrokeStyle(2, 0x44507a)
        .setDepth(0);

      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const p = this.pos(r, c);
          this.add
            .rectangle(
              p.x,
              p.y,
              this.cell,
              this.cell,
              (r + c) % 2 ? 0x222a45 : 0x1c233b
            )
            .setDepth(1);
        }
      }

      this.input.on("pointerdown", () => unlockAudio());

      this.newGame(false);
    }

    buildTextures() {
      if (this.textures.exists("jewel0")) return;

      // Soft circle particle for bursts / dust
      {
        const g = this.make.graphics({ x: 0, y: 0, add: false });
        g.fillStyle(0xffffff, 1);
        g.fillCircle(8, 8, 7);
        g.generateTexture("fxdot", 16, 16);
        g.destroy();
      }

      // Tiny square sparkle
      {
        const g = this.make.graphics({ x: 0, y: 0, add: false });
        g.fillStyle(0xffffff, 1);
        g.fillRect(3, 3, 6, 6);
        g.generateTexture("fxspark", 12, 12);
        g.destroy();
      }

      JEWEL_STYLES.forEach((style, idx) => {
        this.drawJewelTexture("jewel" + idx, style);
      });
    }

    drawJewelTexture(key, style) {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      const cx = TEX / 2;
      const cy = TEX / 2;
      const R = TEX * 0.42;
      const sides = style.sides;
      const pts = [];
      const rot = sides === 4 ? Math.PI / 4 : -Math.PI / 2;
      for (let i = 0; i < sides; i++) {
        const a = rot + (i / sides) * Math.PI * 2;
        pts.push({ x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R });
      }

      // Soft drop shadow
      g.fillStyle(0x000000, 0.22);
      g.beginPath();
      g.moveTo(pts[0].x + 3, pts[0].y + 5);
      for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x + 3, pts[i].y + 5);
      g.closePath();
      g.fillPath();

      // Outer body
      g.fillStyle(style.base, 1);
      g.beginPath();
      g.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
      g.closePath();
      g.fillPath();

      // Facet wedges from center
      for (let i = 0; i < sides; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % sides];
        const shade = i % 2 === 0 ? lighten(style.base, 0.28) : darken(style.base, 0.18);
        g.fillStyle(shade, 0.92);
        g.beginPath();
        g.moveTo(cx, cy);
        g.lineTo(a.x, a.y);
        g.lineTo(b.x, b.y);
        g.closePath();
        g.fillPath();
      }

      // Inner table (cut face)
      const innerR = R * 0.42;
      g.fillStyle(style.mid, 0.95);
      g.beginPath();
      for (let i = 0; i < sides; i++) {
        const a = rot + (i / sides) * Math.PI * 2;
        const x = cx + Math.cos(a) * innerR;
        const y = cy + Math.sin(a) * innerR;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.closePath();
      g.fillPath();

      // Bright table highlight
      g.fillStyle(style.tip, 0.55);
      g.beginPath();
      for (let i = 0; i < sides; i++) {
        const a = rot + (i / sides) * Math.PI * 2;
        const x = cx + Math.cos(a) * innerR * 0.55 - 2;
        const y = cy + Math.sin(a) * innerR * 0.55 - 3;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.closePath();
      g.fillPath();

      // Gloss blob
      g.fillStyle(0xffffff, 0.55);
      g.fillEllipse(cx - R * 0.22, cy - R * 0.28, R * 0.28, R * 0.18);
      g.fillStyle(0xffffff, 0.28);
      g.fillEllipse(cx + R * 0.18, cy + R * 0.12, R * 0.16, R * 0.1);

      // Rim
      g.lineStyle(3, lighten(style.dark, 0.15), 0.65);
      g.beginPath();
      g.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
      g.closePath();
      g.strokePath();

      // Tiny sparkle
      g.fillStyle(0xffffff, 0.9);
      g.fillCircle(cx - R * 0.08, cy - R * 0.35, 3);
      g.fillCircle(cx + R * 0.3, cy - R * 0.05, 2);

      g.generateTexture(key, TEX, TEX);
      g.destroy();
    }

    pos(r, c) {
      return {
        x: this.originX + this.pad + c * (this.cell + this.pad) + this.cell / 2,
        y: this.originY + this.pad + r * (this.cell + this.pad) + this.cell / 2,
      };
    }

    randColor(a, b) {
      let v;
      do {
        v = Phaser.Math.Between(0, COLORS.length - 1);
      } while (v === a || v === b);
      return v;
    }

    gemDepth(r, c) {
      return this.gemDepthBase + r * COLS + c;
    }

    makeGem(r, c, color) {
      const p = this.pos(r, c);
      const size = this.cell * 0.9;
      const g = this.add
        .image(p.x, p.y, "jewel" + color)
        .setDisplaySize(size, size)
        .setDepth(this.gemDepth(r, c))
        .setData("r", r)
        .setData("c", c)
        .setData("color", color)
        .setData("selected", false)
        .setInteractive({ useHandCursor: true });
      this.lockGemHit(g);

      // Soft selection halo (hidden until selected)
      const halo = this.add
        .circle(p.x, p.y, this.cell * 0.42, 0xffffff, 0)
        .setStrokeStyle(3, 0xffffff, 0)
        .setDepth(g.depth - 0.1);
      g.halo = halo;
      g.setData("restScale", g.scaleX);

      g.on("pointerdown", (pointer) => this.onGemPointerDown(g, pointer));
      g.on("pointerup", (pointer) => this.onGemPointerUp(g, pointer));

      return g;
    }

    syncHalo(g) {
      if (!g || !g.halo) return;
      g.halo.x = g.x;
      g.halo.y = g.y;
      const rest = g.getData("restScale");
      const base = rest == null || rest <= 0 ? 1 : rest;
      g.halo.setScale((g.scaleX || 1) / base);
      g.halo.setDepth(g.depth - 0.1);
      g.halo.setAlpha(g.alpha);
    }

    /** Keep pointer hit box at original cell size even when gem is scaled. */
    lockGemHit(g) {
      if (!g || !g.input) return;
      const s = Math.max(0.01, g.scaleX || 1);
      const hw = (this.cell * 0.92) / s;
      const hh = (this.cell * 0.92) / s;
      g.input.hitArea = new Phaser.Geom.Rectangle(-hw / 2, -hh / 2, hw, hh);
      g.input.hitAreaCallback = Phaser.Geom.Rectangle.Contains;
    }

    /**
     * Visual scale relative to rest pose (setDisplaySize). factor 1 = rest.
     * Always lockGemHit after changing scale so hit boxes cannot accumulate.
     */
    setGemScale(g, factor) {
      if (!g || !g.active) return;
      const rest = g.getData("restScale");
      const base = rest == null || rest <= 0 ? (this.cell * 0.9) / TEX : rest;
      g.setScale(base * factor);
      this.lockGemHit(g);
    }


    onGemPointerDown(gem, pointer) {
      if (this.busy || this.ended || !gem.active) return;
      const cell = { r: gem.getData("r"), c: gem.getData("c") };
      this._dragFrom = cell;
      this._dragPointerId = pointer.id;
      this._sx = pointer.x;
      this._sy = pointer.y;

      if (this.selected) {
        if (this.selected.r === cell.r && this.selected.c === cell.c) {
          this.clearSelect();
          return;
        }
        if (this.isAdjacent(this.selected, cell)) {
          const a = this.selected;
          this.clearSelect();
          this._dragFrom = null;
          this.trySwap(a, cell);
          return;
        }
      }
      this.select(cell);
    }

    onGemPointerUp(gem, pointer) {
      if (this.busy || this.ended || !gem.active) return;
      if (!this._dragFrom) return;
      if (this._dragPointerId != null && pointer.id !== this._dragPointerId) return;

      const from = this._dragFrom;
      const to = { r: gem.getData("r"), c: gem.getData("c") };
      const dx = pointer.x - this._sx;
      const dy = pointer.y - this._sy;
      this._dragFrom = null;
      this._dragPointerId = null;

      if (from.r === to.r && from.c === to.c) {
        if (Math.hypot(dx, dy) >= SWIPE_MIN) {
          const dir =
            Math.abs(dx) > Math.abs(dy)
              ? dx > 0
                ? { r: 0, c: 1 }
                : { r: 0, c: -1 }
              : dy > 0
                ? { r: 1, c: 0 }
                : { r: -1, c: 0 };
          const nbr = { r: from.r + dir.r, c: from.c + dir.c };
          if (
            nbr.r >= 0 &&
            nbr.r < ROWS &&
            nbr.c >= 0 &&
            nbr.c < COLS &&
            this.isAdjacent(from, nbr)
          ) {
            this.clearSelect();
            this.trySwap(from, nbr);
          }
        }
        return;
      }

      if (!this.isAdjacent(from, to)) return;
      this.clearSelect();
      this.trySwap(from, to);
    }

    destroyGem(g) {
      if (!g) return;
      if (g.halo) {
        g.halo.destroy();
        g.halo = null;
      }
      g.destroy();
    }

    clearBoard() {
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          this.destroyGem(this.gems[r] && this.gems[r][c]);
        }
      }
      this.gems = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
      this.grid = Array.from({ length: ROWS }, () => Array(COLS).fill(-1));
    }

    fillInitial() {
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const left =
            c >= 2 && this.grid[r][c - 1] === this.grid[r][c - 2]
              ? this.grid[r][c - 1]
              : -1;
          const up =
            r >= 2 && this.grid[r - 1][c] === this.grid[r - 2][c]
              ? this.grid[r - 1][c]
              : -1;
          const color = this.randColor(left, up);
          this.grid[r][c] = color;
          this.gems[r][c] = this.makeGem(r, c, color);
        }
      }
    }

    syncHud() {
      if (scoreEl) scoreEl.textContent = String(this.score);
      if (movesEl) movesEl.textContent = String(this.movesLeft);
    }

    hardReset() {
      this.gen = resetGen;
      if (this.tweens) this.tweens.killAll();
      if (this.time) this.time.removeAllEvents();
      this.busy = false;
      this.ended = false;
      this.selected = null;
      this._dragFrom = null;
      this._dragPointerId = null;
      this.combo = 0;
      hideOverlay();
      this.newGame(true);
    }

    newGame(fromHard) {
      const myGen = this.gen;
      if (this.tweens) this.tweens.killAll();
      if (this.time) this.time.removeAllEvents();

      this.clearBoard();
      this.score = 0;
      this.movesLeft = START_MOVES;
      this.busy = false;
      this.selected = null;
      this.ended = false;
      this._dragFrom = null;
      this._dragPointerId = null;
      this.combo = 0;
      hideOverlay();
      this.fillInitial();
      this.syncHud();
      if (fromHard) sfx("click");

      this.time.delayedCall(40, () => {
        if (this.gen !== myGen) return;
        this.resolveBoard();
      });
    }

    isAdjacent(a, b) {
      return Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;
    }

    select(cell) {
      this.clearSelect();
      this.selected = cell;
      const g = this.gems[cell.r][cell.c];
      if (g) {
        g.setData("selected", true);
        this.setGemScale(g, 1.05);
        g.setDepth(this.gemDepthBase + 80);
        this.lockGemHit(g);
        if (g.halo) {
          g.halo.setStrokeStyle(3, 0xffffff, 0.95);
          g.halo.setFillStyle(0xffffff, 0.08);
          this.syncHalo(g);
        }
      }
    }

    clearSelect() {
      if (this.selected) {
        const row = this.gems[this.selected.r];
        const g = row && row[this.selected.c];
        if (g) {
          g.setData("selected", false);
          this.setGemScale(g, 1);
          g.setDepth(this.gemDepth(g.getData("r"), g.getData("c")));
          this.lockGemHit(g);
          if (g.halo) {
            g.halo.setStrokeStyle(3, 0xffffff, 0);
            g.halo.setFillStyle(0xffffff, 0);
            this.syncHalo(g);
          }
        }
      }
      this.selected = null;
    }

    trySwap(a, b) {
      if (this.busy || this.ended) return;
      if (!this.isAdjacent(a, b)) return;
      const myGen = this.gen;
      this.busy = true;
      this.combo = 0;
      this.swapCells(a, b);
      this.animateSwap(a, b, () => {
        if (this.gen !== myGen) return;
        if (!this.findMatches().length) {
          sfx("invalid");
          this.swapCells(a, b);
          this.animateSwap(a, b, () => {
            if (this.gen !== myGen) return;
            this.busy = false;
          });
          return;
        }
        this.movesLeft -= 1;
        this.syncHud();
        sfx("swap");
        this.resolveBoard();
      });
    }

    swapCells(a, b) {
      const t = this.grid[a.r][a.c];
      this.grid[a.r][a.c] = this.grid[b.r][b.c];
      this.grid[b.r][b.c] = t;
      const g1 = this.gems[a.r][a.c];
      const g2 = this.gems[b.r][b.c];
      this.gems[a.r][a.c] = g2;
      this.gems[b.r][b.c] = g1;
      if (g1) {
        g1.setData("r", b.r);
        g1.setData("c", b.c);
      }
      if (g2) {
        g2.setData("r", a.r);
        g2.setData("c", a.c);
      }
    }

    /**
     * Overlapping swap: one gem arcs over (scale up + high depth),
     * the other dips under (scale down + low depth) so they pass through each other.
     */
    animateSwap(a, b, done) {
      const gOver = this.gems[b.r][b.c]; // moving toward b
      const gUnder = this.gems[a.r][a.c]; // moving toward a
      const pOver = this.pos(b.r, b.c);
      const pUnder = this.pos(a.r, a.c);

      let left = 2;
      let finished = false;
      const tweens = [];
      const resetGemScale = (g) => {
        if (!g || !g.active) return;
        this.setGemScale(g, 1);
        this.syncHalo(g);
      };
      const finish = () => {
        if (finished) return;
        if (--left === 0) {
          finished = true;
          done();
        }
      };
      this.time.delayedCall(SWAP_MS + 500, () => {
        if (!finished) {
          finished = true;
          left = 0;
          tweens.forEach((tw) => {
            if (tw) tw.stop();
          });
          resetGemScale(gOver);
          resetGemScale(gUnder);
          done();
        }
      });

      const runArc = (g, dest, over) => {
        if (!g) {
          finish();
          return;
        }
        const sx = g.x;
        const sy = g.y;
        const mx = (sx + dest.x) / 2;
        const my = (sy + dest.y) / 2;
        // Perpendicular offset for arc (passes beside / over)
        const dx = dest.x - sx;
        const dy = dest.y - sy;
        const len = Math.hypot(dx, dy) || 1;
        const ox = (-dy / len) * this.cell * (over ? 0.38 : -0.22);
        const oy = (dx / len) * this.cell * (over ? 0.38 : -0.22) - (over ? this.cell * 0.18 : this.cell * 0.06);

        g.setDepth(over ? this.gemDepthBase + 100 : this.gemDepthBase + 2);

        const state = { t: 0 };
        const tw = this.tweens.add({
          targets: state,
          t: 1,
          duration: SWAP_MS,
          ease: "Sine.InOut",
          onUpdate: () => {
            const t = state.t;
            const omt = 1 - t;
            // Quadratic bezier through mid+offset
            const bx = omt * omt * sx + 2 * omt * t * (mx + ox) + t * t * dest.x;
            const by = omt * omt * sy + 2 * omt * t * (my + oy) + t * t * dest.y;
            g.x = bx;
            g.y = by;
            // Over max 1.08, under min 0.95; always relative to rest pose.
            const bump = over
              ? 1 + 0.08 * Math.sin(Math.PI * t)
              : 1 - 0.05 * Math.sin(Math.PI * t);
            this.setGemScale(g, bump);
            this.syncHalo(g);
          },
          onComplete: () => {
            g.x = dest.x;
            g.y = dest.y;
            this.setGemScale(g, 1);
            g.setDepth(this.gemDepth(g.getData("r"), g.getData("c")));
            this.lockGemHit(g);
            this.syncHalo(g);
            finish();
          },
          onStop: () => {
            resetGemScale(g);
          },
        });
        tweens.push(tw);
      };

      runArc(gOver, pOver, true);
      runArc(gUnder, pUnder, false);
    }

    findMatches() {
      const marked = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
      for (let r = 0; r < ROWS; r++) {
        let run = 1;
        for (let c = 1; c <= COLS; c++) {
          if (c < COLS && this.grid[r][c] === this.grid[r][c - 1] && this.grid[r][c] >= 0) {
            run++;
          } else {
            if (run >= 3) for (let k = 0; k < run; k++) marked[r][c - 1 - k] = true;
            run = 1;
          }
        }
      }
      for (let c = 0; c < COLS; c++) {
        let run = 1;
        for (let r = 1; r <= ROWS; r++) {
          if (r < ROWS && this.grid[r][c] === this.grid[r - 1][c] && this.grid[r][c] >= 0) {
            run++;
          } else {
            if (run >= 3) for (let k = 0; k < run; k++) marked[r - 1 - k][c] = true;
            run = 1;
          }
        }
      }
      const list = [];
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (marked[r][c]) list.push({ r, c });
        }
      }
      return list;
    }

    spawnBurst(x, y, colorIdx) {
      const tint = COLORS[colorIdx] || 0xffffff;
      const count = 10;
      for (let i = 0; i < count; i++) {
        const ang = (i / count) * Math.PI * 2 + Math.random() * 0.4;
        const dist = this.cell * (0.35 + Math.random() * 0.55);
        const dot = this.add
          .image(x, y, i % 3 === 0 ? "fxspark" : "fxdot")
          .setDisplaySize(8 + Math.random() * 6, 8 + Math.random() * 6)
          .setTint(tint)
          .setAlpha(0.95)
          .setDepth(this.fxDepth);
        this.tweens.add({
          targets: dot,
          x: x + Math.cos(ang) * dist,
          y: y + Math.sin(ang) * dist,
          alpha: 0,
          scale: 0.2,
          duration: 220 + Math.random() * 160,
          ease: "Cubic.Out",
          onComplete: () => dot.destroy(),
        });
      }
      // Center flash
      const flash = this.add
        .circle(x, y, this.cell * 0.2, 0xffffff, 0.7)
        .setDepth(this.fxDepth);
      this.tweens.add({
        targets: flash,
        scale: 2.2,
        alpha: 0,
        duration: 180,
        ease: "Cubic.Out",
        onComplete: () => flash.destroy(),
      });
    }

    spawnFallDust(g) {
      if (!g || !g.active) return;
      const tint = COLORS[g.getData("color")] || 0xffffff;
      const dust = this.add
        .image(g.x + (Math.random() - 0.5) * 8, g.y - this.cell * 0.15, "fxdot")
        .setDisplaySize(5, 5)
        .setTint(lighten(tint, 0.35))
        .setAlpha(0.55)
        .setDepth(this.fxDepth - 1);
      this.tweens.add({
        targets: dust,
        y: dust.y - 10 - Math.random() * 14,
        x: dust.x + (Math.random() - 0.5) * 16,
        alpha: 0,
        scale: 0.3,
        duration: 280,
        ease: "Sine.Out",
        onComplete: () => dust.destroy(),
      });
    }

    showComboPop(n, matches) {
      if (n < 2) return;
      const W = this.scale.width;
      const labels = ["", "", "콤보!", "대콤보!", "슈퍼!", "울트라!"];
      const label = (labels[Math.min(n, labels.length - 1)] || "콤보!") + " x" + n;
      const pts = matches.length * 10;
      const txt = this.add
        .text(W / 2, this.originY + this.cell * 1.2, label, {
          fontFamily: "system-ui, sans-serif",
          fontSize: Math.max(18, Math.floor(this.cell * 0.55)) + "px",
          fontStyle: "bold",
          color: "#fff7d6",
          stroke: "#5a3d00",
          strokeThickness: 5,
        })
        .setOrigin(0.5)
        .setDepth(this.fxDepth + 5)
        .setAlpha(0)
        .setScale(0.6);
      const sub = this.add
        .text(W / 2, txt.y + this.cell * 0.45, "+" + pts, {
          fontFamily: "system-ui, sans-serif",
          fontSize: Math.max(14, Math.floor(this.cell * 0.38)) + "px",
          fontStyle: "bold",
          color: "#a8ffd8",
          stroke: "#0a3d2a",
          strokeThickness: 4,
        })
        .setOrigin(0.5)
        .setDepth(this.fxDepth + 5)
        .setAlpha(0);

      this.tweens.add({
        targets: txt,
        alpha: 1,
        scale: 1.15,
        y: txt.y - 8,
        duration: 180,
        ease: "Back.Out",
        onComplete: () => {
          this.tweens.add({
            targets: txt,
            alpha: 0,
            y: txt.y - 28,
            scale: 1.3,
            duration: 420,
            delay: 220,
            ease: "Cubic.In",
            onComplete: () => txt.destroy(),
          });
        },
      });
      this.tweens.add({
        targets: sub,
        alpha: 1,
        y: sub.y - 6,
        duration: 200,
        delay: 40,
        ease: "Sine.Out",
        onComplete: () => {
          this.tweens.add({
            targets: sub,
            alpha: 0,
            y: sub.y - 24,
            duration: 400,
            delay: 260,
            onComplete: () => sub.destroy(),
          });
        },
      });

      // Confetti sprinkle on big combos
      if (n >= 3) {
        for (let i = 0; i < 12; i++) {
          const c = COLORS[i % COLORS.length];
          const p = this.add
            .image(W / 2 + (Math.random() - 0.5) * this.cell * 2, txt.y, "fxspark")
            .setTint(c)
            .setDisplaySize(7, 7)
            .setDepth(this.fxDepth + 4);
          this.tweens.add({
            targets: p,
            x: p.x + (Math.random() - 0.5) * this.cell * 3,
            y: p.y + this.cell * (0.5 + Math.random()),
            alpha: 0,
            angle: Math.random() * 180,
            duration: 500,
            ease: "Cubic.Out",
            onComplete: () => p.destroy(),
          });
        }
      }
    }

    resolveBoard() {
      const myGen = this.gen;
      const matches = this.findMatches();
      if (!matches.length) {
        this.combo = 0;
        this.busy = false;
        this.checkEnd();
        return;
      }
      this.busy = true;
      this.combo += 1;
      // Score = cleared gems × 10 (locked spec)
      this.score += matches.length * 10;
      sfx("match");
      this.syncHud();
      this.showComboPop(this.combo, matches);

      let pending = matches.length;
      let advanced = false;
      const advance = () => {
        if (advanced || this.gen !== myGen) return;
        advanced = true;
        this.collapseAndRefill();
      };
      this.time.delayedCall(CLEAR_MS + 900, advance);

      matches.forEach(({ r, c }) => {
        const g = this.gems[r][c];
        const color = this.grid[r][c];
        this.grid[r][c] = -1;
        this.gems[r][c] = null;
        if (!g) {
          if (--pending === 0) advance();
          return;
        }
        const p = this.pos(r, c);
        this.spawnBurst(p.x, p.y, color >= 0 ? color : g.getData("color"));
        this.tweens.add({
          targets: g,
          scale: 1.35,
          duration: CLEAR_MS * 0.35,
          yoyo: false,
          ease: "Sine.Out",
          onUpdate: () => this.syncHalo(g),
          onComplete: () => {
            this.tweens.add({
              targets: g,
              scale: 0,
              alpha: 0,
              angle: (Math.random() - 0.5) * 40,
              duration: CLEAR_MS * 0.65,
              ease: "Back.In",
              onUpdate: () => this.syncHalo(g),
              onComplete: () => {
                this.destroyGem(g);
                if (--pending === 0) advance();
              },
            });
          },
        });
      });
    }

    collapseAndRefill() {
      const myGen = this.gen;
      for (let c = 0; c < COLS; c++) {
        const stack = [];
        for (let r = ROWS - 1; r >= 0; r--) {
          if (this.grid[r][c] >= 0) {
            stack.push({ color: this.grid[r][c], gem: this.gems[r][c] });
          }
        }
        for (let r = ROWS - 1; r >= 0; r--) {
          const idx = ROWS - 1 - r;
          if (idx < stack.length) {
            const item = stack[idx];
            this.grid[r][c] = item.color;
            this.gems[r][c] = item.gem;
            if (item.gem) {
              item.gem.setData("r", r);
              item.gem.setData("c", c);
            }
          } else {
            this.grid[r][c] = -1;
            this.gems[r][c] = null;
          }
        }
        for (let r = 0; r < ROWS; r++) {
          if (this.grid[r][c] < 0) {
            const color = Phaser.Math.Between(0, COLORS.length - 1);
            this.grid[r][c] = color;
            const g = this.makeGem(r, c, color);
            const startY = this.originY - (ROWS - r) * (this.cell + this.pad);
            g.y = startY;
            this.syncHalo(g);
            this.gems[r][c] = g;
          }
        }
      }

      let moving = 0;
      let continued = false;
      const cont = () => {
        if (continued || this.gen !== myGen) return;
        continued = true;
        this.time.delayedCall(40, () => {
          if (this.gen !== myGen) return;
          this.resolveBoard();
        });
      };

      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const g = this.gems[r][c];
          if (!g) continue;
          const p = this.pos(r, c);
          if (Math.abs(g.x - p.x) < 1 && Math.abs(g.y - p.y) < 1) {
            g.setDepth(this.gemDepth(r, c));
            continue;
          }
          moving++;
          let dustAcc = 0;
          const fallDist = Math.abs(g.y - p.y);
          this.tweens.add({
            targets: g,
            x: p.x,
            y: p.y,
            duration: FALL_BASE + (ROWS - r) * 14 + Math.min(120, fallDist * 0.15),
            ease: "Bounce.Out",
            onUpdate: () => {
              this.syncHalo(g);
              g.setDepth(this.gemDepthBase + 50);
              dustAcc += 1;
              if (dustAcc % 3 === 0) this.spawnFallDust(g);
            },
            onComplete: () => {
              g.setDepth(this.gemDepth(r, c));
              this.syncHalo(g);
              // Landing puff
              for (let i = 0; i < 4; i++) {
                const d = this.add
                  .image(g.x + (Math.random() - 0.5) * 12, g.y + this.cell * 0.28, "fxdot")
                  .setDisplaySize(4, 4)
                  .setTint(0xc8d0e8)
                  .setAlpha(0.5)
                  .setDepth(this.fxDepth - 1);
                this.tweens.add({
                  targets: d,
                  x: d.x + (Math.random() - 0.5) * 20,
                  y: d.y - 6 - Math.random() * 8,
                  alpha: 0,
                  duration: 220,
                  onComplete: () => d.destroy(),
                });
              }
              moving--;
              if (moving === 0) cont();
            },
          });
        }
      }
      if (moving === 0) cont();
      else this.time.delayedCall(2800, cont);
    }

    checkEnd() {
      if (this.ended) return;
      if (this.score >= GOAL) {
        this.ended = true;
        sfx("win");
        showEndOverlay(true, this.score);
      } else if (this.movesLeft <= 0) {
        this.ended = true;
        showEndOverlay(false, this.score);
      }
    }
  }

  window.__bitnaMatch3Reset = () => {
    unlockAudio();
    if (scoreEl) scoreEl.textContent = "0";
    if (movesEl) movesEl.textContent = String(START_MOVES);
    hideOverlay();
    resetGen += 1;

    if (!gameRef) return;
    const scene = gameRef.scene.getScene("Match3") || sceneRef;
    if (!scene) return;

    if (scene.tweens) scene.tweens.killAll();
    if (scene.time) scene.time.removeAllEvents();
    scene.busy = false;
    scene.ended = false;
    scene.selected = null;
    scene._dragFrom = null;
    scene._dragPointerId = null;
    scene.combo = 0;
    scene.gen = resetGen;

    if (scene.sys && scene.sys.isActive() && typeof scene.hardReset === "function") {
      scene.hardReset();
      return;
    }
    if (scene.sys && scene.sys.isActive()) {
      scene.scene.restart();
      return;
    }
    if (typeof scene.newGame === "function") scene.newGame(true);
  };

  const boot = () => {
    const el = document.getElementById("game-container");
    if (!el) return;

    // Fixed logical square; parent CSS sizes the box; FIT scales into it.
    const LOGICAL = 720;

    gameRef = new Phaser.Game({
      type: Phaser.AUTO,
      parent: "game-container",
      width: LOGICAL,
      height: LOGICAL,
      backgroundColor: "#111527",
      scene: [Match3Scene],
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: LOGICAL,
        height: LOGICAL,
      },
      input: {
        activePointers: 3,
      },
    });
    if (gameRef.scale) gameRef.scale.refresh();

    const bindReset = (id) => {
      const btn = document.getElementById(id);
      if (!btn || btn.dataset.phaserBound) return;
      btn.dataset.phaserBound = "1";
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        window.__bitnaMatch3Reset();
      });
    };
    bindReset("btn-new");
    bindReset("overlay-new");
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
