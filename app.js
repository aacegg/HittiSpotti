/* HittiSpotti – musiikkivisa suomalaisilla biiseillä.
 * Pelkkää selain-JavaScriptiä: ei build-vaihetta, ei riippuvuuksia.
 */
(() => {
  "use strict";

  // ---------- Säännöt ----------
  const STEPS = [0.1, 0.5, 2, 8, 15];          // pätkän pituus sekunteina
  /* Pisteet putoavat suhteellisesti, eivät tasaisesti: joka askel maksaa noin
   * 29 % siitä mitä pelaajalla oli. Pätkän pituus moninkertaistuu askeleittain
   * (0,1 -> 0,5 on viisinkertainen määrä ääntä), joten tasainen pudotus teki
   * ensimmäisistä askelista liian halpoja ohittaa ja viimeisistä liian
   * kalliita. Maksimi pysyy 1200:ssa, jotta vanhat tulokset ovat vertailu-
   * kelpoisia. Ohjeteksti index.html:ssä toistaa nämä luvut. */
  const POINTS = [1200, 850, 600, 425, 300];   // pisteet, jos tunnistat tällä askeleella
  const DAILY_COUNT = 5;
  const TIER_CYCLE = [1, 2, 3, 4, 5];          // yksi biisi jokaiselta tasolta, helpoimmasta vaikeimpaan
  const TIER_NAMES = { 1: "Helppo", 2: "Keskitaso", 3: "Vaikea", 4: "Mestari", 5: "Mahdoton" };
  const STORE = "hittispotti:";
  const STORE_OLD = "songspot-suomi:";         // aiempi nimi, tiedot siirretään kerran
  const RING = 2 * Math.PI * 54;               // soittopainikkeen kehän pituus (r = 54)
  /* Katalogilla on oma versionumeronsa, jota nostetaan vain kun songs.json
   * muuttuu. Näin selain ja service worker saavat pitää 780 kt:n tiedoston
   * välimuistissa tyylimuutosten yli, mutta uusi katalogi on eri osoite ja
   * tulee varmasti perille – vanha versio antaisi pelaajalle eri päivän
   * biisit kuin muille. */
  const KATALOGI = "songs.json?k=2";

  // ---------- Tila ----------
  const state = {
    songs: [],           // kaikki – näistä haetaan ja arvataan
    pool: [],            // näistä peli jakaa biisit
    byId: new Map(),
    mode: "daily",        // "daily" | "free"
    dayKey: null,         // minkä päivän sarja on auki – ei kellosta, ks. startDaily
    rounds: [],           // biisikohtaiset tilat, päivän pelissä viisi
    at: 0,                // mikä niistä on auki
    used: new Set(),
    results: [],
    score: 0,
    selected: null,
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
    freeReset: $("#free-reset"),
    navFreeNote: $("#nav-free-note"),
    bar: document.querySelector(".bar"),
    barTag: $("#bar-tag"),
    loadingText: $("#loading-text"),
    loadingRetry: $("#loading-retry"),
    retryBtn: $("#retry-btn"),
    modeLabel: $("#mode-label"),
    scoreLabel: $("#score-label"),
    playBtn: $("#play-btn"),
    playIcon: $("#play-icon"),
    clipLen: $("#clip-len"),
    stake: $("#stake"),
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
    revealApple: $("#reveal-apple"),
    revealPoints: $("#reveal-points"),
    rate: $("#rate"),
    rateQ: $("#rate-q"),
    rateRow: $("#rate-row"),
    exportBtn: $("#export-btn"),
    exportOut: $("#export-out"),
    replayBtn: $("#replay-btn"),
    nextBtn: $("#next-btn"),
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
  const secNum = (s) => (s < 1 ? s.toFixed(1).replace(".", ",") : String(s));
  const fmtSec = (s) => secNum(s) + " s";
  /* "0,1 sekunnista" – paljastuksen sanamuotoon, jossa "0,1 s" lukisi oudosti. */
  const secWord = (s) => secNum(s) + " sekunnista";
  const pad = (n) => String(n).padStart(2, "0");

  /* Yhteenveto kertoo mitä tapahtui, ei arvostele pelaajaa: "Neljä viidestä
   * tunnistettu", ei "Hyvä korva!". Sarja on aina viisi biisiä, mutta
   * taulukot kattavat pienemmätkin varmuuden vuoksi ja tuntemattomasta
   * koosta pudotaan murtolukuun. */
  const LUKU = ["Nolla", "Yksi", "Kaksi", "Kolme", "Neljä", "Viisi"];
  const KAIKISTA = { 1: "yhdestä", 2: "kahdesta", 3: "kolmesta", 4: "neljästä", 5: "viidestä" };
  function resultSummary(solved, total) {
    if (!solved) return "Ei osumia.";
    if (solved >= total) return LUKU[total] ? `Kaikki ${LUKU[total].toLowerCase()} tunnistettu.` : `Kaikki ${total} tunnistettu.`;
    return LUKU[solved] && KAIKISTA[total]
      ? `${LUKU[solved]} ${KAIKISTA[total]} tunnistettu.`
      : `${solved}/${total} tunnistettu.`;
  }

  /* Päiväys niin kuin sen puhuisi: "keskiviikkona 3.9.". Viikonpäivä on
   * taulukossa eikä toLocaleDateStringissä, koska tarvitaan essiivi
   * ("keskiviikkona") jota selaimen lokaali ei anna. Vuosi jätetään pois:
   * näytettävä päivä on aina kuluva tai eilinen. */
  const VIIKONPAIVA = ["sunnuntaina", "maanantaina", "tiistaina", "keskiviikkona",
                       "torstaina", "perjantaina", "lauantaina"];
  const dateLine = (d) => `${VIIKONPAIVA[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}.`;
  /* Avaimesta takaisin paikalliseksi päiväksi. Pelinäkymä näyttää sen päivän,
   * jonka sarja on auki – ei kellon päivää, joka voi vaihtua kesken pelin. */
  const keyToDate = (key) => { const [y, m, d] = key.split("-").map(Number); return new Date(y, m - 1, d); };

  /* Nimetön tapahtumalaskuri. Kirjaa vain sen, että jokin tapahtui – ei
   * biisiä, tulosta eikä mitään pelaajasta. Kaksi tapahtumaa riittää siihen
   * mikä on oikeasti kiinnostavaa: montako aloitettua päivän sarjaa pelataan
   * loppuun. Skripti latautuu asynkronisesti ja mainosesto voi estää sen
   * kokonaan, joten kutsu ei saa kaatua sen puuttumiseen. */
  function track(nimi) {
    /* Laskuri ladataan asynkronisesti, ja "päivä aloitettu" tapahtuu heti
     * sivun auettua – mitattuna skripti oli valmis vasta 147 ms kohdalla,
     * jolloin suora kutsu katosi hiljaa. Siksi yritetään uudestaan kunnes
     * skripti on paikalla, ja luovutetaan viiden sekunnin jälkeen: silloin
     * kyseessä on mainosesto, joka on pelaajan oma valinta. */
    let yritys = 0;
    (function yrita() {
      try {
        if (window.goatcounter && window.goatcounter.count) {
          window.goatcounter.count({ path: nimi, title: nimi, event: true });
          return;
        }
      } catch { return; }   // analytiikka ei koskaan riko peliä
      if (++yritys < 20) setTimeout(yrita, 250);
    })();
  }

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
    remove(key) {
      try { localStorage.removeItem(STORE + key); } catch { /* ignore */ }
    },
    keys() {
      try {
        return Object.keys(localStorage).filter((k) => k.startsWith(STORE)).map((k) => k.slice(STORE.length));
      } catch { return []; }
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
    // Elävä väri kuuluu soivalle biisille. Muualla sivu palaa perusväriin,
    // jotta sovelluksella on myös oma pysyvä sävynsä.
    if (name !== "game") delete el.body.dataset.tier;
    window.scrollTo({ top: 0 });
    if (name === "stats") renderStats();
    updateBar();
  }

  function updateBar() {
    if (state.view === "game" && state.rounds.length) {
      el.barTag.textContent = `${state.rounds.filter((r) => r.finished).length}/${state.rounds.length} valmis`;
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

  /* Onko kesken olevassa sarjassa mitään menetettävää: yksikin biisi, jota on
   * ehditty ohittaa tai arvata. Koskematon sarja saa vaihtua ilman kyselyä. */
  const atRisk = () => state.view === "game" && state.rounds.some((r) => r.finished || r.step > 0);
  const freeStarted = () => state.mode === "free" && atRisk();

  function refreshDrawer() {
    const done = store.get("daily:" + todayKey(), null);
    el.navDailyNote.textContent = done
      ? `pelattu tänään, ${fmt(done.score)} p`
      : `viisi biisiä, ${dateLine(new Date())}`;
    el.drawerFoot.textContent = `${state.pool.length} arvattavaa biisiä · tulokset tallentuvat vain tähän selaimeen`;
    // "Uusi sarja" koskee vain vapaata peliä, joten se näkyy vasta siellä.
    el.freeReset.hidden = !(state.mode === "free" && state.view === "game");
    el.navFreeNote.textContent = !freeStarted() ? "aloita sarja alusta"
      : state.score ? `nollaa sarja ja ${fmt(state.score)} p`
      : "nollaa aloitettu sarja";
    document.querySelectorAll("[data-go]").forEach((b) => {
      const isMode = b.dataset.go === "daily" || b.dataset.go === "free";
      if (isMode) b.classList.toggle("is-active", state.view === "game" && state.mode === b.dataset.go);
    });
  }

  // ---------- Katalogi ----------
  async function loadCatalog() {
    const res = await fetch(KATALOGI);
    if (!res.ok) throw new Error("songs.json ei latautunut (" + res.status + ")");
    const all = await res.json();
    state.songs = all.filter((s) => s.preview && s.id);
    /* Osa biiseistä on mukana vain hakulistan täytteenä: ne eivät koskaan
     * tule arvattavaksi, mutta tekevät ehdotuslistasta niin tiheän, ettei
     * oikeaa vastausta voi päätellä pelkästään siitä mitä listalla on. */
    state.pool = state.songs.filter((s) => s.peli !== false);
    /* Pakat johdetaan poolista, joten uudelleenlataus (Yritä uudelleen)
     * mitätöi ne. Ilman tyhjennystä jäisi käyttöön vanhan katalogin pakka. */
    tierLists.clear();
    deckCache.clear();
    state.songs.forEach((s) => {
      s.label = `${s.artist} – ${s.title}`;
      s.key = normalize(s.artist + " " + s.title);
      s.keyTitle = normalize(s.title);
      s.keyArtist = normalize(s.artist);
      state.byId.set(String(s.id), s);
    });
    if (state.pool.length < DAILY_COUNT) throw new Error("Katalogissa on liian vähän biisejä.");
  }

  /* Päivän biisejä ei arvota päivä kerrallaan vaan pakka sekoitetaan kerran:
   * jokainen taso saa oman satunnaisen järjestyksen, jota käydään läpi päivä
   * kerrallaan. Riippumattomassa arvonnassa mikään ei estänyt samaa biisiä
   * osumasta peräkkäisinä päivinä – 35 biisin Mahdoton toistui kahden viikon
   * sisällä 95 %:n todennäköisyydellä. Nyt biisi palaa vasta kun koko taso on
   * käyty läpi, eli aikaisintaan tason biisimäärän verran päiviä myöhemmin.
   * Järjestys on yhä pelkkä päivämäärän funktio, joten sarja on sama kaikilla
   * ilman palvelinta. */
  const DAY_MS = 86400000;
  /* Kierron alkupäivä. Tästä päivästä lähtien jaetaan pakkojen ensimmäinen
   * kortti, eli EPOCH:n siirtäminen aloittaa koko kierron alusta. */
  const EPOCH = Date.UTC(2026, 8, 3);   // 3.9.2026
  /* Sekoituksen sukupolvi. Kulkee jokaisen pakan siemeneen, joten numeron
   * nostaminen antaa kaikille tasoille kokonaan uuden järjestyksen ilman
   * että kierron alkupäivää tarvitsee koskea. */
  const SEKOITUS = 4;

  function dayIndex(key) {
    const [y, m, d] = key.split("-").map(Number);
    return Math.floor((Date.UTC(y, m - 1, d) - EPOCH) / DAY_MS);
  }

  // Fisher–Yates siemenellä: sama kierros tuottaa aina saman järjestyksen.
  function shuffled(list, seed) {
    const rnd = mulberry32(seed);
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  /* Kierrosten sauma on ainoa kohta, jossa lyhyt toisto vielä mahtuisi
   * syntymään: edellisen pakan loppu ja uuden alku ovat päiviä peräkkäin.
   * Siksi uuden alkupäästä siirretään pois kaikki, jotka olivat edellisen
   * loppupäässä. Vaihtopari haetaan pakan keskeltä, ei lopusta, jotta tämän
   * kierroksen häntä pysyy samana kuin sekoitus antoi – muuten seuraava sauma
   * vertaisi väärään järjestykseen. */
  const GAP = 7;

  function tierOrder(list, tier, cycle) {
    const order = shuffled(list, hashString(`hittispotti:${SEKOITUS}:${tier}:${cycle}`));
    const n = order.length;
    if (cycle <= 0 || n < 2 * GAP + 2) return order;
    const prev = shuffled(list, hashString(`hittispotti:${SEKOITUS}:${tier}:${cycle - 1}`));
    const tail = new Set(prev.slice(n - GAP).map((x) => x.id));
    for (let i = 0; i < GAP; i++) {
      if (!tail.has(order[i].id)) continue;
      for (let j = GAP; j < n - GAP; j++) {
        if (!tail.has(order[j].id)) { [order[i], order[j]] = [order[j], order[i]]; break; }
      }
    }
    return order;
  }

  /* Tason biisit vakaassa lähtöjärjestyksessä, ettei songs.json:in
   * rivijärjestys vaikuta. Välimuistissa, koska sekä pakkojen rakentaminen
   * että törmäysten korjaus tarvitsevat tätä toistuvasti. */
  const tierLists = new Map();
  function tierList(tier) {
    if (!tierLists.has(tier)) {
      tierLists.set(tier, state.pool.filter((s) => s.tier === tier).sort((a, b) => a.id - b.id));
    }
    return tierLists.get(tier);
  }

  // "Juice Leskinen & Grand Slam" ja "Juice Leskinen" ovat sama artisti.
  const artistKey = (song) => normalize(String(song.artist).split(/\s*[,&]\s*|\s+ja\s+/)[0]);

  /* Pakka, josta saman päivän artistitörmäykset on korjattu.
   *
   * Korjaus on VAIHTO pakan sisällä, ei siirtymä eteenpäin. Siirtymä olisi
   * ilmeisempi, mutta se jakaisi väistetyn biisin kahdesti – kerran nyt ja
   * kerran omalla vuorollaan – ja yhden askeleen väistö toisi saman biisin
   * kahtena peräkkäisenä päivänä. Mitattuna lyhin väli toistoon romahti
   * kahdeksasta päivästä yhteen. Vaihdossa syrjäytetty biisi siirtyy sen
   * toisen vuorolle, joten jokainen jaetaan yhä täsmälleen kerran
   * kierroksessa.
   *
   * Tasoilla on kiinteä arvojärjestys: taso 1 ei koskaan väisty, taso 2
   * väistää tasoa 1, taso 3 tasoja 1-2 ja niin edelleen. Riippuvuus kulkee
   * siis aina alaspäin eikä kierrä kehää. */
  const deckCache = new Map();

  function deck(tier, cycle) {
    const avain = tier + ":" + cycle;
    const valmis = deckCache.get(avain);
    if (valmis) return valmis;
    const order = tierOrder(tierList(tier), tier, cycle).slice();
    deckCache.set(avain, order);
    if (tier === TIER_CYCLE[0]) return order;   // ylin taso ei väisty
    const n = order.length;
    /* Vaihtopari haetaan pakan ympäri kiertäen, ei vain eteenpäin: pakan
     * viimeisellä paikalla eteenpäin ei ole mistä vaihtaa, ja mittauksessa
     * juuri sinne jäi yksi törmäys 800 päivästä. Taaksepäin vaihtaminen voi
     * tuoda törmäyksen aiemmalle paikalle, joten kierroksia ajetaan kunnes
     * mikään ei enää muutu – käytännössä yksi tai kaksi riittää. */
    for (let kierros = 0; kierros < 3; kierros++) {
      let muutoksia = 0;
      for (let pos = 0; pos < n; pos++) {
        const day = cycle * n + pos;
        const varatut = new Set();
        for (const alempi of TIER_CYCLE) {
          if (alempi === tier) break;
          const song = dealt(alempi, day);
          if (song) varatut.add(artistKey(song));
        }
        if (!varatut.has(artistKey(order[pos]))) continue;
        for (let askel = 1; askel < n; askel++) {
          const j = (pos + askel) % n;
          if (varatut.has(artistKey(order[j]))) continue;
          [order[pos], order[j]] = [order[j], order[pos]];
          muutoksia++;
          break;
        }
      }
      if (!muutoksia) break;
    }
    return order;
  }

  function dealt(tier, day) {
    const n = tierList(tier).length;
    if (!n) return null;
    return deck(tier, Math.floor(day / n))[((day % n) + n) % n];
  }

  function dailySongs(key) {
    const day = dayIndex(key);
    const picked = [];
    for (const tier of TIER_CYCLE) {
      const song = dealt(tier, day);
      if (song) picked.push(song);
    }
    // Jos jokin taso olisi tyhjä, täytetään viisikko muilta tasoilta.
    const ids = new Set(picked.map((s) => s.id));
    const rnd = mulberry32(hashString("hittispotti:fill:" + key));
    while (picked.length < DAILY_COUNT) {
      const pool = state.pool.filter((s) => !ids.has(s.id));
      if (!pool.length) break;
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

  /* Soittimen kuvake piirretään muodoilla, ei merkeillä: ▶ ja ■ ovat
   * fontin armoilla eivätkä istu keskelle, ja latauksesta saa kunnon
   * kehän pisteiden sijaan. */
  function setPlayIcon(kind) {
    el.playIcon.className = "play-icon is-" + kind;
    /* Paljastuksessa iso soitin on piilossa, joten Kuuntele-nappi on ainoa
     * äänen hallinta. Sen tekstin pitää kertoa mitä painallus tekee. */
    if (el.replayBtn) el.replayBtn.textContent = kind === "stop" ? "Pysäytä" : "Kuuntele";
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
    setPlayIcon("play");
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
    setPlayIcon("load");

    const ready = () => {
      el.playBtn.disabled = false;
      audio.playing = true;
      el.playBtn.classList.add("is-playing");
      setPlayIcon("stop");
    };
    const failed = (err) => {
      console.error(err);
      el.playBtn.disabled = false;
      setPlayIcon("play");
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
    /* Avain otetaan kerran tässä ja kulkee state.dayKey:ssä loppuun asti.
     * Jos se luettaisiin kellosta uudestaan tallennettaessa, 23.58 aloitettu
     * ja 00.03 päättynyt peli kirjautuisi huomisen päivälle tämän päivän
     * biiseillä. */
    const key = todayKey();
    const done = store.get("daily:" + key, null);
    state.mode = "daily";
    state.dayKey = key;
    if (done) {
      state.results = done.results.map((r) => ({ ...r, song: state.byId.get(String(r.id)) }));
      state.score = done.score;
      renderResults();
      show("results");
      return;
    }
    state.at = 0;
    const jatkuu = restoreDailyProgress(key);
    if (!jatkuu) track("paiva-aloitettu");
    state.rounds = jatkuu || dailySongs(key).map(newRound);
    state.results = [];
    state.score = state.rounds.reduce((sum, r) => sum + r.points, 0);
    // Poikkeustapaus: kaikki palautetut kierrokset ovat valmiita, mutta
    // lopputulos jäi kirjaamatta (selain kaatui juuri viimeisen jälkeen).
    if (state.rounds.every((r) => r.finished)) { collectResults(); saveDaily(); renderResults(); show("results"); return; }
    show("game");
    openRound();
    state.rounds.forEach((r) => prefetch(r.song));
  }

  /* Kesken jäänyt päivän sarja tallennetaan joka toiminnon jälkeen ja
   * palautetaan kun päivä avataan uudestaan. Ilman tätä puhelimen selain,
   * joka pudottaa taustalle jääneen välilehden muistista, aloitti sarjan
   * alusta – ja pelaaja oli jo nähnyt osan vastauksista. Biisit palautetaan
   * tallennetuista tunnisteista eikä arvonnasta uudestaan, koska katalogin
   * päivitys voi vaihtaa päivän biisit; pelaajalle kuuluvat ne jotka hän
   * aloitti. */
  const progressKey = (key) => `daily:${key}:kesken`;

  function persistDaily() {
    if (state.mode !== "daily" || !state.dayKey) return;
    store.set(progressKey(state.dayKey), {
      at: state.at,
      rounds: state.rounds.map((r) => ({
        id: r.song.id, step: r.step, guesses: r.guesses,
        finished: r.finished, solved: r.solved, points: r.points,
      })),
    });
  }

  function restoreDailyProgress(key) {
    const saved = store.get(progressKey(key), null);
    if (!saved || !Array.isArray(saved.rounds) || saved.rounds.length !== DAILY_COUNT) return null;
    const rounds = [];
    for (const s of saved.rounds) {
      const song = state.byId.get(String(s.id));
      if (!song) return null;   // biisi poistunut katalogista: aloitetaan puhtaalta
      rounds.push({ ...newRound(song), step: s.step, guesses: s.guesses || [],
                    finished: !!s.finished, solved: !!s.solved, points: s.points || 0 });
    }
    state.at = Number.isInteger(saved.at) ? saved.at : 0;
    return rounds;
  }

  /* Vapaa peli on satunnainen viiden biisin sarja, yksi jokaiselta tasolta:
   * sama rakenne kuin päivän pelissä, mutta sarjoja voi pelata niin monta
   * kuin haluaa. Sarja päättyy tuloksiin ja seuraava alkaa puhtaalta
   * pöydältä, joten pisteet eivät kasaannu loputtomiin. */
  function startFree() {
    // state.used säilyy sivun latauksen yli, joten peräkkäisissä sarjoissa ei
    // tule samoja biisejä uudestaan.
    state.mode = "free";
    state.results = [];
    state.score = 0;
    state.rounds = TIER_CYCLE.map((t) => newRound(pickFreeSong(t)));
    state.at = 0;
    show("game");
    openRound();
    state.rounds.forEach((r) => prefetch(r.song));
  }

  function pickFreeSong(tier) {
    let pool = state.pool.filter((s) => s.tier === tier && !state.used.has(s.id));
    if (!pool.length) {
      // Taso käyty läpi: aloitetaan se alusta muita tasoja nollaamatta.
      state.pool.forEach((s) => { if (s.tier === tier) state.used.delete(s.id); });
      pool = state.pool.filter((s) => s.tier === tier);
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
      el.views.game.classList.remove("is-revealed");
    }
    renderRound();
  }

  function renderRound() {
    const r = cur();
    // Sama sanamuoto kuin tulosnäkymässä, ettei sama asia ole kahta tyyliä.
    el.modeLabel.textContent = state.mode === "daily"
      ? `Päivän biisit, ${dateLine(keyToDate(state.dayKey || todayKey()))}`
      : "Vapaa peli";
    el.scoreLabel.textContent = `${fmt(state.score)} p`;
    // Koko sivun elävä väri on soivan biisin vaikeustaso.
    el.body.dataset.tier = String(r.song.tier);
    renderTierBar();
    const sec = STEPS[r.finished ? STEPS.length - 1 : r.step];
    el.clipLen.innerHTML = `${fmtSec(sec).replace(" s", "")}<span class="unit">s</span>`;
    el.stake.innerHTML = r.finished ? "" : `<b>${fmt(POINTS[r.step])}</b> pistettä pelissä`;
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

  /* Tasorivi on biisien välinen navigointi kummassakin pelimuodossa: viisikko
   * pysyy paikallaan ja kesken jääneeseen biisiin voi palata myöhemmin. */
  function renderTierBar() {
    el.tierBar.innerHTML = state.rounds.map((r, i) => {
      const name = TIER_NAMES[r.song.tier];
      let cls = "";
      let state_ = "kesken";
      if (i === state.at) {
        cls = " is-on";
      } else if (r.finished) {
        cls = r.solved ? " is-ok" : " is-miss";
        state_ = r.solved ? "ratkaistu" : "ei ratkaistu";
      } else if (r.step > 0) {
        cls = " is-part";   // aloitettu mutta kesken: tänne kannattaa palata
        state_ = `kesken, ${fmtSec(STEPS[r.step])}`;
      } else {
        state_ = "aloittamatta";
      }
      return `<button type="button" class="tchip${cls}" data-slot="${i}" data-tier="${r.song.tier}"
        aria-pressed="${i === state.at}" aria-label="${name}, ${state_}"
        >${name}</button>`;
    }).join("");
  }

  /* Yksi nappi riittää: ohitus ja väärä arvaus vievät kierrosta yhtä paljon
   * eteenpäin, joten nappi tekee aina sen mitä kentän sisältö tarkoittaa. */
  /* Soittimen "seuraava raita" -kuvake: ohitus on juuri sitä, joten merkki
   * sanoo saman kuin sana. Piirretty, koska ⏭-merkin ulkoasu ja korkeus
   * vaihtelevat laitteittain. */
  const SKIP_ICON = '<svg class="btn-icon" viewBox="0 0 16 16" aria-hidden="true">'
    + '<path d="M2.6 3.1a.7.7 0 0 1 1.09-.58l6.1 4.32a.8.8 0 0 1 0 1.31l-6.1 4.32A.7.7 0 0 1 2.6 12.9z"/>'
    + '<rect x="11.5" y="2.5" width="2.1" height="11" rx="1.05"/></svg>';

  /* Nappi kertoo teon ja sen hinnan: arvaus näyttää mitä on voitettavana,
   * ohitus sen mihin pätkä pitenee. Luovutuksella ei ole hintaa
   * kerrottavana, joten se on pelkkä sana. */
  function renderAction() {
    const r = cur();
    const ready = !!(state.selected || exactMatch(el.input.value));
    const last = r.step >= STEPS.length - 1;
    const label = ready ? "Arvaa" : last ? "Luovuta" : "Ohita";
    const note = ready ? `+${fmt(POINTS[r.step])} p` : last ? "" : fmtSec(STEPS[r.step + 1]);
    const skip = !ready && !last;
    el.actionBtn.innerHTML = `<span class="btn-label">${label}</span>`
      + (note ? `<span class="btn-note${skip ? " has-icon" : ""}">${skip ? SKIP_ICON : ""}${note}</span>` : "");
    // Kaksi erillistä elementtiä luetaan yhteen ilman väliä, joten nimi erikseen.
    el.actionBtn.setAttribute("aria-label", note ? `${label}, ${note}` : label);
    el.actionBtn.classList.toggle("btn-accent", ready);
    el.actionBtn.classList.toggle("is-give", !ready && last);
  }

  function logGuess(type, label) {
    const li = document.createElement("li");
    li.className = type;
    li.innerHTML = `<span class="mark">${type === "wrong" ? "✕" : "→"}</span><span>${escapeHtml(label)}</span>`;
    el.log.appendChild(li);
  }

  function addGuess(type, label, id) {
    cur().guesses.push({ type, label, id });
    logGuess(type, label);
  }

  /* Onko tämä biisi jo arvattu tällä kierroksella. Väärä arvaus ei kannata
   * toistaa: se veisi askeleen eteenpäin antamatta mitään uutta. */
  const alreadyGuessed = (song) => !!song && cur().guesses.some((g) => g.id === song.id);

  function advanceStep() {
    const r = cur();
    if (r.finished) return;
    if (r.step >= STEPS.length - 1) { finishRound(false); return; }
    r.step += 1;
    persistDaily();
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
    else { addGuess("wrong", guess.label, guess.id); advanceStep(); }
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
    /* Soitin ja mittari väistyvät paljastuksen tieltä, ks. style.css. */
    el.views.game.classList.add("is-revealed");
    el.reveal.classList.toggle("is-correct", r.solved);
    el.reveal.classList.toggle("is-wrong", !r.solved);
    el.revealArt.hidden = !song.art;
    el.revealArt.src = song.art || "";
    el.revealArt.alt = song.art ? `${song.title} – kansikuva` : "";
    el.revealVerdict.textContent = r.solved
      ? `Oikein · ${secWord(STEPS[r.step])}`
      : "Ei osunut";
    el.revealTitle.textContent = song.title;
    el.revealArtist.textContent = `${song.artist} · ${song.year}`;
    // Sama trackId kuin esikuuntelussa; Apple ohjaa sen kappaleen sivulle.
    el.revealApple.href = `https://music.apple.com/fi/song/${song.id}`;
    el.revealApple.setAttribute("aria-label", `Kuuntele ${song.artist} – ${song.title} Apple Musicissa`);
    el.revealPoints.textContent = r.solved ? `+${fmt(r.points)} pistettä` : "0 pistettä";
    renderRate(song);
    // Viimeisen biisin jälkeen nappi vie tuloksiin kummassakin pelimuodossa.
    el.nextBtn.textContent = state.rounds.some((x) => !x.finished) ? "Seuraava" : "Tulokset";
  }

  function finishRound(solved) {
    stopPlayback();
    const r = cur();
    r.finished = true;
    r.solved = solved;
    r.points = solved ? POINTS[r.step] : 0;
    state.score += r.points;
    logRound(r);
    renderRound();
    showReveal(r);
    /* Biisi lähtee soimaan samalla kun vastaus ilmestyy: pelaaja haluaa
     * kuulla mikä se oli, eikä sitä varten pitäisi tarvita erillistä
     * painallusta. Soitetaan pisin pätkä, jotta biisin tunnistaa.
     *
     * Tämä on tarkoituksella finishRoundissa eikä showRevealissa: showReveal
     * ajetaan myös kun sivu avataan valmiiseen kierrokseen tai kun tasoriviltä
     * palataan jo pelattuun biisiin, eikä ääni saa käynnistyä silloin itsestään.
     * Kierroksen päättyminen taas seuraa aina napin painalluksesta, joten myös
     * iOS sallii äänen. */
    playClip(STEPS[STEPS.length - 1]);
    el.nextBtn.focus({ preventScroll: true });
    if (state.rounds.every((x) => x.finished)) {
      collectResults();
      if (state.mode === "daily") saveDaily();
      else saveFree();
    } else {
      persistDaily();
    }
  }

  function collectResults() {
    state.results = state.rounds.map((x) => ({
      id: x.song.id, song: x.song, step: x.step, points: x.points, solved: x.solved,
    }));
  }

  function nextRound() {
    // Siirry seuraavaan kesken olevaan biisiin, tarvittaessa alusta kiertäen.
    for (let k = 1; k <= state.rounds.length; k++) {
      const i = (state.at + k) % state.rounds.length;
      if (!state.rounds[i].finished) { state.at = i; persistDaily(); openRound(); return; }
    }
    renderResults();
    show("results");
  }


  // ---------- Ehdotukset ----------
  function exactMatch(text) {
    const key = normalize(text);
    if (!key) return null;
    const hit = state.songs.find((s) => s.key === key || normalize(s.label) === key) || null;
    return alreadyGuessed(hit) ? null : hit;
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
      const used = alreadyGuessed(s);
      const li = document.createElement("li");
      li.className = "suggestion" + (used ? " is-used" : "")
        + (i === state.activeSuggestion && !used ? " is-active" : "");
      li.setAttribute("role", "option");
      li.setAttribute("aria-disabled", String(used));
      li.innerHTML = `<span class="s-title">${escapeHtml(s.title)}</span>`
        + `<span class="s-artist">${escapeHtml(s.artist)}</span>`
        + (used ? '<span class="s-used">arvattu</span>' : "");
      // Kuuntelija myös estetylle riville: napautus, joka ei tee yhtään mitään,
      // näyttää rikkinäiseltä. preventDefault pitää kentän kohdistettuna,
      // jolloin lista ei sulkeudu alta.
      li.addEventListener("mousedown", (e) => {
        e.preventDefault();
        if (used) toast(`${s.title} on jo arvattu tällä biisillä.`);
        else chooseSuggestion(s);
      });
      el.suggestions.appendChild(li);
    });
    el.suggestions.hidden = false;
    el.input.setAttribute("aria-expanded", "true");
    placeSuggestions();
  }

  /* Ehdotuslistan paikka ja korkeus näkyvän alueen mukaan.
   *
   * Puhelimessa näppäimistö peittää alaosan, eikä sivu tiedä siitä mitään:
   * mitattuna 440 px:n näkyvässä alueessa kentän alle jäi 136 px ja listasta
   * näkyi kaksi riviä kahdeksasta. Kentän yläpuolella oli 254 px tyhjää.
   * Siksi lista käännetään ylös kun sinne mahtuu enemmän, ja korkeus
   * rajataan siihen mitä oikeasti on käytettävissä.
   *
   * visualViewport kertoo näppäimistön viemän tilan; ilman sitä (vanhat
   * selaimet, työpöytä) käytetään ikkunan korkeutta, jolloin lista pysyy
   * alhaalla niin kuin ennenkin. */
  function placeSuggestions() {
    if (el.suggestions.hidden) return;
    const vv = window.visualViewport;
    const nakyvaYla = vv ? vv.offsetTop : 0;
    const alaraja = nakyvaYla + (vv ? vv.height : window.innerHeight);
    /* Yläpalkki on sticky ja piirtyy listan päälle, joten sen alareuna on
     * todellinen yläraja. Ilman tätä ylöspäin auennut lista jäi osittain
     * palkin alle ja ylin ehdotus näkyi puolikkaana. */
    const palkki = el.bar ? el.bar.getBoundingClientRect().bottom : 0;
    const ylaraja = Math.max(nakyvaYla, palkki);
    const r = el.input.getBoundingClientRect();
    const MARGIN = 8, VAHIN = 120, ENINTAAN = 360;
    const alla = alaraja - r.bottom - MARGIN;
    const ylla = r.top - ylaraja - MARGIN;
    // Sääntö on tarkoituksella yksinkertainen: lista aukeaa sinne missä on
    // enemmän tilaa. Kynnysarvo "alle 120 px alapuolella" ei riittänyt, koska
    // näppäimistön kanssa alle jäi 128 px eli juuri ja juuri yli rajan, ja
    // lista pysyi alhaalla kaksi riviä korkeana.
    const ylos = ylla > alla;
    el.suggestions.classList.toggle("is-up", ylos);
    const tila = Math.floor(ylos ? ylla : alla);
    el.suggestions.style.maxHeight = Math.max(VAHIN, Math.min(tila, ENINTAAN)) + "px";
  }

  function closeSuggestions() {
    el.suggestions.hidden = true;
    el.suggestions.classList.remove("is-up");
    el.suggestions.style.maxHeight = "";
    el.input.setAttribute("aria-expanded", "false");
    state.activeSuggestion = -1;
    state.suggestions = [];
  }

  function chooseSuggestion(song) {
    if (alreadyGuessed(song)) return;
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
    // Jo arvatut ohitetaan, jottei niihin voi päätyä näppäimistölläkään.
    const move = (dir) => {
      for (let k = 1; k <= n; k++) {
        const i = ((state.activeSuggestion + dir * k) % n + n) % n;
        if (!alreadyGuessed(state.suggestions[i])) return i;
      }
      return -1;
    };
    if (e.key === "ArrowDown") {
      e.preventDefault();
      state.activeSuggestion = n ? move(1) : -1;
      renderSuggestions();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      state.activeSuggestion = n ? move(-1) : -1;
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

  /* Sama tieto sivulla piirrettynä. Emojiruudut kuuluvat jaettavaan
   * tekstiin, mutta muun typografian seassa ne näyttävät liimatuilta. */
  const squaresHtml = (r) => STEPS.map((_, i) => {
    const cls = i < r.step ? "miss" : i === r.step ? (r.solved ? "hit" : "miss") : "none";
    return `<i class="sq is-${cls}"></i>`;
  }).join("");

  function shareText() {
    const lines = [];
    if (state.mode === "daily") {
      lines.push(`🎵 HittiSpotti · ${todayPretty()}`);
      lines.push(`${fmt(state.score)} / ${fmt(POINTS[0] * DAILY_COUNT)} pistettä`);
    } else {
      lines.push("🎵 HittiSpotti · vapaa sarja");
      lines.push(`${fmt(state.score)} / ${fmt(POINTS[0] * state.results.length)} pistettä`);
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
    el.resultsTitle.textContent = daily
      ? `Päivän biisit, ${dateLine(keyToDate(state.dayKey || todayKey()))}`
      : "Vapaa peli";
    el.resultsScore.textContent = fmt(state.score);
    const yhteenveto = resultSummary(solved, daily ? DAILY_COUNT : state.results.length);
    el.resultsSub.textContent = daily ? `${yhteenveto} Uusi sarja huomenna.` : yhteenveto;
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
          <div class="r-squares" aria-hidden="true">${squaresHtml(r)}</div>
        </div>
        <div class="r-points${r.solved ? "" : " zero"}">${r.solved ? "+" + fmt(r.points) : "0"}</div>`;
      el.resultsList.appendChild(li);
    });
    el.sharePreview.hidden = true;
    el.againBtn.textContent = daily ? "Vapaa peli" : "Uusi sarja";
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
      toast("Tulos kopioitu leikepöydälle.");
    } catch {
      toast("Kopioi teksti alta.");
    }
  }

  /* ---------- Kerätty aineisto ----------
   * Kaksi eri asiaa, joista jälkimmäinen on arvokkaampi:
   *   arviot   – pelaajan oma arvio siitä miltä biisi tuntui (vapaaehtoinen)
   *   kierrokset – millä askeleella biisi tunnistettiin, vai luovutettiinko
   * Askel on käyttäytymistä eikä mielipidettä, ja se kertyy joka kierroksesta
   * ilman että pelaajalta kysytään mitään. Kaikki jää tähän selaimeen: sivu
   * on staattinen eikä lähetä mitään minnekään.
   */
  const LOG_MAX = 3000;

  function logRound(r) {
    const log = store.get("kierrokset", []);
    log.push({
      id: r.song.id,
      taso: r.song.tier,
      askel: r.step,          // 0-4, eli 0,1 s ... 15 s
      osui: r.solved,
      pv: (state.mode === "daily" && state.dayKey) || todayKey(),
      tila: state.mode,
    });
    store.set("kierrokset", log.slice(-LOG_MAX));
  }

  function saveRating(id, tier) {
    const all = store.get("arviot", {});
    all[id] = tier;
    store.set("arviot", all);
  }

  /* Arviorivi näyttää samalta kuin pelin tasorivi, mutta ei paljasta biisin
   * nykyistä tasoa: valmiiksi valittu vaihtoehto ohjaisi vastausta. */
  function renderRate(song) {
    const given = store.get("arviot", {})[song.id];
    el.rateQ.textContent = given ? `Arviosi: ${TIER_NAMES[given]}` : "Miltä tämä tuntui?";
    el.rateRow.innerHTML = TIER_CYCLE.map((t) => `<button type="button"
      class="tchip${given === t ? " is-on" : ""}" data-rate="${t}" data-tier="${t}"
      aria-pressed="${given === t}">${TIER_NAMES[t]}</button>`).join("");
  }

  // ---------- Tallennus & tilastot ----------
  function defaultStats() {
    return {
      dailyPlayed: 0, dailyTotal: 0, dailyBest: 0, dailySolved: 0, streak: 0, bestStreak: 0, lastDaily: null,
      freeGames: 0, freeRounds: 0, freeSolved: 0, freeTotal: 0, freeBestRun: 0,
    };
  }

  function saveDaily() {
    // Sen päivän avain, jonka sarja pelattiin – ei kellon päivä. Keskiyön yli
    // pelattu sarja kuuluu sille päivälle jolta biisit ovat.
    const key = state.dayKey || todayKey();
    const already = !!store.get("daily:" + key, null);
    store.remove(progressKey(key));
    store.set("daily:" + key, {
      score: state.score,
      results: state.results.map((r) => ({ id: r.id, step: r.step, points: r.points, solved: r.solved })),
    });
    if (already) return;   // sama päivä kirjataan tilastoihin vain kerran
    track("paiva-valmis");
    const stats = { ...defaultStats(), ...store.get("stats", {}) };
    stats.dailyPlayed += 1;
    stats.dailyTotal += state.score;
    stats.dailyBest = Math.max(stats.dailyBest, state.score);
    stats.dailySolved += state.results.filter((r) => r.solved).length;
    // Edellinen päivä lasketaan sarjan omasta päivästä, ei kellosta.
    const y = keyToDate(key); y.setDate(y.getDate() - 1);
    stats.streak = stats.lastDaily === dayKey(y) ? stats.streak + 1 : 1;
    stats.bestStreak = Math.max(stats.bestStreak, stats.streak);
    stats.lastDaily = key;
    store.set("stats", stats);
  }

  function saveFree() {
    const stats = { ...defaultStats(), ...store.get("stats", {}) };
    stats.freeGames += 1;
    stats.freeRounds += state.results.length;
    stats.freeSolved += state.results.filter((r) => r.solved).length;
    stats.freeTotal += state.score;
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
      // Kaikki muut selitteet ovat kahden sanan mittaisia; tämä oli kolme
      // riviä pitkä ja venytti ruudukon rivin muita korkeammaksi.
      [streak, todayDone ? "päivän putki" : "putki, ei vielä tänään"],
      [s.bestStreak, "pisin putki"],
      ["head", "Vapaa peli"],
      [s.freeGames, "pelattua sarjaa"],
      [s.freeGames ? fmt(s.freeTotal / s.freeGames) : "–", "keskipisteet"],
      [fmt(s.freeBestRun), "paras sarja"],
      [s.freeRounds ? Math.round((s.freeSolved / s.freeRounds) * 100) + " %" : "–", "tunnistettu"],
    ];
    el.statGrid.innerHTML = tiles.map(([v, l]) => (v === "head"
      ? `<p class="stat-head">${l}</p>`
      : `<div class="stat"><div class="stat-value">${v}</div><div class="stat-label">${l}</div></div>`)).join("");
  }

  /* Vienti kokoaa biisikohtaisen yhteenvedon: oma arvio ja se, millä
   * askeleella biisi keskimäärin tunnistettiin. Raakaloki olisi tarpeettoman
   * iso liitettäväksi, ja tasojen säätöön riittää tiivistelmä. */
  function exportData() {
    const arviot = store.get("arviot", {});
    const log = store.get("kierrokset", []);
    const per = new Map();
    for (const k of log) {
      const e = per.get(k.id) || { n: 0, osui: 0, askeleet: 0 };
      e.n += 1;
      if (k.osui) e.osui += 1;
      e.askeleet += k.askel;
      per.set(k.id, e);
    }
    const ids = new Set([...per.keys(), ...Object.keys(arviot).map(Number)]);
    const biisit = [...ids].map((id) => {
      const song = state.byId.get(String(id));
      const e = per.get(id);
      const rec = { id, nimi: song ? song.label : "?", nykyinen: song ? song.tier : null };
      if (arviot[id]) rec.arvio = arviot[id];
      if (e) {
        rec.kierroksia = e.n;
        rec.osui = e.osui;
        rec.keskiaskel = Math.round((e.askeleet / e.n) * 10) / 10;
      }
      return rec;
    }).sort((x, y) => (y.kierroksia || 0) - (x.kierroksia || 0));

    if (!biisit.length) { toast("Ei vielä kerättyä dataa."); return; }
    el.exportOut.textContent = JSON.stringify({
      versio: 1, kierroksia: log.length, arvioita: Object.keys(arviot).length, biisit,
    }, null, 1);
    el.exportOut.hidden = false;
    navigator.clipboard?.writeText(el.exportOut.textContent)
      .then(() => toast("Kopioitu leikepöydälle."))
      .catch(() => toast("Kopioi teksti alta."));
  }

  /* Nollaus koskee tilastoja ja menneiden päivien tuloksia – ei enempää.
   *
   * Aiemmin tämä pyyhki kaikki avaimet, myös kierroslokin ja omat
   * vaikeusarviot. Ne ovat juuri se aineisto, jota varten "Vie pelidata" on
   * olemassa, eikä varmistusteksti maininnut niitä lainkaan: nappi hävitti
   * hiljaa kerätyn datan ja lupasi tehdä jotain vaatimattomampaa.
   *
   * Myös tämän päivän tulos jää. Se ei estä uudelleenpelaamista – yksityinen
   * ikkuna tai toinen selain ajaa saman asian, eikä sitä voi selaimessa
   * pyörivässä pelissä estää – mutta poistaa vahingossa tapahtuvan reitin ja
   * tekee napista sen mitä sen nimi lupaa. */
  function resetStats() {
    if (!confirm("Nollataanko tilastot ja aiempien päivien tulokset? Omat arviot ja kerätty pelidata säilyvät.")) return;
    const tanaan = "daily:" + todayKey();
    for (const key of store.keys()) {
      const menneetTulokset = key.startsWith("daily:") && key !== tanaan && !key.endsWith(":kesken");
      if (key === "stats" || menneetTulokset) store.remove(key);
    }
    renderStats();
    refreshDrawer();
    toast("Tilastot nollattu.");
  }

  // ---------- Navigointi ----------
  function go(target) {
    // Vapaan pelin nollaus: uusi sarja kesken pelin. Varmistetaan vain, jos
    // jotain oikeasti menetetään.
    if (target === "refree") {
      if (freeStarted() && !confirm("Sarja alkaa alusta ja pisteet nollautuvat. Jatketaanko?")) return;
      closeDrawer();
      stopPlayback();
      startFree();
      toast("Uusi sarja.");
      return;
    }
    if ((target === "daily" || target === "free") && atRisk()
      && !confirm("Kesken oleva sarja menetetään. Vaihdetaanko?")) return;
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
    el.replayBtn.addEventListener("click", () => {
      if (audio.playing) { stopPlayback(); return; }
      playClip(STEPS[STEPS.length - 1]);
    });
    el.rateRow.addEventListener("click", (e) => {
      const chip = e.target.closest("[data-rate]");
      if (!chip || cur() === undefined) return;
      saveRating(cur().song.id, Number(chip.dataset.rate));
      renderRate(cur().song);
    });
    el.retryBtn.addEventListener("click", loadAndStart);
    // Näppäimistön avautuminen ja sulkeutuminen muuttaa näkyvää aluetta.
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", placeSuggestions);
      window.visualViewport.addEventListener("scroll", placeSuggestions);
    }
    window.addEventListener("resize", placeSuggestions);
    el.exportBtn.addEventListener("click", exportData);
    el.nextBtn.addEventListener("click", nextRound);
    el.tierBar.addEventListener("click", (e) => {
      const chip = e.target.closest("button.tchip");
      if (!chip) return;
      // Molemmissa pelimuodoissa rivi vaihtaa vain näkymää: biisit ja niiden
      // kesken jäänyt edistyminen säilyvät paikoillaan.
      state.at = Number(chip.dataset.slot);
      persistDaily();
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
  /* Kesken jäänyt sarja on tarpeeton heti kun sen päivä on vaihtunut: sitä ei
   * enää pääse pelaamaan, koska päivän peli avaa aina kuluvan päivän sarjan.
   * Siivotaan, ettei localStorageen jää päivä päivältä kasvavaa jäämää. */
  function pruneProgress() {
    const tag = ":kesken";
    const today = progressKey(todayKey());
    store.keys()
      .filter((k) => k.startsWith("daily:") && k.endsWith(tag) && k !== today)
      .forEach((k) => store.remove(k));
  }

  /* Virheteksti pelaajan kielellä. Selaimen oma viesti ("Failed to fetch")
   * on englantia eikä kerro mitä tehdä, joten se jää konsoliin. */
  function loadErrorText(err) {
    if (location.protocol === "file:") {
      return "Selain ei salli songs.json-tiedoston lukemista suoraan levyltä. "
           + "Käynnistä paikallinen palvelin, esimerkiksi python3 -m http.server, ja avaa http://localhost:8000.";
    }
    if (!navigator.onLine) return "Ei verkkoyhteyttä. Biisit haetaan uudestaan kun yhteys palaa.";
    const status = /\((\d{3})\)/.exec(String(err && err.message));
    if (status) return `Biisilistaa ei saatu palvelimelta (virhe ${status[1]}). Yritä hetken päästä uudelleen.`;
    return "Biisien lataus ei onnistunut. Tarkista verkkoyhteys ja yritä uudelleen.";
  }

  async function loadAndStart() {
    el.loadingRetry.hidden = true;
    el.loadingText.textContent = "Ladataan biisejä…";
    try {
      await loadCatalog();
      refreshDrawer();
      startDaily();          // sivu avautuu suoraan päivän peliin
    } catch (err) {
      console.error(err);
      el.loadingText.textContent = loadErrorText(err);
      // Levyltä avattua sivua ei korjaa uudelleenyritys vaan palvelin.
      el.loadingRetry.hidden = location.protocol === "file:";
      show("loading");
    }
  }

  async function init() {
    migrateStore();
    pruneProgress();
    bind();
    await loadAndStart();
  }

  init();

  /* Service worker tekee sivusta nopean ja offline-kelpoisen. Rekisteröinti
   * viimeisenä ja hiljaa: jos selain ei tue sitä tai sivu on avattu levyltä,
   * peli toimii silti tismalleen samoin. */
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => { /* ei pakollinen */ });
    });
  }
})();
