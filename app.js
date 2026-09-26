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

  /* Vapaan pelin vuosikymmenet.
   *
   * 50- ja 60-luku eivät ole omia kausiaan. Sarja ottaa yhden biisin joka
   * vaikeustasolta, eikä sitä voi koota vajaasta vuosikymmenestä: 50-luvulla
   * on nolla biisiä tasoilla 1 ja 2, ja koko vuosikymmenessä seitsemän
   * biisiä. Ne kulkevat siksi 70- ja 80-luvun mukana, jolloin ohuinkin taso
   * saa 36 biisiä.
   *
   * Tyvi on nimi ilman "-luku"-päätettä. Sitä tarvitaan kun valintoja on
   * monta: "1990-, 2000- ja 2010-luku" on suomea, "1990-luku, 2000-luku ja
   * 2010-luku" on luettelo. */
  const KAUDET = [
    { avain: "vanha", tyvi: "1950–80", alku: 1950, loppu: 1989 },
    { avain: "1990", tyvi: "1990", alku: 1990, loppu: 1999 },
    { avain: "2000", tyvi: "2000", alku: 2000, loppu: 2009 },
    { avain: "2010", tyvi: "2010", alku: 2010, loppu: 2019 },
    { avain: "2020", tyvi: "2020", alku: 2020, loppu: 2099 },
  ];
  KAUDET.forEach((k) => { k.nimi = k.tyvi + "-luku"; });

  /* Valitut kaudet aikajärjestyksessä, tai tyhjä lista kun rajausta ei ole.
   *
   * Täysi valinta palautetaan tyhjänä tahallaan: viisi valittua on sama
   * biisijoukko kuin ei yhtään, ja jos ne olisivat eri asioita, peli
   * näyttäisi otsikkona "1950–80-, 1990-, 2000-, 2010- ja 2020-luku"
   * silloin kun tarkoitus on "kaikki". Näin viimeisen napin painaminen
   * palaa siististi lähtötilaan. */
  function valitutKaudet() {
    if (!state.kaudet.length || state.kaudet.length === KAUDET.length) return [];
    return KAUDET.filter((k) => state.kaudet.includes(k.avain));
  }

  /* Rajauksen nimi otsikoihin, tuloksiin ja jakotekstiin. Tyhjä merkkijono
   * kun rajausta ei ole: kutsuja päättää itse sanooko se silloin "Vapaa
   * peli" vai "vapaa sarja".
   *
   * Neljä viidestä sanotaan poissulkevasti. Se on lyhyempi kuin luettelo,
   * ja ennen kaikkea se on se mitä pelaaja teki: hän jätti yhden pois. */
  function kausiNimi() {
    const valitut = valitutKaudet();
    if (!valitut.length) return "";
    if (valitut.length === 1) return valitut[0].nimi;
    const poissa = KAUDET.filter((k) => !valitut.includes(k));
    if (poissa.length === 1) return `Ei ${poissa[0].tyvi}-lukua`;
    const tyvet = valitut.map((k) => k.tyvi);
    return `${tyvet.slice(0, -1).map((t) => `${t}-`).join(", ")} ja ${tyvet[tyvet.length - 1]}-luku`;
  }

  /* Napin painallus kääntää yhden kauden päälle tai pois JA kokoaa sarjan
   * uudestaan. Valinta on siis aina elävä: ensimmäinen painallus aloittaa
   * sen vuosikymmenen sarjan, toinen lisää vuosikymmenen ja kokoaa sarjan
   * uusiksi molemmilla.
   *
   * Tämä on sama käytös kuin ennen monivalintaa, ja se on tahallista.
   * Välissä kokeiltiin mallia jossa napit vain valitsevat ja sarjan aloittaa
   * erillinen rivi, mutta silloin painallus ei tehnyt mitään näkyvää ja
   * aloitus piti osata etsiä. Elävässä valinnassa ei ole mitään opittavaa:
   * painat nappia ja peli vaihtuu.
   *
   * Valikko jätetään auki. Se on koko monivalinnan ehto: jos painallus
   * sulkisi valikon niin kuin ennen, toista vuosikymmentä ei pääsisi
   * painamaan avaamatta valikkoa uudestaan. */
  function vaihdaKausi(avain) {
    /* Varmistus vain ensimmäisestä painalluksesta. Sen jälkeen uusi sarja on
     * jo tulossa eikä menetettäviä pisteitä enää ole, joten saman kysymyksen
     * toistaminen joka napille olisi pelkkä este monivalinnan tiellä. */
    if (!pakkaAjastin && freeStarted()
      && !confirm("Sarja alkaa alusta ja pisteet nollautuvat. Jatketaanko?")) return;
    const i = state.kaudet.indexOf(avain);
    if (i === -1) state.kaudet.push(avain);
    else state.kaudet.splice(i, 1);
    // Järjestys aikajärjestykseen, ei painallusjärjestykseen.
    state.kaudet = KAUDET.filter((k) => state.kaudet.includes(k.avain)).map((k) => k.avain);
    /* Valinta säilyy käyntien yli. Juuri sitä palaute pyysi: se joka ei
     * halua vanhoja biisejä ei halua niitä myöskään huomenna, eikä valintaa
     * pidä joutua tekemään uudestaan joka kerta. */
    store.set("kaudet", state.kaudet);
    refreshDrawer();
    kokoaSarjaPian();
  }

  /* Sarja kootaan vasta kun napit ovat hetken hiljaa.
   *
   * Ilman viivettä neljän vuosikymmenen valitseminen kokoaisi neljä sarjaa,
   * ja koska jokainen sarja esilataa viiden biisin ääninäytteet (prefetch),
   * se olisi 20 latausta joista 15 heitetään heti pois. Viive on niin lyhyt
   * ettei sitä huomaa yhdellä painalluksella, mutta se sulattaa nopean
   * naputtelun yhdeksi kokoamiseksi. */
  const PAKKA_VIIVE = 350;
  let pakkaAjastin = 0;

  function kokoaSarjaPian() {
    clearTimeout(pakkaAjastin);
    pakkaAjastin = setTimeout(async () => {
      pakkaAjastin = 0;
      stopPlayback();
      await startFree();
      /* Valikko on auki ja siellä vaihtui rivejä: pelimuodon korostus ja
       * "Aloita peli alusta", joka kuuluu vain vapaaseen peliin. */
      refreshDrawer();
    }, PAKKA_VIIVE);
  }

  /* Kesken oleva kokoaminen perutaan kun pelaaja menee muualle. Muuten
   * valikosta valittu Tilastot tai Päivän biisit vaihtuisi kolmannessa
   * sekunnissa vapaaksi peliksi. */
  function peruSarjanKokoaminen() {
    clearTimeout(pakkaAjastin);
    pakkaAjastin = 0;
  }

  /* Tallennettu valinta käyttöön käynnistyksessä.
   *
   * Tuntemattomat avaimet suodatetaan pois eikä niistä valiteta: jos kausien
   * jako joskus muuttuu, vanha valinta ei saa estää pelin käynnistymistä
   * eikä jäädä vaikuttamaan näkymättömänä. Sama koskee mitä tahansa muuta
   * roskaa jonka joku on voinut kirjoittaa avaimen alle käsin. */
  function lataaKaudet() {
    const tallessa = store.get("kaudet", []);
    if (!Array.isArray(tallessa)) return;
    state.kaudet = KAUDET.filter((k) => tallessa.includes(k.avain)).map((k) => k.avain);
  }
  const STORE = "hittispotti:";
  const STORE_OLD = "songspot-suomi:";         // aiempi nimi, tiedot siirretään kerran
  const RING = 2 * Math.PI * 54;               // soittopainikkeen kehän pituus (r = 54)
  /* Katalogilla on oma versionumeronsa, jota nostetaan vain kun biisilista
   * muuttuu. Näin selain ja service worker saavat pitää katalogin
   * välimuistissa tyylimuutosten yli, mutta uusi katalogi on eri osoite ja
   * tulee varmasti perille – vanha versio antaisi pelaajalle eri päivän
   * biisit kuin muille. */
  const KATALOGI_K = 36;

  /* Katalogi on kahdessa osassa, ks. scripts/tee_aanet.py.
   *
   * katalogi.json on kevyt: artisti, nimi, vuosi, taso ja tunniste. Siitä
   * rakentuvat ehdotuslista ja päivän arvonta, eli kaikki mitä sivun
   * avaaminen vaatii. 206 kt.
   *
   * Esikuunteluosoitteet ja kansikuvat ovat kansiossa aanet/, jaettuna
   * paloihin tunnisteen perusteella. Ne olivat ennen samassa tiedostossa ja
   * veivät siitä 77 %, vaikka niistä tarvitaan kerrallaan viisi biisiä.
   * Yhtenä erillisenä tiedostona ne olisivat 450 kt eikä mitään olisi
   * säästetty, vain siirretty myöhemmäksi; paloina viiden biisin sarja
   * hakee enintään viisi noin 7 kt:n tiedostoa.
   *
   * Palojen määrän on oltava sama kuin scripts/tee_aanet.py:n PALOJA. */
  const KATALOGI = `katalogi.json?k=${KATALOGI_K}`;
  const AANI_PALOJA = 64;
  const aaniOsoite = (n) => `aanet/${String(n).padStart(2, "0")}.json?k=${KATALOGI_K}`;

  /* Tuoteversio, eri asia kuin osoitteiden ?v=-numero.
   *
   * ?v= on välimuistin murtaja: sen ainoa tehtävä on olla merkkijono jota ei
   * ole ennen käytetty, ja se kasvaa jokaisesta julkaisusta. Juuri siksi se
   * on myös ainoa numero jolla vian voi toistaa, ja se kulkee palautteen
   * mukana.
   *
   * Tämä taas on se numero jonka pelaaja näkee ja osaa sanoa ääneen. Se
   * vaihtuu harvoin ja vain päätöksestä. Palauteviestissä ne ovat molemmat,
   * muodossa "versio 1.0 (100)": pelaaja tunnistaa alun, ja suluista näkee
   * täsmälleen mikä rakenne hänellä oli. */
  const TUOTEVERSIO = "1.0";

  /* Mitä uutta -tiedote.
   *
   * null tarkoittaa ettei tiedotetta ole, eikä silloin näytetä mitään.
   * Tämä on tahallaan käsin kirjoitettava eikä automaattinen: jos ilmoitus
   * ilmestyisi joka julkaisussa, sen lukeminen loppuisi ensimmäisen parin
   * jälkeen ja jäljelle jäisi pelkkä este pelaajan ja soittonapin välissä.
   * Kirjoitetaan siis vain silloin kun pelaajalle on oikeasti asiaa.
   *
   * id on avain jolla nähdyksi merkitseminen tehdään. Vaihda se aina kun
   * kirjoitat uuden tiedotteen, muuten vanhan nähneet eivät näe uutta.
   *
   * Tärkein kohta on ensimmäisenä. Tiedote silmäillään ylhäältä alas ja
   * suljetaan, eikä viimeistä riviä lue kaikki. Ensimmäisenä on siksi se
   * jota ei löydä itse: vuosikymmenten monivalinta, koska napit näyttävät
   * ulospäin täsmälleen samalta kuin ennenkin. Biisimäärän huomaa
   * pelaamalla, vaikeustasot huomaa pelaamalla, tämän ei.
   *
   * Jokainen kohta alkaa lihavoinnilla ja jatkuu tarkennuksella, jotta listan
   * voi silmäillä lihavoinnit lukemalla. Lihavointi ei silti saa määrätä
   * lauseen rakennetta: ensimmäisestä kohdasta tuli kerran "Monta
   * vuosikymmentä kerralla vapaassa pelissä, tai yksi kokonaan pois", joka
   * alkoi lihavoinnilla mutta ei kertonut kenellekään mitään. Lause ensin,
   * lihavointi sen alkuun.
   *
   * 50-80-luku on nimeltä eikä "yhden vuosikymmenen", koska se on se jota
   * oikeasti pyydettiin, ja esimerkki opettaa ominaisuuden kerralla. */
  const UUTTA = {
    /* Tunnus vaihdettu b-kirjaimella, vaikka sisältö on sama.
     *
     * Ensimmäisessä julkaisussa tiedote merkittiin nähdyksi näytettäessä, ja
     * service workerin vaihtuminen latasi sivun sekuntia myöhemmin. Jokainen
     * sinä aikana käynyt on siis merkitty nähneeksi lukematta yhtään riviä.
     * Vanhalla tunnuksella he eivät näkisi tätä enää koskaan.
     *
     * Vaihto näyttää tiedotteen toistamiseen niille harvoille jotka ehtivät
     * sen oikeasti lukea, eli niille joilla ei ollut service workeria
     * lainkaan. Se on pienempi haitta kuin se että ominaisuus jää kertomatta
     * niille joilta se vietiin alta. */
    /* c-kierros: b poltti tiedotteen jokaiselta jonka tallennustila oli
     * sillä hetkellä tyhjä, koska tyhjää pidettiin uutena pelaajana.
     * Heidät tavoittaa vain uudella tunnuksella. */
    /* Luvut korjattu v114:n jälkeen ilman tunnuksen vaihtoa. Ne jotka
     * ovat jo lukeneet tiedotteen eivät näe sitä uudestaan, ja he näkivät
     * hieman vanhentuneet luvut kerran; se on pienempi haitta kuin
     * kolmas pakotettu näyttö kaikille. Ne jotka eivät ole vielä
     * nähneet saavat oikeat luvut. */
    id: "2026-09-19c",
    /* Tiedote lakkaa näkymästä kokonaan tästä päivästä alkaen, eikä sitä
     * voi enää tulla kenellekään. Tämä julkaisu on maanantaina vanha uutinen:
     * uudet biisit ovat silloin jo päivän pelissä, ja lukitus on ohi.
     *
     * Vanheneminen on päivämäärä eikä käsin poistaminen, koska käsin
     * poistaminen vaatii muistamista ja uuden julkaisun juuri oikeana
     * päivänä. Päivä hoitaa sen itsestään myös siinä tapauksessa etten ole
     * paikalla. Vertailu on tekstivertailu, koska YYYY-MM-DD järjestyy
     * oikein sellaisenaan, ja se käyttää pelin omaa vuorokausirajaa
     * (todayKey) eikä selaimen paikallista, jotta se vaihtuu samaan aikaan
     * kuin päivän biisitkin. */
    loppuu: "2026-09-21",
    kohdat: [
      "<b>Valitse useampi vuosikymmen kerralla</b> vapaassa pelissä, tai jätä vaikka 50-80-luku pois",
      "<b>198 uutta biisiä</b>, nyt yhteensä 1 744",
      "<b>163 biisin</b> vaikeustaso korjattu pelidatan perusteella",
    ],
  };

  // ---------- Tila ----------
  const state = {
    songs: [],           // kaikki – näistä haetaan ja arvataan
    pool: [],            // näistä peli jakaa biisit
    byId: new Map(),
    /* Päivän artisti -pelin artistit. Oma listansa eikä katalogista
     * johdettu: artistipeli on eri peli eikä sen joukko liity siihen
     * mitä biisejä arvauspelissä sattuu olemaan. Ladataan vasta kun
     * peliin mennään, jottei biisipelin avaus hidastu. */
    artistit: [],
    mode: "daily",        // "daily" | "free"
    /* Vapaan pelin vuosikymmenrajaus: lista KAUDET-avaimia. Tyhjä lista
     * tarkoittaa koko katalogia, ja niin tarkoittaa myös täysi lista, koska
     * ne ovat sama joukko biisejä.
     *
     * Ei oma pelimuotonsa vaan suodatin, koska kaikki muu toimii samoin.
     * Monivalinta siksi, että pelaaja halusi jättää yhden vuosikymmenen pois
     * eikä valita yhtä: "ei oo mitää hajua noist 50 luvun biiseeist ni ois
     * iha kiva jos vois pelata ilman niitä". Yksi kerrallaan -valinnalla sitä
     * ei voinut ilmaista, koska neljän jäljelle jäävän valitseminen vaatii
     * neljä valintaa yhtä aikaa. */
    kaudet: [],
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
    gain: null,        // pätkän häivytys, ajastetaan uusiksi jos aikaa pidennetään
    master: null,      // pysyvä äänenvoimakkuus, elää kontekstin mukana
    revive: false,     // sivu kävi taustalla: konteksti rakennetaan uusiksi
    startedAt: 0,      // ctx.currentTime pätkän alkaessa
    total: 0,          // pätkän ajastettu pituus sekunteina
    raf: 0,
    playing: false,
  };

  // ---------- DOM ----------
  const $ = (s) => document.querySelector(s);
  const el = {
    body: document.body,
    aPvm: $("#a-pvm"),
    aRivit: $("#a-rivit"),
    aArvaus: $("#a-arvaus"),
    aInput: $("#a-input"),
    aEhdotukset: $("#a-ehdotukset"),
    aJaljella: $("#a-jaljella"),
    aLoppu: $("#a-loppu"),
    aPaljastusSheet: $("#a-paljastus-sheet"),
    aPaljastusScrim: $("#a-paljastus-scrim"),
    aPaljastusClose: $("#a-paljastus-close"),
    aPaljastusOk: $("#a-paljastus-ok"),
    aPaljastusKuva: $("#a-paljastus-kuva"),
    aPaljastusOtsikko: $("#a-paljastus-otsikko"),
    aPaljastusNimi: $("#a-paljastus-nimi"),
    aPaljastusRivi: $("#a-paljastus-rivi"),
    aPaljastusTeksti: $("#a-paljastus-teksti"),
    atKuva: $("#at-kuva"),
    atRivi: $("#at-rivi"),
    aLoppuOtsikko: $("#a-loppu-otsikko"),
    aLoppuTeksti: $("#a-loppu-teksti"),
    aTulokset: $("#a-tulokset"),
    aOhje: $("#a-ohje"),
    aOhjeSheet: $("#a-ohje-sheet"),
    aOhjeScrim: $("#a-ohje-scrim"),
    aOhjeClose: $("#a-ohje-close"),
    aOhjeValiPeli: $("#a-ohje-vali-peli"),
    aOhjeValiSarakkeet: $("#a-ohje-vali-sarakkeet"),
    aOhjePeli: $("#a-ohje-peli"),
    aOhjeSarakkeet: $("#a-ohje-sarakkeet"),
    aOhjeOk: $("#a-ohje-ok"),
    atOtsikko: $("#at-otsikko"),
    atTeksti: $("#at-teksti"),
    atPelatut: $("#at-pelatut"),
    atVoitto: $("#at-voitto"),
    atPutki: $("#at-putki"),
    atPisin: $("#at-pisin"),
    atVertailu: $("#at-vertailu"),
    atJakauma: $("#at-jakauma"),
    atKorttiYla: $("#at-kortti-ylä"),
    atKorttiRivit: $("#at-kortti-rivit"),
    atJaa: $("#at-jaa"),
    views: {
      game: $("#view-game"),
      results: $("#view-results"),
      artisti: $("#view-artisti"),
      artistitulos: $("#view-artisti-tulos"),
      stats: $("#view-stats"),
      help: $("#view-help"),
      loading: $("#view-loading"),
    },
    scrim: $("#scrim"),
    drawer: $("#drawer"),
    menuBtn: $("#menu-btn"),
    // Oikea kisko ja se mistä sen sisältö on lainassa, ks. siirraKiskoon.
    rail: $("#rail"),
    railBody: $("#rail-body"),
    railPoints: $("#rail-points"),
    aani: $("#aani"),
    aaniArvo: $("#aani-arvo"),
    dsNumbers: $("#ds-numbers"),
    dsWeekBlock: $("#ds-week-block"),
    dsWeek: $("#ds-week"),
    stage: $(".stage"),
    drawerClose: $("#drawer-close"),
    drawerFoot: $("#drawer-foot"),
    drawerStats: $("#drawer-stats"),
    dsStreak: $("#ds-streak"),
    dsStreakLabel: $("#ds-streak-label"),
    dsPlayed: $("#ds-played"),
    dsBest: $("#ds-best"),
    dsHit: $("#ds-hit"),
    dsLongest: $("#ds-longest"),
    navDailyNote: $("#nav-daily-note"),
    navFreeNote: $("#nav-free-note"),
    freeReset: $("#free-reset"),
    bar: document.querySelector(".bar"),
    barTag: $("#bar-tag"),
    loadingText: $("#loading-text"),
    loadingRetry: $("#loading-retry"),
    retryBtn: $("#retry-btn"),
    feedbackLink: $("#feedback-link"),
    suggestLink: $("#suggest-link"),
    resultsVertailu: $("#results-vertailu"),
    installBtn: $("#install-btn"),
    installSheet: $("#install-sheet"),
    installScrim: $("#install-scrim"),
    installClose: $("#install-close"),
    mainosEiViela: $("#mainos-ei-viela"),
    mainosPeli: $("#mainos-peli"),
    mainosPeliTila: $("#mainos-peli-tila"),
    mainosTulos: $("#mainos-tulos"),
    mainosTulosTila: $("#mainos-tulos-tila"),
    uuttaSheet: $("#uutta-sheet"),
    uuttaScrim: $("#uutta-scrim"),
    uuttaClose: $("#uutta-close"),
    uuttaLista: $("#uutta-lista"),
    uuttaOk: $("#uutta-ok"),
    installIntro: $("#install-intro"),
    installSteps: $("#install-steps"),
    modeLabel: $("#mode-label"),
    modeSub: $("#mode-sub"),
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
    dataConsent: $("#data-consent"),
    replayBtn: $("#replay-btn"),
    nextBtn: $("#next-btn"),
    resultsTitle: $("#results-title"),
    resultsScore: $("#results-score"),
    resultsSub: $("#results-sub"),
    resultsList: $("#results-list"),
    shareBtn: $("#share-btn"),
    sharePreview: $("#share-preview"),
    shareSheet: $("#share-sheet"),
    shareScrim: $("#share-scrim"),
    shareClose: $("#share-close"),
    shareImg: $("#share-img"),
    shareNote: $("#share-note"),
    shareNative: $("#share-native"),
    shareCopyImg: $("#share-copy-img"),
    shareCopyLink: $("#share-copy-link"),
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

  /* Artistin entiset ja nykyiset nimet samaan hakuavaimeen.
   *
   * Katalogissa biisi on sillä nimellä jolla se julkaistiin, mikä on
   * oikein: "Bandana" on Abreun eikä Anna Abreun. Pelaaja ei kuitenkaan
   * tiedä kumpaa nimeä käyttää, ja haku vaatii että jokainen kirjoitettu
   * sana löytyy riviltä. Siksi haku "Anna Abreu" antoi viisi biisiä
   * kymmenestä ja "Robin Packalen" yhdeksän kolmestatoista.
   *
   * Tämä koskee VAIN hakua. Näytettävä nimi, päivän pakka ja
   * artistitörmäysten esto käyttävät katalogin omaa nimeä kuten ennenkin.
   * Mitattuna 800 päivältä pakka ei muutu tästä lainkaan. */
  const HAKUALIAKSET = {
    "abreu": "Anna Abreu",
    "anna abreu": "Abreu",
    "robin": "Robin Packalen",
    "robin packalen": "Robin",
  };

  function hakuAliakset(artist) {
    const lisa = HAKUALIAKSET[normalize(artist)];
    return lisa ? " " + lisa : "";
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

  /* Tallennusavaimet peleittäin.
   *
   * Päivän biisin avaimet ovat jo pelaajien selaimissa, joten niitä EI saa
   * muuttaa: pelkkä etuliitteen lisäys nollaisi jokaisen putken ja
   * tilaston. Siksi biisipeli kirjoittaa yhä samoihin avaimiin kuin ennen
   * ja artistipeli saa oman etuliitteensä.
   *
   * Tämä taulu on yksi paikka jossa avaimet ovat näkyvissä. Ilman sitä
   * toinen peli kirjoittaisi samaan "daily:<pvm>"-avaimeen ja pelit
   * ylikirjoittaisivat toistensa tulokset. Myös tilastojen nollaus ja
   * keskeneräisten siivous käyvät molemmat pelit läpi tämän kautta,
   * joten uuden pelin lisääminen ei jätä niitä jälkeen. */
  const PELIT = ["biisi", "artisti"];
  const AVAIN = {
    biisi: {
      etuliite: "",
      tulos: (pvm) => `daily:${pvm}`,
      kesken: (pvm) => `daily:${pvm}:kesken`,
      vertailu: (pvm) => `paivavertailu:${pvm}`,
      stats: "stats",
    },
    artisti: {
      etuliite: "artisti:",
      tulos: (pvm) => `artisti:daily:${pvm}`,
      kesken: (pvm) => `artisti:daily:${pvm}:kesken`,
      vertailu: (pvm) => `artisti:paivavertailu:${pvm}`,
      stats: "artisti:stats",
    },
  };

  /* Kuuluuko avain tälle pelille. Biisipelillä ei ole etuliitettä, joten
   * sille kelpaa kaikki mikä EI ala jonkin toisen pelin etuliitteellä. */
  function omaAvain(peli, key) {
    const etuliite = AVAIN[peli].etuliite;
    if (etuliite) return key.startsWith(etuliite);
    return PELIT.every((p) => p === peli || !key.startsWith(AVAIN[p].etuliite));
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
    // Jakoruutu kuuluu tuloksiin. Muualle siirryttäessä se jäisi leijumaan.
    // Sama koskee asennusohjetta, joka avautuu valikosta: ilman tätä se jäisi
    // ruudulle ja body pysyisi lukossa, kun valikosta siirtyy näkymään.
    if (el.body.classList.contains("sheet-open")) {
      el.shareSheet.hidden = true;
      el.shareScrim.hidden = true;
      el.installSheet.hidden = true;
      el.installScrim.hidden = true;
      el.uuttaSheet.hidden = true;
      el.uuttaScrim.hidden = true;
      el.aOhjeSheet.hidden = true;
      el.aOhjeScrim.hidden = true;
      el.aPaljastusSheet.hidden = true;
      el.aPaljastusScrim.hidden = true;
      el.body.classList.remove("sheet-open");
    }
    /* Ääni kuuluu vain peliin. openRound pysäyttää soiton kierrosten välillä
     * ja go() valikosta siirryttäessä, mutta viimeisen biisin jälkeen
     * Tulokset-nappi vie tuloksiin kolmatta reittiä, eikä pätkä pysähtynyt:
     * se jäi soimaan tulosnäkymään. Pysäytys näkymän vaihdossa kattaa kaikki
     * reitit kerralla. */
    if (name !== "game") stopPlayback();
    /* Mainospaikat seuraavat näkymää. Pelin paikka kuuluu vain
     * paljastukseen, joten se piilotetaan aina kun pelistä poistutaan; jos
     * paljastus on yhä auki, showReveal näyttää sen uudestaan palatessa. */
    if (name !== "game") piilotaMainos("peli");
    if (name === "results") naytaMainos("tulos");
    else piilotaMainos("tulos");
    for (const [k, v] of Object.entries(el.views)) v.hidden = k !== name;
    // Elävä väri kuuluu soivalle biisille. Muualla sivu palaa perusväriin,
    // jotta sovelluksella on myös oma pysyvä sävynsä.
    if (name !== "game") delete el.body.dataset.tier;
    window.scrollTo({ top: 0 });
    if (name === "stats") renderStats();
    updateBar();
  }

  function updateBar() {
    el.body.dataset.mode = state.mode;
    /* Kiinteä sivupalkki on näkyvissä koko ajan, joten sen sisältö on
     * pidettävä ajan tasalla ilman avaamista. Kapealla ruudulla riittää
     * päivitys avattaessa, koska suljettua ei näe kukaan. */
    if (LEVEA.matches && state.pool.length) refreshDrawer();
    paivitaKisko();
    if (state.view !== "game" || !state.rounds.length) { el.barTag.textContent = ""; return; }
    const valmis = state.rounds.filter((r) => r.finished).length;
    /* Yläpalkki pysyy paikallaan kun sivu vierii, joten se on ainoa kohta
     * josta pelimuodon näkee koko ajan. Vapaa peli merkitään nimeltä, päivän
     * biisit ei: se on oletus, ja saman sanan toistaminen otsikon vieressä
     * näyttäisi vahingolta. Poikkeus on se joka pitää huomata. */
    if (state.mode === "free") {
      /* Kausi on se joka pitää muistaa kesken sarjan: se kertoo miksi biisit
       * ovat sitä mitä ovat. Ilman rajausta nimi on "Vapaa peli".
       *
       * Nimi ja edistyminen ovat omissa elementeissään, koska monivalinta voi
       * tuottaa pitkän nimen. Nimi saa katketa, edistyminen ei: jos palkkiin
       * mahtuu vain toinen, "3/5" on se jota katsotaan kesken sarjan. */
      el.barTag.innerHTML = `<b>${kausiNimi() || "Vapaa peli"}</b>`
        + `<span>· ${valmis}/${state.rounds.length}</span>`;
    } else {
      el.barTag.textContent = `${valmis}/${state.rounds.length} valmis`;
    }
  }

  /* ---------- Sivupalkki ----------
   *
   * Kaksi eri asiaa saman elementin takana. Kapealla ruudulla valikko on
   * napin takana ja liukuu sisällön päälle. Leveällä se on kiinteä osa
   * sivua siinä tilassa joka oli muutenkin tyhjää: aina auki, eikä sitä
   * voi sulkea. Kun mitään ei ole peitetty, sulkeminen ei tekisi muuta
   * kuin veisi valikon pois.
   *
   * Raja on CSS:ssä, ja tämä kysyy siltä samaa rajaa eikä arvaa omaansa. */
  const LEVEA = window.matchMedia("(min-width: 1200px)");

  function paivitaPalkki() {
    if (LEVEA.matches) {
      // Kapean ruudun avaustila ei saa jäädä päälle, jos ikkunaa levennetään.
      el.body.classList.remove("drawer-open");
      if (state.pool.length) refreshDrawer();
    }
    el.menuBtn.setAttribute("aria-expanded", String(el.body.classList.contains("drawer-open")));
    paivitaKisko();
  }

  /* Oikea kisko.
   *
   * Vasemmalla on navigointi ja oma tilanne pitkällä aikavälillä, oikealla
   * käynnissä oleva sarja. Kisko ei ole uusi kopio mistään: tasorivi ja
   * vapaan pelin "Uusi sarja" siirretään sinne samoina elementteinä kuin
   * kapealla ruudulla, jolloin kuuntelijat, tila ja ruudunlukijan käsitys
   * pysyvät yhtenä eikä kahtena.
   *
   * Kisko näkyy vain pelinäkymässä. Tuloksissa ja tilastoissa sarjaa ei ole
   * käynnissä, ja tyhjä kisko olisi pelkkä reunaviiva. */
  function paivitaKisko() {
    const kiskoon = LEVEA.matches && state.view === "game" && state.rounds.length > 0;
    el.rail.hidden = !kiskoon;
    if (kiskoon) {
      if (el.tierBar.parentElement !== el.railBody) el.railBody.append(el.tierBar);
      if (el.freeReset.parentElement !== el.railBody) el.railBody.append(el.freeReset);
    } else {
      // Takaisin omille paikoilleen: tasorivi soittimen yläpuolelle,
      // "Uusi sarja" vapaan pelin alle valikkoon.
      if (el.tierBar.parentElement !== el.stage.parentElement) {
        el.stage.parentElement.insertBefore(el.tierBar, el.stage);
      }
      const vapaa = el.drawer.querySelector('[data-go="free"]');
      if (el.freeReset.parentElement !== vapaa.parentElement) vapaa.after(el.freeReset);
    }
    if (kiskoon) piirraPisteet();
  }

  /* Pisteasteikko kiskon alalaidassa.
   *
   * Soittimen alla oleva mittari kertoo missä kohtaa ollaan, mutta ei sitä
   * mitä seuraava askel maksaa. Ohittamisen hinta pitää olla nähtävissä
   * ennen ohittamista eikä vasta jälkikäteen, joten koko asteikko on
   * näkyvissä ja nykyinen askel korostettu. */
  function piirraPisteet() {
    const askel = cur() ? cur().step : 0;
    const paljastettu = cur() ? cur().finished : false;
    el.railPoints.innerHTML = STEPS.map((sec, i) => {
      const nyt = !paljastettu && i === askel;
      return `<li class="${nyt ? "is-now" : i < askel ? "is-past" : ""}">
        <span>${fmtSec(sec)}</span><b>${fmt(POINTS[i])}</b></li>`;
    }).join("");
  }

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

  /* Onko kesken olevaan sarjaan koskettu: yksikin biisi, jota on ehditty
   * ohittaa tai arvata. Koskematon sarja saa vaihtua ilman kyselyä. */
  const sarjaAloitettu = () => state.view === "game" && state.rounds.some((r) => r.finished || r.step > 0);
  /* Vain vapaa sarja voi oikeasti kadota. Päivän sarja tallennetaan joka
   * toiminnon jälkeen ja palautuu sellaisenaan (persistDaily), joten siitä
   * poistuminen ei hävitä mitään. */
  const freeStarted = () => state.mode === "free" && sarjaAloitettu();

  function refreshDrawer() {
    /* Tila voi muuttua kesken istunnon: Chrome tarjoaa asennuksen vasta
     * hetken päästä, ja asennuksen jälkeen rivi saa kadota ilman uudelleen
     * latausta. Valikon avaus on luonteva hetki tarkistaa se. */
    paivitaAsennusnappi();
    const done = store.get(AVAIN.biisi.tulos(todayKey()), null);
    el.navDailyNote.textContent = done
      ? `pelattu tänään, ${fmt(done.score)} p`
      : `viisi biisiä, ${dateLine(new Date())}`;
    /* Kaksi riviä: ensimmäinen kertoo pelistä, toinen tunnistaa version.
       Versio omalle rivilleen, jottei se katoa lauseen jatkoksi silloin kun
       sitä nimenomaan etsitään. */
    el.drawerFoot.innerHTML =
      `${state.pool.length} arvattavaa biisiä · tulokset tallentuvat vain tähän selaimeen`
      + `<span class="drawer-versio">HittiSpotti ${TUOTEVERSIO}</span>`;
    /* "Aloita peli alusta" koskee vain vapaata peliä, joten se näkyy vasta
       siellä. Rivillä ei ole enää selitettä: teksti kertoo jo mitä nappi
       tekee, ja menetettävät pisteet lukevat varmistuksessa jonka se avaa. */
    const rajaus = kausiNimi();
    el.freeReset.hidden = !(state.mode === "free" && state.view === "game");
    /* "Vapaa peli" on valittuna aina kun vapaa sarja on käynnissä, myös
       rajattuna. Aiemmin rajaus vei korostuksen kausinapille, koska nappi
       oli itsessään pelin aloitus. Nyt napit ovat suodatin ja rivi on
       aloitus, joten ne kertovat kahta eri asiaa eivätkä kilpaile. */
    document.querySelectorAll("[data-go]").forEach((b) => {
      const isMode = b.dataset.go === "daily" || b.dataset.go === "free";
      if (isMode) {
        b.classList.toggle("is-active",
          state.view === "game" && state.mode === b.dataset.go);
      }
    });
    /* Napit näyttävät valinnan aina, eivät vain kesken vapaan sarjan: se on
       säilyvä asetus eikä käynnissä olevan sarjan ominaisuus. Muuten
       eilen tehty rajaus olisi voimassa mutta näkyisi valikossa
       valitsemattomana. */
    document.querySelectorAll("[data-kausi]").forEach((b) => {
      const paalla = state.kaudet.includes(b.dataset.kausi);
      b.classList.toggle("is-on", paalla);
      // Väri on ainoa muu merkki valinnasta, joten se ei riitä yksin.
      b.setAttribute("aria-pressed", String(paalla));
    });
    /* Alateksti on ainoa paikka joka kertoo ennen aloitusta mitä napeista
       seuraa. Ilman sitä valinta näkyisi vasta pelin otsikossa, eli vasta
       kun sarja on jo alkanut ja edellinen menetetty. */
    el.navFreeNote.textContent = rajaus
      ? `viisi satunnaista biisiä · ${rajaus.toLowerCase()}`
      : "viisi satunnaista biisiä";
    refreshDrawerStats();
  }

  /* Oma tilanne valikossa. Sama putken laskenta kuin tilastonäkymässä: putki
   * on voimassa vain jos viimeisin päivä on tänään tai eilen, muuten se on
   * katkennut. Lohko piilotetaan kunnes ensimmäinen päivä on pelattu, jottei
   * uudelle pelaajalle näytetä pelkkiä nollia. */
  function refreshDrawerStats() {
    const s = { ...defaultStats(), ...store.get(AVAIN.biisi.stats, {}) };
    /* Kaksi lohkoa, kaksi eri lähdettä, siis kaksi eri ehtoa. Luvut tulevat
     * kootuista tilastoista, viikko suoraan päivien omista tuloksista.
     *
     * Aiemmin molemmat riippuivat samasta luvusta, ja se oli väärin:
     * tilastojen nollaus poistaa "stats"-avaimen mutta jättää kuluvan päivän
     * tuloksen paikalleen. Silloin valikossa luki "pelattu tänään, 1 500 p"
     * mutta koko lohko oli piilossa, eli sivupalkin alalaita oli tyhjä
     * vaikka näytettävää oli. */
    const viikko = keraaViikko();
    const onPaivia = viikko.some((d) => d.osui !== null);
    el.dsNumbers.hidden = !s.dailyPlayed;
    el.dsWeekBlock.hidden = !onPaivia;
    el.drawerStats.hidden = !s.dailyPlayed && !onPaivia;
    if (el.drawerStats.hidden) return;
    piirraViikko(viikko);
    if (!s.dailyPlayed) return;
    const eilen = new Date(); eilen.setDate(eilen.getDate() - 1);
    const tanaan = s.lastDaily === todayKey();
    const putki = (tanaan || s.lastDaily === dayKey(eilen)) ? s.streak : 0;
    el.dsStreak.textContent = putki;
    el.dsStreakLabel.textContent = putki === 0 ? "putki katkesi"
      : tanaan ? "päivän putki"
      : "putki, et vielä tänään";
    el.dsPlayed.textContent = fmt(s.dailyPlayed);
    el.dsBest.textContent = fmt(s.dailyBest);
    el.dsHit.textContent = Math.round((s.dailySolved / (s.dailyPlayed * DAILY_COUNT)) * 100) + " %";
    el.dsLongest.textContent = fmt(s.bestStreak);
  }

  /* Viimeiset seitsemän päivää.
   *
   * Putkiluku kertoo että päiviä on peräkkäin muttei sitä miten ne menivät.
   * Tiedot ovat jo selaimessa: joka päivä tallentaa oman tuloksensa. Tämä ei
   * siis kerää mitään uutta vaan näyttää sen mitä on. */
  function keraaViikko() {
    const paivat = [];
    for (let i = 6; i >= 0; i--) {
      const pv = new Date();
      pv.setDate(pv.getDate() - i);
      const avain = dayKey(pv);
      const tulos = store.get(AVAIN.biisi.tulos(avain), null);
      paivat.push({
        avain,
        tanaan: i === 0,
        nimi: ["su", "ma", "ti", "ke", "to", "pe", "la"][pv.getDay()],
        osui: tulos ? tulos.results.filter((r) => r.solved).length : null,
        pisteet: tulos ? tulos.score : null,
      });
    }
    return paivat;
  }

  /* Pylvään korkeus on sinä päivänä tunnistetut biisit, väri tason asteikolta
   * samassa suunnassa kuin muualla: viisi oikein vihreä, nolla punainen.
   * Pelaamaton päivä on hiusviiva eikä nollan korkuinen pylväs, koska ne ovat
   * eri asioita ja näyttäisivät muuten samalta. */
  function piirraViikko(paivat) {
    el.dsWeek.innerHTML = paivat.map((d) => {
      const otsikko = d.osui === null
        ? `${d.avain}: ei pelattu`
        : `${d.avain}: ${d.osui}/${DAILY_COUNT} tunnistettu, ${fmt(d.pisteet)} p`;
      const korkeus = d.osui === null ? 0 : 8 + (d.osui / DAILY_COUNT) * 32;
      const taso = Math.max(1, Math.min(5, 5 - d.osui));
      return `<li class="${d.osui === null ? "on-tyhja" : ""}${d.tanaan ? " on-tanaan" : ""}"
        title="${otsikko}"><span style="height:${korkeus}px"
        ${d.osui === null ? "" : `data-tier="${taso}"`}></span><b>${d.nimi}</b></li>`;
    }).join("");
  }

  // ---------- Katalogi ----------
  async function loadCatalog() {
    const res = await fetch(KATALOGI);
    if (!res.ok) throw new Error("katalogi.json ei latautunut (" + res.status + ")");
    const all = await res.json();
    /* Ennen tässä suodatettiin esikuunteluosoitteen perusteella. Kevyessä
     * katalogissa ei ole sitä kenttää: rakennusskripti jättää esikuuntelua
     * vailla olevan biisin pois kokonaan, joten suodatus on tehty jo
     * julkaisussa ja tähän jää vain se mitä ehdotuslista tarvitsee. */
    state.songs = all.filter((s) => s.id && s.artist && s.title);
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
      s.key = normalize(s.artist + " " + s.title + hakuAliakset(s.artist));
      s.keyTitle = normalize(s.title);
      s.keyArtist = normalize(s.artist);
      /* Sama teksti ilman normalisointia, pelkkä pieni kirjainkoko.
       * normalize poistaa välimerkit, joten "+", "/" ja "-" katoavat
       * hausta kokonaan: haku "40+" antoi biisin "40K" eikä biisiä "40+",
       * ja pelkkä "+" ei antanut mitään. Raaka muoto säilyttää ne. */
      s.keyRaaka = `${s.artist} ${s.title}`.toLowerCase();
      state.byId.set(String(s.id), s);
    });
    if (state.pool.length < DAILY_COUNT) throw new Error("Katalogissa on liian vähän biisejä.");
  }

  /* Äänipalat: esikuunteluosoitteet ja kansikuvat, haettuna vasta kun tiedämme
   * mitkä biisit ovat vuorossa.
   *
   * Pala haetaan kerran istuntoa kohti ja luvat pidetään muistissa, jotta
   * kaksi samanaikaista pyyntöä samaan palaan eivät tee kahta hakua. Koko
   * palan sisältö sulautetaan biisiolioihin, ei vain pyydetyt: se on jo
   * ladattu, ja seuraava sarja voi osua samaan palaan.
   *
   * Epäonnistuminen ei kaada peliä. Ilman esikuunteluosoitetta fetchBuffer
   * hakee sen Applelta tunnisteella (refreshPreviewUrl), ja kansikuvan puute
   * vain jättää kuvan pois paljastuksesta. Siksi tämä ei koskaan heitä. */
  const aaniPalat = new Map();

  function haePala(n) {
    if (!aaniPalat.has(n)) {
      aaniPalat.set(n, fetch(aaniOsoite(n))
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error("aanet " + r.status))))
        .catch((err) => {
          console.warn("äänipala " + n, err);
          aaniPalat.delete(n);   // yritetään uudestaan seuraavalla sarjalla
          return null;
        }));
    }
    return aaniPalat.get(n);
  }

  async function varmistaAanet(songs) {
    const puuttuu = (songs || []).filter((s) => s && s.id && !s.preview);
    if (!puuttuu.length) return;
    const numerot = [...new Set(puuttuu.map((s) => s.id % AANI_PALOJA))];
    const data = await Promise.all(numerot.map(haePala));
    for (const pala of data) {
      if (!pala) continue;
      for (const [id, arvo] of Object.entries(pala)) {
        const song = state.byId.get(id);
        if (!song || !Array.isArray(arvo)) continue;
        /* Vain puuttuvan päälle. Sama pala sulautetaan uudestaan aina kun
         * siitä pyydetään uutta biisiä, ja refreshPreviewUrl on voinut sillä
         * välin hakea tuoreemman osoitteen vanhentuneen tilalle. Ilman tätä
         * ehtoa palan vanha osoite palaisi takaisin. */
        if (!song.preview) song.preview = arvo[0] || "";
        if (!song.art) song.art = arvo[1] || "";
      }
    }
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
  const SEKOITUS = 5;

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
   * vertaisi väärään järjestykseen.
   *
   * Luku on suoraan se takuu jonka saa: lyhin väli saman biisin toistoon
   * saumassa on tasan GAP + 1 päivää. Mitattuna 3000 päivän ajalta
   * seitsemällä se oli 8 päivää, neljälläkymmenellä 15, kahdellakymmenellä-
   * yhdellä 22 ja kuudellakymmenellä 61. Mekanismi toimi siis koko ajan,
   * luku oli vain liian pieni: kahdeksan päivää on kaukana siitä mitä ylempi
   * kommentti lupaa, eli että biisi palaa vasta kun taso on käyty läpi.
   *
   * Yläraja tulee vaihtokohteista. Siirrettäviä on enintään GAP ja
   * vaihtokohteita n - 2 * GAP, joten tarvitaan n >= 3 * GAP. Pienin taso on
   * 256 biisiä, eli 60 jättää 136 kohdetta 60:lle tarvitsijalle. Mitattuna
   * 90 jo huononsi tulosta, koska kohteet loppuivat kesken ja korjaus
   * luovutti. Jos jokin taso joskus kutistuu alle 180 biisin, tätä on
   * pienennettävä. */
  const GAP = 60;

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

  /* Tason biisit vakaassa lähtöjärjestyksessä, ettei katalogin
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
    karanteeni(order, cycle);
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

  /* ---------- Päivän artisti ----------
   *
   * Sama periaate kuin biisipakassa mutta yksinkertaisempi: yksi lista,
   * ei tasoja eikä törmäyksiä. Artisti arvotaan pelkästä päivämäärästä,
   * joten kaikki saavat saman ilman palvelinta.
   *
   * Omat vakiot eikä biisipelin jaetut: artistipeli on eri peli, ja jos
   * jaettu EPOCH tai SEKOITUS joskus muuttuisi biisipelin takia, se
   * sekoittaisi artistikierron ilman että kukaan yhdistäisi asioita.
   *
   * Lista järjestetään tunnisteen mukaan ennen sekoitusta, jottei
   * artistit.json:in rivijärjestys vaikuta arvontaan. */
  const ARTISTI_EPOCH = Date.UTC(2026, 8, 24);   // 24.9.2026
  const ARTISTI_SEKOITUS = 1;
  /* Sauman suoja, sama idea kuin biisipakan GAP. Kierroksen loppu ja
   * seuraavan alku ovat päiviä peräkkäin, joten ilman tätä sama artisti
   * voisi tulla kahtena peräkkäisenä päivänä vaikka kierto on 247
   * päivää.
   *
   * Luku on suoraan se takuu jonka saa: lyhin väli saman artistin
   * toistoon on GAP + 1 päivää. Kahdellakymmenellä mitattu lyhin oli 23
   * päivää, mikä on 247 päivän kierrossa liian lyhyt: pelaaja muistaa
   * vielä hyvin kolmen viikon takaisen artistin.
   *
   * Yläraja tulee vaihtokohteista: siirrettäviä on enintään GAP ja
   * kohteita n - 2 * GAP, joten tarvitaan n >= 3 * GAP. Kuudellakymmenellä
   * se on 180. JOS ARTISTEJA JOSKUS ON ALLE 180, tämä on pienennettävä,
   * tai sauman korjaus lakkaa toimimasta hiljaa. */
  const ARTISTI_GAP = 60;

  function artistiDayIndex(key) {
    const [y, m, d] = key.split("-").map(Number);
    return Math.floor((Date.UTC(y, m - 1, d) - ARTISTI_EPOCH) / DAY_MS);
  }

  const artistiPakat = new Map();

  function artistiPakka(cycle) {
    const valmis = artistiPakat.get(cycle);
    if (valmis) return valmis;
    const lista = state.artistit.slice().sort((a, b) => (a.id < b.id ? -1 : 1));
    const order = shuffled(lista, hashString(`artisti:${ARTISTI_SEKOITUS}:${cycle}`));
    const n = order.length;
    if (cycle > 0 && n >= 3 * ARTISTI_GAP) {
      const edellinen = shuffled(lista,
        hashString(`artisti:${ARTISTI_SEKOITUS}:${cycle - 1}`));
      const hanta = new Set(edellinen.slice(n - ARTISTI_GAP).map((a) => a.id));
      for (let i = 0; i < ARTISTI_GAP; i++) {
        if (!hanta.has(order[i].id)) continue;
        for (let j = ARTISTI_GAP; j < n - ARTISTI_GAP; j++) {
          if (hanta.has(order[j].id)) continue;
          [order[i], order[j]] = [order[j], order[i]];
          break;
        }
      }
    }
    artistiPakat.set(cycle, order);
    return order;
  }

  function paivanArtisti(key) {
    const n = state.artistit.length;
    if (!n) return null;
    const day = artistiDayIndex(key);
    return artistiPakka(Math.floor(day / n))[((day % n) + n) % n];
  }

  /* Arvauksia päivässä. Wordlessa kuusi, ja sama luku toimii tässä:
   * viidellä attribuutilla kuusi arvausta riittää päättelyyn mutta ei
   * tee siitä varmaa. */
  const ARTISTI_ARVAUKSIA = 6;

  /* Numeroattribuutin "lähellä" -raja. Jäsenmäärässä yksi ja
   * debyyttivuodessa viisi: molemmat ovat sen verran lähellä, että
   * pelaaja on oikeilla jäljillä muttei osunut. Tämä on Wordlen
   * keltaisen vastine, ja ilman sitä kaikki väärät näyttäisivät
   * samalta vaikka osa arvauksista oli aivan vieressä. */
  /* Osittainen osuma muissa kuin lukukentissä.
   *
   * Keltainen oli aluksi vain jäsenmäärässä ja debyyttivuodessa, ja
   * mitattuna 21 % peleistä ei saanut yhtään keltaista ruutua. Kolme
   * saraketta viidestä oli mustavalkoisia, vaikka niissä on aitoa
   * osittaista osumaa: sekayhtye ON osaksi miesyhtye, ja molemmilla
   * kielillä laulava ON osaksi suomeksi laulava. Se on sama tieto kuin
   * "vuosi menee viisi pieleen", eikä keksitty sukulaisuus.
   *
   * Pari luetaan kumpaankin suuntaan: arvaus Seka oikean Miehen kohdalla
   * on yhtä lailla osittain oikein kuin toisin päin. */
  const ARTISTI_KENTAT = [
    /* Arvattu artisti. Rivin ensimmäinen ruutu, ja ainoa jossa lukee
     * nimi ja näkyy kuva.
     *
     * Ruutu on kahdessa tehtävässä yhtä aikaa. Se kertoo kenet
     * arvattiin, jolloin rivin voi lukea ilman erillistä nimiriviä sen
     * yläpuolella, ja se on se sarake joka estää kaiken vihreän
     * väärällä arvauksella: 246 artistista 25:llä on täsmälleen samat
     * viisi muuta tietoa jonkun toisen kanssa, ja ilman tätä pelaaja
     * saattoi arvata kaksoisolennon, nähdä viisi vihreää ja saada
     * "väärin". Mitattuna sellaisia pareja oli 14.
     *
     * Keltainen on sama alkukirjain. Se otettiin hetkeksi pois, koska
     * kone ratkaisi pelin sen kanssa lähes aina, mutta kone ei ole
     * pelaaja: se tietää kaikkien 246 artistin debyyttivuodet ja
     * kotipaikat, ja sille jäljellä on vain päättely. Ihmiselle vaikea
     * osa on keksiä nimi, ja alkukirjain kaventaa sen 246:sta noin
     * kahdeksaan. Siksi se on tässä pelin ainoa vihje muistille.
     *
     * Nimi katkeaa pisteisiin jos se ei mahdu. Kuva riittää
     * tunnistamiseen siinä missä nimen alku. */
    { avain: "n", otsikko: "Artisti", nimi: true },
    /* Genressä ei ole osittaista osumaa.
     *
     * Rock ja metalli oli hetken mukana sillä perusteella että metalli on
     * rockin alalaji. Se ei kuitenkaan noudata samaa sääntöä kuin muut
     * keltaiset: niissä arvattu arvo SISÄLTYY oikeaan (sekayhtyeessä on
     * miehiä, "molemmat" sisältää suomen), mikä on logiikkaa eikä
     * mielipidettä. Rock ei sisällä metallia tässä datassa, vaan ne ovat
     * rinnakkaisia koreja jotka erotettiin toisistaan juuri siksi että
     * ne ovat eri asioita. Mitattuna se toi 0,2 keltaista peliin, eli
     * koko hyöty tuli niistä kahdesta joista ei voi olla eri mieltä. */
    { avain: "g", otsikko: "Genre" },
    /* Yksi ja kaksi sanoina. Niin artisteista puhutaan: "soolo" ja
     * "duo" ovat nimiä kokoonpanolle, eivät lukumääriä. Kolmesta
     * ylöspäin sanaa ei ole, joten siitä eteenpäin luku on luku.
     *
     * Vain näyttömuoto. Vertailu, nuoli ja "lähellä" laskevat luvulla
     * kuten ennenkin, joten Soolo ja Duo ovat keltaisia keskenään. */
    { avain: "j", otsikko: "Jäseniä", luku: true, lahella: 1,
      naytto: (v) => (v === 1 ? "Soolo" : v === 2 ? "Duo" : String(v)) },
    { avain: "s", otsikko: "Sukup.",
      osittain: [["Seka", "Mies"], ["Seka", "Nainen"]] },
    /* Kotipaikka. Vihreä on sama kunta, keltainen sama maakunta.
     *
     * Maakunta eikä suuralue. Suuralue antoi enemmän keltaista (14 %
     * ruuduista vastaan 9 %) ja rajasi joukkoa tehokkaammin, mutta se
     * on tilastokäsite jota ei lue missään pelaajalle näkyvässä:
     * säännön "sama suuralue" ymmärtäminen vaatisi tietämään mikä
     * Länsi-Suomi on. Maakunnan jokainen tuntee.
     *
     * Maakunta tulee datassa valmiina kenttänä, koska vaihtoehto olisi
     * kuljettaa 344 kunnan taulukko selaimeen. Sääntö on sama
     * sisältyvyys kuin muissakin keltaisissa: kunta kuuluu maakuntaan.
     *
     * Tämä korvasi laulukielen, joka oli mitattuna heikoin sarake: 211
     * artistia 247:stä lauloi suomeksi, joten yhden arvauksen jälkeen
     * siitä jäi jäljelle 75 % artisteista. Kotipaikasta jää 58 %. */
    { avain: "p", otsikko: "Kotoisin", ylakentta: "a" },
    { avain: "v", otsikko: "Debyytti", luku: true, lahella: 5 },
  ];

  /* Tavutusvihjeet kahdelle pitkälle arvolle.
   *
   * Ruutu on kapea, ja "Elektroninen" ja "Instrumentaali" eivät mahdu
   * sinne yhdelle riville millään luettavalla kirjasinkoolla. Selaimen
   * oma hyphens: auto katkaisisi ne oikein, mutta se vaatii suomen
   * tavutussanaston, jota kaikissa selaimissa ei ole: ilman sitä sana
   * katkeaa mistä sattuu ("Instrume|ntaali"). Arvoja on kaikkiaan
   * kourallinen, joten oikea katkokohta kirjoitetaan tähän pehmeänä
   * tavuviivana. Se näkyy vain jos rivi oikeasti katkeaa siitä.
   *
   * Tämä on vain näyttömuoto. Data, vertailu ja jakoteksti käyttävät
   * arvoa sellaisenaan. */
  const ARTISTI_TAVUT = {
    "Elektroninen": "Elek­tro­ninen",
    "Enonkoski": "Enon­koski",
    "Harjavalta": "Har­ja­valta",
    "Haukipudas": "Hau­ki­pudas",
    "Helsinki": "Hel­sinki",
    "Hämeenlinna": "Hä­meen­linna",
    "Joroinen": "Jo­roinen",
    "Juankoski": "Juan­koski",
    "Jyväskylä": "Jy­väs­kylä",
    "Kauhajoki": "Kau­ha­joki",
    "Kauniainen": "Kau­ni­ainen",
    "Kemijärvi": "Ke­mi­järvi",
    "Kirkkonummi": "Kirk­ko­nummi",
    "Kuusankoski": "Kuu­san­koski",
    "Lappeenranta": "Lap­peen­ranta",
    "Lumijoki": "Lu­mi­joki",
    "Maarianhamina": "Maa­rian­ha­mina",
    "Metalli": "Me­talli",
    "Miehikkälä": "Mie­hik­kälä",
    "Outokumpu": "Ou­to­kumpu",
    "Pietarsaari": "Pie­tar­saari",
    "Pyhäranta": "Py­hä­ranta",
    "Riihimäki": "Rii­hi­mäki",
    "Rovaniemi": "Ro­va­niemi",
    "Seinäjoki": "Sei­nä­joki",
    "Siilinjärvi": "Sii­lin­järvi",
    "Sodankylä": "So­dan­kylä",
    "Suonenjoki": "Suo­nen­joki",
    "Tohmajärvi": "Toh­ma­järvi",
    "Toivakka": "Toi­vakka",
    "Ulkomaat": "Ulko­maat",
    "Utajärvi": "U­ta­järvi",
    "Ylitornio": "Yli­tor­nio",
    "Ylistaro": "Ylis­taro",
    "Ylöjärvi": "Ylö­järvi",
  };

  /* Kansikuvan osoitteen kiinteät osat.
   *
   * artistit.json:ssa on vain keskiosa, koska kaikki 245 osoitetta
   * alkavat ja päättyvät samalla tavalla. Kokonaisina ne
   * kaksinkertaistivat tiedoston, ja se ladataan jokaisen pelaajan
   * selaimeen. Sama jako on scripts/tee_artistidata.py:ssä. */
  const ARTISTI_KUVA_ETU = "https://is1-ssl.mzstatic.com/image/thumb/";
  const ARTISTI_KUVA_PAATE = "/300x300bb.jpg";
  /* Arvausrivin kuva on 24 pikseliä leveä, joten sille haetaan oma
   * pieni koko. Kuutta 300-pikselistä kansikuvaa ei ole syytä ladata
   * ruutuun jossa ne näkyvät peukalonkynsinä. */
  const ARTISTI_KUVA_RIVI = "/100x100bb.jpg";

  /* Nuolet piirretään SVG:nä eikä merkkeinä ▲ ja ▼.
   *
   * Unicoden kolmiot ovat umpinaisia muotoja ilman vartta, ja ne
   * piirtyvät eri kokoisina ja eri kohdalla riviä jokaisessa
   * kirjasimessa. SVG on joka laitteella samanlainen, terävä missä
   * tahansa koossa ja perii ruudun tekstivärin, joten sama nuoli toimii
   * sekä tummalla että vaalealla pohjalla.
   *
   * Vertailu palauttaa yhä merkin ▲ tai ▼: se on tieto suunnasta, ja
   * testit sekä vaikeussimulaatio lukevat sen. Tämä taulukko kääntää
   * sen kuvaksi vasta piirrettäessä. */
  const ARTISTI_NUOLET = {
    "▲": '<svg class="a-nuoli" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 10.2V2.4M2.6 5.8 6 2.2l3.4 3.6"/></svg>',
    "▼": '<svg class="a-nuoli" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1.8v7.8M2.6 6.2 6 9.8l3.4-3.6"/></svg>',
  };

  /* Yksi arvausrivi verrattuna oikeaan vastaukseen.
   *
   * Palauttaa ruudut, ei valmista HTML:ää: samaa vertailua tarvitsee
   * sekä ruudukko että jakoteksti, eikä jakoteksti saa joutua
   * lukemaan väreja DOM:ista. */
  function artistiVertaa(arvaus, oikea) {
    return ARTISTI_KENTAT.map((kentta) => {
      const a = arvaus[kentta.avain];
      const o = oikea[kentta.avain];
      const teksti = kentta.naytto ? kentta.naytto(a) : String(a);
      if (a === o) return { tila: "osui", teksti, nuoli: "" };
      /* Nimet ovat listalla ainutkertaisia, joten vihreä yllä tarkoittaa
       * jo oikeaa artistia. Tässä ratkaistaan vain keltainen. */
      if (kentta.nimi) {
        const sama = a[0].toUpperCase() === o[0].toUpperCase();
        return { tila: sama ? "lahella" : "ohi", teksti, nuoli: "" };
      }
      if (kentta.luku) {
        const lahella = Math.abs(a - o) <= kentta.lahella;
        return {
          tila: lahella ? "lahella" : "ohi",
          teksti,
          nuoli: a < o ? "▲" : "▼",   // nuoli osoittaa oikeaan suuntaan
        };
      }
      /* Yläkenttä: arvo kuuluu laajempaan joukkoon, ja jos joukko on
       * sama, arvaus on lähellä. Kunta kuuluu suuralueeseen. */
      const sama = kentta.ylakentta
        && arvaus[kentta.ylakentta] === oikea[kentta.ylakentta];
      const osittain = sama || (kentta.osittain || []).some(
        ([x, y]) => (a === x && o === y) || (a === y && o === x));
      return { tila: osittain ? "lahella" : "ohi", teksti, nuoli: "" };
    });
  }

  /* Artistipelin tila. Oma oliona eikä state.rounds-muotoisena: pelit
   * ovat erillisiä, ja yhteinen tila sotkisi kesken jääneen biisisarjan
   * kesken jääneeseen artistiin. */
  const artistiTila = {
    pvm: null,
    oikea: null,
    arvaukset: [],     // artistiolioita siinä järjestyksessä kuin arvattiin
    ohi: false,
    voitto: false,
  };

  /* Artistilista ladataan vasta kun peliin mennään. Biisipelin avaus ei
   * saa hidastua 27 kilotavulla dataa jota se ei käytä. */
  let artistiLataus = null;

  function lataaArtistit() {
    if (state.artistit.length) return Promise.resolve();
    if (!artistiLataus) {
      artistiLataus = fetch("artistit.json?v=" + KATALOGI_K)
        .then((v) => {
          if (!v.ok) throw new Error("artistit.json (" + v.status + ")");
          return v.json();
        })
        .then((lista) => {
          state.artistit = lista;
          state.artistit.forEach((a) => {
            const alias = ARTISTI_ALIAKSET[a.n];
            a.haku = normalize(a.n + (alias ? " " + alias : ""));
            /* Toinen avain ilman heittomerkkiä. normalize tekee
             * heittomerkistä välin, joten "Waldo's People" on siellä
             * muodossa "waldo s people" eikä "waldos people" osu siihen
             * lainkaan. Sama koskee Bomfunk MC's:ää. */
            a.haku2 = normalize((a.n + (alias ? " " + alias : ""))
              .replace(/['\u2019]/g, ""));
          });
        })
        .catch((e) => { artistiLataus = null; throw e; });
    }
    return artistiLataus;
  }

  /* Hakunimet joilla artisti tunnetaan mutta joita ei ole listalla.
   *
   * Pelaaja kirjoittaa sen nimen jonka hän muistaa, ei sitä jonka
   * valitsimme listalle. "Tarja Turunen" ei osunut mihinkään, koska
   * listalla lukee "Tarja", ja "Anna Abreu" ei osunut koska listalla
   * lukee "ABREU". Kumpikin näytti pelaajalle siltä että artistia ei
   * ole pelissä.
   *
   * Vain haku. Ruudukko, jakoteksti ja arvonta käyttävät listan omaa
   * nimeä kuten ennenkin, eikä tämä voi vaikuttaa päivän artistiin. */
  const ARTISTI_ALIAKSET = {
    "Tarja": "Tarja Turunen",
    "ABREU": "Anna Abreu",
    "Vesala": "Paula Vesala",
    "Stig": "Stig Dogg",
    "Robin": "Robin Packalen",
  };

  function artistiEhdotukset(teksti) {
    const q = normalize(teksti);
    const raaka = teksti.toLowerCase().trim();
    if (!q && !raaka) return [];
    const arvatut = new Set(artistiTila.arvaukset.map((a) => a.id));
    const pisteet = [];
    for (const a of state.artistit) {
      if (arvatut.has(a.id)) continue;          // jo arvattua ei tarjota
      const raakaOsuu = raaka.length > 0 && a.n.toLowerCase().includes(raaka);
      const osuu = a.haku.includes(q) || a.haku2.includes(q);
      if (!q ? !raakaOsuu : !(osuu || raakaOsuu)) continue;
      let p = 0;
      if (a.haku === q || a.haku2 === q) p += 120;
      if (raakaOsuu) p += 40;
      if (a.haku.startsWith(q) || a.haku2.startsWith(q)) p += 30;
      p -= Math.min(10, a.n.length / 4);        // lyhyempi nimi ensin
      pisteet.push([p, a]);
    }
    pisteet.sort((x, y) => y[0] - x[0] || x[1].n.localeCompare(y[1].n, "fi"));
    /* Kahdeksan eikä neljäkymmentä. Lista mahtuu ruudulle ilman
     * vieritystä, ja pidempi lista on joka tapauksessa väärä työkalu:
     * jos oikeaa ei näy, kirjoittaa yhden kirjaimen lisää. */
    return pisteet.slice(0, 8).map((x) => x[1]);
  }

  /* Rivin paljastus: kuusi ruutua, joista viimeinen alkaa kääntyä
   * 5 * 110 ms kohdalla ja kääntyy 320 ms. Luvut ovat tässä yhdessä
   * paikassa, koska sekä loppulohkon odotus, nimiruudun toinen käännös
   * että tyylitiedoston ajoitus nojaavat niihin.
   *
   * Nimiruutu kääntyy kahdesti. Ensimmäisellä kierroksella se on
   * harmaa kuten kaikki muutkin, ja vasta rivin jälkeen se kääntyy
   * uudestaan ja näyttää värinsä. Ilman tätä koko animaatio oli turha:
   * nimiruutu on rivin ensimmäinen, joten se kertoi lopputuloksen
   * ennen kuin muut ruudut olivat ehtineet kääntyä.
   *
   * Harmaa nimiruutu ei käänny toista kertaa. Siinä ei ole mitään
   * paljastettavaa, ja turha käännös lupaisi jotain mitä ei tule. */
  const ARTISTI_RIVI_MS = 5 * 110 + 320;
  const ARTISTI_NIMI_VIIVE_MS = 140;
  const ARTISTI_NIMI_MS = 320;
  /* Pieni tauko nimiruudun käännön jälkeen: ilman sitä paljastusruutu
   * nousee juuri kun väri tulee näkyviin, ja peittää sen. */
  const ARTISTI_TAUKO_MS = 180;
  let artistiLoppuAjastin = 0;
  let artistiNimiAjastin = 0;

  /* uusi = kutsu tulee juuri tehdystä arvauksesta. Vain silloin viimeinen
   * rivi animoidaan ja loppulohko odottaa animaation ohi: kesken jääneen
   * pelin avaaminen piirtää samat rivit, eikä niitä saa paljastaa
   * uudestaan kuin ne olisi juuri arvattu. */
  function piirraArtistiRivit(uusi = false) {
    clearTimeout(artistiLoppuAjastin);
    clearTimeout(artistiNimiAjastin);
    const viimeinen = artistiTila.arvaukset.length - 1;
    /* Nimiruudun väri jätetään pois vain juuri arvatulta riviltä, ja
     * vain jos väriä on. Kesken jääneen pelin avaaminen piirtää rivit
     * valmiina. */
    let nimiJaljessa = null;
    const rivit = artistiTila.arvaukset.map((arvaus, rivi) => {
      const ruudut = artistiVertaa(arvaus, artistiTila.oikea);
      const solut = ruudut.map((r, i) => {
        let luokka = r.tila === "osui" ? " on-osui"
                   : r.tila === "lahella" ? " on-lahella" : "";
        if (ARTISTI_KENTAT[i].nimi) {
          if (uusi && rivi === viimeinen && luokka) {
            nimiJaljessa = luokka.trim();
            luokka = "";
          }
          /* Kuva vain jos sellainen on. Kuvaton artisti saa saman
           * ruudun ilman sitä, ja nimelle jää enemmän tilaa. */
          const osoite = artistiKuvaOsoite(arvaus, ARTISTI_KUVA_RIVI);
          const kuva = osoite
            ? `<img class="a-nimi-kuva" src="${escapeHtml(osoite)}" alt="" loading="lazy">`
            : "";
          return `<div class="a-ruutu on-nimi${luokka}" style="--i:${i}">`
            + `${kuva}<span>${escapeHtml(r.teksti)}</span></div>`;
        }
        const nuoli = ARTISTI_NUOLET[r.nuoli] || "";
        const teksti = ARTISTI_TAVUT[r.teksti] || r.teksti;
        return `<div class="a-ruutu${luokka}" style="--i:${i}"><span>${escapeHtml(teksti)}</span>${nuoli}</div>`;
      }).join("");
      const animoi = uusi && rivi === viimeinen ? " on-uusi" : "";
      return `<li><div class="a-rivi${animoi}">${solut}</div></li>`;
    });
    el.aRivit.innerHTML = rivit.join("");
    if (nimiJaljessa) {
      const ruutu = el.aRivit.querySelector("li:last-child .a-ruutu.on-nimi");
      artistiNimiAjastin = setTimeout(() => {
        if (!ruutu) return;
        ruutu.classList.add(nimiJaljessa, "on-kaanny");
      }, ARTISTI_RIVI_MS + ARTISTI_NIMI_VIIVE_MS);
    }
    const jaljella = ARTISTI_ARVAUKSIA - artistiTila.arvaukset.length;
    el.aJaljella.textContent = artistiTila.ohi
      ? ""
      : `${jaljella} ${jaljella === 1 ? "arvaus" : "arvausta"} jäljellä`;
    el.aArvaus.hidden = artistiTila.ohi;
    if (artistiTila.ohi) {
      const n = artistiTila.arvaukset.length;
      el.aLoppuOtsikko.textContent = artistiTila.voitto ? "Oikein!" : "Ei osunut";
      el.aLoppuTeksti.textContent = artistiTila.voitto
        ? `Päivän artisti oli ${artistiTila.oikea.n}. Arvauksia ${n}/${ARTISTI_ARVAUKSIA}.`
        : `Päivän artisti oli ${artistiTila.oikea.n}.`;
      /* Vastaus vasta kun viimeinenkin ruutu on kääntynyt. Muuten
       * "Päivän artisti oli X" lukisi ruudulla ennen kuin pelaaja on
       * ehtinyt katsoa sitä riviä josta se olisi pitänyt päätellä. */
      el.aLoppu.classList.toggle("on-uusi", uusi);
      if (uusi) {
        el.aLoppu.hidden = true;
        artistiLoppuAjastin = setTimeout(() => {
          el.aLoppu.hidden = false;
          avaaArtistiPaljastus();
        }, ARTISTI_RIVI_MS + (nimiJaljessa
          ? ARTISTI_NIMI_VIIVE_MS + ARTISTI_NIMI_MS + ARTISTI_TAUKO_MS : 0));
      } else {
        el.aLoppu.hidden = false;
      }
    } else {
      el.aLoppu.hidden = true;
    }
  }

  function tallennaArtisti() {
    if (!artistiTila.pvm) return;
    // Luetaan ennen kirjoitusta: tilastot kirjataan vain kerran päivässä,
    // ja tallenteen olemassaolo on se mikä kertoo päivän jo kirjatuksi.
    const jo = !!store.get(AVAIN.artisti.tulos(artistiTila.pvm), null);
    const avain = artistiTila.ohi
      ? AVAIN.artisti.tulos(artistiTila.pvm)
      : AVAIN.artisti.kesken(artistiTila.pvm);
    store.set(avain, {
      arvaukset: artistiTila.arvaukset.map((a) => a.id),
      voitto: artistiTila.voitto,
    });
    if (artistiTila.ohi) store.remove(AVAIN.artisti.kesken(artistiTila.pvm));
    if (artistiTila.ohi && !jo) kirjaaArtistiTilastot();
  }

  function artistiArvaa(artisti) {
    if (artistiTila.ohi || !artisti) return;
    if (artistiTila.arvaukset.some((a) => a.id === artisti.id)) return;
    artistiTila.arvaukset.push(artisti);
    if (artisti.id === artistiTila.oikea.id) {
      artistiTila.voitto = true;
      artistiTila.ohi = true;
    } else if (artistiTila.arvaukset.length >= ARTISTI_ARVAUKSIA) {
      artistiTila.ohi = true;
    }
    tallennaArtisti();
    piirraArtistiRivit(true);
    if (artistiTila.ohi) {
      /* Arvauksia 1-6 jos ratkesi, 0 jos ei. Palvelin ei saa pisteitä
       * lainkaan: artistipelissä niitä ei ole. */
      lahetaArtisti(artistiTila.pvm,
        artistiTila.voitto ? artistiTila.arvaukset.length : 0);
    }
  }

  /* ---------- ArtistiSpotin tilastot ja tuloskortti ----------
   *
   * Omat lukunsa eikä biisipelin tilastoihin liitettyjä: tämä on eri peli
   * samalla sivulla. Pisteitä ei ole, joten mitattavaa on kolme: monenako
   * päivänä pelattu, moniko ratkesi, ja monellako arvauksella. */
  const ARTISTI_MERKIT = { osui: "🟩", lahella: "🟨", ohi: "⬛" };

  function artistiOletustilastot() {
    return {
      pelatut: 0,      // päiviä pelattu loppuun
      voitot: 0,
      putki: 0,        // peräkkäisiä ratkaistuja päiviä
      pisin: 0,
      viimeisin: "",   // viimeisin RATKAISTU päivä, putken jatkoa varten
      jakauma: [0, 0, 0, 0, 0, 0],
    };
  }

  function artistiTilastot() {
    const s = { ...artistiOletustilastot(),
                ...store.get(AVAIN.artisti.stats, {}) };
    /* Jakauma rakennetaan aina uusiksi oikean mittaisena. Tallenteesta voi
     * tulla mitä tahansa: vanhempi versio, käsin muokattu localStorage tai
     * puuttuva kenttä, eikä piirto saa kaatua siihen. */
    const j = Array.isArray(s.jakauma) ? s.jakauma : [];
    s.jakauma = Array.from({ length: ARTISTI_ARVAUKSIA },
      (_, i) => Number(j[i]) || 0);
    return s;
  }

  function kirjaaArtistiTilastot() {
    const s = artistiTilastot();
    s.pelatut += 1;
    if (artistiTila.voitto) {
      s.voitot += 1;
      s.jakauma[artistiTila.arvaukset.length - 1] += 1;
    }
    /* Putki lasketaan pelatusta päivästä eikä kellosta, samoin kuin
     * biisipelissä: keskiyön yli pelattu päivä kuuluu sille päivälle jonka
     * artistista on kyse. */
    const edellinen = keyToDate(artistiTila.pvm);
    edellinen.setDate(edellinen.getDate() - 1);
    if (!artistiTila.voitto) {
      // Väärin mennyt päivä katkaisee putken, ei jätä sitä roikkumaan.
      s.putki = 0;
      s.viimeisin = "";
    } else {
      s.putki = s.viimeisin === dayKey(edellinen) ? s.putki + 1 : 1;
      s.viimeisin = artistiTila.pvm;
      s.pisin = Math.max(s.pisin, s.putki);
    }
    store.set(AVAIN.artisti.stats, s);
  }

  /* Jaettava teksti. Sama vertailu kuin ruudukossa, koska merkit luetaan
   * artistiVertaa():sta eikä DOM:ista: jaettu tulos ei voi erota siitä
   * mitä pelaaja näki. Sarakeotsikoita ei ole mukana, koska ne
   * paljastaisivat vastaajalle mitä kukin ruutu tarkoittaa ennen kuin hän
   * on itse pelannut. */
  function artistiJakoteksti() {
    const n = artistiTila.arvaukset.length;
    const rivit = [
      `🎤 ArtistiSpotti · ${keyToDate(artistiTila.pvm).toLocaleDateString("fi-FI")}`,
      `${artistiTila.voitto ? n : "X"}/${ARTISTI_ARVAUKSIA}`,
      "",
    ];
    for (const arvaus of artistiTila.arvaukset) {
      rivit.push(artistiVertaa(arvaus, artistiTila.oikea)
        .map((r) => ARTISTI_MERKIT[r.tila]).join(""));
    }
    rivit.push("");
    rivit.push(jaettavaOsoite());
    return rivit.join("\n");
  }

  async function jaaArtisti() {
    const teksti = artistiJakoteksti();
    /* Natiivi jako ensin, leikepöytä varalle. Sama järjestys kuin
     * biisipelissä: puhelimessa jako avaa sovellusvalikon, työpöydällä
     * sitä ei yleensä ole ja kopiointi on ainoa mikä toimii. */
    if (navigator.share) {
      try {
        await navigator.share({ text: teksti });
        return;
      } catch (e) {
        // Oma peruutus ei ole virhe eikä ansaitse ilmoitusta.
        if (e && e.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(teksti);
      toast("Tulos kopioitu leikepöydälle.");
    } catch {
      toast("Kopiointi ei onnistunut.");
    }
  }

  /* Miten muut pärjäsivät samalla artistilla.
   *
   * Palvelin palauttaa raa'at luvut (montako pelasi, montako ratkaisi
   * milläkin arvauksella, montako ei ratkaissut) ja peli laskee niistä
   * esityksen. Sama periaate kuin biisipelissä: kun palvelin ei päätä
   * esitystapaa, sitä voi muuttaa julkaisematta Workeria. */
  function artistiVertailuTeksti(d, omatArvaukset, voitto) {
    if (!d || !d.n) return "";
    const muita = d.n - 1;
    if (muita < ARTISTI_VERTAILU_RAJA) {
      // Liian pieni otos keskiarvoksi. Järjestysluku on silti tietoa.
      return d.n === 1 ? "Olit päivän ensimmäinen pelaaja."
        : `Olit päivän ${d.n}. pelaaja.`;
    }
    /* Omat luvut pois vertailusta: pelaaja ei vertaa itseään itseensä.
     * Oma tulos on jo kirjattu palvelimelle kun tämä haetaan. */
    const korit = d.g.slice();
    if (voitto && korit[omatArvaukset - 1]) korit[omatArvaukset - 1] -= 1;

    const ratkaisi = korit.reduce((a, b) => a + b, 0);
    if (!ratkaisi) return "Kukaan muu ei ratkaissut artistia.";
    /* Keskiarvo lasketaan vain ratkaisseista. Ratkaisemattomalle ei ole
     * arvausmäärää jonka voisi laskea mukaan: hän käytti kuusi mutta ei
     * osunut, eikä se ole sama asia kuin kuudella osunut. */
    const ka = (korit.reduce((a, b, i) => a + b * (i + 1), 0) / ratkaisi)
      .toFixed(1).replace(".", ",");
    return `Muut arvasivat keskimäärin ${ka} arvauksella.`;
  }

  /* Monesko pelaaja näkee ensimmäisenä keskiarvon. Sama luku ja sama
   * peruste kuin biisipelissä: kymmenen on pieni otos, mutta vertailu
   * kymmeneen on kiinnostavampi kuin pelkkä järjestysluku. */
  const ARTISTI_VERTAILU_RAJA = 10;

  let artistiVertailuVuoro = 0;

  async function paivitaArtistiVertailu() {
    const e = el.atVertailu;
    e.hidden = true;
    if (!artistiTila.pvm || !artistiTila.ohi) return;
    const vuoro = ++artistiVertailuVuoro;
    const d = await haeArtisti(artistiTila.pvm);
    // Hidas vastaus ei saa kirjoittaa toisen päivän näkymän päälle.
    if (vuoro !== artistiVertailuVuoro || state.view !== "artistitulos") return;
    const teksti = artistiVertailuTeksti(
      d, artistiTila.arvaukset.length, artistiTila.voitto);
    e.textContent = teksti;
    e.hidden = !teksti;
  }

  function piirraArtistiTulos() {
    const s = artistiTilastot();
    const n = artistiTila.arvaukset.length;
    asetaArtistiKuva(el.atKuva, artistiTila.oikea);
    el.atOtsikko.textContent = artistiTila.voitto ? "Oikein!" : "Ei osunut";
    el.atTeksti.textContent = artistiTila.voitto
      ? `Päivän artisti oli ${artistiTila.oikea.n}. Arvauksia ${n}/${ARTISTI_ARVAUKSIA}.`
      : `Päivän artisti oli ${artistiTila.oikea.n}.`;
    piirraArtistiVastaus(el.atRivi, artistiTila.oikea);

    /* Putki näytetään nollana, jos viimeisin ratkaistu päivä ei ole tämä
     * eikä eilinen. Luku on tallessa muuttumattomana, mutta katkennutta
     * putkea ei saa näyttää elävänä. */
    const eilen = new Date();
    eilen.setDate(eilen.getDate() - 1);
    const putki = (s.viimeisin === todayKey() || s.viimeisin === dayKey(eilen))
      ? s.putki : 0;
    el.atPelatut.textContent = s.pelatut;
    el.atVoitto.textContent = s.pelatut
      ? Math.round((s.voitot / s.pelatut) * 100) : 0;
    el.atPutki.textContent = putki;
    el.atPisin.textContent = s.pisin;

    /* Palkit suhteessa suurimpaan koriin, ei pelattuihin päiviin: yksikin
     * pelattu päivä antaa täyden palkin, mikä on juuri mitä Wordlekin
     * tekee. Tyhjät korit jäävät nollan levyisiksi mutta pysyvät rivissä,
     * jotta jakauman muoto näkyy. */
    const suurin = Math.max(1, ...s.jakauma);
    const oma = artistiTila.voitto ? n : 0;
    el.atJakauma.innerHTML = s.jakauma.map((maara, i) => {
      const leveys = Math.round((maara / suurin) * 100);
      const oma_ = i + 1 === oma ? " on-oma" : "";
      return `<div class="at-rivi${oma_}"><span class="at-nro">${i + 1}</span>
        <span class="at-ura"><span class="at-palkki${oma_}" style="width:${leveys}%"></span></span>
        <span class="at-maara">${maara}</span></div>`;
    }).join("");

    el.atKorttiYla.textContent =
      `ArtistiSpotti · ${keyToDate(artistiTila.pvm).toLocaleDateString("fi-FI")} · `
      + `${artistiTila.voitto ? n : "X"}/${ARTISTI_ARVAUKSIA}`;
    /* Kortissa vain värit, ei tekstiä. Se on sama ruudukko jonka pelaaja
     * jakaa, ja arvattujen artistien nimet jäävät pois samasta syystä kuin
     * jakotekstistäkin. */
    el.atKorttiRivit.innerHTML = artistiTila.arvaukset.map((arvaus) => {
      const solut = artistiVertaa(arvaus, artistiTila.oikea).map((r, i) => {
        const luokka = r.tila === "osui" ? " on-osui"
                     : r.tila === "lahella" ? " on-lahella" : "";
        const nimi = ARTISTI_KENTAT[i].nimi ? " on-nimi" : "";
        return `<div class="a-ruutu${luokka}${nimi}"></div>`;
      }).join("");
      return `<div class="a-rivi">${solut}</div>`;
    }).join("");
  }

  /* Tulosnäkymä aukeaa vain ratkaistusta päivästä. Kesken oleva sarja veisi
   * sinne tyhjän kortin ja kertoisi vastauksen tilastorivin vierestä. */
  async function avaaArtistiTulos() {
    await lataaArtistit();
    if (!artistiTila.pvm) await avaaArtisti();
    if (!artistiTila.ohi) { await avaaArtisti(); return; }
    show("artistitulos");
    piirraArtistiTulos();
    paivitaArtistiVertailu();
  }

  /* Testipäivä osoiteriviltä: ?artisti=2026-10-05 tai ?artisti=satunnainen.
   *
   * Päivän artistin voi pelata vain kerran, joten kehittäjä ei pääse
   * kokeilemaan peliä uudestaan ennen seuraavaa vuorokautta. Tämä avaa
   * jonkin muun päivän artistin.
   *
   * Ei toimi tuotannossa. Siellä se olisi tapa kurkata tulevat päivät
   * etukäteen, ja koko pelin idea on että kaikilla on sama artisti
   * samana päivänä. Testisivu ja localhost ovat kehitysosoitteita,
   * hittispotti.fi ei.
   *
   * Tulos tallentuu sen päivän avaimelle jota pelataan, joten oikean
   * päivän tulos säilyy koskemattomana. */
  function artistiTestipaiva() {
    const tuotanto = location.hostname === "hittispotti.fi"
      || location.hostname.endsWith(".hittispotti.fi");
    if (tuotanto) return "";
    const arvo = new URLSearchParams(location.search).get("artisti") || "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(arvo)) return arvo;
    if (arvo === "satunnainen") {
      /* Satunnainen päivä koko kierron sisältä. Ei tämän päivän
       * ympäriltä, koska silloin samat artistit toistuisivat. */
      const d = new Date();
      d.setDate(d.getDate() + Math.floor(Math.random() * 400));
      return dayKey(d);
    }
    return "";
  }

  /* Päivän artistin avaaminen. Palauttaa kesken jääneen sarjan samasta
   * kohdasta, koska päivä on sama ja arvaukset on jo nähty. */
  async function avaaArtisti() {
    show("artisti");
    await lataaArtistit();
    const pvm = artistiTestipaiva() || todayKey();
    if (artistiTila.pvm !== pvm) {
      artistiTila.pvm = pvm;
      artistiTila.oikea = paivanArtisti(pvm);
      artistiTila.arvaukset = [];
      artistiTila.ohi = false;
      artistiTila.voitto = false;
      const byId = new Map(state.artistit.map((a) => [a.id, a]));
      const tallessa = store.get(AVAIN.artisti.tulos(pvm), null)
                    || store.get(AVAIN.artisti.kesken(pvm), null);
      if (tallessa && Array.isArray(tallessa.arvaukset)) {
        for (const id of tallessa.arvaukset) {
          const a = byId.get(id);
          if (a) artistiTila.arvaukset.push(a);
        }
        artistiTila.voitto = artistiTila.arvaukset
          .some((a) => a.id === artistiTila.oikea.id);
        artistiTila.ohi = artistiTila.voitto
          || artistiTila.arvaukset.length >= ARTISTI_ARVAUKSIA;
      }
    }
    // Päivämäärä seuraa pelattavaa päivää eikä kelloa, jotta
    // testipäivää pelatessa näkee mitä päivää pelaa.
    el.aPvm.textContent = keyToDate(pvm).toLocaleDateString("fi-FI");
    el.aInput.value = "";
    el.aEhdotukset.hidden = true;
    piirraArtistiRivit();
    /* Ensimmäisellä käynnillä säännöt aukeavat itsestään. Pelkkä
     * kysymysmerkki jäisi huomaamatta, ja ruudukko ilman selitystä on
     * viisi saraketta värejä ilman kertojaa siitä mitä ne tarkoittavat. */
    if (!store.get(AVAIN.artisti.etuliite + "ohje-nahty", 0)) avaaArtistiOhje();
  }

  /* Ehdotuslista ja sen valinta. Sama rakenne kuin biisipelin haussa,
   * mutta oma toteutuksensa: biisipelin lista käsittelee arvauslokia ja
   * soitinta, joita tässä ei ole. */
  function piirraArtistiEhdotukset(lista) {
    if (!lista.length) {
      el.aEhdotukset.hidden = true;
      el.aEhdotukset.innerHTML = "";
      return;
    }
    el.aEhdotukset.innerHTML = lista.map((a, i) =>
      `<li class="suggestion${i === artistiValittu ? " is-active" : ""}"
        role="option" aria-selected="${i === artistiValittu}"
        data-i="${i}"><span class="s-title">${escapeHtml(a.n)}</span></li>`
    ).join("");
    el.aEhdotukset.hidden = false;
    artistiEhdokkaat = lista;
    /* Valittu rivi näkyviin jos lista on vierittynyt. Ilman tätä
     * nuolinäppäin siirtää korostusta listan ulkopuolelle eikä mikään
     * ruudulla muutu. */
    const aktiivinen = el.aEhdotukset.querySelector(".is-active");
    if (aktiivinen) aktiivinen.scrollIntoView({ block: "nearest" });
  }

  let artistiEhdokkaat = [];
  /* Nuolinäppäimillä valittu rivi. -1 tarkoittaa ettei mitään ole
   * valittu, jolloin Enter ottaa listan ensimmäisen. */
  let artistiValittu = -1;

  el.aInput.addEventListener("input", () => {
    // Uusi hakusana, uusi lista: vanha valinta osoittaisi väärään riviin.
    artistiValittu = -1;
    piirraArtistiEhdotukset(artistiEhdotukset(el.aInput.value));
  });

  el.aInput.addEventListener("keydown", (e) => {
    const n = artistiEhdokkaat.length;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!n) return;
      e.preventDefault();
      /* Kierto listan yli molempiin suuntiin. Alusta ylös päin hyppää
       * viimeiseen, mikä on nopein tapa päästä listan loppuun. */
      const suunta = e.key === "ArrowDown" ? 1 : -1;
      artistiValittu = ((artistiValittu + suunta) % n + n) % n;
      piirraArtistiEhdotukset(artistiEhdokkaat);
      return;
    }
    if (e.key === "Escape") {
      el.aEhdotukset.hidden = true;
      artistiValittu = -1;
      return;
    }
    if (e.key !== "Enter") return;
    e.preventDefault();
    /* Enter ottaa nuolilla valitun rivin, tai listan ensimmäisen jos
     * mitään ei ole valittu. Pelaaja kirjoittaa nimen harvoin
     * täsmälleen oikein, ja ilman jälkimmäistä Enter ei tekisi mitään. */
    if (n) valitseArtisti(artistiEhdokkaat[artistiValittu >= 0 ? artistiValittu : 0]);
  });

  el.aEhdotukset.addEventListener("click", (e) => {
    const li = e.target.closest("li[data-i]");
    if (li) valitseArtisti(artistiEhdokkaat[Number(li.dataset.i)]);
  });

  /* Monesko arvaus osui, sanana.
   *
   * "Ratkesi 3 arvauksella" on numeron ja sanan sekamuoto joka lukee
   * tönkösti. Järjestysluku sanana on se miten ihminen sanoisi asian
   * ääneen, ja kuusi vaihtoehtoa mahtuu taulukkoon.
   *
   * Verbi on "ratketa" eikä "löytää": löytäminen on esineen etsimistä,
   * arvauspeli ratkeaa. Samasta syystä häviörivi on "Arvaukset
   * loppuivat kesken" eikä "Et löytänyt sitä": molemmat puhuvat
   * pelistä eivätkä pelaajan suorituksesta. */
  const ARTISTI_JARJESTYS = ["", "ensimmäisellä", "toisella", "kolmannella",
    "neljännellä", "viidennellä", "kuudennella"];

  /* Artistin kuvan osoite, tai tyhjä jos kuvaa ei ole.
   *
   * Tyhjä src lataisi sivun itsensä uudestaan ja piirtäisi rikkinäisen
   * kuvan paikalle, joten kuvaelementti piilotetaan sen sijaan. */
  function artistiKuvaOsoite(artisti, paate = ARTISTI_KUVA_PAATE) {
    return artisti && artisti.c ? ARTISTI_KUVA_ETU + artisti.c + paate : "";
  }

  function asetaArtistiKuva(kuvaEl, artisti) {
    const osoite = artistiKuvaOsoite(artisti);
    kuvaEl.hidden = !osoite;
    if (osoite && kuvaEl.getAttribute("src") !== osoite) kuvaEl.src = osoite;
  }

  /* Paljastusruutu. Aukeaa itsestään kun päivä ratkeaa, ja vain silloin:
   * jo pelatun päivän avaaminen uudestaan ei saa räpsäyttää vastausta
   * ruudulle ennen kuin pelaaja on ehtinyt katsoa omaa ruudukkoaan. */
  /* Oikean artistin tiedot omalla rivillään. Ruudukko kertoo vain mikä
   * arvauksissa osui, joten hävinnyt ei näe vastauksen tietoja mistään.
   *
   * Harmaana ja ilman nuolia: väri ja nuoli tarkoittavat pelissä
   * vertailua arvaukseen, eikä tässä verrata mihinkään. Nimi jätetään
   * pois, koska se lukee jo isolla tämän yläpuolella.
   *
   * Tavutusvihjeet ovat mukana, koska ruudut ovat tässä yhtä kapeat
   * kuin pelissäkin. */
  function piirraArtistiVastaus(el_, artisti) {
    if (!el_ || !artisti) return;
    el_.innerHTML = ARTISTI_KENTAT
      .filter((kentta) => !kentta.nimi)
      .map((kentta) => {
        const arvo = artisti[kentta.avain];
        const teksti = kentta.naytto ? kentta.naytto(arvo) : String(arvo);
        return `<div class="a-ruutu"><span>${escapeHtml(ARTISTI_TAVUT[teksti] || teksti)}</span></div>`;
      }).join("");
  }

  function avaaArtistiPaljastus() {
    const n = artistiTila.arvaukset.length;
    asetaArtistiKuva(el.aPaljastusKuva, artistiTila.oikea);
    el.aPaljastusOtsikko.textContent = artistiTila.voitto ? "Oikein!" : "Ei osunut";
    el.aPaljastusNimi.textContent = artistiTila.oikea.n;
    piirraArtistiVastaus(el.aPaljastusRivi, artistiTila.oikea);
    el.aPaljastusTeksti.textContent = artistiTila.voitto
      ? `Ratkesi ${ARTISTI_JARJESTYS[n] || n + "."} arvauksella.`
      : "Arvaukset loppuivat kesken.";
    /* Sivun oma loppulohko piiloon ruudun ajaksi. Siinä lukee sama asia,
     * ja himmennyksen läpi luettuna se näytti siltä että sama teksti on
     * vahingossa kahdesti. Se palaa kun ruutu suljetaan, joten rastilla
     * sulkeminen ei hukkaa mitään. */
    el.aLoppu.hidden = true;
    el.aPaljastusScrim.hidden = false;
    el.aPaljastusSheet.hidden = false;
    el.body.classList.add("sheet-open");
    el.aPaljastusSheet.focus({ preventScroll: true });
  }

  function suljeArtistiPaljastus() {
    el.aPaljastusSheet.hidden = true;
    el.aPaljastusScrim.hidden = true;
    el.body.classList.remove("sheet-open");
    if (artistiTila.ohi) el.aLoppu.hidden = false;
  }

  el.aPaljastusClose.addEventListener("click", suljeArtistiPaljastus);
  el.aPaljastusScrim.addEventListener("click", suljeArtistiPaljastus);
  el.aPaljastusOk.addEventListener("click", () => {
    suljeArtistiPaljastus();
    avaaArtistiTulos();
  });

  /* Ohjeruutu.
   *
   * Säännöt ovat pelin omassa näkymässä eivätkä sivun Ohjeet-osiossa,
   * koska ArtistiSpotti on pelimuoto HittiSpotin sisällä: sen säännöt
   * kuuluvat sinne missä peli on, eivät yhdeksän tuhannen merkin päähän
   * toisen pelin ohjeiden perään. */
  /* Välilehden vaihto. Auki oleva lehti on aina se jonka nappi on
   * korostettu, joten tila on yhdessä paikassa eikä kahdessa. */
  function artistiOhjeVali(peli) {
    el.aOhjeValiPeli.classList.toggle("on-auki", peli);
    el.aOhjeValiSarakkeet.classList.toggle("on-auki", !peli);
    el.aOhjeValiPeli.setAttribute("aria-selected", String(peli));
    el.aOhjeValiSarakkeet.setAttribute("aria-selected", String(!peli));
    el.aOhjePeli.hidden = !peli;
    el.aOhjeSarakkeet.hidden = peli;
    el.aOhjeSheet.scrollTop = 0;
  }

  el.aOhjeValiPeli.addEventListener("click", () => artistiOhjeVali(true));
  el.aOhjeValiSarakkeet.addEventListener("click", () => artistiOhjeVali(false));

  function avaaArtistiOhje() {
    store.set(AVAIN.artisti.etuliite + "ohje-nahty", 1);
    // Aina säännöistä: sarakkeet ovat hakuteos, säännöt ovat se mitä
    // ensimmäisenä halutaan tietää.
    artistiOhjeVali(true);
    el.aOhjeScrim.hidden = false;
    el.aOhjeSheet.hidden = false;
    el.body.classList.add("sheet-open");
    el.aOhjeSheet.focus({ preventScroll: true });
  }

  function suljeArtistiOhje() {
    el.aOhjeSheet.hidden = true;
    el.aOhjeScrim.hidden = true;
    el.body.classList.remove("sheet-open");
    el.aOhje.focus({ preventScroll: true });
  }

  el.aOhje.addEventListener("click", avaaArtistiOhje);
  el.aOhjeClose.addEventListener("click", suljeArtistiOhje);
  el.aOhjeOk.addEventListener("click", suljeArtistiOhje);
  el.aOhjeScrim.addEventListener("click", suljeArtistiOhje);

  el.aTulokset.addEventListener("click", () => { avaaArtistiTulos(); });
  el.atJaa.addEventListener("click", () => { jaaArtisti(); });

  function valitseArtisti(a) {
    if (!a) return;
    el.aInput.value = "";
    el.aEhdotukset.hidden = true;
    artistiEhdokkaat = [];
    artistiValittu = -1;
    artistiArvaa(a);
  }

  /* Lukitut päivät 17.-20.9.2026 on poistettu.
   *
   * Taulukko kiinnitti neljän päivän biisit, koska niistä oli kuvattu
   * videot etukäteen. Viimeinen niistä on mennyt, joten taulukko ei enää
   * tee mitään ja lukitushaara dailySongsista on poistettu.
   *
   * Karanteeni sen sijaan EI ole ohi, ks. seuraava lohko. */

  /* Lukituksen karanteeni.
   *
   * Lukitus vaihtaa päivän biisit mutta ei kerro pakalle mitään, joten
   * lukittu biisi on yhä omalla paikallaan uudessa pakassa. Ilman tätä se
   * voi palata heti kun lukitus loppuu: mitattuna Apulannan Valot
   * pimeyksien reunoilla olisi tullut uudestaan neljän päivän päästä.
   * Pelin oma lupaus on, ettei biisi palaa ennen kuin koko taso on käyty
   * läpi, eli aikaisintaan satojen päivien päästä.
   *
   * Siksi lukitut biisit siirretään pakan sisällä pois ikkunasta, joka
   * ulottuu KARANTEENI_PV päivää viimeisen lukitun päivän yli. Siirto on
   * vaihto kuten artistitörmäyksissäkin eikä ohitus, joten jokainen biisi
   * jaetaan yhä täsmälleen kerran kierroksessa. Jos vaihtoparia ei löydy,
   * biisi jää paikalleen: lopputulos on silloin sama kuin ilman
   * karanteenia eikä päivä voi jäädä tyhjäksi.
   *
   * Ajetaan ennen artistitörmäysten korjausta, jotta se ehtii siivota
   * vaihdon mahdollisesti tuomat törmäykset.
   *
   * ÄLÄ POISTA TÄTÄ LUKITUKSEN MUKANA. Karanteeni kestää 120 päivää
   * viimeisen lukitun päivän yli, eli 18.1.2027 asti, kun lukitus itse
   * päättyi jo 20.9.2026.
   *
   * Luvut olivat ennen johdettuja LUKITUT-taulukosta. Se oli ansa: tyhjällä
   * taulukolla Math.min() on Infinity ja Math.max() on -Infinity, jolloin
   * KARANTEENI_LOPPU olisi -Infinity ja alla oleva "day > KARANTEENI_LOPPU"
   * katkaisisi heti. Karanteeni olisi siis lakannut toimimasta täysin
   * hiljaa sinä hetkenä kun taulukko poistetaan, ilman virhettä tai
   * mitään merkkiä. Siksi idt ja päivät on kirjoitettu tähän auki.
   *
   * Nämä 20 biisiä ovat ne jotka olivat lukittuina 17.-20.9.2026. Koko
   * lohkon voi poistaa kun 18.1.2027 on mennyt. */
  const KARANTEENI_PV = 120;
  const KARANTEENI_IDT = new Set([
    209285022, 1392974769, 723817717, 1442626023, 1580370681,   // 17.9.
    307823569, 1522651576, 1166823835, 1178935690, 654974316,   // 18.9.
    329146131, 1565598460, 1041903663, 1798232918, 713547026,   // 19.9.
    716186675, 267022867, 1516626959, 847881102, 1442640791,    // 20.9.
  ]);
  const KARANTEENI_ALKU = dayIndex("2026-09-17");
  const KARANTEENI_LOPPU = dayIndex("2026-09-20") + KARANTEENI_PV;

  function karanteeni(order, cycle) {
    if (!KARANTEENI_IDT.size) return;
    const n = order.length;
    for (let pos = 0; pos < n; pos++) {
      const day = cycle * n + pos;
      if (day > KARANTEENI_LOPPU) break;   // paikat ovat päiväjärjestyksessä
      if (day < KARANTEENI_ALKU) continue; // menneet päivät jätetään rauhaan
      if (!KARANTEENI_IDT.has(order[pos].id)) continue;
      for (let askel = 1; askel < n; askel++) {
        const j = (pos + askel) % n;
        if (cycle * n + j <= KARANTEENI_LOPPU) continue;
        if (KARANTEENI_IDT.has(order[j].id)) continue;
        [order[pos], order[j]] = [order[j], order[pos]];
        break;
      }
    }
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
  /* Äänikontekstin herätys.
   *
   * Aiemmin herätys tehtiin vain tilassa "suspended". iOS:n Safarissa on oma
   * tila "interrupted", johon konteksti siirtyy kun puhelu, herätys, toisen
   * sovelluksen ääni tai näytön lukitus keskeyttää sen. Silloin ehto ei
   * täsmännyt, ääntä ei herätetty, eikä loppupelissä kuulunut enää mitään:
   * testaajan sanoin "ääni toimi puolet pelistä". Nyt herätetään aina kun
   * tila ei ole "running", eli myös tuntemattomista tiloista. */
  /* Äänenvoimakkuus.
   *
   * Pätkän oma vahvistin hoitaa häivytyksen ja syntyy uudestaan joka
   * pätkälle, joten se ei voi kantaa asetusta. Sen ja kaiuttimen väliin
   * tulee pysyvä pääsäädin, joka elää äänikontekstin mukana.
   *
   * Puhelimessa on laitteen omat näppäimet, koneella ei mitään: siellä ainoa
   * keino on käyttöjärjestelmän mikseri. Siksi säädin on työpöydän kiskossa,
   * ja siksi arvo muistetaan selaimessa. */
  const AANI_OLETUS = 0.7;
  const aaniTaso = () => {
    const v = Number(store.get("aani", AANI_OLETUS));
    return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : AANI_OLETUS;
  };

  /* iPhonen äänettömyyskytkin.
   *
   * Safari antaa Web Audiolle oletuksena ääni-istunnon tyypin "ambient", ja
   * ambient vaimennetaan aina kun puhelin on äänettömällä. Sama kytkin, joka
   * vaimentaa soittoäänen, vaimensi siis koko pelin, eikä pelaaja saanut
   * siitä mitään ilmoitusta: peli vain oli hiljaa. Tavallinen <audio>-elementti
   * saa eri tyypin ja soi äänettömälläkin, mutta peli ei voi käyttää sitä,
   * koska pätkän pitää katketa 0,1 sekunnin tarkkuudella ja häipyä pehmeästi.
   *
   * "playback" tarkoittaa varsinaista mediatoistoa, jota kytkin ei koske.
   * Hinta on se, ettei ääni enää sekoitu muiden sovellusten kanssa: pätkän
   * soidessa pelaajan oma musiikki pysähtyy eikä käynnisty itsestään takaisin.
   * Musiikkivisassa se on oikea vaihtokauppa, koska biisiä ei kuitenkaan voi
   * arvata oman musiikin päältä.
   *
   * WebKit sulki asiaa koskevan vikailmoituksen (bugs.webkit.org 237322)
   * merkinnällä "configuration changed": sivun kuuluu itse kertoa millaista
   * ääntä se tuottaa. Toimii iOS 17:stä lähtien; muissa selaimissa
   * ominaisuutta ei ole, jolloin tarkistus ohittaa tämän. */
  function asetaAaniIstunto() {
    try {
      if ("audioSession" in navigator) navigator.audioSession.type = "playback";
    } catch { /* Vain ääni jää äänettömällä kuulumatta, peli toimii silti. */ }
  }

  function ensureAudio() {
    if (!audio.ctx) {
      /* Ennen kontekstin luontia: tyyppi ratkaisee millaisena istunto
       * avataan. Kutsutaan joka kerta, koska konteksti voidaan rakentaa
       * uudestaan keskeytyksen jälkeen (ks. reviveAudio). */
      asetaAaniIstunto();
      const Ctx = window.AudioContext || window.webkitAudioContext;
      audio.ctx = new Ctx();
    }
    if (!audio.master || audio.master.context !== audio.ctx) {
      audio.master = audio.ctx.createGain();
      audio.master.gain.value = aaniTaso();
      audio.master.connect(audio.ctx.destination);
    }
    if (audio.ctx.state !== "running") audio.ctx.resume().catch(() => {});
    return audio.ctx;
  }

  function asetaAani(arvo) {
    store.set("aani", arvo);
    if (audio.master) {
      /* Liu'utetaan lyhyesti eikä hypätä: arvon vaihtaminen kesken soivan
       * pätkän naksahtaisi. */
      const g = audio.master.gain;
      g.cancelScheduledValues(audio.ctx.currentTime);
      g.setTargetAtTime(arvo, audio.ctx.currentTime, 0.015);
    }
    if (fallback.el) fallback.el.volume = arvo;
    if (el.aaniArvo) el.aaniArvo.textContent = Math.round(arvo * 100) + " %";
  }

  /* Herätys on lupaus, eikä sitä ennen kannata ajastaa mitään: pysähtyneessä
   * kontekstissa currentTime ei etene, jolloin pätkä ei kuuluisi eikä sen
   * pysäytys laukeaisi. */
  async function wakeAudio(ctx) {
    if (ctx.state === "running") return;
    try { await ctx.resume(); } catch { /* selain voi kieltäytyä ilman elettä */ }
  }

  /* iOS keskeyttää äänikontekstin kun käyttäjä poistuu toiseen sovellukseen.
   * Pelkkä resume() ei riitä: se voi onnistua näennäisesti niin että tila on
   * "running" mutta ääntä ei silti kuulu, eikä herätys ole luotettava ilman
   * käyttäjän elettä. Siksi konteksti rakennetaan uusiksi ensimmäisellä
   * painalluksella sivulle palaamisen jälkeen.
   *
   * Tehdään synkronisesti painalluksen sisällä, koska iOS sallii uuden
   * kontekstin käynnistämisen vain eleen yhteydessä. Vanhan sulkemista ei
   * odoteta. Puretut äänipuskurit eivät ole sidottuja kontekstiin, joten ne
   * säilyvät välimuistissa eikä pätkiä tarvitse ladata uudestaan. */
  function reviveAudio() {
    if (!audio.revive) return;
    audio.revive = false;
    const vanha = audio.ctx;
    audio.ctx = null;
    audio.source = null;
    audio.gain = null;
    audio.master = null;   // kuuluu vanhaan kontekstiin, ensureAudio tekee uuden
    if (vanha) { try { vanha.close(); } catch { /* ignore */ } }
    ensureAudio();
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
      fallback.el.volume = aaniTaso();
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
    audio.gain = null;
    audio.startedAt = 0;
    audio.total = 0;
    audio.playing = false;
    el.playBtn.classList.remove("is-playing");
    setPlayIcon("play");
    el.ring.style.strokeDashoffset = RING;
  }

  function animateBar(seconds, kulunut = 0) {
    const visual = Math.max(seconds, 0.45); // 0,1 s näkyy silti palkissa
    const start = performance.now() - kulunut * 1000;
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
    reviveAudio();
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
    await wakeAudio(ctx);
    if (cur().song !== song) return;   // biisi ehti vaihtua odotuksen aikana
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
    src.connect(gain).connect(audio.master || ctx.destination);
    /* Kesto ajastetaan stop():lla eikä start():n kolmantena parametrina:
     * kestoparametri lyö lopetushetken lukkoon eikä myöhempi stop() voi
     * siirtää sitä, jolloin ajan pidentäminen kesken soiton ei onnistuisi. */
    src.start(now, clipOffset(song, buffer));
    src.stop(now + seconds);
    audio.source = src;
    audio.gain = gain;
    audio.startedAt = now;
    audio.total = seconds;
    ready();
    animateBar(seconds);
  }

  /* Ajan pidentäminen kesken soiton ei katkaise ääntä: pätkä jatkaa siitä
   * mihin se ehti ja pysähtyy vasta uuden mitan täytyttyä. Jos ääni ei soi,
   * uusi pätkä alkaa alusta niin kuin ennenkin.
   *
   * Koskee vain arvausvaiheen pidennystä. Luovutuksen jälkeinen paljastus
   * soittaa pisimmän pätkän alusta, koska siinä halutaan kuulla biisi
   * kokonaan eikä jatkaa keskeltä. */
  function extendClip(seconds) {
    if (!audio.playing) { playClip(seconds); return; }
    // Varasoitin: pysäytysajastin uusiksi jäljellä olevalle ajalle.
    if (!audio.source) {
      const a = fallback.el;
      if (!a) { playClip(seconds); return; }
      clearTimeout(fallback.timer);
      const jaljella = Math.max(0, seconds - a.currentTime);
      fallback.timer = setTimeout(() => a.pause(), jaljella * 1000);
      animateBar(seconds, a.currentTime);
      return;
    }
    const ctx = audio.ctx;
    const nyt = ctx.currentTime;
    const kulunut = nyt - audio.startedAt;
    if (kulunut >= seconds) { playClip(seconds); return; }   // ehti jo ohi
    const loppu = audio.startedAt + seconds;
    try { audio.source.stop(loppu); } catch { playClip(seconds); return; }
    // Häivytys oli ajastettu vanhalle lopulle, joten se ajastetaan uusiksi.
    const g = audio.gain && audio.gain.gain;
    if (g) {
      const fade = Math.min(0.02, seconds / 4);
      if (g.cancelAndHoldAtTime) g.cancelAndHoldAtTime(nyt);
      else { g.cancelScheduledValues(nyt); g.setValueAtTime(1, nyt); }
      g.setValueAtTime(1, Math.max(nyt, loppu - fade));
      g.linearRampToValueAtTime(0, loppu);
    }
    audio.total = seconds;
    cancelAnimationFrame(audio.raf);
    animateBar(seconds, kulunut);
  }

  function prefetch(song) {
    if (!song || audio.buffers.has(song.id) || !audio.ctx) return;
    fetchBuffer(song).catch(() => { /* yritetään uudestaan kun soitetaan */ });
  }

  // ---------- Peli ----------
  async function startDaily() {
    /* Avain otetaan kerran tässä ja kulkee state.dayKey:ssä loppuun asti.
     * Jos se luettaisiin kellosta uudestaan tallennettaessa, 23.58 aloitettu
     * ja 00.03 päättynyt peli kirjautuisi huomisen päivälle tämän päivän
     * biiseillä. */
    const key = todayKey();
    const done = store.get(AVAIN.biisi.tulos(key), null);
    state.mode = "daily";
    state.dayKey = key;
    if (done) {
      state.results = done.results.map((r) => ({ ...r, song: state.byId.get(String(r.id)) }));
      state.score = done.score;
      /* Myös valmis päivä tarvitsee palat: tuloslistalla ja jakokuvassa ovat
       * kansikuvat, eikä tähän haaraan tulla soittimen kautta. */
      await varmistaAanet(state.results.map((r) => r.song));
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
    await varmistaAanet(state.rounds.map((r) => r.song));
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
  const progressKey = (key) => AVAIN.biisi.kesken(key);

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
  async function startFree() {
    /* state.used elää saman sivulatauksen ajan, joten peräkkäisissä sarjoissa
     * ei tule samoja biisejä uudestaan. Sivun päivitys nollaa sen: muistia ei
     * talleteta, koska satunnaisuus riittää eikä toistoa käytännössä ehdi
     * huomata yhden istunnon aikana. */
    state.mode = "free";
    state.results = [];
    state.score = 0;
    state.rounds = TIER_CYCLE.map((t) => newRound(pickFreeSong(t)));
    state.at = 0;
    await varmistaAanet(state.rounds.map((r) => r.song));
    show("game");
    openRound();
    state.rounds.forEach((r) => prefetch(r.song));
  }

  function pickFreeSong(tier) {
    /* Vuosikymmenrajaus on osa tason poimintaa, ei erillinen suodatin
     * jälkikäteen: muuten "taso käyty läpi" -nollaus laskisi väärin ja
     * nollaisi koko tason vaikka kauden sisällä olisi vielä biisejä. */
    const valitut = valitutKaudet();
    let kuuluu = (s) => s.tier === tier
      && (!valitut.length
        || (s.year && valitut.some((k) => s.year >= k.alku && s.year <= k.loppu)));
    /* Jos valinnasta ei löydy tätä tasoa lainkaan, rajaus jätetään väliin
     * tämän biisin kohdalla. Nykyisellä katalogilla ohuinkin yksittäinen
     * kausi antaa 22 biisiä joka tasolta, eikä monivalinta voi tehdä
     * joukosta pienempää kuin sen ohuin osa, mutta tyhjä joukko kaatuisi,
     * ja peli ilman yhtä vuosikymmentä on parempi kuin peli joka ei
     * käynnisty. */
    if (valitut.length && !state.pool.some(kuuluu)) kuuluu = (s) => s.tier === tier;
    let pool = state.pool.filter((s) => kuuluu(s) && !state.used.has(s.id));
    if (!pool.length) {
      // Taso käyty läpi: aloitetaan se alusta muita tasoja nollaamatta.
      state.pool.forEach((s) => { if (kuuluu(s)) state.used.delete(s.id); });
      pool = state.pool.filter(kuuluu);
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
      // Mainos kuuluu vain paljastukseen, ei arvausvaiheeseen.
      piilotaMainos("peli");
    }
    renderRound();
  }

  function renderRound() {
    const r = cur();
    /* Pelimuoto on näkymän otsikko, ei kuvateksti. Aiemmin ainoa ero muotojen
     * välillä oli tämä rivi himmeällä pikkutekstillä, eikä testaaja huomannut
     * vaihtaneensa muotoa. Nyt nimi on otsikkokokoinen ja päivämäärä jää sen
     * alle pieneksi. Vapaan pelin värin hoitaa CSS body[data-mode]:n kautta. */
    /* Vuosikymmen on otsikossa eikä pikkutekstissä. Sama syy kuin
     * pelimuodolla aikanaan: jos ainoa ero näkyy himmeänä alarivinä, pelaaja
     * ei huomaa mitä on valinnut, ja ihmettelee miksi kaikki biisit ovat
     * vanhoja. */
    const rajaus = kausiNimi();
    el.modeLabel.textContent = state.mode === "daily" ? "Päivän biisit"
      : rajaus || "Vapaa peli";
    el.modeSub.textContent = state.mode === "daily"
      ? dateLine(keyToDate(state.dayKey || todayKey()))
      : rajaus ? "vapaa peli" : "";
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
      /* Tila lasketaan aina, myös vuorossa olevalle. Kapealla ruudulla se on
       * vain ruudunlukijan aria-label, koska viisi nimeä mahtuu riville vain
       * ilman lisätekstiä. Leveällä ruudulla kisko näyttää sen myös silmälle:
       * siellä on tilaa, ja silloin sarjan tilanteen näkee vilkaisulla. */
      let cls = "";
      let tila;
      if (r.finished) {
        cls = r.solved ? " is-ok" : " is-miss";
        tila = r.solved ? `tunnistit ${fmtSec(STEPS[r.step])}` : "ei osunut";
      } else if (r.step > 0) {
        cls = " is-part";   // aloitettu mutta kesken: tänne kannattaa palata
        tila = `kesken, ${fmtSec(STEPS[r.step])}`;
      } else {
        tila = "aloittamatta";
      }
      if (i === state.at) cls = " is-on";
      return `<button type="button" class="tchip${cls}" data-slot="${i}" data-tier="${r.song.tier}"
        aria-pressed="${i === state.at}" aria-label="${name}, ${tila}"
        >${name}<span class="tchip-tila">${tila}</span></button>`;
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
    extendClip(STEPS[r.step]);
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
    // Viimeisen biisin jälkeen nappi vie tuloksiin kummassakin pelimuodossa.
    el.nextBtn.textContent = state.rounds.some((x) => !x.finished) ? "Seuraava" : "Tulokset";
    naytaMainos("peli");
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

  /* Montako ehdotusta lista näyttää enimmillään.
   *
   * Raja oli ensin kahdeksan, mikä riitti biisin nimellä haettaessa mutta
   * katkaisi artistihaun kesken: "gettomasa" antoi kahdeksan yhdeksästä.
   * Sitten 25, koska suurimmilla artisteilla oli silloin 20 kappaletta.
   * Se vanheni katalogin kasvaessa: Cheekillä on nyt 31 biisiä pääartistina
   * ja 34 kun feat-maininnat lasketaan mukaan, JVG:llä 27 ja 33. Raja
   * katkaisi siis juuri niiden artistien haun joilla on eniten biisejä.
   *
   * 50 antaa nykyiselle suurimmalle kaksinkertaisen varan. Pituus ei maksa
   * mitään: rivit ovat pelkkää tekstiä ilman kuvia ja verkkoa, ja lista on
   * rajattu 46 prosenttiin ruudun korkeudesta ja vierii, joten se ei vie
   * ruudulta tilaa eikä työnnä mitään pois. */
  const OSUMIA = 50;

  function exactMatch(text) {
    const key = normalize(text);
    if (!key) return null;
    const hit = state.songs.find((s) => s.key === key || normalize(s.label) === key) || null;
    return alreadyGuessed(hit) ? null : hit;
  }

  function findSuggestions(text) {
    const q = normalize(text);
    /* Hakusana myös raakana, pelkkä kirjainkoko pienennettynä.
     * normalize poistaa välimerkit, joten "+", "/" ja "-" katoavat siitä
     * kokonaan: haku "40+" osui biisiin "40K" eikä biisiin "40+", ja
     * pelkkä "+" palautti tyhjän koska normalisoitu haku oli tyhjä. */
    const raaka = text.toLowerCase().trim();
    if (!q && !raaka) return [];
    const tokens = q ? q.split(" ") : [];
    const scored = [];
    for (const s of state.songs) {
      const raakaOsuu = raaka.length > 0 && s.keyRaaka.includes(raaka);
      const sanatOsuvat = tokens.length > 0 && tokens.every((t) => s.key.includes(t));
      if (!sanatOsuvat && !raakaOsuu) continue;
      let score = 0;
      /* Välimerkkeineen osuva voittaa normalisoidun, koska se on
       * tarkempi: haku "40+" nostaa biisin "40+" biisin "40K" ohi. */
      if (raakaOsuu) score += 40;
      if (q) {
        /* Täsmälleen sama nimi voittaa alkuosuman. Ilman tätä lyhyet
         * nimet olivat käytännössä löytymättömissä: biisi "M" jäi
         * kaikkien m-alkuisten alle, koska "Mankeli" saa alkuosumasta
         * saman 30 pistettä kuin täsmälleen oikea "M". Sama koski
         * biisejä "e", "Ei", "Jos" ja "100". */
        if (s.keyTitle === q) score += 120;
        else if (s.keyArtist === q) score += 90;
        if (s.keyTitle.startsWith(q)) score += 30;
        else if (s.keyArtist.startsWith(q)) score += 25;
        else if (s.key.startsWith(q)) score += 20;
        if (s.keyTitle.includes(q)) score += 10;
        if (s.keyArtist.includes(q)) score += 8;
        /* Lyhyt nimi ensin, kun haku osuu useaan. "M" on lähempänä
         * hakua "M" kuin "Mankeli", ja pelaaja joka kirjoittaa vain
         * yhden kirjaimen etsii todennäköisimmin juuri sitä biisiä. */
        score -= Math.min(10, s.keyTitle.length / 4);
      }
      score -= s.tier; // tutummat ensin tasapelissä
      scored.push([score, s]);
    }
    scored.sort((a, b) => b[0] - a[0] || a[1].label.localeCompare(b[1].label, "fi"));
    return scored.slice(0, OSUMIA).map((x) => x[1]);
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
    updateSearchMode();
    scrollActiveIntoView();
  }

  /* Nuolinäppäimillä liikkuminen piirtää listan uusiksi, joten valittu rivi
   * voi jäädä vieritetyn listan ulkopuolelle. Vieritetään vain listaa, ei
   * sivua: scrollIntoView liikuttaisi myös taustalla olevaa näkymää. */
  function scrollActiveIntoView() {
    const rivi = el.suggestions.children[state.activeSuggestion];
    if (!rivi) return;
    const lista = el.suggestions.getBoundingClientRect();
    const r = rivi.getBoundingClientRect();
    if (r.top < lista.top) el.suggestions.scrollTop -= lista.top - r.top;
    else if (r.bottom > lista.bottom) el.suggestions.scrollTop += r.bottom - lista.bottom;
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
    if (el.suggestions.hidden) { suunta = null; korkeus = 0; return; }
    const vv = window.visualViewport;
    const nakyvaYla = vv ? vv.offsetTop : 0;
    const alaraja = nakyvaYla + (vv ? vv.height : window.innerHeight);
    /* Yläpalkki on sticky ja piirtyy listan päälle, joten sen alareuna on
     * todellinen yläraja. Ilman tätä ylöspäin auennut lista jäi osittain
     * palkin alle ja ylin ehdotus näkyi puolikkaana. */
    const palkki = el.bar ? el.bar.getBoundingClientRect().bottom : 0;
    const ylaraja = Math.max(nakyvaYla, palkki);
    const r = el.input.getBoundingClientRect();
    const MARGIN = 8, VAHIN = 120, ENINTAAN = 360, KUOLLUT = 12;
    const alla = alaraja - r.bottom - MARGIN;
    const ylla = r.top - ylaraja - MARGIN;
    /* Suunta valitaan kerran listan auetessa ja se pidetään. Sääntö oli
     * aiemmin pelkkä "sinne missä on enemmän tilaa", ja se laskettiin uusiksi
     * joka näppäinpainalluksella. Androidilla näppäimistö pienentää sivun
     * asetteluikkunaa, jolloin tilat muuttuvat kesken kirjoittamisen ja lista
     * loikki kentän ylä- ja alapuolen väliä. Suunta vaihtuu enää vain jos
     * nykyiselle puolelle ei mahdu vähimmäiskorkeutta ja toisella on enemmän. */
    if (suunta === null) suunta = ylla > alla ? "ylos" : "alas";
    else if (suunta === "alas" && alla < VAHIN && ylla > alla) suunta = "ylos";
    else if (suunta === "ylos" && ylla < VAHIN && alla > ylla) suunta = "alas";
    const ylos = suunta === "ylos";
    el.suggestions.classList.toggle("is-up", ylos);
    const tila = Math.floor(ylos ? ylla : alla);
    /* Sama syy: parin pikselin heilahdus näkyvässä alueessa muutti listan
     * korkeutta joka merkillä. Kirjoitetaan vain kun ero on sen verran suuri
     * ettei kyse ole näppäimistön animaation aiheuttamasta värähdyksestä. */
    const uusi = Math.max(VAHIN, Math.min(tila, ENINTAAN));
    if (Math.abs(uusi - korkeus) >= KUOLLUT) {
      korkeus = uusi;
      el.suggestions.style.maxHeight = uusi + "px";
    }
  }

  /* Hakutila: kirjoitettaessa soitin, mittari ja tasorivi väistyvät, jolloin
   * kenttä nousee yläpalkin alle ja ehdotuksille jää koko ruutu näppäimistöön
   * asti. Ks. style.css.
   *
   * Ehto on pelkkä ruudun leveys. Ensin kokeiltiin mitata näppäimistön viemä
   * tila (window.innerHeight - visualViewport.height), koska se olisi ollut
   * tarkin ehto: työpöydällä ja näppäimistöllisellä tabletilla mikään ei peity.
   * iPhonella se ei kuitenkaan mennyt kertaakaan päälle, joten mittaus jäi.
   * Kapealla ruudulla kenttään painaminen avaa näppäimistön joka tapauksessa,
   * eikä väärää tulkintaa käytännössä synny. */
  const kapea = window.matchMedia("(max-width: 720px)");
  /* Listan voimassa oleva suunta ja korkeus. Nollataan kun lista suljetaan. */
  let suunta = null, korkeus = 0;

  function updateSearchMode() {
    /* Hakutila vaatii myös ehdotuksia näkyviin. Pelkkä kentän kohdistus ei
     * riitä: tyhjällä kentällä ruudulle jäi vain kenttä ja Ohita-nappi, eikä
     * takaisin pelinäkymään ollut mitään mihin painaa. Kun tila on sidottu
     * listaan, se avautuu vasta kun tilalle on käyttöä ja sulkeutuu heti kun
     * kenttä tyhjennetään. "Ei osumia" ei kelpaa: silloin ei ole listaa jolle
     * tilaa raivattaisiin. */
    const rivit = !el.suggestions.hidden && state.suggestions.length > 0;
    const kirjoitettu = el.input.value.trim() !== "";
    const oli = el.views.game.classList.contains("is-searching");
    /* Auki mennään vasta kun listalla on rivejä, mutta auki myös pysytään niin
     * kauan kuin kentässä on tekstiä. Aiemmin ehtona olivat pelkät rivit, ja
     * kesken sanan kirjoittaminen osui jatkuvasti tilaan jossa osumia ei ole
     * ("gettomasaa"). Näkymä romahti ja palautui joka merkillä, mikä näkyi
     * Androidilla sivun heittelynä. Tyhjä kenttä sulkee tilan yhä, joten
     * ulospääsy kentän tyhjennysnapista säilyy. */
    const paalla = document.activeElement === el.input && kapea.matches
      && (rivit || (oli && kirjoitettu));
    el.views.game.classList.toggle("is-searching", paalla);
    /* Selain vierittää sivua itse saadakseen kentän näppäimistön yläpuolelle.
     * Kun muu sisältö väistyy, sivu on lyhyt eikä vieritystä enää tarvita,
     * mutta selain ei palauta sitä. Vain tilaan siirryttäessä: Androidilla
     * näppäimistö laukaisee resize-tapahtumia pitkin kirjoittamista, ja
     * jokaisella kerralla vierittäminen kilpaili selaimen oman vierityksen
     * kanssa. Se oli heittelyn pääsyy. */
    if (paalla && !oli && window.scrollY > 0) window.scrollTo(0, 0);
    placeSuggestions();
  }

  function closeSuggestions() {
    el.suggestions.hidden = true;
    el.suggestions.classList.remove("is-up");
    el.suggestions.style.maxHeight = "";
    el.input.setAttribute("aria-expanded", "false");
    state.activeSuggestion = -1;
    state.suggestions = [];
    updateSearchMode();
  }

  function chooseSuggestion(song) {
    if (alreadyGuessed(song)) return;
    state.selected = song;
    el.input.value = song.label;
    closeSuggestions();
    // Valinta on tehty: näppäimistö pois ja soitin takaisin näkyviin, jotta
    // Arvaa-nappi on heti painettavissa.
    el.input.blur();
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
      const rajaus = kausiNimi();
      lines.push(`🎵 HittiSpotti · ${rajaus ? rajaus.toLowerCase() : "vapaa sarja"}`);
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
    /* Vertailu piiloon heti ja haku käyntiin. Vanha teksti kuuluu edelliseen
     * sarjaan, eikä se saa jäädä näkyviin vapaan pelin tuloksiin eikä
     * eilisen lukuihin sillä aikaa kun uudet haetaan. */
    if (el.resultsVertailu) el.resultsVertailu.hidden = true;
    paivitaVertailu();
    const solved = state.results.filter((r) => r.solved).length;
    el.resultsTitle.textContent = daily
      ? `Päivän biisit, ${dateLine(keyToDate(state.dayKey || todayKey()))}`
      : kausiNimi() || "Vapaa peli";
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
          <div class="r-meta">
            <span class="r-tier">${escapeHtml(TIER_NAMES[s.tier] || "")}</span>
            <span class="r-squares" aria-hidden="true">${squaresHtml(r)}</span>
          </div>
        </div>
        <div class="r-points${r.solved ? "" : " zero"}">${r.solved ? "+" + fmt(r.points) : "0"}</div>`;
      el.resultsList.appendChild(li);
    });
    piilotaJako();
    valmisteleKuva();
    el.againBtn.textContent = daily ? "Vapaa peli" : "Uusi sarja";
  }

  /* ---------- Tuloskuva ----------
   *
   * Kuvassa EI näy biisien nimiä eikä kansia, vaikka kannet sen sallisivat
   * (Applen kuvapalvelin lähettää access-control-allow-origin: *). Syy on
   * pelillinen: päivän biisit ovat kaikille samat, joten nimet paljastava
   * kuva pilaisi päivän siltä jolle sen lähettää. Juuri se tekisi jakamisesta
   * hyödytöntä. Neliöt kertovat miten meni paljastamatta mitä.
   *
   * Piirretään 1080 x 1080: neliö toistuu viestisovelluksissa ennustettavasti
   * eikä rajaudu esikatselussa. */
  const KUVA = 1080;
  const NAYTA = '"Bricolage Grotesque", system-ui, sans-serif';

  const TIER_VARIT = ["", "#5ecf9a", "#bcd14a", "#f5b32e", "#ff8a4c", "#ff5f6d"];

  /* Päivän biisit ja vapaa peli saavat eri kuvan, ja ero on tarkoituksellinen.
   * Päivän biisit ovat kaikille samat, joten nimet paljastava kuva pilaisi
   * päivän siltä jolle sen lähettää: siellä pelkät neliöt. Vapaan pelin biisit
   * arvotaan jokaiselle erikseen, joten siellä ei ole mitään pilattavaa ja
   * kannet saa näyttää. */
  async function tulosKuva() {
    // Oma fontti pitää olla ladattu ennen piirtoa, muuten canvas käyttää
    // varafonttia eikä kuva näytä sivustolta.
    if (document.fonts && document.fonts.ready) {
      try { await document.fonts.ready; } catch { /* varafontilla mennään */ }
    }
    return state.mode === "daily" ? neliokuva() : listakuva(await lataaKannet());
  }

  /* Kannet erikseen CORS-tilassa. Sivulla olevat img-elementit on ladattu
   * ilman sitä, ja tavallisena ladattu kuva saastuttaisi canvasin niin ettei
   * siitä saisi enää blobia. Applen kuvapalvelin lähettää
   * access-control-allow-origin: *, joten tämä toimii.
   *
   * Yksikään kansi ei saa jäädä odottamaan ikuisesti: jos lataus ei valmistu
   * kolmessa sekunnissa, piirretään tilalle tyhjä laatikko. */
  function lataaKannet() {
    return Promise.all(state.results.map((r) => new Promise((valmis) => {
      const s = r.song || state.byId.get(String(r.id));
      if (!s || !s.art) return valmis(null);
      const kuva = new Image();
      kuva.crossOrigin = "anonymous";
      const aika = setTimeout(() => valmis(null), 3000);
      kuva.onload = () => { clearTimeout(aika); valmis(kuva); };
      kuva.onerror = () => { clearTimeout(aika); valmis(null); };
      kuva.src = s.art;
    })));
  }

  function pohja(g, leveys, korkeus) {
    g.fillStyle = "#0a0908";
    g.fillRect(0, 0, leveys, korkeus);
    g.textBaseline = "alphabetic";
  }

  /* Sama viiden palkin aaltomuoto kuin kuvakkeessa ja sanamerkissä. Palkit
   * piirretään paksuina viivoina pyörein päin eikä pyöristettyinä
   * suorakulmioina: roundRect puuttuu vanhemmista Safareista, ja pyöreä
   * viivanpää antaa täsmälleen saman muodon joka selaimessa.
   *
   * Yksiköt ovat samat kuin favicon.svg:ssä: 52 leveä, 46 korkea, palkki 8,
   * väli 3. Mittakaava tulee halutusta korkeudesta. */
  const MERKKI = [19.6, 34.8, 46, 28.4, 39.6];

  function merkki(g, x, alaviiva, korkeus) {
    const k = korkeus / 46;
    g.lineCap = "round";
    g.lineWidth = 8 * k;
    MERKKI.forEach((h, i) => {
      const kx = x + (i * 11 + 4) * k;
      g.strokeStyle = TIER_VARIT[i + 1];
      g.beginPath();
      g.moveTo(kx, alaviiva - 4 * k);
      g.lineTo(kx, alaviiva - (h - 4) * k);
      g.stroke();
    });
  }

  // Sanamerkki, pelimuoto ja pisteluku ovat molemmissa kuvissa samat.
  function otsikko(g, reuna, muoto) {
    let y = reuna + 44;
    merkki(g, reuna, y, 34);
    g.font = `800 52px ${NAYTA}`;
    g.fillStyle = "#f2ebdf";
    const x0 = reuna + 56;
    g.fillText("Hitti", x0, y);
    // Leveys on mitattava lihavalla fontilla, ei vaihdon jälkeen: kevyemmällä
    // mitattuna "Spotti" alkoi liian vasemmalta ja sanat menivät päällekkäin.
    const lev = g.measureText("Hitti").width;
    g.font = `400 52px ${NAYTA}`;
    g.fillText("Spotti", x0 + lev, y);

    y += 62;
    g.font = `400 34px ${NAYTA}`;
    g.fillStyle = "#8a8073";
    g.fillText(muoto, reuna, y);

    y += 176;
    g.font = `800 152px ${NAYTA}`;
    g.fillStyle = "#f2ebdf";
    const pisteet = fmt(state.score);
    g.fillText(pisteet, reuna, y);
    const pl = g.measureText(pisteet).width;
    g.font = `700 44px ${NAYTA}`;
    g.fillStyle = "#8a8073";
    g.fillText("pistettä", reuna + pl + 20, y);
    return y;
  }

  function alaosa(g, reuna, leveys, korkeus, teksti) {
    g.font = `700 38px ${NAYTA}`;
    g.fillStyle = "#8a8073";
    g.fillText(teksti, reuna, korkeus - reuna - 66);
    g.font = `700 40px ${NAYTA}`;
    g.fillStyle = "#5ecf9a";
    g.fillText("hittispotti.fi", reuna, korkeus - reuna);
  }

  function yhteenveto() {
    const s = { ...defaultStats(), ...store.get(AVAIN.biisi.stats, {}) };
    const eilen = new Date(); eilen.setDate(eilen.getDate() - 1);
    const putki = (s.lastDaily === todayKey() || s.lastDaily === dayKey(eilen)) ? s.streak : 0;
    const osumat = state.results.filter((r) => r.solved).length;
    const osat = [`${osumat}/${state.results.length} tunnistettu`];
    if (state.mode === "daily" && putki > 1) osat.push(`putki ${putki} päivää`);
    return osat.join("  ·  ");
  }

  // Päivän biisit: neliöt eivät paljasta mitään.
  function neliokuva() {
    const c = document.createElement("canvas");
    c.width = KUVA; c.height = KUVA;
    const g = c.getContext("2d");
    const reuna = 92;
    pohja(g, KUVA, KUVA);
    let y = otsikko(g, reuna, `Päivän biisit · ${dateLine(keyToDate(state.dayKey || todayKey()))}`);

    // Yksi rivi biisiä kohti, viisi ruutua eli viisi pätkän pituutta.
    y += 74;
    const koko = 62, vali = 16;
    state.results.forEach((r) => {
      STEPS.forEach((_, i) => {
        const osuma = i === r.step && r.solved;
        const kaytetty = i < r.step || (i === r.step && !r.solved);
        ruutu(g, reuna + i * (koko + vali), y, koko, osuma ? "#5ecf9a" : kaytetty ? "#3a332c" : null);
      });
      y += koko + vali;
    });
    alaosa(g, reuna, KUVA, KUVA, yhteenveto());
    return c;
  }

  /* Vapaa peli: kannet ja nimet mukaan. Korkeus 1440 eli 3:4. Kokeilin ensin
   * 1350:tä, mutta viidennen biisin vaikeustasorivi osui yhteenvetotekstiin. */
  const KUVA_LISTA = 1440;

  function listakuva(kannet) {
    const c = document.createElement("canvas");
    c.width = KUVA; c.height = KUVA_LISTA;
    const g = c.getContext("2d");
    const reuna = 92;
    pohja(g, KUVA, KUVA_LISTA);
    let y = otsikko(g, reuna, kausiNimi() || "Vapaa peli");

    y += 46;
    const kansi = 122, rivi = 148, tekstiX = reuna + kansi + 30;
    state.results.forEach((r, i) => {
      const s = r.song || state.byId.get(String(r.id)) || {};
      // Kansi, tai tyhjä laatikko jos sitä ei saatu ladattua.
      if (kannet[i]) g.drawImage(kannet[i], reuna, y, kansi, kansi);
      else { g.fillStyle = "#14120f"; g.fillRect(reuna, y, kansi, kansi); }

      const pisteet = r.solved ? "+" + fmt(r.points) : "0";
      g.font = `700 40px ${NAYTA}`;
      const pLev = g.measureText(pisteet).width;
      g.textAlign = "right";
      g.fillStyle = r.solved ? "#f2ebdf" : "#5b544a";
      g.fillText(pisteet, KUVA - reuna, y + 48);
      g.textAlign = "left";

      const tilaa = KUVA - reuna - tekstiX - pLev - 30;
      g.font = `700 42px ${NAYTA}`;
      g.fillStyle = "#f2ebdf";
      g.fillText(katkaise(g, s.title || "?", tilaa), tekstiX, y + 46);

      g.font = `400 34px ${NAYTA}`;
      g.fillStyle = "#8a8073";
      g.fillText(katkaise(g, `${s.artist || "?"} · ${s.year || ""}`.trim(), tilaa), tekstiX, y + 92);

      // Vaikeustason pallo ja nimi, sama merkintätapa kuin tulosnäkymässä.
      const vari = TIER_VARIT[s.tier] || "#8a8073";
      g.fillStyle = vari;
      g.beginPath(); g.arc(tekstiX + 8, y + 122, 8, 0, Math.PI * 2); g.fill();
      g.font = `400 30px ${NAYTA}`;
      g.fillStyle = "#857c6f";
      g.fillText(TIER_NAMES[s.tier] || "", tekstiX + 28, y + 132);
      y += rivi;
    });
    alaosa(g, reuna, KUVA, KUVA_LISTA, yhteenveto());
    return c;
  }

  // Liian pitkä nimi katkaistaan kolmeen pisteeseen eikä valu kuvan yli.
  function katkaise(g, teksti, tilaa) {
    if (g.measureText(teksti).width <= tilaa) return teksti;
    let t = teksti;
    while (t.length > 1 && g.measureText(t + "…").width > tilaa) t = t.slice(0, -1);
    return t + "…";
  }

  function ruutu(g, x, y, koko, tayte) {
    const r = 8;
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + koko, y, x + koko, y + koko, r);
    g.arcTo(x + koko, y + koko, x, y + koko, r);
    g.arcTo(x, y + koko, x, y, r);
    g.arcTo(x, y, x + koko, y, r);
    g.closePath();
    if (tayte) { g.fillStyle = tayte; g.fill(); }
    else { g.strokeStyle = "#2a2521"; g.lineWidth = 3; g.stroke(); }
  }

  /* Kuva tehdään valmiiksi heti kun tulosnäkymä avataan, ei vasta napista.
   * Näin jakoruutu aukeaa ilman odotusta eikä tyhjä kehys ehdi vilahtaa. */
  let kuvaLupaus = null, kuvaBlob = null;

  function valmisteleKuva() {
    kuvaLupaus = (async () => {
      const c = await tulosKuva();
      return await new Promise((r) => c.toBlob(r, "image/png"));
    })().catch(() => null);
  }

  const jaettavaOsoite = () => (location.protocol.startsWith("http")
    ? location.origin + location.pathname : "https://hittispotti.fi/");

  /* Postilinkit kootaan vasta selaimessa, ei kirjoiteta valmiiksi HTML:ään.
   * Sivun lähdekoodia haravoivat roskapostirobotit eivät aja JavaScriptiä,
   * joten osoite ei päädy niiden listoille aivan yhtä helposti. */
  const POSTI = ["hittispotti", "gmail.com"].join("@");

  /* Laite ja selain lyhyesti. Ensin viestiin liitettiin koko user agent,
   * mutta se vei puhelimen ruudulla viisi riviä ja näytti roskalta juuri
   * siinä kohdassa jossa ihmisen pitäisi kirjoittaa. Vikailmoituksesta
   * tarvitaan käytännössä vain versio ja karkea laite. */
  function laite() {
    const u = navigator.userAgent;
    const alusta = /iPhone/.test(u) ? "iPhone" : /iPad/.test(u) ? "iPad"
      : /Android/.test(u) ? "Android" : /Macintosh/.test(u) ? "Mac"
      : /Windows/.test(u) ? "Windows" : /Linux/.test(u) ? "Linux" : "tuntematon";
    // Järjestyksellä on väliä: Chrome iOS:ssä on CriOS, ja lähes kaikkien
    // selainten tunnisteessa lukee myös Safari.
    const selain = /CriOS|Chrome/.test(u) ? "Chrome" : /FxiOS|Firefox/.test(u) ? "Firefox"
      : /EdgiOS|Edg\//.test(u) ? "Edge" : /Safari/.test(u) ? "Safari" : "tuntematon";
    return `${alusta}, ${selain}`;
  }

  function postilinkki(aihe, runko) {
    return "mailto:" + POSTI + "?subject=" + encodeURIComponent(aihe)
      + "&body=" + encodeURIComponent(runko);
  }

  function asetaPalautelinkki() {
    const skripti = document.querySelector('script[src*="app.js"]');
    const versio = (skripti && (skripti.getAttribute("src").match(/v=(\d+)/) || [])[1]) || "?";
    // Kaksi tyhjää riviä alkuun: kohdistin on siinä missä kirjoittaminen
    // alkaa, eikä käyttäjän tarvitse ensin poistaa mitään.
    if (el.feedbackLink) {
      el.feedbackLink.href = postilinkki("HittiSpotti-palaute",
        `\n\n---\nversio ${TUOTEVERSIO} (${versio}) · ${laite()}`);
    }
    if (el.suggestLink) {
      el.suggestLink.href = postilinkki("Biisiehdotus",
        "Artisti:\nKappale:\n\nVoit ehdottaa useampaa kerralla.\n");
    }
  }

  /* ---------- Kotivalikkoon lisääminen ----------
   *
   * Kaksi täysin eri polkua, koska selaimet eivät ole tästä samaa mieltä.
   *
   * Androidin ja työpöydän Chrome antaa beforeinstallprompt-tapahtuman. Se
   * otetaan talteen ja käytetään vasta kun pelaaja painaa nappia, joten
   * asennusta ei tuputeta kesken pelin. Tapahtuman saa käyttää vain kerran.
   *
   * iOS:llä vastaavaa rajapintaa ei ole lainkaan, eikä sitä voi kiertää.
   * Siellä ainoa rehellinen keino on näyttää polku Safarin jakovalikkoon.
   * Siksi nappi ei lupaa asentavansa itse vaan sanoo mitä se tekee.
   */
  let asennusEle = null;

  function onkoAsennettu() {
    /* Kolme mittaria, koska yksikään ei kata kaikkia alustoja: standalone on
     * Applen oma, display-mode on standardi ja referrer paljastaa Androidin
     * sovelluskuoren. */
    return window.matchMedia("(display-mode: standalone)").matches
      || window.navigator.standalone === true
      || document.referrer.startsWith("android-app://");
  }

  function onkoIOS() {
    const u = navigator.userAgent;
    // iPadOS esittäytyy Macintoshina, joten se erottuu vain kosketuksesta.
    return /iPad|iPhone|iPod/.test(u)
      || (/Macintosh/.test(u) && navigator.maxTouchPoints > 1);
  }

  /* Chrome, Firefox ja Edge iOS:llä käyttävät samaa moottoria, mutta niistä
   * kotivalikkoon lisääminen ei onnistu. Ohjeen pitää osata sanoa sekin. */
  const onkoIOSSafari = () =>
    onkoIOS() && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(navigator.userAgent);

  function paivitaAsennusnappi() {
    if (!el.installBtn) return;
    el.installBtn.hidden = onkoAsennettu() || !(asennusEle || onkoIOS());
  }

  async function asennaTaiOhjeista() {
    if (!asennusEle) { avaaAsennusohje(); return; }
    /* Tapahtuma kuluu käytössä, joten se nollataan ennen kutsua. Jos pelaaja
     * perui, nappi katoaa: Chrome ei anna samaa tapahtumaa uudelleen, ja
     * nappi joka ei enää tee mitään on pahempi kuin puuttuva nappi. */
    const ele = asennusEle;
    asennusEle = null;
    ele.prompt();
    const valinta = await ele.userChoice.catch(() => ({ outcome: "dismissed" }));
    if (valinta.outcome !== "accepted") toast("Voit lisätä pelin myöhemmin selaimen valikosta.");
    paivitaAsennusnappi();
  }

  function avaaAsennusohje() {
    const safari = onkoIOSSafari();
    el.installSteps.hidden = !safari;
    el.installIntro.textContent = safari
      ? "Peli aukeaa omana sovelluksenaan ilman selaimen palkkeja, ja toimii myös ilman verkkoa."
      : "Kotivalikkoon lisääminen onnistuu iPhonella ja iPadilla vain Safarissa. Avaa hittispotti.fi Safarissa ja kokeile uudelleen.";
    el.installScrim.hidden = false;
    el.installSheet.hidden = false;
    el.body.classList.add("sheet-open");
    el.installClose.focus({ preventScroll: true });
  }

  function suljeAsennusohje() {
    el.installSheet.hidden = true;
    el.installScrim.hidden = true;
    el.body.classList.remove("sheet-open");
    el.installBtn.focus({ preventScroll: true });
  }

  /* ---------- Mitä uutta ---------- */

  function naytaUutta(palaava) {
    if (!UUTTA || store.get("uutta:nahty", null) === UUTTA.id) return;
    if (UUTTA.loppuu && todayKey() >= UUTTA.loppuu) return;
    /* Tyhjä tallennustila: ei näytetä, mutta EI myöskään merkitä nähdyksi.
     *
     * Aiemmin tässä merkittiin, jottei uusi pelaaja näkisi muutoslokia
     * myöhemmin. Se oli väärä päätelmä: tyhjä tallennustila ei tarkoita
     * uutta pelaajaa. Se tarkoittaa myös yksityistä ikkunaa ja selainta
     * jonka tiedot on tyhjennetty, ja puhelinselaimet siivoavat
     * sivustotietoja itsekseen. Yksi sellainen käynti poltti tiedotteen
     * lopullisesti, ja pelaaja jäi ilman vaikka oli pelannut kuukausia.
     *
     * Hinta toiseen suuntaan on pieni: uusi pelaaja näkee tiedotteen
     * toisella latauksellaan, koska äänenvoimakkuus tallentuu jo
     * ensimmäisellä. Se kertoo hänelle lähinnä että peliä kehitetään. */
    if (!palaava) return;
    /* Jos katalogin lataus kaatui, ruudulla on virheilmoitus. Tiedote sen
     * päällä olisi väärä asia väärään aikaan. Ei merkitä nähdyksi:
     * yritetään uudestaan seuraavalla kerralla. */
    if (state.view !== "game" && state.view !== "results") return;
    el.uuttaLista.innerHTML = UUTTA.kohdat.map((k) => `<li>${k}</li>`).join("");
    el.uuttaScrim.hidden = false;
    el.uuttaSheet.hidden = false;
    el.body.classList.add("sheet-open");
    el.uuttaSheet.focus({ preventScroll: true });
    /* Nähdyksi myös silloin kun tiedote on ollut ruudulla lukuajan verran.
     *
     * Pelkkä sulkemisesta merkitseminen jätti aukon: välilehden sulkeminen
     * ei ole sulkemista, joten se joka luki tiedotteen ja sulki välilehden
     * sai sen uudestaan joka käynnillä. Pelkkä näyttämisestä merkitseminen
     * taas poltti sen sekunnissa, kun service workerin vaihtuminen latasi
     * sivun alta. Lukuaika erottaa nämä kaksi: uudelleenlataus ei ehdi
     * sen sisään, mutta lukeminen ehtii. */
    clearTimeout(uuttaAjastin);
    uuttaAjastin = setTimeout(() => {
      uuttaAjastin = 0;
      /* Ehto on tarpeen, koska show() piilottaa avoimet ruudut näkymää
       * vaihdettaessa käymättä suljeUutan kautta. Ilman tätä ajastin
       * merkitsisi nähdyksi tiedotteen joka ei ole enää ruudulla. */
      if (UUTTA && !el.uuttaSheet.hidden) store.set("uutta:nahty", UUTTA.id);
    }, UUTTA_LUKUAIKA);
  }
  const UUTTA_LUKUAIKA = 6000;
  let uuttaAjastin = 0;

  /* Nähdyksi vasta suljettaessa, ei näytettäessä.
   *
   * Näytettäessä merkitseminen hävisi ensimmäisessä julkaisussa kokonaan:
   * sivupyyntö on verkko ensin, joten palaava pelaaja sai uuden app.js:n
   * heti, ja tiedote ehti näkyä. Sivua ohjasi silti vielä vanha service
   * worker, ja kun uusi otti ohjat, controllerchange latasi sivun
   * uudestaan. Merkintä oli jo tehty, joten tiedote välähti ruudulla
   * sekunnin ja katosi lopullisesti.
   *
   * Nyt nopea uudelleenlataus vain näyttää sen uudestaan: se ei ehdi
   * lukuajan sisään. Jos pelaaja sulkee välilehden heti lukematta, hän saa
   * sen vielä kerran, ja se on parempi suunta kuin kokonaan näkemättä
   * jääminen. Lukuajan verran ruudulla ollut tiedote taas on luettu, vaikkei
   * tätä kautta suljettaisi. */
  function suljeUutta() {
    clearTimeout(uuttaAjastin);
    uuttaAjastin = 0;
    if (UUTTA) store.set("uutta:nahty", UUTTA.id);
    el.uuttaSheet.hidden = true;
    el.uuttaScrim.hidden = true;
    el.body.classList.remove("sheet-open");
  }

  /* Sulkee sen ruudun joka sattuu olemaan auki.
   *
   * Escape kutsui ennen suoraan suljeJakoa, mikä oli oikein niin kauan kuin
   * ruutuja oli yksi. Asennusohjeen kanssa se jo riisui sheet-open-luokan
   * mutta jätti itse ohjeen ruudulle ilman taustahimmennystä. Kolmannen
   * ruudun kanssa arvailu loppuu tähän. */
  function suljeRuutu() {
    if (!el.shareSheet.hidden) suljeJako();
    else if (!el.installSheet.hidden) suljeAsennusohje();
    else if (!el.uuttaSheet.hidden) suljeUutta();
    else if (!el.aOhjeSheet.hidden) suljeArtistiOhje();
    else if (!el.aPaljastusSheet.hidden) suljeArtistiPaljastus();
    else el.body.classList.remove("sheet-open");
  }

  /* Kuuntelijat sidotaan heti moduulin latauessa eikä vasta käynnistyksessä:
   * beforeinstallprompt voi laueta ennen kuin peli on saanut katalogin
   * ladattua, ja myöhässä rekisteröity kuuntelija ei näkisi sitä lainkaan. */
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();  // estää Chromen oman kehotepalkin
    asennusEle = e;
    paivitaAsennusnappi();
  });
  window.addEventListener("appinstalled", () => {
    asennusEle = null;
    paivitaAsennusnappi();
    toast("Peli lisättiin aloitusnäyttöön.");
  });

  async function avaaJako() {
    el.sharePreview.hidden = true;
    if (!kuvaLupaus) valmisteleKuva();
    kuvaBlob = await kuvaLupaus;

    if (kuvaBlob) {
      if (el.shareImg.dataset.url) URL.revokeObjectURL(el.shareImg.dataset.url);
      const url = URL.createObjectURL(kuvaBlob);
      el.shareImg.dataset.url = url;
      el.shareImg.src = url;
      el.shareImg.hidden = false;
      /* Tiedostojako ei ole kaikkialla: työpöytäselaimissa se yleensä
       * puuttuu, ja silloin nappi on turha eikä sitä näytetä. */
      const tiedosto = new File([kuvaBlob], "hittispotti.png", { type: "image/png" });
      el.shareNative.hidden = !(navigator.canShare && navigator.canShare({ files: [tiedosto] }));
      el.shareCopyImg.hidden = !(window.ClipboardItem && navigator.clipboard && navigator.clipboard.write);
      /* Selite kertoo mitä kuvassa on, ja se riippuu pelimuodosta eikä
       * laitteen ominaisuuksista. Nämä menivät aiemmin sekaisin: vapaan pelin
       * kuvan alla luki että kuva ei paljasta biisejä, vaikka se listaa ne. */
      const osat = [state.mode === "daily"
        ? "Kuva ei paljasta biisejä, joten sen voi lähettää kenelle vain."
        : "Kuvassa näkyvät biisit. Vapaassa pelissä ne ovat jokaisella eri."];
      if (el.shareNative.hidden) osat.push("Tallenna painamalla kuvaa pitkään.");
      el.shareNote.textContent = osat.join(" ");
    } else {
      // Kuvaa ei saatu: näytetään tekstiversio, jotta jakaminen onnistuu silti.
      el.shareImg.hidden = true;
      el.shareNative.hidden = true;
      el.shareCopyImg.hidden = true;
      el.shareNote.textContent = "Kuvan luonti ei onnistunut tällä selaimella. Tulos tekstinä:";
      el.sharePreview.textContent = shareText();
      el.sharePreview.hidden = false;
    }

    el.shareScrim.hidden = false;
    el.shareSheet.hidden = false;
    el.body.classList.add("sheet-open");
    el.shareClose.focus({ preventScroll: true });
  }

  function suljeJako() {
    el.shareSheet.hidden = true;
    el.shareScrim.hidden = true;
    el.body.classList.remove("sheet-open");
    el.shareBtn.focus({ preventScroll: true });
  }

  async function jaaKuva() {
    if (!kuvaBlob) return;
    const tiedosto = new File([kuvaBlob], "hittispotti.png", { type: "image/png" });
    try {
      await navigator.share({ files: [tiedosto] });
      suljeJako();
    } catch (e) {
      // Käyttäjän oma peruutus ei ole virhe eikä ansaitse ilmoitusta.
      if (!e || e.name !== "AbortError") toast("Jakaminen ei onnistunut.");
    }
  }

  async function kopioiKuva() {
    if (!kuvaBlob) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": kuvaBlob })]);
      toast("Kuva kopioitu leikepöydälle.");
    } catch {
      toast("Kopiointi ei onnistunut. Paina kuvaa pitkään.");
    }
  }

  async function kopioiLinkki() {
    try {
      await navigator.clipboard.writeText(jaettavaOsoite());
      toast("Linkki kopioitu leikepöydälle.");
    } catch {
      toast("Kopiointi ei onnistunut.");
    }
  }

  function piilotaJako() {
    el.sharePreview.hidden = true;
    if (el.shareImg.dataset.url) {
      URL.revokeObjectURL(el.shareImg.dataset.url);
      delete el.shareImg.dataset.url;
      el.shareImg.removeAttribute("src");
    }
    kuvaBlob = null;
    kuvaLupaus = null;
  }

  /* ---------- Kerätty aineisto ----------
   * Kaksi eri asiaa, joista jälkimmäinen on arvokkaampi:
   *   arviot   – pelaajan oma arvio siitä miltä biisi tuntui (vapaaehtoinen)
   *   kierrokset – millä askeleella biisi tunnistettiin, vai luovutettiinko
   * Askel on käyttäytymistä eikä mielipidettä, ja se kertyy joka kierroksesta
   * ilman että pelaajalta kysytään mitään. Molemmat jäävät kokonaisina tähän
   * selaimeen, ja molemmista lähtee tilastopalvelimelle nimetön kooste, jos
   * pelaaja ei ole kytkenyt sitä pois.
   */
  const LOG_MAX = 3000;

  function logRound(r) {
    const log = store.get("kierrokset", []);
    const kierros = {
      id: r.song.id,
      taso: r.song.tier,
      askel: r.step,          // 0-4, eli 0,1 s ... 15 s
      osui: r.solved,
      pv: (state.mode === "daily" && state.dayKey) || todayKey(),
      tila: state.mode,
    };
    log.push(kierros);
    store.set("kierrokset", log.slice(-LOG_MAX));
    lahetaKierros(kierros);
  }

  /* Kierroksen lähetys tilastopalvelimelle.
   *
   * Tämä on ainoa asia jonka peli lähettää itsestään ulos. Mukana menee
   * biisi, taso, askel, osuiko ja pelimuoto. Ei tunnistetta, ei aikaleimaa,
   * ei mitään mikä yhdistäisi kaksi kierrosta samaan pelaajaan: palvelin
   * laskee vain koosteita. Päivämäärä jätetään pois tarkoituksella, koska
   * sitä ei tarvita eikä sitä siksi kuulu lähettää.
   *
   * sendBeacon on tähän oikea työkalu: se ei odota vastausta, ei hidasta
   * peliä, ja menee perille vaikka pelaaja sulkisi välilehden samalla
   * sekunnilla. text/plain pitää pyynnön "yksinkertaisena", jolloin selain
   * ei tee erillistä esikyselyä.
   *
   * Osoite on tyhjä kunnes palvelin on julkaistu; silloin tämä ei tee mitään
   * ja peli toimii täsmälleen kuten ennenkin. */
  /* HUOM: tämä rivi on pidettävä yhtenä merkkijonovakiona.
   * .github/workflows/testisivu.yml korvaa sen tyhjällä ja vaatii
   * osuman tasan kerran, joten ehtolauseeksi muutettuna testisivun
   * julkaisu kaatuisi. Paikallisuuden tarkistus on siksi omanaan
   * alempana eikä tässä. */
  const PALVELIN = "https://hittispotti-tilastot.hittispotti.workers.dev";

  const dataLupa = () => store.get("datalupa", true) !== false;

  /* Paikallinen kehitys ei kirjoita tuotannon tilastoihin.
   *
   * Testisivulta palvelimen osoite riisutaan julkaisussa, mutta
   * localhostissa app.js on sellaisenaan ja osoittaa tuotantoon. Ilman
   * tätä jokainen paikallinen läpipeluu kirjaisi rivin oikeisiin
   * lukuihin, ja ne luvut ovat se aineisto josta biisien vaikeustasot
   * johdetaan. */
  const PAIKALLINEN = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)
    || location.protocol === "file:";

  /* Saako palvelimelle puhua. Eri asia kuin dataLupa(), joka on
   * pelaajan oma valinta ja näkyy asetusruudun valintana: se ei saa
   * näyttää pois päältä olevalta vain siksi että kehitetään
   * paikallisesti. */
  const saaLahettaa = () => !!PALVELIN && !PAIKALLINEN && dataLupa();

  /* ---------- Vertailu muihin pelaajiin ----------
   *
   * Tulossivulla näkyy miten muut pärjäsivät saman päivän sarjassa. Luvut
   * ovat päiväkohtaisia: jokainen päivä on palvelimella oma rivinsä, ja
   * vertailu vaihtuu täsmälleen silloin kun biisitkin, koska molemmat
   * johdetaan samasta päivämäärästä.
   *
   * Kolme vaihetta, koska aamun ensimmäisillä ei ole vielä ketään johon
   * verrata. Ilman keskimmäistä pelaajat 2-19 jäisivät ilman mitään, eli
   * heidän näkymänsä olisi köyhempi kuin ensimmäisen.
   *
   *   1.      "Olit päivän ensimmäinen pelaaja!"
   *   2.-19.  "Olit päivän 7. pelaaja"
   *   20.->   keskiarvo ja oma sijoitus
   *
   * Luvut haetaan aina kun tulossivu avataan, myös sivun uudelleenlatauksen
   * jälkeen. Niinpä aamun ensimmäinen näkee keskiarvon myöhemmin päivällä
   * vain avaamalla sivun uudestaan, ilman että mitään kyselee taustalla.
   */
  /* Monesko pelaaja näkee ensimmäisenä keskiarvon. Sitä ennen näytetään
   * järjestysluku. Kymmenen on pieni otos, mutta vertailu kymmeneen on
   * pelaajalle kiinnostavampi kuin pelkkä järjestysluku, ja päivän biisit
   * ovat kaikille samat joten luku on silti vertailukelpoinen. */
  const VERTAILU_RAJA = 11;
  const KORI = 500;           // sama koriväli kuin palvelimella

  function vertailuKey(key) { return AVAIN.biisi.vertailu(key); }

  /* Lähetetään vain kerran päivää kohti ja vain jos pelaaja sallii sen.
   * Vastaus sisältää järjestysluvun ja koko koosteen, joten tulossivu saa
   * kaiken tarvitsemansa yhdellä pyynnöllä. */
  async function lahetaPaiva(key, pisteet) {
    if (!saaLahettaa()) return null;
    try {
      const v = await fetch(PALVELIN + "/paiva", {
        method: "POST",
        body: JSON.stringify({ paiva: key, pisteet }),
        headers: { "content-type": "text/plain" },
      });
      if (!v.ok) return null;
      const d = await v.json();
      /* Järjestysluku talteen: se on tosiasia siitä hetkestä, eikä sitä voi
       * laskea jälkikäteen. Ilman tallennusta se katoaisi uudelleen-
       * latauksessa, vaikka "olit päivän ensimmäinen" on juuri se asia joka
       * kannattaa säilyttää. */
      if (Number.isInteger(d.sija)) store.set(vertailuKey(key), { sija: d.sija });
      return d;
    } catch { return null; }
  }

  async function haePaiva(key) {
    if (!saaLahettaa()) return null;
    try {
      const v = await fetch(PALVELIN + "/paiva?p=" + encodeURIComponent(key));
      return v.ok ? await v.json() : null;
    } catch { return null; }
  }

  /* Päivän artisti kirjoittaa omaan päätepisteeseensä eikä /paiva-reittiin.
   * Tulos on eri asia: monellako arvauksella artisti ratkesi, ei montako
   * pistettä sarjasta tuli. Samaan reittiin pakotettuna kahden pelin
   * keskiarvot sekoittuisivat.
   *
   * arvauksia on 1-6 jos artisti ratkesi ja 0 jos ei ratkennut. */
  async function lahetaArtisti(key, arvauksia) {
    if (!saaLahettaa()) return null;
    try {
      const v = await fetch(PALVELIN + "/artisti", {
        method: "POST",
        body: JSON.stringify({ paiva: key, arvauksia }),
        headers: { "content-type": "text/plain" },
      });
      if (!v.ok) return null;
      const d = await v.json();
      if (Number.isInteger(d.sija)) {
        store.set(AVAIN.artisti.vertailu(key), { sija: d.sija });
      }
      return d;
    } catch { return null; }
  }

  async function haeArtisti(key) {
    if (!saaLahettaa()) return null;
    try {
      const v = await fetch(PALVELIN + "/artisti?p=" + encodeURIComponent(key));
      return v.ok ? await v.json() : null;
    } catch { return null; }
  }

  /* Muiden keskiarvo, ei kaikkien. Oma tulos vähennetään pois, jolloin sana
   * "muut" pitää kirjaimellisesti paikkansa eikä vain suunnilleen. */
  function vertailuTeksti(d, omat, sija) {
    if (!d || !d.n) return "";
    if (d.n < VERTAILU_RAJA) {
      if (sija === 1) return "Olit päivän ensimmäinen pelaaja!";
      return sija ? `Olit päivän ${sija}. pelaaja.` : "";
    }
    const muita = d.n - 1;
    const ka = Math.round((d.summa - omat) / muita);
    /* Korit ovat 500 pisteen levyisiä, joten oman korin sisällä olevia ei
     * lasketa kummallekaan puolelle. Alaspäin pyöristäminen on rehellisempi
     * kuin puolittaminen: "parempi kuin 78 %" ei saa olla liioiteltu. */
    const omaKori = Math.min(Math.floor(omat / KORI), d.k.length - 1);
    const alle = d.k.slice(0, omaKori).reduce((a, b) => a + b, 0);
    const osuus = Math.round((100 * alle) / muita);
    /* Ei sanaa "tänään". Sarja joka aloitetaan ennen keskiyötä ja pelataan
     * loppuun sen jälkeen kuuluu edelliselle päivälle, ja silloin "tänään"
     * olisi väärin. Päivä lukee joka tapauksessa tulossivun otsikossa, joten
     * sitä ei tarvitse toistaa tässä. */
    const alku = sija === 1 ? "Olit päivän ensimmäinen pelaaja! " : "";
    return `${alku}Muut saivat keskimäärin ${fmt(ka)} p. Olit parempi kuin ${osuus} %.`;
  }

  /* Haetaan aina kun tulossivu avataan. Kutsu voi mennä päällekkäin, jos
   * pelaaja pomppii näkymien välillä, joten viimeisenä alkanut voittaa:
   * vanhemman vastaus ei saa kirjoittaa uudempaa yli. */
  let vertailuVuoro = 0;
  async function paivitaVertailu() {
    const el2 = el.resultsVertailu;
    if (!el2) return;
    if (state.mode !== "daily" || !saaLahettaa()) { el2.hidden = true; return; }
    const key = state.dayKey || todayKey();
    const oma = store.get(AVAIN.biisi.tulos(key), null);
    if (!oma) { el2.hidden = true; return; }

    const vuoro = ++vertailuVuoro;
    const d = await haePaiva(key);
    if (vuoro !== vertailuVuoro) return;
    const sija = (store.get(vertailuKey(key), null) || {}).sija;
    const teksti = vertailuTeksti(d, oma.score, sija);
    el2.textContent = teksti;
    el2.hidden = !teksti;
  }

  /* Vapaan pelin kierroksista lähetetään vain osa.
   *
   * Tietokannan ilmaisella tasolla saa kirjoittaa 100 000 riviä
   * vuorokaudessa. Kävijämäärä kasvoi kahdessa päivässä parista kymmenestä
   * tuhansiin, ja raja tuli täyteen kesken illan: mitattu vauhti oli noin
   * 18 prosenttiyksikköä tunnissa.
   *
   * Vapaa peli on noin neljä viidesosaa kaikista kierroksista, koska sitä
   * voi pelata putkeen niin monta sarjaa kuin jaksaa. Päivän sarjan saa
   * kukin kerran. Karsinta osuu siis sinne missä kierroksia on eniten.
   *
   * Päivän sarja lähetetään aina, koska se on myös laadukkaampaa aineistoa:
   * kaikki saavat saman biisin, yhden yrityksen, ja se lasketaan putkeen.
   * Vapaasta pelistä riittää joka kolmas, koska biisin vaikeus on osuus
   * eikä summa; otanta hidastaa kertymistä muttei vinouta sitä.
   *
   * Kolmasosa on arvio eikä laki. Jos raja tulee silti vastaan, pienennä;
   * jos tilaa jää, kasvata. */
  const VAPAA_OTANTA = 3;

  function lahetaKierros(k) {
    if (!saaLahettaa()) return;
    if (k.tila === "free" && Math.floor(Math.random() * VAPAA_OTANTA) !== 0) return;
    const runko = JSON.stringify({
      id: k.id, taso: k.taso, askel: k.askel, osui: k.osui, tila: k.tila,
    });
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(PALVELIN + "/kierros", new Blob([runko], { type: "text/plain" }));
        return;
      }
      // Vanhemmat selaimet: keepalive tekee saman kuin sendBeacon.
      fetch(PALVELIN + "/kierros", {
        method: "POST", body: runko, keepalive: true,
        headers: { "content-type": "text/plain" },
      }).catch(() => {});
    } catch { /* tilastointi ei koskaan riko peliä */ }
  }

  /* Pelaajan oma vaikeusarvio ("Miltä tämä tuntui?") on poistettu.
   *
   * Se oli toinen signaali samasta biisistä: askel kertoi mitä pelaaja
   * teki, arvio mitä hän ajatteli. Käytännössä tasot on kuitenkin johdettu
   * mitatusta vaikeudesta, ja paljastuksesta tarvittiin pystysuora tila
   * mainokselle. Palvelimen /arvio-päätepiste on yhä olemassa eikä sinne
   * enää lähetetä mitään.
   *
   * Selaimeen aiemmin tallennetut arviot jäävät avaimen "arviot" alle.
   * Niitä ei lueta enää mistään, mutta niitä ei myöskään poisteta: ne ovat
   * pelaajan omaa dataa eikä niiden hävittämiseen ole syytä. */

  /* ---------- Mainokset ----------
   *
   * Mainokset ovat pois päältä niin kauan kuin MAINOS_PAIKAT on tyhjä.
   * Tyhjä paikka ohitetaan ennen kuin skriptiä edes pyydetään, joten
   * selaimesta ei lähde mitään Googlelle eikä evästeitä voi syntyä. Sama
   * ehto antaa ottaa paikat käyttöön yksi kerrallaan.
   *
   * Julkaisijatunnus saa siis olla täytettynä jo ennen sitä. Se ei ole
   * salaisuus: se on tarkoitettu näkymään jokaisen mainosta näyttävän
   * sivun lähdekoodissa ja se on myös ads.txt-tiedostossa.
   *
   * ENNEN KUIN PAIKAT TÄYTETÄÄN, kaksi asiaa on oltava kunnossa:
   *   1. AdSensen suostumusikkuna (Privacy & messaging) päällä ETA-alueelle
   *   2. ohjeiden tietosuojakohta kirjoitettu uusiksi, koska siinä lukee
   *      yhä "Ei evästeitä ... Siksi tämä sivu ei tarvitse evästeilmoitusta"
   *
   * Suostumusta ei kysytä tässä koodissa. AdSensen oma suostumusikkuna
   * (Privacy & messaging) hoitaa ETA-alueen vaatimuksen, ja se tulee samasta
   * skriptistä. Omatekoinen ikkuna olisi sekä turha että riski: Google
   * vaatii sertifioidun ikkunan, eikä oma sellainen ole.
   *
   * HUOM: tämä on eri asia kuin dataLupa(). Se koskee pelin omaa
   * tilastolähetystä, ja sen sulkeminen ei saa sulkea mainoksia: pelaajalle
   * luvataan siinä vain että vaikeustasodata jää lähettämättä. */
  const MAINOS_JULKAISIJA = "ca-pub-2029070076507506";
  const MAINOS_PAIKAT = { peli: "", tulos: "" };  // AdSensen slot-tunnukset
  const MAINOS_SKRIPTI =
    "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js";

  /* Paikanvaraaja ulkoasun katsomista varten. Päälle osoitteen perään
   * ?mainos=1. Se ei lataa mitään ulkopuolelta eikä jätä jälkeä mihinkään,
   * joten sen voi näyttää myös tuotannossa ilman seurauksia. */
  const mainosEsikatselu = new URLSearchParams(location.search).get("mainos") === "1";

  const mainoksetPaalla = () => !!MAINOS_JULKAISIJA || mainosEsikatselu;
  const mainosAlustetut = new Set();
  let mainosSkriptiPyydetty = false;

  /* Skripti ladataan vasta kun ensimmäistä mainosta tarvitaan, ei sivun
   * latauksessa. Mainos on joka tapauksessa vierityksen takana, joten
   * etusivun ei tarvitse odottaa sitä, ja peli pysyy yhtä nopeana kuin
   * ennenkin niille jotka eivät vieritä alas. */
  function lataaMainosskripti() {
    if (mainosSkriptiPyydetty || !MAINOS_JULKAISIJA) return;
    mainosSkriptiPyydetty = true;
    const s = document.createElement("script");
    s.async = true;
    s.src = MAINOS_SKRIPTI + "?client=" + encodeURIComponent(MAINOS_JULKAISIJA);
    s.crossOrigin = "anonymous";
    document.head.appendChild(s);
  }

  /* Alustus vain kerran paikkaa kohden.
   *
   * Paljastus näytetään ja piilotetaan viisi kertaa sarjan aikana, ja
   * adsbygoogle.push() heittää virheen jos sama ins-elementti työnnetään
   * toistamiseen ("already have ads in them"). Siksi paikka täytetään
   * ensimmäisellä kerralla ja jätetään sen jälkeen rauhaan. Käytännössä
   * sama mainos näkyy koko sarjan ajan, mikä on myös AdSensen sääntöjen
   * mukainen tapa: mainosta ei saa virkistää itse kesken katselun. */
  function naytaMainos(nimi) {
    if (!mainoksetPaalla()) return;
    const kuori = nimi === "peli" ? el.mainosPeli : el.mainosTulos;
    const tila = nimi === "peli" ? el.mainosPeliTila : el.mainosTulosTila;
    if (!kuori || !tila) return;
    if (mainosAlustetut.has(nimi)) { kuori.hidden = false; return; }

    /* Esikatselu voittaa aina. Ehto oli ennen "&& !MAINOS_JULKAISIJA",
     * jolloin ?mainos=1 lakkasi toimimasta heti kun tunnus täytettiin, eikä
     * ulkoasua olisi enää päässyt katsomaan ilman oikeita mainoksia. */
    if (mainosEsikatselu) {
      const laatikko = document.createElement("div");
      laatikko.className = "mainos-esikatselu";
      laatikko.textContent = "Mainospaikka (" + nimi + ")";
      tila.appendChild(laatikko);
      mainosAlustetut.add(nimi);
      kuori.hidden = false;
      return;
    }

    const paikka = MAINOS_PAIKAT[nimi];
    if (!paikka) return;        // paikka ei vielä käytössä
    lataaMainosskripti();
    const ins = document.createElement("ins");
    ins.className = "adsbygoogle";
    ins.style.display = "block";
    ins.dataset.adClient = MAINOS_JULKAISIJA;
    ins.dataset.adSlot = paikka;
    ins.dataset.adFormat = "auto";
    ins.dataset.fullWidthResponsive = "true";
    tila.appendChild(ins);
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
      mainosAlustetut.add(nimi);
      kuori.hidden = false;
    } catch {
      /* Mainoksen kaatuminen ei saa kaataa peliä: jos push epäonnistuu,
       * paikka jää piiloon eikä sitä yritetä uudestaan. */
      ins.remove();
    }
  }

  /* Ohjeiden "mainoksia ei vielä näytetä" pois heti kun jokin paikka on
   * täytetty. Tämä ajetaan kerran käynnistyksessä, ks. init. Esikatselu ei
   * laske: ?mainos=1 näyttää vain paikanvaraajan, ei oikeaa mainosta. */
  function paivitaMainosteksti() {
    if (!el.mainosEiViela) return;
    const kaytossa = Object.values(MAINOS_PAIKAT).some((p) => !!p);
    el.mainosEiViela.hidden = kaytossa;
  }

  /* Paikka piiloon kun paljastus sulkeutuu. Sisältö jää DOM:iin, joten
   * mainosta ei alusteta uudestaan, vain kuori piilotetaan. */
  function piilotaMainos(nimi) {
    const kuori = nimi === "peli" ? el.mainosPeli : el.mainosTulos;
    if (kuori) kuori.hidden = true;
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
    const already = !!store.get(AVAIN.biisi.tulos(key), null);
    store.remove(progressKey(key));
    store.set(AVAIN.biisi.tulos(key), {
      score: state.score,
      results: state.results.map((r) => ({ id: r.id, step: r.step, points: r.points, solved: r.solved })),
    });
    if (already) return;   // sama päivä kirjataan tilastoihin vain kerran
    track("paiva-valmis");
    /* Tulos palvelimelle vertailua varten, saman kerran-päivässä-vartion
     * takana kuin muutkin kirjaukset. Vastaus päivittää tulossivun heti,
     * joten ensimmäinen näkymä ei odota erillistä hakua. */
    lahetaPaiva(key, state.score).then((d) => {
      if (!d || state.view !== "results") return;
      const teksti = vertailuTeksti(d, state.score, d.sija);
      el.resultsVertailu.textContent = teksti;
      el.resultsVertailu.hidden = !teksti;
    });
    const stats = { ...defaultStats(), ...store.get(AVAIN.biisi.stats, {}) };
    stats.dailyPlayed += 1;
    stats.dailyTotal += state.score;
    stats.dailyBest = Math.max(stats.dailyBest, state.score);
    stats.dailySolved += state.results.filter((r) => r.solved).length;
    // Edellinen päivä lasketaan sarjan omasta päivästä, ei kellosta.
    const y = keyToDate(key); y.setDate(y.getDate() - 1);
    stats.streak = stats.lastDaily === dayKey(y) ? stats.streak + 1 : 1;
    stats.bestStreak = Math.max(stats.bestStreak, stats.streak);
    stats.lastDaily = key;
    store.set(AVAIN.biisi.stats, stats);
  }

  function saveFree() {
    const stats = { ...defaultStats(), ...store.get(AVAIN.biisi.stats, {}) };
    stats.freeGames += 1;
    stats.freeRounds += state.results.length;
    stats.freeSolved += state.results.filter((r) => r.solved).length;
    stats.freeTotal += state.score;
    stats.freeBestRun = Math.max(stats.freeBestRun, state.score);
    store.set(AVAIN.biisi.stats, stats);
  }

  function renderStats() {
    const s = { ...defaultStats(), ...store.get(AVAIN.biisi.stats, {}) };
    const todayDone = !!store.get(AVAIN.biisi.tulos(todayKey()), null);
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

  /* Nollaus koskee tilastoja ja menneiden päivien tuloksia – ei enempää.
   *
   * Aiemmin tämä pyyhki kaikki avaimet, myös kierroslokin ja omat
   * vaikeusarviot, eikä varmistusteksti maininnut niitä lainkaan: nappi
   * hävitti hiljaa kerätyn datan ja lupasi tehdä jotain vaatimattomampaa.
   *
   * Myös tämän päivän tulos jää. Se ei estä uudelleenpelaamista – yksityinen
   * ikkuna tai toinen selain ajaa saman asian, eikä sitä voi selaimessa
   * pyörivässä pelissä estää – mutta poistaa vahingossa tapahtuvan reitin ja
   * tekee napista sen mitä sen nimi lupaa. */
  function resetStats() {
    if (!confirm("Nollataanko tilastot ja aiempien päivien tulokset? Kerätty pelidata säilyy.")) return;
    /* Molemmat pelit kerralla: nappi lupaa nollata tilastot, ei vain
     * biisipelin tilastot. Ilman PELIT-silmukkaa artistipelin tulokset
     * jäisivät jäljelle eikä kukaan huomaisi sitä ennen kuin putki
     * näyttäisi väärää lukua. */
    for (const peli of PELIT) {
      const a = AVAIN[peli];
      const tanaan = a.tulos(todayKey());
      const alku = a.etuliite + "daily:";
      for (const key of store.keys()) {
        if (!omaAvain(peli, key)) continue;
        const menneetTulokset = key.startsWith(alku) && key !== tanaan
                                && !key.endsWith(":kesken");
        if (key === a.stats || menneetTulokset) store.remove(key);
      }
    }
    renderStats();
    refreshDrawer();
    toast("Tilastot nollattu.");
  }

  // ---------- Navigointi ----------
  async function go(target) {
    /* Vuosikymmennapista voi olla kokoaminen kesken. Pelaajan oma valinta
     * valikosta voittaa sen aina: ilman tätä Tilastot tai Päivän biisit
     * vaihtuisi kolmannessa sekunnissa vapaaksi peliksi. */
    peruSarjanKokoaminen();
    // Vapaan pelin nollaus: uusi sarja kesken pelin. Varmistetaan vain, jos
    // jotain oikeasti menetetään.
    if (target === "refree") {
      if (freeStarted() && !confirm("Sarja alkaa alusta ja pisteet nollautuvat. Jatketaanko?")) return;
      closeDrawer();
      stopPlayback();
      // Rajaus pysyy: "alusta" tarkoittaa uutta sarjaa, ei paluuta koko
      // katalogiin.
      await startFree();
      toast("Uusi sarja.");
      return;
    }
    /* Varmistus vain siitä mikä oikeasti menetetään.
     *
     * Aiemmin tämä kysyttiin kummastakin pelimuodosta poistuttaessa, mikä oli
     * päivän pelissä yksinkertaisesti valhe: päivän sarja tallennetaan joka
     * ohituksen, arvauksen ja biisin vaihdon jälkeen, ja se palautuu samasta
     * kohdasta samoilla pisteillä. Vapaata sarjaa ei tallenneta lainkaan, eli
     * vain se katoaa. Väärä varoitus on pahempi kuin puuttuva: se opettaa
     * ohittamaan varoitukset lukematta, jolloin oikeakaan ei enää pysäytä. */
    /* Kausivalinnalla ei ole enää omaa kohdettaan. Napit eivät aloita mitään,
     * joten niitä ei tarvitse varmistaa: rajauksen muuttaminen kesken sarjan
     * ei tee sarjalle yhtään mitään ennen kuin "Vapaa peli" painetaan, ja
     * silloin varmistus tulee tätä kautta niin kuin ennenkin. */
    if (target === "daily" || target === "free") {
      // Vapaa peli vapaan pelin päälle aloittaa uuden sarjan, ei vaihda muotoa.
      const uusiVapaa = target !== "daily" && state.mode === "free";
      if (freeStarted() && !confirm(uusiVapaa
        ? "Sarja alkaa alusta ja pisteet nollautuvat. Jatketaanko?"
        : "Kesken oleva vapaa sarja menetetään. Vaihdetaanko?")) return;
    }
    closeDrawer();
    stopPlayback();
    if (target === "daily") await startDaily();
    else if (target === "free") await startFree();
    else if (target === "artisti") await avaaArtisti();
    else if (target === "artistitulos") await avaaArtistiTulos();
    else if (target === "stats") show("stats");
    else if (target === "help") show("help");
    else if (target === "back") show(state.rounds.length ? "game" : "results");
  }

  // ---------- Tapahtumat ----------
  function bind() {
    el.menuBtn.addEventListener("click", () => {
      if (el.body.classList.contains("drawer-open")) closeDrawer();
      else openDrawer();
    });
    if (el.aani) {
      el.aani.value = Math.round(aaniTaso() * 100);
      asetaAani(aaniTaso());
      // input eikä change: taso seuraa sormea, jotta muutoksen kuulee heti.
      el.aani.addEventListener("input", () => asetaAani(Number(el.aani.value) / 100));
    }
    // Ikkunan koon muutos vaihtaa palkin luonteen kesken kaiken.
    LEVEA.addEventListener("change", paivitaPalkki);
    paivitaPalkki();
    el.drawerClose.addEventListener("click", closeDrawer);
    el.scrim.addEventListener("click", closeDrawer);
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      // Ruutu on päällimmäisenä, joten se sulkeutuu ensin.
      if (el.body.classList.contains("sheet-open")) suljeRuutu();
      else if (el.body.classList.contains("drawer-open")) closeDrawer();
    });

    document.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => go(b.dataset.go)));
    /* Napit eivät kulje go():n kautta, koska ne eivät navigoi mihinkään:
     * ne kääntävät suodattimen päälle tai pois ja jättävät valikon auki,
     * jotta seuraavan vuosikymmenen voi valita samalla käynnillä. */
    document.querySelectorAll("[data-kausi]").forEach((b) =>
      b.addEventListener("click", () => vaihdaKausi(b.dataset.kausi)));

    el.playBtn.addEventListener("click", () => {
      if (audio.playing) { stopPlayback(); return; }
      playClip(cur().finished ? STEPS[STEPS.length - 1] : STEPS[cur().step]);
    });
    el.replayBtn.addEventListener("click", () => {
      if (audio.playing) { stopPlayback(); return; }
      playClip(STEPS[STEPS.length - 1]);
    });
    el.retryBtn.addEventListener("click", loadAndStart);
    asetaPalautelinkki();
    if (el.dataConsent) {
      el.dataConsent.checked = dataLupa();
      el.dataConsent.addEventListener("change", () => {
        store.set("datalupa", el.dataConsent.checked);
        toast(el.dataConsent.checked
          ? "Kiitos. Kierrokset auttavat tasojen tarkentamisessa."
          : "Selvä, mitään ei enää lähetetä.");
      });
    }
    el.input.addEventListener("focus", updateSearchMode);
    el.input.addEventListener("blur", updateSearchMode);
    /* Toiseen sovellukseen siirtyminen katkaisee äänen iOS:ssä. Kaksi asiaa
     * meni tässä pieleen: soitto jäi päälle omassa kirjanpidossamme, jolloin
     * ensimmäinen painallus paluun jälkeen tulkittiin pysäytykseksi eikä
     * mitään soinut, ja itse äänikonteksti jäi keskeytettyyn tilaan josta se
     * ei toivu pelkällä herätyksellä. Siksi soitto pysäytetään siististi
     * poistuttaessa ja konteksti merkitään uusittavaksi. */
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) { stopPlayback(); audio.revive = true; }
    });
    // Näppäimistön avautuminen ja sulkeutuminen muuttaa näkyvää aluetta.
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", updateSearchMode);
      window.visualViewport.addEventListener("scroll", updateSearchMode);
    }
    window.addEventListener("resize", updateSearchMode);
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
    el.shareBtn.addEventListener("click", avaaJako);
    el.shareClose.addEventListener("click", suljeJako);
    el.shareScrim.addEventListener("click", suljeJako);
    el.shareNative.addEventListener("click", jaaKuva);
    el.shareCopyImg.addEventListener("click", kopioiKuva);
    el.shareCopyLink.addEventListener("click", kopioiLinkki);
    el.installBtn.addEventListener("click", asennaTaiOhjeista);
    el.installClose.addEventListener("click", suljeAsennusohje);
    el.installScrim.addEventListener("click", suljeAsennusohje);
    el.uuttaClose.addEventListener("click", suljeUutta);
    el.uuttaScrim.addEventListener("click", suljeUutta);
    el.uuttaOk.addEventListener("click", suljeUutta);
    // Rajaus elää tilassa, joten "uusi sarja" saa sen mukaansa itsestään.
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
    for (const peli of PELIT) {
      const a = AVAIN[peli];
      const today = a.kesken(todayKey());
      const alku = a.etuliite + "daily:";
      store.keys()
        .filter((k) => omaAvain(peli, k) && k.startsWith(alku)
                       && k.endsWith(tag) && k !== today)
        .forEach((k) => store.remove(k));
    }
  }

  /* Virheteksti pelaajan kielellä. Selaimen oma viesti ("Failed to fetch")
   * on englantia eikä kerro mitä tehdä, joten se jää konsoliin. */
  function loadErrorText(err) {
    if (location.protocol === "file:") {
      return "Selain ei salli katalogi.json-tiedoston lukemista suoraan levyltä. "
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
      await startDaily();    // sivu avautuu suoraan päivän peliin
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
    /* Onko tämä selain käynyt täällä ennen. Luettava tässä, ennen kuin peli
     * ehtii kirjoittaa mitään omaa: myöhemmin jokainen selain näyttäisi
     * palaavalta. migrateStore on ajettu, joten vanhan nimen alla olleet
     * tiedot lasketaan mukaan. */
    const palaava = store.keys().length > 0;
    pruneProgress();
    lataaKaudet();
    paivitaMainosteksti();
    bind();
    await loadAndStart();
    naytaUutta(palaava);
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

  /* Auki jäänyt välilehti näytti eri biisit kuin muut.
   *
   * Peli lupaa että päivän viisi biisiä ovat kaikilla samat. Lupaus pettää
   * kahdella tavalla, ja molemmat koskevat välilehteä jota ei ole ladattu
   * uudelleen. Vuorokausi voi vaihtua auki olevassa välilehdessä, jolloin
   * se laskee uuden päivän mutta vanhasta muistissa olevasta tilasta. Ja
   * katalogi voi vaihtua julkaisussa, jolloin pakan sekoitus menee uusiksi.
   *
   * Jälkimmäinen sattui oikeasti: kaksi pelaajaa samassa huoneessa sai eri
   * biisit, koska toinen oli päivittänyt sivun ja toinen ei. Se on pelin
   * ydinlupauksen kannalta pahin mahdollinen vika, koska yhdessä pelaaminen
   * on koko päivän sarjan idea.
   *
   * Molemmat korjaantuvat lataamalla sivu uudelleen. Päivän sarja
   * tallennetaan joka toiminnon jälkeen, joten lataus ei hävitä siitä
   * mitään. Vapaa sarja ei tallennu, joten sen aikana lataus jää odottamaan
   * eikä vie kesken olevaa peliä.
   */
  const AVATTU_PAIVA = todayKey();
  /* Onko jokin service worker jo ohjannut tätä sivua.
   *
   * Tämä ei voi olla latauksessa luettu vakio. Ensimmäisellä käynnillä
   * ohjausta ei vielä ole kun skripti ajetaan, joten vakio jäisi pysyvästi
   * epätodeksi ja versiovahti olisi poissa päältä koko välilehden iän.
   * Mitattu: testi jäi versioon 103 vaikka 104 oli jo palvelimella. Siksi
   * lippua päivitetään: ensimmäinen ohjauksen vaihto on asennus eikä
   * vanhentuminen, seuraavat ovat uusi versio. */
  let onOhjattu = !!(navigator.serviceWorker && navigator.serviceWorker.controller);
  let latausOdottaa = false;

  function lataaUudelleen() {
    /* Kesken olevaa vapaata sarjaa ei viedä alta. Lataus tehdään heti kun se
     * on ohi; tarkistus toistuu minuutin välein.
     *
     * Sama koskee auki olevaa ruutua. Verkko ensin -navigoinnin takia uusi
     * versio on sivulla jo ennen kuin uusi service worker ottaa ohjat, eli
     * Mitä uutta ehti näkyä sekunnin ennen kuin controllerchange latasi
     * sivun alta pois. Luettavana oleva teksti ei saa kadota kesken
     * lauseen, ja lataus odottaa siihen asti kun ruutu suljetaan. */
    if (freeStarted() || el.body.classList.contains("sheet-open")) {
      latausOdottaa = true;
      return;
    }
    location.reload();
  }

  function tarkistaTuoreus() {
    if (document.hidden) return;
    if (todayKey() !== AVATTU_PAIVA || latausOdottaa) { lataaUudelleen(); return; }
    /* Uusi versio: pyydetään selainta tarkistamaan sw.js. Jos uusi asentuu,
     * se ottaa ohjat heti (skipWaiting) ja controllerchange laukeaa. Pyyntö
     * on ehdollinen ja sw.js on pari kilotavua, joten tämä ei maksa mitään. */
    if (navigator.serviceWorker && navigator.serviceWorker.getRegistration) {
      navigator.serviceWorker.getRegistration()
        .then((r) => r && r.update())
        .catch(() => { /* verkotta ei tarkisteta, peli jatkuu */ });
    }
  }

  document.addEventListener("visibilitychange", tarkistaTuoreus);
  window.addEventListener("pageshow", tarkistaTuoreus);
  /* Näkyvissä oleva välilehti ei laukaise visibilitychangea lainkaan, joten
   * vuorokauden vaihtuminen on tarkistettava myös kellosta. Pelkkä
   * paikallinen vertailu, ei verkkoa. */
  setInterval(tarkistaTuoreus, 60000);

  if (navigator.serviceWorker) {
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      // Ensimmäisellä käynnillä ohjaus siirtyy kerran ilman että mikään
      // vanheni. Vain aidosti vaihtunut versio saa ladata sivun uudelleen.
      if (onOhjattu) lataaUudelleen();
      else onOhjattu = true;
    });
  }
})();
