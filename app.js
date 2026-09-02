/* HittiSpotti – musiikkivisa suomalaisilla biiseillä.
 * Pelkkää selain-JavaScriptiä: ei build-vaihetta, ei riippuvuuksia.
 */
(() => {
  "use strict";

  // ---------- Säännöt ----------
  const STEPS = [0.1, 0.5, 2, 8, 15];          // pätkän pituus sekunteina
  const POINTS = [1200, 975, 750, 525, 300];   // pisteet, jos tunnistat tällä askeleella
  const DAILY_COUNT = 5;
  const TIER_CYCLE = [1, 2, 3, 4, 5];          // yksi biisi jokaiselta tasolta, helpoimmasta vaikeimpaan
  const TIER_NAMES = { 1: "Helppo", 2: "Keskitaso", 3: "Vaikea", 4: "Mestari", 5: "Mahdoton" };
  const STORE = "hittispotti:";
  const STORE_OLD = "songspot-suomi:";         // aiempi nimi, tiedot siirretään kerran
  const RING = 2 * Math.PI * 54;               // soittopainikkeen kehän pituus (r = 54)

  // ---------- Tila ----------
  const state = {
    songs: [],
    byId: new Map(),
    mode: "daily",        // "daily" | "free"
    rounds: [],           // biisikohtaiset tilat, päivän pelissä viisi
    at: 0,                // mikä niistä on auki
    used: new Set(),
    freeCount: 0,
    results: [],
    score: 0,
    selected: null,
    pinned: null,        // vapaassa pelissä lukittu taso, null = kierto
    suggestions: [],
    activeSuggestion: -1,
    view: "loading",
  };

  const audio = {
    ctx: null,
    buffers: new Map(),   // id -> AudioBuffer
    starts: new Map(),    // id -> pätkän aloituskohta sekunteina
    source: null,
    raf: 0,
    playing: false,
  };

  // ---------- DOM ----------
  const $ = (s) => document.querySelector(s);
  const el = {
    body: document.body,
    views: {
      game: $("#view-game"),
      results: $("#view-results"),
      stats: $("#view-stats"),
      help: $("#view-help"),
      loading: $("#view-loading"),
    },
    scrim: $("#scrim"),
    drawer: $("#drawer"),
    menuBtn: $("#menu-btn"),
    drawerClose: $("#drawer-close"),
    drawerFoot: $("#drawer-foot"),
    navDailyNote: $("#nav-daily-note"),
    barTag: $("#bar-tag"),
    loadingText: $("#loading-text"),
    modeLabel: $("#mode-label"),
    scoreLabel: $("#score-label"),
    playBtn: $("#play-btn"),
    playIcon: $("#play-icon"),
    clipLen: $("#clip-len"),
    ring: $("#ring-fg"),
    tierBar: $("#tierbar"),
    ladder: $("#ladder"),
    hint: $("#hint"),
    form: $("#guess-form"),
    input: $("#guess-input"),
    suggestions: $("#suggestions"),
    actionBtn: $("#action-btn"),
    log: $("#guess-log"),
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
    againBtn: $("#results-again-btn"),
    statGrid: $("#stat-grid"),
    resetBtn: $("#reset-stats-btn"),
    toast: $("#toast"),
  };

  // ---------- Apurit ----------
  const fmt = (n) => Math.round(n).toLocaleString("fi-FI");
  const fmtSec = (s) => (s < 1 ? s.toFixed(1).replace(".", ",") : String(s)) + " s";
  const pad = (n) => String(n).padStart(2, "0");
  const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const todayKey = () => dayKey(new Date());
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

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  const store = {
    get(key, fallbackValue) {
      try {
        const raw = localStorage.getItem(STORE + key);
        return raw ? JSON.parse(raw) : fallbackValue;
      } catch { return fallbackValue; }
    },
    set(key, value) {
      try { localStorage.setItem(STORE + key, JSON.stringify(value)); } catch { /* yksityinen tila tms. */ }
    },
    keys() {
      try {
        return Object.keys(localStorage).filter((k) => k.startsWith(STORE)).map((k) => k.slice(STORE.length));
      } catch { return []; }
    },
    clear() {
      try {
        Object.keys(localStorage)
          .filter((k) => k.startsWith(STORE) || k.startsWith(STORE_OLD))
          .forEach((k) => localStorage.removeItem(k));
      } catch { /* ignore */ }
    },
  };

  // Siirtää aiemman nimen alla olevat tulokset kerran, ettei putki ja tilastot katoa.
  function migrateStore() {
    try {
      if (store.keys().length) return;
      Object.keys(localStorage)
        .filter((k) => k.startsWith(STORE_OLD))
        .forEach((k) => localStorage.setItem(STORE + k.slice(STORE_OLD.length), localStorage.getItem(k)));
    } catch { /* ignore */ }
  }

  let toastTimer = 0;
  function toast(msg, ms = 2200) {
    el.toast.textContent = msg;
    el.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.toast.hidden = true; }, ms);
  }

  // ---------- Näkymät ----------
  function show(name) {
    state.view = name;
    for (const [k, v] of Object.entries(el.views)) v.hidden = k !== name;
    window.scrollTo({ top: 0 });
    if (name === "stats") renderStats();
    updateBar();
  }

  function updateBar() {
    if (state.view === "game" && state.rounds.length) {
      el.barTag.textContent = state.mode === "daily"
        ? `${state.rounds.filter((r) => r.finished).length}/${DAILY_COUNT} valmis`
        : `Kierros ${state.freeCount + 1}`;
    } else {
      el.barTag.textContent = "";
    }
  }

  // ---------- Sivupalkki ----------
  function openDrawer() {
    refreshDrawer();
    el.body.classList.add("drawer-open");
    el.menuBtn.setAttribute("aria-expanded", "true");
    el.drawerClose.focus({ preventScroll: true });
  }

  function closeDrawer() {
    el.body.classList.remove("drawer-open");
    el.menuBtn.setAttribute("aria-expanded", "false");
  }

  function refreshDrawer() {
    const done = store.get("daily:" + todayKey(), null);
    el.navDailyNote.textContent = done
      ? `pelattu tänään · ${fmt(done.score)} p`
      : `viisi biisiä · ${todayPretty()}`;
    el.drawerFoot.textContent = `${state.songs.length} suomibiisiä · tulokset tallentuvat vain tähän selaimeen`;
    document.querySelectorAll("[data-go]").forEach((b) => {
      const isMode = b.dataset.go === "daily" || b.dataset.go === "free";
      if (isMode) b.classList.toggle("is-active", state.view === "game" && state.mode === b.dataset.go);
    });
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

  function dailySongs(key) {
    const rnd = mulberry32(hashString("songspot-suomi:" + key)); // siemen pidetään ennallaan, ettei päivän sarja vaihdu
    const picked = [];
    const ids = new Set();
    for (const tier of TIER_CYCLE) {
      let pool = state.songs.filter((s) => s.tier === tier && !ids.has(s.id));
      if (!pool.length) pool = state.songs.filter((s) => !ids.has(s.id));
      const song = pool[Math.floor(rnd() * pool.length)];
      picked.push(song);
      ids.add(song.id);
    }
    return picked;
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
    // Applen esikuuntelu-URL voi vanhentua: haetaan tuore trackId:llä.
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
        // Selain lataa tiedoston mutta ei pura AAC:tä Web Audiolla -> <audio>-elementti.
        throw new DecodeError(String((err && err.message) || err));
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

  // Varasoitin, jos Web Audio ei pysty purkamaan esikuuntelua.
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
      if (fallback.songId === song.id && a.readyState >= 2) { begin(); return; }
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
    const threshold = Math.max(peak * 0.02, 0.004); // kynnys suhteessa huippuun
    const win = Math.max(1, Math.round(sr * 0.01)); // 10 ms ikkuna
    for (let i = 0; i + win <= data.length; i += win) {
      let sum = 0;
      for (let j = i; j < i + win; j++) sum += data[j] * data[j];
      if (Math.sqrt(sum / win) >= threshold) return Math.max(0, i / sr - 0.03);
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
    el.ring.style.strokeDashoffset = RING;
  }

  function animateBar(seconds) {
    const visual = Math.max(seconds, 0.45); // 0,1 s näkyy silti palkissa
    const start = performance.now();
    const tick = () => {
      const t = Math.min(1, (performance.now() - start) / (visual * 1000));
      el.ring.style.strokeDashoffset = RING * (1 - t);
      if (t < 1) audio.raf = requestAnimationFrame(tick);
      else stopPlayback();
    };
    audio.raf = requestAnimationFrame(tick);
  }

  async function playClip(seconds) {
    const song = state.rounds.length ? cur().song : null;
    if (!song) return;
    stopPlayback();
    el.playBtn.disabled = true;
    el.playIcon.textContent = "…";

    const ready = () => {
      el.playBtn.disabled = false;
      audio.playing = true;
      el.playBtn.classList.add("is-playing");
      el.playIcon.textContent = "■";
    };
    const failed = (err) => {
      console.error(err);
      el.playBtn.disabled = false;
      el.playIcon.textContent = "▶";
      el.hint.textContent = "Pätkän lataus epäonnistui. Tarkista verkkoyhteys tai ohita biisi.";
      toast("Esikuuntelua ei saatu ladattua.");
    };

    let buffer = null;
    try {
      buffer = await fetchBuffer(song);
    } catch (err) {
      if (!(err instanceof DecodeError)) { failed(err); return; }
      if (cur().song !== song) return;
      try {
        await playClipFallback(song, seconds);
      } catch (err2) { failed(err2); return; }
      if (cur().song !== song) { stopFallback(); return; }
      ready();
      animateBar(seconds);
      return;
    }
    if (cur().song !== song) return; // biisi ehti vaihtua

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
    animateBar(seconds);
  }

  function prefetch(song) {
    if (!song || audio.buffers.has(song.id) || !audio.ctx) return;
    fetchBuffer(song).catch(() => { /* yritetään uudestaan kun soitetaan */ });
  }

  // ---------- Peli ----------
  function startDaily() {
    const key = todayKey();
    const done = store.get("daily:" + key, null);
    state.mode = "daily";
    if (done) {
      state.results = done.results.map((r) => ({ ...r, song: state.byId.get(String(r.id)) }));
      state.score = done.score;
      renderResults();
      show("results");
      return;
    }
    state.rounds = dailySongs(key).map(newRound);
    state.at = 0;
    state.results = [];
    state.score = 0;
    show("game");
    openRound();
    state.rounds.forEach((r) => prefetch(r.song));
  }

  function startFree() {
    state.mode = "free";
    state.pinned = null;
    state.used = new Set();
    state.freeCount = 0;
    state.results = [];
    state.score = 0;
    state.rounds = [newRound(nextFreeSong())];
    state.at = 0;
    show("game");
    openRound();
  }

  /* Vapaa peli kiertää tasot samassa järjestyksessä kuin päivän peli. Näin
   * kapea taso ei lopu kesken: Mahdoton toistuu vasta 175 kierroksen päästä
   * eikä 35:n, ja jokainen taso tulee yhtä usein vastaan. */
  function nextFreeSong() {
    const tier = state.pinned || TIER_CYCLE[state.freeCount % TIER_CYCLE.length];
    let pool = state.songs.filter((s) => s.tier === tier && !state.used.has(s.id));
    if (!pool.length) {
      // Taso käyty läpi: aloitetaan se alusta muita tasoja nollaamatta.
      state.songs.forEach((s) => { if (s.tier === tier) state.used.delete(s.id); });
      pool = state.songs.filter((s) => s.tier === tier);
    }
    const song = pool[Math.floor(Math.random() * pool.length)];
    state.used.add(song.id);
    return song;
  }

  /* Jokaisella biisillä on oma tilansa, joten päivän pelissä voi siirtyä
   * toiseen biisiin ja palata kesken jääneeseen ilman että edistyminen
   * katoaa. */
  function newRound(song) {
    return { song, step: 0, guesses: [], finished: false, solved: false, points: 0 };
  }

  const cur = () => state.rounds[state.at];

  function openRound() {
    stopPlayback();
    const r = cur();
    state.selected = null;
    el.input.value = "";
    closeSuggestions();
    el.log.innerHTML = "";
    r.guesses.forEach((g) => logGuess(g.type, g.label));
    if (r.finished) {
      showReveal(r);
    } else {
      el.reveal.hidden = true;
      el.form.hidden = false;
      el.hint.textContent = "";
    }
    renderRound();
  }

  function renderRound() {
    const r = cur();
    el.modeLabel.textContent = state.mode === "daily"
      ? `Päivän biisit · ${todayPretty()}`
      : "Vapaa peli";
    el.scoreLabel.textContent = `${fmt(state.score)} p`;
    renderTierBar();
    el.clipLen.textContent = fmtSec(STEPS[r.finished ? STEPS.length - 1 : r.step]);
    el.ladder.innerHTML = "";
    STEPS.forEach((sec, i) => {
      const li = document.createElement("li");
      li.className = i < r.step ? "is-done" : i === r.step ? "is-current" : "";
      li.textContent = fmtSec(sec).replace(" s", "");
      li.title = `${fmtSec(sec)} · ${fmt(POINTS[i])} pistettä`;
      el.ladder.appendChild(li);
    });
    renderAction();
    updateBar();
  }

  /* Päivän pelissä rivi on biisien välinen navigointi: viisikko pysyy samana,
   * mutta kesken jääneeseen voi palata myöhemmin. Vapaassa pelissä samalla
   * rivillä vaihdetaan vaikeustasoa. */
  function renderTierBar() {
    if (state.mode === "daily") {
      el.tierBar.innerHTML = state.rounds.map((r, i) => {
        const done = r.finished ? (r.solved ? "ratkaistu" : "ei ratkaistu") : "kesken";
        const cls = i === state.at ? " is-on" : r.finished ? (r.solved ? " is-ok" : " is-miss") : "";
        return `<button type="button" class="tchip${cls}" data-slot="${i}" data-tier="${r.song.tier}"
          aria-pressed="${i === state.at}" aria-label="${TIER_NAMES[r.song.tier]}, ${done}"
          >${TIER_NAMES[r.song.tier]}</button>`;
      }).join("");
      return;
    }
    const now = cur().song.tier;
    el.tierBar.innerHTML = TIER_CYCLE.map((t) => {
      const pinned = state.pinned === t;
      // Kierrossa nykyinen taso saa vain reunuksen, lukittu taso täytön.
      const cls = pinned ? " is-on" : (state.pinned === null && t === now ? " is-now" : "");
      return `<button type="button" class="tchip${cls}" data-tier="${t}" aria-pressed="${pinned}">${TIER_NAMES[t]}</button>`;
    }).join("");
  }

  /* Yksi nappi riittää: ohitus ja väärä arvaus vievät kierrosta yhtä paljon
   * eteenpäin, joten nappi tekee aina sen mitä kentän sisältö tarkoittaa. */
  function renderAction() {
    const r = cur();
    const ready = !!(state.selected || exactMatch(el.input.value));
    const last = r.step >= STEPS.length - 1;
    el.actionBtn.textContent = ready
      ? "Arvaa"
      : last ? "Luovuta" : `Ohita → ${fmtSec(STEPS[r.step + 1])}`;
    el.actionBtn.classList.toggle("btn-accent", ready);
  }

  function logGuess(type, label) {
    const li = document.createElement("li");
    li.className = type;
    li.innerHTML = `<span class="mark">${type === "wrong" ? "✕" : "→"}</span><span>${escapeHtml(label)}</span>`;
    el.log.appendChild(li);
  }

  function addGuess(type, label) {
    cur().guesses.push({ type, label });
    logGuess(type, label);
  }

  function advanceStep() {
    const r = cur();
    if (r.finished) return;
    if (r.step >= STEPS.length - 1) { finishRound(false); return; }
    r.step += 1;
    renderRound();
    el.hint.textContent = "";
    playClip(STEPS[r.step]);
    el.input.value = "";
    state.selected = null;
    closeSuggestions();
    renderAction();
  }

  function submitGuess() {
    const r = cur();
    if (r.finished) return;
    const guess = state.selected || exactMatch(el.input.value);
    if (!guess) { toast("Valitse biisi listasta."); return; }
    if (guess.id === r.song.id) finishRound(true);
    else { addGuess("wrong", guess.label); advanceStep(); }
  }

  function skipStep() {
    const r = cur();
    if (r.finished) return;
    addGuess("skip", r.step >= STEPS.length - 1 ? "Luovutettu" : `Ohitettu ${fmtSec(STEPS[r.step])}`);
    advanceStep();
  }

  function showReveal(r) {
    const song = r.song;
    el.form.hidden = true;
    closeSuggestions();
    el.reveal.hidden = false;
    el.reveal.classList.toggle("is-correct", r.solved);
    el.reveal.classList.toggle("is-wrong", !r.solved);
    el.revealArt.hidden = !song.art;
    el.revealArt.src = song.art || "";
    el.revealArt.alt = song.art ? `${song.title} – kansikuva` : "";
    el.revealVerdict.textContent = r.solved
      ? (r.step === 0 ? "Uskomatonta – 0,1 sekunnista" : `Oikein ${fmtSec(STEPS[r.step])} pätkästä`)
      : "Ei tällä kertaa";
    el.revealTitle.textContent = song.title;
    el.revealArtist.textContent = `${song.artist} · ${song.year}`;
    el.revealPoints.textContent = r.solved ? `+${fmt(r.points)} pistettä` : "0 pistettä";
    const left = state.mode === "daily" && state.rounds.some((x) => !x.finished);
    el.nextBtn.textContent = state.mode === "daily" && !left ? "Tulokset" : "Seuraava";
  }

  function finishRound(solved) {
    stopPlayback();
    const r = cur();
    r.finished = true;
    r.solved = solved;
    r.points = solved ? POINTS[r.step] : 0;
    state.score += r.points;
    if (state.mode === "free") {
      state.results.push({ id: r.song.id, song: r.song, step: r.step, points: r.points, solved });
      bumpFreeStats(solved, r.points);
    }
    renderRound();
    showReveal(r);
    el.nextBtn.focus({ preventScroll: true });
    if (state.mode === "daily" && state.rounds.every((x) => x.finished)) {
      state.results = state.rounds.map((x) => ({
        id: x.song.id, song: x.song, step: x.step, points: x.points, solved: x.solved,
      }));
      saveDaily();
    }
  }

  function nextRound() {
    if (state.mode === "daily") {
      // Siirry seuraavaan kesken olevaan biisiin, tarvittaessa alusta kiertäen.
      for (let k = 1; k <= state.rounds.length; k++) {
        const i = (state.at + k) % state.rounds.length;
        if (!state.rounds[i].finished) { state.at = i; openRound(); return; }
      }
      renderResults();
      show("results");
      return;
    }
    state.freeCount += 1;
    state.rounds = [newRound(nextFreeSong())];
    state.at = 0;
    openRound();
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
    el.suggestions.innerHTML = "";
    if (!el.input.value.trim()) { closeSuggestions(); return; }
    if (!state.suggestions.length) {
      el.suggestions.innerHTML = `<li class="empty">Ei osumia – kokeile artistin tai biisin nimeä.</li>`;
    }
    state.suggestions.forEach((s, i) => {
      const li = document.createElement("li");
      li.className = "suggestion" + (i === state.activeSuggestion ? " is-active" : "");
      li.setAttribute("role", "option");
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
    closeSuggestions();
    renderAction();
    el.actionBtn.focus({ preventScroll: true });
  }

  function onInput() {
    state.selected = null;
    state.suggestions = findSuggestions(el.input.value);
    state.activeSuggestion = state.suggestions.length ? 0 : -1;
    renderAction();
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
  const squares = (r) => STEPS.map((_, i) => (i < r.step ? "🟥" : i === r.step ? (r.solved ? "🟩" : "🟥") : "⬜")).join("");

  function shareText() {
    const lines = [];
    if (state.mode === "daily") {
      lines.push(`🎵 HittiSpotti · ${todayPretty()}`);
      lines.push(`${fmt(state.score)} / ${fmt(POINTS[0] * DAILY_COUNT)} pistettä`);
    } else {
      lines.push("🎵 HittiSpotti · vapaa peli");
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
    const solved = state.results.filter((r) => r.solved).length;
    el.resultsKicker.textContent = daily ? `Päivän biisit · ${todayPretty()}` : "Vapaa peli";
    el.resultsScore.textContent = fmt(state.score);
    if (daily) {
      el.resultsTitle.textContent = state.score >= 5000 ? "Mestarillista!"
        : state.score >= 3000 ? "Hyvä korva!"
        : state.score > 0 ? "Ihan kelpo" : "Huomenna uudestaan";
      el.resultsSub.textContent = `Tunnistit ${solved}/${DAILY_COUNT} biisistä. Uusi sarja huomenna.`;
    } else {
      el.resultsTitle.textContent = "Peli päättyi";
      el.resultsSub.textContent = `Tunnistit ${solved}/${state.results.length} biisistä.`;
    }
    el.resultsList.innerHTML = "";
    state.results.forEach((r) => {
      const s = r.song || state.byId.get(String(r.id)) || { title: "?", artist: "?", art: "", year: "" };
      const li = document.createElement("li");
      li.dataset.tier = s.tier ?? "";
      li.innerHTML = `
        <img src="${escapeHtml(s.art || "")}" alt="" loading="lazy">
        <div>
          <div class="r-title">${escapeHtml(s.title)}</div>
          <div class="r-artist">${escapeHtml(s.artist)} · ${escapeHtml(s.year ?? "")}</div>
          <div class="r-tier">${escapeHtml(TIER_NAMES[s.tier] || "")}</div>
          <div class="r-squares">${squares(r)}</div>
        </div>
        <div class="r-points${r.solved ? "" : " zero"}">${r.solved ? "+" + fmt(r.points) : "0"}</div>`;
      el.resultsList.appendChild(li);
    });
    el.sharePreview.hidden = true;
    el.againBtn.textContent = daily ? "Vapaa peli" : "Pelaa uudestaan";
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
  function defaultStats() {
    return {
      dailyPlayed: 0, dailyTotal: 0, dailyBest: 0, dailySolved: 0, streak: 0, bestStreak: 0, lastDaily: null,
      freeRounds: 0, freeSolved: 0, freeTotal: 0, freeBestRun: 0,
    };
  }

  function saveDaily() {
    const key = todayKey();
    store.set("daily:" + key, {
      score: state.score,
      results: state.results.map((r) => ({ id: r.id, step: r.step, points: r.points, solved: r.solved })),
    });
    const stats = { ...defaultStats(), ...store.get("stats", {}) };
    stats.dailyPlayed += 1;
    stats.dailyTotal += state.score;
    stats.dailyBest = Math.max(stats.dailyBest, state.score);
    stats.dailySolved += state.results.filter((r) => r.solved).length;
    const y = new Date(); y.setDate(y.getDate() - 1);
    stats.streak = stats.lastDaily === dayKey(y) ? stats.streak + 1 : 1;
    stats.bestStreak = Math.max(stats.bestStreak, stats.streak);
    stats.lastDaily = key;
    store.set("stats", stats);
  }

  function bumpFreeStats(solved, points) {
    const stats = { ...defaultStats(), ...store.get("stats", {}) };
    stats.freeRounds += 1;
    if (solved) stats.freeSolved += 1;
    stats.freeTotal += points;
    stats.freeBestRun = Math.max(stats.freeBestRun, state.score);
    store.set("stats", stats);
  }

  function renderStats() {
    const s = { ...defaultStats(), ...store.get("stats", {}) };
    const todayDone = !!store.get("daily:" + todayKey(), null);
    const y = new Date(); y.setDate(y.getDate() - 1);
    const streak = (s.lastDaily === todayKey() || s.lastDaily === dayKey(y)) ? s.streak : 0;
    const tiles = [
      ["head", "Päivän biisit"],
      [s.dailyPlayed, "pelattua päivää"],
      [s.dailyPlayed ? fmt(s.dailyTotal / s.dailyPlayed) : "–", "keskipisteet"],
      [fmt(s.dailyBest), "paras tulos"],
      [s.dailyPlayed ? Math.round((s.dailySolved / (s.dailyPlayed * DAILY_COUNT)) * 100) + " %" : "–", "tunnistettu"],
      [streak + (todayDone ? "" : " ⏳"), "putki (päivää)"],
      [s.bestStreak, "pisin putki"],
      ["head", "Vapaa peli"],
      [s.freeRounds, "kierrosta"],
      [s.freeRounds ? Math.round((s.freeSolved / s.freeRounds) * 100) + " %" : "–", "tunnistettu"],
      [fmt(s.freeBestRun), "paras peli"],
      [s.freeRounds ? fmt(s.freeTotal / s.freeRounds) : "–", "pisteitä / kierros"],
    ];
    el.statGrid.innerHTML = tiles.map(([v, l]) => (v === "head"
      ? `<p class="stat-head">${l}</p>`
      : `<div class="stat"><div class="stat-value">${v}</div><div class="stat-label">${l}</div></div>`)).join("");
  }

  function resetStats() {
    if (!confirm("Nollataanko tilastot ja tämän päivän tulos tästä selaimesta?")) return;
    store.clear();
    renderStats();
    refreshDrawer();
    toast("Tilastot nollattu.");
  }

  // ---------- Navigointi ----------
  function go(target) {
    const midRound = state.view === "game" && state.rounds.some((r) => !r.finished);
    if ((target === "daily" || target === "free") && midRound
      && !confirm("Kesken oleva kierros menetetään. Vaihdetaanko?")) return;
    closeDrawer();
    stopPlayback();
    if (target === "daily") startDaily();
    else if (target === "free") startFree();
    else if (target === "stats") show("stats");
    else if (target === "help") show("help");
    else if (target === "back") show(state.rounds.length ? "game" : "results");
  }

  // ---------- Tapahtumat ----------
  function bind() {
    el.menuBtn.addEventListener("click", () => (el.body.classList.contains("drawer-open") ? closeDrawer() : openDrawer()));
    el.drawerClose.addEventListener("click", closeDrawer);
    el.scrim.addEventListener("click", closeDrawer);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && el.body.classList.contains("drawer-open")) closeDrawer();
    });

    document.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => go(b.dataset.go)));

    el.playBtn.addEventListener("click", () => {
      if (audio.playing) { stopPlayback(); return; }
      playClip(cur().finished ? STEPS[STEPS.length - 1] : STEPS[cur().step]);
    });
    el.replayBtn.addEventListener("click", () => playClip(STEPS[STEPS.length - 1]));
    el.nextBtn.addEventListener("click", nextRound);
    el.tierBar.addEventListener("click", (e) => {
      const chip = e.target.closest("button.tchip");
      if (!chip) return;
      if (state.mode === "daily") {
        state.at = Number(chip.dataset.slot);   // biisit säilyvät, vain näkymä vaihtuu
        openRound();
        return;
      }
      const t = Number(chip.dataset.tier);
      state.pinned = state.pinned === t ? null : t;   // sama taso uudelleen purkaa lukituksen
      state.freeCount += 1;
      state.rounds = [newRound(nextFreeSong())];
      state.at = 0;
      openRound();
    });

    el.actionBtn.addEventListener("click", () => {
      if (state.selected || exactMatch(el.input.value)) submitGuess();
      else skipStep();
    });
    // Enter arvaa aina, ei koskaan ohita vahingossa.
    el.form.addEventListener("submit", (e) => { e.preventDefault(); submitGuess(); });
    el.input.addEventListener("input", onInput);
    el.input.addEventListener("keydown", onInputKey);
    el.input.addEventListener("focus", () => { if (el.input.value.trim() && !state.selected) onInput(); });
    el.input.addEventListener("blur", () => setTimeout(closeSuggestions, 120));
    el.shareBtn.addEventListener("click", copyShare);
    el.againBtn.addEventListener("click", () => go("free"));
    el.resetBtn.addEventListener("click", resetStats);

    document.addEventListener("keydown", (e) => {
      if (state.view !== "game" || e.target === el.input || e.target.tagName === "BUTTON") return;
      if (e.key === " ") { e.preventDefault(); el.playBtn.click(); }
      else if (e.key === "Enter" && cur().finished) nextRound();
    });
  }

  // ---------- Käynnistys ----------
  async function init() {
    migrateStore();
    bind();
    try {
      await loadCatalog();
      refreshDrawer();
      startDaily();          // sivu avautuu suoraan päivän peliin
    } catch (err) {
      console.error(err);
      el.loadingText.textContent = location.protocol === "file:"
        ? "Selain ei salli songs.json-tiedoston lukemista suoraan levyltä. Käynnistä paikallinen palvelin, esimerkiksi python3 -m http.server, ja avaa http://localhost:8000."
        : "Biisien lataus epäonnistui: " + err.message;
    }
  }

  init();
})();
