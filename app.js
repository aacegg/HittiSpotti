/* SongSpot Suomi – musiikkivisa suomenkielisillä biiseillä.
 * Pelkkää selain-JavaScriptiä: ei build-vaihetta, ei riippuvuuksia.
 */
(() => {
  "use strict";

  // ---------- Säännöt ----------
  const STEPS = [0.1, 0.5, 2, 8, 15];          // pätkän pituus sekunteina
  const POINTS = [1200, 975, 750, 525, 300];   // pisteet, jos tunnistat tällä askeleella
  const DAILY_COUNT = 5;
  const DAILY_TIERS = [1, 2, 3, 4, 3];         // päivän viisikon vaikeusjakauma
  const TIER_NAMES = { 0: "Kaikki", 1: "Helppo", 2: "Tuttu", 3: "Keskitaso", 4: "Vaikea", 5: "Mestari" };
  const STORAGE_PREFIX = "songspot-suomi:";

  // ---------- Tila ----------
  const state = {
    songs: [],            // koko katalogi (vain esikuuntelulliset)
    byId: new Map(),
    mode: null,           // "daily" | "free"
    tier: 0,
    queue: [],            // päivän pelin biisit
    used: new Set(),      // vapaan pelin jo soitetut
    roundIndex: 0,
    current: null,        // nykyinen biisi
    step: 0,              // 0..4
    guesses: [],          // {type:"wrong"|"skip", label}
    finished: false,      // kierros ratkaistu (oikein tai kaikki askeleet käytetty)
    results: [],          // {song, step, points, solved}
    score: 0,
    selected: null,       // ehdotuslistasta valittu biisi
    activeSuggestion: -1,
    suggestions: [],
  };

  // ---------- Ääni ----------
  const audio = {
    ctx: null,
    buffers: new Map(),   // id -> AudioBuffer
    starts: new Map(),    // id -> pätkän aloituskohta sekunteina
    source: null,
    raf: 0,
    playing: false,
  };

  // ---------- DOM ----------
  const $ = (sel) => document.querySelector(sel);
  const el = {
    views: {
      loading: $("#view-loading"),
      menu: $("#view-menu"),
      game: $("#view-game"),
      results: $("#view-results"),
      stats: $("#view-stats"),
      help: $("#view-help"),
    },
    loadingText: $("#loading-text"),
    dailyStatus: $("#daily-status"),
    catalogNote: $("#catalog-note"),
    tierPicker: $(".tier-picker"),
    roundLabel: $("#round-label"),
    modeLabel: $("#mode-label"),
    scoreTotal: $("#score-total"),
    playBtn: $("#play-btn"),
    playIcon: $("#play-icon"),
    ringFg: $("#ring-fg"),
    steps: $("#steps"),
    playerStatus: $("#player-status"),
    form: $("#guess-form"),
    input: $("#guess-input"),
    suggestions: $("#suggestions"),
    skipBtn: $("#skip-btn"),
    guessBtn: $("#guess-btn"),
    guessLog: $("#guess-log"),
    reveal: $("#reveal"),
    revealArt: $("#reveal-art"),
    revealVerdict: $("#reveal-verdict"),
    revealTitle: $("#reveal-title"),
    revealArtist: $("#reveal-artist"),
    revealPoints: $("#reveal-points"),
    replayBtn: $("#replay-btn"),
    nextBtn: $("#next-btn"),
    resultsKicker: $("#results-kicker"),
    resultsTitle: $("#results-title"),
    resultsScore: $("#results-score"),
    resultsSub: $("#results-sub"),
    resultsList: $("#results-list"),
    shareBtn: $("#share-btn"),
    sharePreview: $("#share-preview"),
    resultsAgainBtn: $("#results-again-btn"),
    statGrid: $("#stat-grid"),
    resetStatsBtn: $("#reset-stats-btn"),
    toast: $("#toast"),
  };

  const RING_LEN = 2 * Math.PI * 54;

  // ---------- Apurit ----------
  const fmt = (n) => Math.round(n).toLocaleString("fi-FI");
  const fmtSec = (s) => (s < 1 ? s.toFixed(1).replace(".", ",") : String(s)) + " s";
  const todayKey = () => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };
  const todayPretty = () => new Date().toLocaleDateString("fi-FI");

  function normalize(s) {
    return s
      .toLowerCase()
      .replace(/ä/g, "a").replace(/ö/g, "o").replace(/å/g, "a")
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/&/g, " ja ")
      .replace(/[^a-z0-9 ]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function hashString(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(arr, rnd = Math.random) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(STORAGE_PREFIX + key);
        return raw ? JSON.parse(raw) : fallback;
      } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value)); } catch { /* yksityinen tila tms. */ }
    },
    remove(key) {
      try { localStorage.removeItem(STORAGE_PREFIX + key); } catch { /* ignore */ }
    },
    keys() {
      try {
        return Object.keys(localStorage).filter((k) => k.startsWith(STORAGE_PREFIX)).map((k) => k.slice(STORAGE_PREFIX.length));
      } catch { return []; }
    },
  };

  let toastTimer = 0;
  function toast(msg, ms = 2200) {
    el.toast.textContent = msg;
    el.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.toast.hidden = true; }, ms);
  }

  function show(name) {
    for (const [k, v] of Object.entries(el.views)) v.hidden = k !== name;
    window.scrollTo({ top: 0 });
    if (name === "menu") refreshMenu();
    if (name === "stats") renderStats();
  }

  // ---------- Katalogi ----------
  async function loadCatalog() {
    const res = await fetch("songs.json", { cache: "no-cache" });
    if (!res.ok) throw new Error("songs.json ei latautunut (" + res.status + ")");
    const all = await res.json();
    state.songs = all.filter((s) => s.preview && s.id);
    state.songs.forEach((s) => {
      s.label = `${s.artist} – ${s.title}`;
      s.key = normalize(s.artist + " " + s.title);
      s.keyTitle = normalize(s.title);
      s.keyArtist = normalize(s.artist);
      state.byId.set(String(s.id), s);
    });
    if (state.songs.length < DAILY_COUNT) throw new Error("Katalogissa on liian vähän biisejä.");
  }

  function songsForTier(tier) {
    return tier ? state.songs.filter((s) => s.tier === tier) : state.songs;
  }

  function dailySongs(dateKey) {
    const rnd = mulberry32(hashString("songspot-suomi:" + dateKey));
    const picked = [];
    const pickedIds = new Set();
    for (const tier of DAILY_TIERS) {
      let pool = state.songs.filter((s) => s.tier === tier && !pickedIds.has(s.id));
      if (!pool.length) pool = state.songs.filter((s) => !pickedIds.has(s.id));
      const song = pool[Math.floor(rnd() * pool.length)];
      picked.push(song);
      pickedIds.add(song.id);
    }
    return shuffle(picked, rnd);
  }

  // ---------- Ääni ----------
  function ensureAudio() {
    if (!audio.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      audio.ctx = new Ctx();
    }
    if (audio.ctx.state === "suspended") audio.ctx.resume();
    return audio.ctx;
  }

  async function refreshPreviewUrl(song) {
    // iTunesin esikuuntelu-URL voi vanhentua: haetaan tuore trackId:llä.
    const res = await fetch(`https://itunes.apple.com/lookup?id=${song.id}&country=fi`);
    if (!res.ok) throw new Error("lookup " + res.status);
    const data = await res.json();
    const hit = (data.results || []).find((r) => r.previewUrl);
    if (!hit) throw new Error("ei esikuuntelua");
    song.preview = hit.previewUrl;
    if (hit.artworkUrl100) song.art = hit.artworkUrl100.replace("100x100", "300x300");
    return song.preview;
  }

  class DecodeError extends Error {}

  async function fetchBuffer(song) {
    if (audio.buffers.has(song.id)) return audio.buffers.get(song.id);
    const ctx = ensureAudio();
    const tryUrl = async (url) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error("preview " + res.status);
      const bytes = await res.arrayBuffer();
      try {
        return await ctx.decodeAudioData(bytes);
      } catch (err) {
        // Selain osaa ladata tiedoston mutta ei purkaa AAC:tä Web Audiolla -> käytetään <audio>-elementtiä.
        throw new DecodeError(String(err && err.message || err));
      }
    };
    let buffer;
    try {
      buffer = await tryUrl(song.preview);
    } catch (err) {
      if (err instanceof DecodeError) throw err;
      buffer = await tryUrl(await refreshPreviewUrl(song));
    }
    audio.buffers.set(song.id, buffer);
    return buffer;
  }

  // Varajärjestelmä: tavallinen <audio>-elementti, jos Web Audio ei pysty purkamaan esikuuntelua.
  const fallback = { el: null, timer: 0, songId: null };

  function fallbackElement() {
    if (!fallback.el) {
      fallback.el = new Audio();
      fallback.el.preload = "auto";
      fallback.el.crossOrigin = "anonymous";
    }
    return fallback.el;
  }

  function stopFallback() {
    clearTimeout(fallback.timer);
    if (fallback.el && !fallback.el.paused) fallback.el.pause();
  }

  function playClipFallback(song, seconds) {
    return new Promise((resolve, reject) => {
      const a = fallbackElement();
      const begin = () => {
        a.currentTime = 0;
        a.play().then(() => {
          fallback.timer = setTimeout(() => { a.pause(); }, seconds * 1000);
          resolve();
        }).catch(reject);
      };
      if (fallback.songId === song.id && a.readyState >= 2) {
        begin();
        return;
      }
      fallback.songId = song.id;
      a.src = song.preview;
      a.addEventListener("loadedmetadata", begin, { once: true });
      a.addEventListener("error", () => reject(new Error("audio element error")), { once: true });
      a.load();
    });
  }

  /* Pätkä alkaa esikuuntelun alusta, mutta hiljaisuus ohitetaan: etsitään
   * ensimmäinen kohta, jossa ääntä oikeasti kuuluu. Ilman tätä 0,1 sekunnin
   * pätkä voisi osua kokonaan hiljaiseen alkuun. */
  function findAudioStart(buffer) {
    const data = buffer.getChannelData(0);
    const sr = buffer.sampleRate;
    let peak = 0;
    for (let i = 0; i < data.length; i++) {
      const v = Math.abs(data[i]);
      if (v > peak) peak = v;
    }
    if (peak < 0.005) return 0; // käytännössä äänetön pätkä
    // Kynnys suhteutetaan huippuun, jotta hiljaisemmatkin masteroinnit toimivat.
    const threshold = Math.max(peak * 0.02, 0.004);
    const win = Math.max(1, Math.round(sr * 0.01)); // 10 ms ikkuna
    for (let i = 0; i + win <= data.length; i += win) {
      let sum = 0;
      for (let j = i; j < i + win; j++) sum += data[j] * data[j];
      if (Math.sqrt(sum / win) >= threshold) {
        return Math.max(0, i / sr - 0.03); // hitusen ennen, ettei isku katkea
      }
    }
    return 0;
  }

  function clipOffset(song, buffer) {
    if (!buffer) return 0; // varasoitin ei pysty analysoimaan näytteitä
    if (!audio.starts.has(song.id)) audio.starts.set(song.id, findAudioStart(buffer));
    return audio.starts.get(song.id);
  }

  function stopPlayback() {
    if (audio.source) {
      try { audio.source.stop(); } catch { /* jo pysäytetty */ }
      audio.source.disconnect();
      audio.source = null;
    }
    stopFallback();
    cancelAnimationFrame(audio.raf);
    audio.playing = false;
    el.playBtn.classList.remove("is-playing");
    el.playIcon.textContent = "▶";
    el.ringFg.style.strokeDashoffset = RING_LEN;
  }

  function animateRing(seconds) {
    const visualLen = Math.max(seconds, 0.45); // 0,1 s näkyy silti renkaassa
    const start = performance.now();
    const tick = () => {
      const t = Math.min(1, (performance.now() - start) / (visualLen * 1000));
      el.ringFg.style.strokeDashoffset = RING_LEN * (1 - t);
      if (t < 1) audio.raf = requestAnimationFrame(tick);
      else stopPlayback();
    };
    audio.raf = requestAnimationFrame(tick);
  }

  async function playClip(seconds) {
    const song = state.current;
    if (!song) return;
    stopPlayback();
    el.playBtn.disabled = true;
    el.playIcon.classList.add("is-loading");
    el.playIcon.textContent = "…";

    const ready = () => {
      el.playIcon.classList.remove("is-loading");
      el.playBtn.disabled = false;
      audio.playing = true;
      el.playBtn.classList.add("is-playing");
      el.playIcon.textContent = "■";
    };
    const failed = (err) => {
      console.error(err);
      el.playIcon.classList.remove("is-loading");
      el.playBtn.disabled = false;
      el.playIcon.textContent = "▶";
      el.playerStatus.textContent = "Pätkän lataus epäonnistui. Tarkista verkkoyhteys tai ohita biisi.";
      toast("Esikuuntelua ei saatu ladattua.");
    };

    let buffer = null;
    try {
      buffer = await fetchBuffer(song);
    } catch (err) {
      if (!(err instanceof DecodeError)) { failed(err); return; }
      // Web Audio ei purkanut AAC:tä: soitetaan tavallisella <audio>-elementillä.
      if (state.current !== song) return;
      try {
        await playClipFallback(song, seconds);
      } catch (err2) { failed(err2); return; }
      if (state.current !== song) { stopFallback(); return; }
      ready();
      animateRing(seconds);
      return;
    }
    if (state.current !== song) return; // kierros ehti vaihtua

    const ctx = ensureAudio();
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    // Pieni häivytys, ettei 0,1 s pätkä naksahda.
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    const fade = Math.min(0.02, seconds / 4);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(1, now + fade);
    gain.gain.setValueAtTime(1, now + seconds - fade);
    gain.gain.linearRampToValueAtTime(0, now + seconds);
    src.connect(gain).connect(ctx.destination);
    src.start(now, clipOffset(song, buffer), seconds);
    audio.source = src;
    ready();
    animateRing(seconds);
  }

  function prefetch(song) {
    if (!song || audio.buffers.has(song.id) || !audio.ctx) return;
    fetchBuffer(song).catch(() => { /* yritetään uudestaan kun soitetaan */ });
  }

  // ---------- Peli ----------
  function startDaily() {
    const key = todayKey();
    const done = store.get("daily:" + key, null);
    if (done) {
      state.mode = "daily";
      state.results = done.results.map((r) => ({ ...r, song: state.byId.get(String(r.id)) || r.song }));
      state.score = done.score;
      renderResults();
      show("results");
      return;
    }
    state.mode = "daily";
    state.queue = dailySongs(key);
    state.roundIndex = 0;
    state.results = [];
    state.score = 0;
    show("game");
    beginRound(state.queue[0]);
  }

  function startFree() {
    const pool = songsForTier(state.tier);
    if (!pool.length) { toast("Tällä tasolla ei ole vielä biisejä."); return; }
    state.mode = "free";
    state.used = new Set();
    state.roundIndex = 0;
    state.results = [];
    state.score = 0;
    show("game");
    beginRound(nextFreeSong());
  }

  function nextFreeSong() {
    let pool = songsForTier(state.tier).filter((s) => !state.used.has(s.id));
    if (!pool.length) { state.used.clear(); pool = songsForTier(state.tier); }
    const song = pool[Math.floor(Math.random() * pool.length)];
    state.used.add(song.id);
    return song;
  }

  function beginRound(song) {
    stopPlayback();
    state.current = song;
    state.step = 0;
    state.guesses = [];
    state.finished = false;
    state.selected = null;
    state.roundIndex += 1;
    el.input.value = "";
    el.input.disabled = false;
    el.guessLog.innerHTML = "";
    el.reveal.hidden = true;
    el.form.hidden = false;
    el.guessBtn.disabled = true;
    el.skipBtn.disabled = false;
    el.playerStatus.textContent = "Paina play ja kuuntele.";
    closeSuggestions();
    renderHead();
    renderSteps();
    if (state.mode === "daily") {
      prefetch(state.queue[state.roundIndex]);
    }
    el.input.focus({ preventScroll: true });
  }

  function renderHead() {
    if (state.mode === "daily") {
      el.roundLabel.textContent = `Biisi ${state.roundIndex}/${DAILY_COUNT}`;
      el.modeLabel.textContent = `Päivän 5 · ${todayPretty()}`;
    } else {
      el.roundLabel.textContent = `Kierros ${state.roundIndex}`;
      el.modeLabel.textContent = `Vapaa peli · ${TIER_NAMES[state.tier]}`;
    }
    el.scoreTotal.textContent = fmt(state.score);
  }

  function renderSteps() {
    el.steps.innerHTML = "";
    STEPS.forEach((sec, i) => {
      const span = document.createElement("span");
      span.className = "step" + (i < state.step ? " is-done" : i === state.step ? " is-current" : "");
      span.innerHTML = `${fmtSec(sec)} <small>${fmt(POINTS[i])} p</small>`;
      el.steps.appendChild(span);
    });
    const remaining = STEPS.length - state.step - 1;
    el.skipBtn.textContent = remaining > 0 ? `Ohita → ${fmtSec(STEPS[state.step + 1])}` : "Luovuta";
  }

  function logGuess(type, label) {
    state.guesses.push({ type, label });
    const li = document.createElement("li");
    li.className = type;
    li.innerHTML = `<span class="mark">${type === "wrong" ? "✕" : "→"}</span><span>${escapeHtml(label)}</span>`;
    el.guessLog.appendChild(li);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function advanceStep(reason) {
    if (state.finished) return;
    if (state.step >= STEPS.length - 1) {
      finishRound(false);
      return;
    }
    state.step += 1;
    renderSteps();
    el.playerStatus.textContent = reason === "skip"
      ? `Ohitettu. Pätkä on nyt ${fmtSec(STEPS[state.step])}.`
      : `Ei osunut. Pätkä on nyt ${fmtSec(STEPS[state.step])}.`;
    playClip(STEPS[state.step]);
    el.input.value = "";
    state.selected = null;
    el.guessBtn.disabled = true;
    closeSuggestions();
    el.input.focus({ preventScroll: true });
  }

  function submitGuess() {
    if (state.finished) return;
    const guess = state.selected || exactMatch(el.input.value);
    if (!guess) {
      toast("Valitse biisi ehdotuslistasta.");
      return;
    }
    if (guess.id === state.current.id) {
      finishRound(true);
    } else {
      logGuess("wrong", guess.label);
      advanceStep("wrong");
    }
  }

  function skipStep() {
    if (state.finished) return;
    logGuess("skip", state.step >= STEPS.length - 1 ? "Luovutettu" : `Ohitettu ${fmtSec(STEPS[state.step])}`);
    advanceStep("skip");
  }

  function finishRound(solved) {
    stopPlayback();
    state.finished = true;
    const points = solved ? POINTS[state.step] : 0;
    state.score += points;
    const song = state.current;
    state.results.push({ id: song.id, song, step: state.step, points, solved });
    renderHead();

    el.form.hidden = true;
    closeSuggestions();
    el.reveal.hidden = false;
    el.reveal.classList.toggle("is-correct", solved);
    el.reveal.classList.toggle("is-wrong", !solved);
    el.revealArt.hidden = !song.art;
    el.revealArt.src = song.art || "";
    el.revealArt.alt = song.art ? `${song.title} – kansikuva` : "";
    el.revealVerdict.textContent = solved
      ? (state.step === 0 ? "Uskomatonta! Oikein 0,1 sekunnista" : `Oikein ${fmtSec(STEPS[state.step])} pätkästä`)
      : "Ei tällä kertaa";
    el.revealTitle.textContent = song.title;
    el.revealArtist.textContent = `${song.artist} · ${song.year}`;
    el.revealPoints.textContent = solved ? `+${fmt(points)} pistettä` : "0 pistettä";
    el.playerStatus.textContent = solved ? "Hienoa!" : "Kuuntele vielä pätkä ja jatka.";

    const isLast = state.mode === "daily" && state.roundIndex >= DAILY_COUNT;
    el.nextBtn.textContent = isLast ? "Näytä tulokset" : "Seuraava";
    el.nextBtn.focus({ preventScroll: true });

    if (isLast) saveDaily();
    if (state.mode === "free") bumpFreeStats(solved, points);
  }

  function nextRound() {
    if (state.mode === "daily") {
      if (state.roundIndex >= DAILY_COUNT) {
        renderResults();
        show("results");
        return;
      }
      beginRound(state.queue[state.roundIndex]);
    } else {
      beginRound(nextFreeSong());
    }
  }

  function quitGame() {
    stopPlayback();
    if (state.mode === "free" && state.results.length) {
      renderResults();
      show("results");
      return;
    }
    if (state.mode === "daily" && !state.finished && state.results.length < DAILY_COUNT) {
      // Päivän peli keskeytetty: ei tallenneta, voi jatkaa alusta myöhemmin.
    }
    show("menu");
  }

  // ---------- Ehdotukset ----------
  function exactMatch(text) {
    const key = normalize(text);
    if (!key) return null;
    return state.songs.find((s) => s.key === key || normalize(s.label) === key) || null;
  }

  function findSuggestions(text) {
    const q = normalize(text);
    if (!q) return [];
    const tokens = q.split(" ");
    const scored = [];
    for (const s of state.songs) {
      if (!tokens.every((t) => s.key.includes(t))) continue;
      let score = 0;
      if (s.keyTitle.startsWith(q)) score += 30;
      else if (s.keyArtist.startsWith(q)) score += 25;
      else if (s.key.startsWith(q)) score += 20;
      if (s.keyTitle.includes(q)) score += 10;
      if (s.keyArtist.includes(q)) score += 8;
      score -= s.tier; // tutummat ensin tasapelissä
      scored.push([score, s]);
    }
    scored.sort((a, b) => b[0] - a[0] || a[1].label.localeCompare(b[1].label, "fi"));
    return scored.slice(0, 8).map((x) => x[1]);
  }

  function renderSuggestions() {
    const list = state.suggestions;
    el.suggestions.innerHTML = "";
    if (!el.input.value.trim()) { closeSuggestions(); return; }
    if (!list.length) {
      el.suggestions.innerHTML = `<li class="empty">Ei osumia – kokeile artistin tai biisin nimeä.</li>`;
    }
    list.forEach((s, i) => {
      const li = document.createElement("li");
      li.className = "suggestion" + (i === state.activeSuggestion ? " is-active" : "");
      li.setAttribute("role", "option");
      li.id = "sugg-" + i;
      li.innerHTML = `<span class="s-title">${escapeHtml(s.title)}</span><span class="s-artist">${escapeHtml(s.artist)}</span>`;
      li.addEventListener("mousedown", (e) => { e.preventDefault(); chooseSuggestion(s); });
      el.suggestions.appendChild(li);
    });
    el.suggestions.hidden = false;
    el.input.setAttribute("aria-expanded", "true");
  }

  function closeSuggestions() {
    el.suggestions.hidden = true;
    el.input.setAttribute("aria-expanded", "false");
    state.activeSuggestion = -1;
    state.suggestions = [];
  }

  function chooseSuggestion(song) {
    state.selected = song;
    el.input.value = song.label;
    el.guessBtn.disabled = false;
    closeSuggestions();
    el.guessBtn.focus({ preventScroll: true });
  }

  function onInput() {
    state.selected = null;
    state.suggestions = findSuggestions(el.input.value);
    state.activeSuggestion = state.suggestions.length ? 0 : -1;
    el.guessBtn.disabled = !exactMatch(el.input.value);
    renderSuggestions();
  }

  function onInputKey(e) {
    if (el.suggestions.hidden) {
      if (e.key === "ArrowDown" && el.input.value.trim()) { onInput(); e.preventDefault(); }
      return;
    }
    const n = state.suggestions.length;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      state.activeSuggestion = n ? (state.activeSuggestion + 1) % n : -1;
      renderSuggestions();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      state.activeSuggestion = n ? (state.activeSuggestion - 1 + n) % n : -1;
      renderSuggestions();
    } else if (e.key === "Enter") {
      if (state.activeSuggestion >= 0 && state.suggestions[state.activeSuggestion]) {
        e.preventDefault();
        chooseSuggestion(state.suggestions[state.activeSuggestion]);
      }
    } else if (e.key === "Escape") {
      closeSuggestions();
    }
  }

  // ---------- Tulokset ----------
  function squares(r) {
    return STEPS.map((_, i) => (i < r.step ? "🟥" : i === r.step ? (r.solved ? "🟩" : "🟥") : "⬜")).join("");
  }

  function shareText() {
    const lines = [];
    if (state.mode === "daily") {
      lines.push(`🎵 SongSpot Suomi – Päivän 5 · ${todayPretty()}`);
      lines.push(`${fmt(state.score)} / ${fmt(POINTS[0] * DAILY_COUNT)} pistettä`);
    } else {
      lines.push(`🎵 SongSpot Suomi – Vapaa peli (${TIER_NAMES[state.tier]})`);
      lines.push(`${fmt(state.score)} pistettä · ${state.results.length} ${state.results.length === 1 ? "biisi" : "biisiä"}`);
    }
    lines.push("");
    state.results.forEach((r) => lines.push(`${squares(r)} ${r.solved ? fmt(r.points) : "0"}`));
    if (location.protocol.startsWith("http")) {
      lines.push("");
      lines.push(location.origin + location.pathname);
    }
    return lines.join("\n");
  }

  function renderResults() {
    const daily = state.mode === "daily";
    el.resultsKicker.textContent = daily ? `Päivän 5 · ${todayPretty()}` : `Vapaa peli · ${TIER_NAMES[state.tier]}`;
    el.resultsScore.textContent = fmt(state.score);
    const solvedCount = state.results.filter((r) => r.solved).length;
    if (daily) {
      el.resultsTitle.textContent = state.score >= 5000 ? "Mestarillista!" : state.score >= 3000 ? "Hyvä korva!" : state.score > 0 ? "Ihan kelpo" : "Huomenna uudestaan";
      el.resultsSub.textContent = `Tunnistit ${solvedCount}/${DAILY_COUNT} biisistä. Uusi viisikko huomenna.`;
    } else {
      el.resultsTitle.textContent = "Peli päättyi";
      el.resultsSub.textContent = `Tunnistit ${solvedCount}/${state.results.length} biisistä.`;
    }
    el.resultsList.innerHTML = "";
    state.results.forEach((r) => {
      const s = r.song || state.byId.get(String(r.id)) || { title: "?", artist: "?", art: "" };
      const li = document.createElement("li");
      li.innerHTML = `
        <img src="${escapeHtml(s.art || "")}" alt="" loading="lazy">
        <div>
          <div class="r-title">${escapeHtml(s.title)}</div>
          <div class="r-artist">${escapeHtml(s.artist)} · ${escapeHtml(s.year ?? "")}</div>
          <div class="r-squares">${squares(r)}</div>
        </div>
        <div class="r-points${r.solved ? "" : " zero"}">${r.solved ? "+" + fmt(r.points) : "0"}</div>`;
      el.resultsList.appendChild(li);
    });
    el.sharePreview.hidden = true;
    el.resultsAgainBtn.textContent = daily ? "Pelaa vapaata peliä" : "Pelaa uudestaan";
  }

  async function copyShare() {
    const text = shareText();
    el.sharePreview.textContent = text;
    el.sharePreview.hidden = false;
    try {
      if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) {
        await navigator.share({ text });
        return;
      }
      await navigator.clipboard.writeText(text);
      toast("Tulos kopioitu leikepöydälle!");
    } catch {
      toast("Kopioi teksti alta.");
    }
  }

  // ---------- Tallennus & tilastot ----------
  function saveDaily() {
    const key = todayKey();
    store.set("daily:" + key, {
      score: state.score,
      results: state.results.map((r) => ({ id: r.id, step: r.step, points: r.points, solved: r.solved })),
    });
    const stats = store.get("stats", defaultStats());
    stats.dailyPlayed += 1;
    stats.dailyTotal += state.score;
    stats.dailyBest = Math.max(stats.dailyBest, state.score);
    stats.dailySolved += state.results.filter((r) => r.solved).length;
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    const p = (n) => String(n).padStart(2, "0");
    const yKey = `${yesterday.getFullYear()}-${p(yesterday.getMonth() + 1)}-${p(yesterday.getDate())}`;
    stats.streak = stats.lastDaily === yKey ? stats.streak + 1 : 1;
    stats.bestStreak = Math.max(stats.bestStreak, stats.streak);
    stats.lastDaily = key;
    store.set("stats", stats);
  }

  function bumpFreeStats(solved, points) {
    const stats = store.get("stats", defaultStats());
    stats.freeRounds += 1;
    if (solved) stats.freeSolved += 1;
    stats.freeTotal += points;
    store.set("stats", stats);
    if (state.score > (stats.freeBestRun || 0)) {
      stats.freeBestRun = state.score;
      store.set("stats", stats);
    }
  }

  function defaultStats() {
    return {
      dailyPlayed: 0, dailyTotal: 0, dailyBest: 0, dailySolved: 0, streak: 0, bestStreak: 0, lastDaily: null,
      freeRounds: 0, freeSolved: 0, freeTotal: 0, freeBestRun: 0,
    };
  }

  function renderStats() {
    const s = { ...defaultStats(), ...store.get("stats", {}) };
    const todayDone = !!store.get("daily:" + todayKey(), null);
    const streakLive = s.lastDaily === todayKey() || (() => {
      const y = new Date(); y.setDate(y.getDate() - 1);
      const p = (n) => String(n).padStart(2, "0");
      return s.lastDaily === `${y.getFullYear()}-${p(y.getMonth() + 1)}-${p(y.getDate())}`;
    })();
    const streak = streakLive ? s.streak : 0;
    const tiles = [
      ["section", "Päivän 5"],
      [s.dailyPlayed, "pelattua päivää"],
      [s.dailyPlayed ? fmt(s.dailyTotal / s.dailyPlayed) : "–", "keskipisteet"],
      [fmt(s.dailyBest), "paras tulos"],
      [s.dailyPlayed ? Math.round((s.dailySolved / (s.dailyPlayed * DAILY_COUNT)) * 100) + " %" : "–", "tunnistettu"],
      [streak + (todayDone ? "" : " ⏳"), "putki (päivää)"],
      [s.bestStreak, "pisin putki"],
      ["section", "Vapaa peli"],
      [s.freeRounds, "kierrosta"],
      [s.freeRounds ? Math.round((s.freeSolved / s.freeRounds) * 100) + " %" : "–", "tunnistettu"],
      [fmt(s.freeBestRun), "paras peli"],
      [s.freeRounds ? fmt(s.freeTotal / s.freeRounds) : "–", "pisteitä / kierros"],
    ];
    el.statGrid.innerHTML = tiles.map(([v, l]) => v === "section"
      ? `<div class="stat-section">${l}</div>`
      : `<div class="stat"><div class="stat-value">${v}</div><div class="stat-label">${l}</div></div>`).join("");
  }

  function resetStats() {
    if (!confirm("Nollataanko kaikki tilastot ja päivän tulokset tästä selaimesta?")) return;
    store.keys().forEach((k) => store.remove(k));
    renderStats();
    toast("Tilastot nollattu.");
  }

  // ---------- Etusivu ----------
  function refreshMenu() {
    const done = store.get("daily:" + todayKey(), null);
    el.dailyStatus.textContent = done
      ? `Pelattu tänään: ${fmt(done.score)} pistettä · katso tulos`
      : `${todayPretty()} · viisi biisiä, max ${fmt(POINTS[0] * DAILY_COUNT)} pistettä`;
    const tiers = [1, 2, 3, 4, 5].map((t) => songsForTier(t).length);
    el.catalogNote.textContent = `Katalogissa ${state.songs.length} suomibiisiä · Helppo ${tiers[0]} · Tuttu ${tiers[1]} · Keskitaso ${tiers[2]} · Vaikea ${tiers[3]} · Mestari ${tiers[4]}`;
  }

  // ---------- Tapahtumat ----------
  function bind() {
    document.querySelectorAll("[data-nav]").forEach((b) => b.addEventListener("click", (e) => {
      e.preventDefault();
      if (!el.views.game.hidden && state.mode && !state.finished && state.results.length < (state.mode === "daily" ? DAILY_COUNT : Infinity)) {
        if (!confirm("Keskeytetäänkö peli?")) return;
      }
      stopPlayback();
      show(b.dataset.nav);
    }));
    document.querySelector('[data-action="start-daily"]').addEventListener("click", startDaily);
    document.querySelector('[data-action="start-free"]').addEventListener("click", startFree);
    document.querySelector('[data-action="quit"]').addEventListener("click", () => {
      if (state.mode === "daily" && state.results.length < DAILY_COUNT && !confirm("Keskeytetäänkö päivän peli? Voit aloittaa sen myöhemmin alusta.")) return;
      quitGame();
    });

    el.tierPicker.addEventListener("click", (e) => {
      const chip = e.target.closest(".chip");
      if (!chip) return;
      state.tier = Number(chip.dataset.tier);
      el.tierPicker.querySelectorAll(".chip").forEach((c) => c.classList.toggle("is-active", c === chip));
      store.set("tier", state.tier);
    });

    el.playBtn.addEventListener("click", () => {
      if (audio.playing) { stopPlayback(); return; }
      playClip(state.finished ? STEPS[STEPS.length - 1] : STEPS[state.step]);
    });
    el.replayBtn.addEventListener("click", () => playClip(STEPS[STEPS.length - 1]));
    el.nextBtn.addEventListener("click", nextRound);
    el.skipBtn.addEventListener("click", skipStep);
    el.form.addEventListener("submit", (e) => { e.preventDefault(); submitGuess(); });
    el.input.addEventListener("input", onInput);
    el.input.addEventListener("keydown", onInputKey);
    el.input.addEventListener("focus", () => { if (el.input.value.trim() && !state.selected) onInput(); });
    el.input.addEventListener("blur", () => setTimeout(closeSuggestions, 120));
    el.shareBtn.addEventListener("click", copyShare);
    el.resultsAgainBtn.addEventListener("click", startFree);
    el.resetStatsBtn.addEventListener("click", resetStats);
    // Piilota kansikuva, jos sitä ei saada ladattua (ei näytetä rikkinäistä kuvaa).
    el.revealArt.addEventListener("error", () => { el.revealArt.hidden = true; });
    el.resultsList.addEventListener("error", (e) => {
      if (e.target.tagName === "IMG") e.target.style.visibility = "hidden";
    }, true);

    document.addEventListener("keydown", (e) => {
      if (el.views.game.hidden) return;
      const typing = e.target === el.input;
      if (e.key === " " && !typing && e.target.tagName !== "BUTTON") {
        e.preventDefault();
        el.playBtn.click();
      } else if (e.key === "Enter" && state.finished && e.target !== el.nextBtn && e.target.tagName !== "BUTTON") {
        nextRound();
      }
    });
  }

  // ---------- Käynnistys ----------
  async function init() {
    bind();
    state.tier = Number(store.get("tier", 0)) || 0;
    el.tierPicker.querySelectorAll(".chip").forEach((c) => c.classList.toggle("is-active", Number(c.dataset.tier) === state.tier));
    try {
      await loadCatalog();
      show("menu");
    } catch (err) {
      console.error(err);
      el.loadingText.textContent = location.protocol === "file:"
        ? "Selain ei salli songs.json-tiedoston lukemista suoraan levyltä. Käynnistä paikallinen palvelin, esim. `python3 -m http.server`, ja avaa http://localhost:8000."
        : "Biisikatalogin lataus epäonnistui: " + err.message;
      el.loadingText.style.color = "#f87171";
    }
  }

  init();
})();
