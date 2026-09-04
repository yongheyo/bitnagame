(() => {
  // BitnaGame mute preference (migrates legacy playhub-muted once)
  const STORAGE_KEY = "bitnagame-muted";
  const LEGACY_MUTE_KEY = "playhub-muted";
  // Short oscillator presets (no binary assets). Aliases keep game calls simple.
  const FREQ = {
    click: 880,
    move: 520,
    slide: 500,
    swap: 560,
    match: 660,
    merge: 740,
    win: 990,
    over: 200,
    invalid: 160,
  };
  const DUR = {
    click: 0.06,
    move: 0.07,
    slide: 0.07,
    swap: 0.07,
    match: 0.11,
    merge: 0.1,
    win: 0.2,
    over: 0.18,
    invalid: 0.09,
  };
  const WAVE = {
    click: "sine",
    move: "sine",
    slide: "sine",
    swap: "sine",
    match: "triangle",
    merge: "triangle",
    win: "sine",
    over: "square",
    invalid: "square",
  };

  if (localStorage.getItem(STORAGE_KEY) == null) {
    const legacy = localStorage.getItem(LEGACY_MUTE_KEY);
    if (legacy != null) localStorage.setItem(STORAGE_KEY, legacy);
  }

  let muted = localStorage.getItem(STORAGE_KEY) === "1";
  let ctx = null;
  let unlocked = false;
  const listeners = new Set();

  function ensureCtx() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
    } catch (_) {
      ctx = null;
    }
    return ctx;
  }

  function notify() {
    listeners.forEach((fn) => {
      try {
        fn(muted);
      } catch (_) {}
    });
    document.querySelectorAll("[data-bitnagame-mute]").forEach(syncButton);
  }

  function syncButton(btn) {
    if (!btn) return;
    const on = !muted;
    btn.setAttribute("aria-pressed", on ? "false" : "true");
    btn.setAttribute("aria-label", on ? "소리 끄기" : "소리 켜기");
    btn.title = on ? "소리 끔" : "소리 킴";
    btn.textContent = on ? "🔊 소리킴" : "🔇 소리끔";
  }

  function isMuted() {
    return muted;
  }

  function setMuted(value) {
    muted = !!value;
    localStorage.setItem(STORAGE_KEY, muted ? "1" : "0");
    if (muted && ctx && ctx.state === "running") {
      try {
        ctx.suspend();
      } catch (_) {}
    } else if (!muted && ctx && ctx.state === "suspended" && unlocked) {
      try {
        ctx.resume();
      } catch (_) {}
    }
    notify();
    return muted;
  }

  function toggleMute() {
    return setMuted(!muted);
  }

  function unlock() {
    const c = ensureCtx();
    if (!c) {
      unlocked = true;
      return false;
    }
    if (c.state === "suspended") {
      c.resume().catch(() => {});
    }
    unlocked = true;
    return true;
  }

  function beep(freq, dur, type) {
    const c = ensureCtx();
    if (!c || muted || !unlocked) return;
    try {
      if (c.state === "suspended") c.resume().catch(() => {});
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = type || "sine";
      osc.frequency.value = freq;
      gain.gain.value = 0.0001;
      osc.connect(gain);
      gain.connect(c.destination);
      const now = c.currentTime;
      const peak = type === "square" ? 0.035 : 0.08;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(peak, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      osc.start(now);
      osc.stop(now + dur + 0.02);
    } catch (_) {}
  }

  function play(name) {
    if (muted || !unlocked) return;
    const key = FREQ[name] != null ? name : "click";
    const freq = FREQ[key];
    const dur = DUR[key] || 0.07;
    const type = WAVE[key] || "sine";
    beep(freq, dur, type);
    // Tiny second tick for win / merge feedback (still mute-aware via beep)
    if (key === "win") {
      setTimeout(() => beep(1320, 0.12, "sine"), 90);
    } else if (key === "merge") {
      setTimeout(() => beep(920, 0.06, "triangle"), 40);
    } else if (key === "over") {
      setTimeout(() => beep(140, 0.14, "square"), 70);
    }
  }

  function onMuteChange(fn) {
    if (typeof fn === "function") listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function bindMuteButton(btn) {
    if (!btn) return;
    btn.setAttribute("data-bitnagame-mute", "1");
    syncButton(btn);
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      unlock();
      toggleMute();
    });
  }

  function armUnlock() {
    const once = () => {
      unlock();
      window.removeEventListener("pointerdown", once, true);
      window.removeEventListener("keydown", once, true);
      window.removeEventListener("touchstart", once, true);
    };
    window.addEventListener("pointerdown", once, true);
    window.addEventListener("keydown", once, true);
    window.addEventListener("touchstart", once, true);
  }

  function initUi() {
    document.querySelectorAll("[data-bitnagame-mute]").forEach(bindMuteButton);
  }

  armUnlock();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initUi);
  } else {
    initUi();
  }

  window.BitnaGameAudio = {
    isMuted,
    setMuted,
    toggleMute,
    unlock,
    play,
    onMuteChange,
    bindMuteButton,
  };
})();
