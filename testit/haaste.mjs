/* Kaverihaasteen testit.
 *
 *   node testit/haaste.mjs             (projektin juuresta)
 *
 * Funktiot luetaan app.js:stä eikä kopioida tänne, samasta syystä kuin
 * muissakin testeissä: kopio vanhenisi huomaamatta.
 *
 * Miksi tämä on testattu: haasteen koko idea on että sama linkki antaa
 * samat biisit. Jos se pettää, kaksi kaveria pelaa eri sarjaa ja vertaa
 * pisteitä jotka eivät ole vertailukelpoisia. Mikään ruudulla ei kertoisi
 * siitä, koska kumpikin näkee vain oman sarjansa.
 */
import fs from "node:fs";
import { execSync } from "node:child_process";
const src = fs.readFileSync("app.js", "utf8");
const pala = (h) => { const m = src.match(h); if (!m) throw new Error("ei löytynyt " + h); return m[0]; };
const kat = JSON.parse(fs.readFileSync("katalogi.json", "utf8"));

const koodi = `
  const state = { pool: POOL };
  ${pala(/  const TIER_CYCLE = \[[^\]]*\];/)}
  ${pala(/  const KAUDET = \[[\s\S]*?\n  \];/)}
  ${pala(/function hashString\(str\) \{[\s\S]*?\n  \}/)}
  ${pala(/  const KAUSI_VANHA = [^\n]*/)}
  ${pala(/  const puraVanhaKausi = [\s\S]*?\);\n/)}
  ${pala(/function mulberry32\(seed\) \{[\s\S]*?\n  \}/)}
  ${pala(/function shuffled\(list, seed\) \{[\s\S]*?\n  \}/)}
  ${pala(/  const HAASTE_KIERROKSET = \[[^\]]*\];/)}
  ${pala(/  const HAASTE_SIEMEN_MAX = [^\n]*/)}
  ${pala(/  const HAASTE_VERSIO = [^\n]*/)}
  ${pala(/  function haasteKoodi\([\s\S]*?\n  \}/)}
  ${pala(/  function lueHaaste\(koodi\) \{[\s\S]*?\n  \}/)}
  ${pala(/  function haasteBiisit\(h\) \{[\s\S]*?\n  \}/)}
  ${pala(/  function haasteKierros\(h, kierros\) \{[\s\S]*?\n  \}/)}
  return { haasteKoodi, lueHaaste, haasteBiisit, haasteKierros, KAUDET };
`;
const pelattavat = kat.filter((s) => s.peli !== false);
const teeHaaste = (pool) => new Function(koodi.replace("POOL", JSON.stringify(pool)))();
const { haasteKoodi, lueHaaste, haasteBiisit, haasteKierros, KAUDET } = teeHaaste(pelattavat);

let ok = true;
const vaita = (nimi, ehto, lisa = "") => {
  ok = ok && ehto;
  console.log((ehto ? "OK " : "EI ") + nimi + (lisa ? "  " + lisa : ""));
};

// 1. Koodi kestää edestakaisin.
const h = lueHaaste(haasteKoodi(123456, 3, ["1990", "2010"]));
vaita("koodi purkautuu samaksi", h && h.siemen === 123456 && h.kierroksia === 3
  && h.kaudet.join(",") === "1990,2010", JSON.stringify(h));
const kaikki = lueHaaste(haasteKoodi(7, 1, []));
vaita("tyhjä kausivalinta säilyy", kaikki && kaikki.kaudet.length === 0);

// 2. Kelvoton koodi ei aloita peliä. Kirjoitusvirhe linkissä on
//    todennäköisempi kuin oikea koodi, koska koodi kulkee chatissa.
for (const rikki of ["", "abc", "1-2", "1-2-3-4", "1-0-0", "1-9-0", "-1-1-0",
                     "zzzzzzz-1-0", "1-1-zz", "1-1-999"]) {
  vaita(`kelvoton koodi "${rikki}"`, lueHaaste(rikki) === null);
}

// 3. Sama koodi antaa samat biisit. Tämä on haasteen ainoa lupaus.
const a = haasteBiisit(h).map((t) => t.map((s) => s.id).join(","));
const b = haasteBiisit(lueHaaste(h.koodi)).map((t) => t.map((s) => s.id).join(","));
vaita("sama koodi, sama sarja", a.join("|") === b.join("|"));

// 4. Eri siemen antaa eri sarjan. Muuten haaste olisi aina sama peli.
const toinen = lueHaaste(haasteKoodi(654321, 3, ["1990", "2010"]));
vaita("eri siemen, eri sarja",
  haasteBiisit(toinen).map((t) => t[0].id).join(",") !== haasteBiisit(h).map((t) => t[0].id).join(","));

// 5. Jokaisella kierroksella on viisi biisiä, yksi joka tasolta.
for (let k = 0; k < h.kierroksia; k++) {
  const viisikko = haasteKierros(h, k);
  vaita(`kierros ${k + 1}: viisi biisiä`, viisikko.length === 5, String(viisikko.length));
  vaita(`kierros ${k + 1}: tasot 1-5`,
    viisikko.map((s) => s.tier).join(",") === "1,2,3,4,5",
    viisikko.map((s) => s.tier).join(","));
}

// 6. Sama biisi ei toistu haasteen sisällä.
const kaikkiIdt = [];
for (let k = 0; k < h.kierroksia; k++) kaikkiIdt.push(...haasteKierros(h, k).map((s) => s.id));
vaita("ei toistoa haasteen sisällä", new Set(kaikkiIdt).size === kaikkiIdt.length,
  `${kaikkiIdt.length} biisiä`);

// 7. Vuosikymmenrajaus puree.
const luku = lueHaaste(haasteKoodi(99, 5, ["2020"]));
const vuodet = [];
for (let k = 0; k < luku.kierroksia; k++) vuodet.push(...haasteKierros(luku, k).map((s) => s.year));
const kausi = KAUDET.find((x) => x.avain === "2020");
const ulkona = vuodet.filter((v) => !(v >= kausi.alku && v <= kausi.loppu));
/* Rajauksen ulkopuolelle saa jäädä vain silloin kun tasolta ei löydy
   tarpeeksi biisejä kaudelta: silloin vajaa vuosikymmen ei saa jättää
   sarjaa vajaaksi. Tämä tarkistaa että syy on juuri se. */
const vajaat = [1, 2, 3, 4, 5].filter((t) => {
  const kat2 = JSON.parse(fs.readFileSync("katalogi.json", "utf8"))
    .filter((s) => s.peli !== false && s.tier === t
      && s.year >= kausi.alku && s.year <= kausi.loppu);
  return kat2.length < luku.kierroksia;
});
vaita("vuosikymmenrajaus puree",
  ulkona.length === 0 || vajaat.length > 0,
  `${ulkona.length} rajauksen ulkopuolelta, vajaita tasoja ${vajaat.length}`);

/* 8. Kutsulinkki kulkee haaste/-sivun kautta ja päätyy etusivulle samalla
 *    koodilla. Jos tämä hajoaa, linkki joko näyttää chatissa etusivun
 *    esikatselun (vastaanottaja ei tiedä olevansa haastettu) tai koodi
 *    putoaa matkalla ja kaveri päätyy päivän peliin eri biiseihin. */
const osoite = (juuri) => new Function("jaettavaOsoite",
  pala(/  const haasteOsoite = [\s\S]*?;\n/) + "; return haasteOsoite;")(() => juuri);
vaita("kutsulinkki haaste/-sivulle",
  osoite("https://hittispotti.fi/")("abc-3-0") === "https://hittispotti.fi/haaste/?haaste=abc-3-0",
  osoite("https://hittispotti.fi/")("abc-3-0"));
vaita("kutsulinkki kun osoite päättyy tiedostoon",
  osoite("https://hittispotti.fi/index.html")("abc-3-0") === "https://hittispotti.fi/haaste/?haaste=abc-3-0");

const sivu = fs.readFileSync("haaste/index.html", "utf8");
const ohjaus = sivu.match(/<script>([\s\S]*?)<\/script>/)[1];
for (const polku of ["/haaste/", "/haaste", "/haaste/index.html"]) {
  let minne = null;
  new Function("location", ohjaus)({
    pathname: polku, search: "?haaste=abc-3-0", hash: "",
    replace: (u) => { minne = u; },
  });
  vaita(`ohjaus ${polku} säilyttää koodin`, minne === "/?haaste=abc-3-0", String(minne));
}
const meta = (nimi) => (sivu.match(new RegExp(`property="${nimi}" content="([^"]*)"`)) || [])[1];
vaita("esikatselu kertoo haasteesta", /haastettu/i.test(meta("og:title") || ""), meta("og:title"));
const kuva = (meta("og:image") || "").replace(/^https:\/\/hittispotti\.fi\//, "").replace(/\?.*$/, "");
vaita("esikatselukuva on olemassa", !!kuva && fs.existsSync(kuva), kuva);
vaita("ei og:url:ia joka pudottaisi koodin", !/property="og:url"/.test(sivu));

/* 9. Osoiterivin koodi seuraa pelimuotoa. Jos koodi jää osoitteeseen
 *    haasteesta lähdettäessä, selain avaa haasteen uudelleen aina kun
 *    välilehti ladataan uudelleen, vaikka pelaaja lopetti sen päiviä sitten. */
const asetaOsoite = (alku, koodi) => {
  let tulos = null;
  const history = { state: null, replaceState: (_s, _t, u) => { tulos = u; } };
  new Function("history", "location",
    pala(/  function asetaHaasteOsoite\(koodi\) \{[\s\S]*?\n  \}/) + "; return asetaHaasteOsoite;"
  )(history, { href: alku })(koodi);
  return tulos;
};
vaita("haasteesta lähtiessä koodi pois osoitteesta",
  asetaOsoite("https://hittispotti.fi/?haaste=abc-3-0", null) === "/");
vaita("muut parametrit säilyvät",
  asetaOsoite("https://t.dev/?haaste=abc-3-0&artisti=2026-12-24", null) === "/?artisti=2026-12-24");
vaita("haasteeseen tultaessa koodi osoitteeseen",
  asetaOsoite("https://hittispotti.fi/", "abc-3-0") === "/?haaste=abc-3-0");
vaita("ilman haastetta osoitteeseen ei kosketa",
  asetaOsoite("https://hittispotti.fi/", null) === null);

/* 10. Haasteen vuosikymmenet näytetään haasteen omista valinnoista, ei
 *     vapaan pelin valinnasta. Aiemmin otsikko luki vapaan pelin valinnan:
 *     90-luvun haaste näytti "2020-luku", jos vapaassa pelissä oli se. */
const nimet = new Function(`
  const state = { kaudet: ["2020"] };
  ${pala(/  const KAUDET = \[[\s\S]*?\n  \];/)}
  ${pala(/  const KAUSI_VANHA = [^\n]*/)}
  ${pala(/  KAUDET\.forEach\(\(k\) => \{ k\.nimi = [^\n]*/)}
  ${pala(/  function valitutKaudet\([\s\S]*?\n  \}/)}
  ${pala(/  function kausiNimi\([\s\S]*?\n  \}/)}
  return kausiNimi;`)();
vaita("haasteen vuosikymmen omasta valinnasta", nimet(["1990"]) === "1990-luku", nimet(["1990"]));
vaita("vapaan pelin valinta ei vuoda haasteeseen", nimet([]) === "", nimet([]));
vaita("50–70 ja 80 yhdessä yhtenä nimenä", nimet(["5070", "1980"]) === "1950–80-luku", nimet(["5070", "1980"]));
vaita("80-luku omana nimenä", nimet(["1980"]) === "1980-luku", nimet(["1980"]));
vaita("viisi kuudesta poissulkevasti", nimet(["5070", "1980", "1990", "2000", "2010"]) === "Ei 2020-lukua");
vaita("yhdistelmä luettelona", nimet(["5070", "1980", "2010"]) === "1950–80- ja 2010-luku", nimet(["5070", "1980", "2010"]));
vaita("ilman parametria vapaan pelin valinta", nimet() === "2020-luku", nimet());

/* 11. Pisteet palautettaessa. Päättynyt kierros on sekä kierroslistassa
 *     että biiseissä, joten listasta saa laskea vain edeltävät kierrokset.
 *     Aiemmin pelatun haasteen avaaminen uudelleen näytti tuplapisteet. */
const aiemmat = new Function(pala(/  const haasteAiemmat = [\s\S]*?;\n/) + "; return haasteAiemmat;")();
vaita("ensimmäisellä kierroksella ei aiempia",
  aiemmat({ kierros: 0, kierrokset: [{ pisteet: 2900 }] }) === 0);
vaita("toisella kierroksella vain ensimmäinen",
  aiemmat({ kierros: 1, kierrokset: [{ pisteet: 2900 }, { pisteet: 1000 }] }) === 2900);
vaita("ilman haastetta nolla", aiemmat(null) === 0);

/* 12. Valintatapa 2: katalogimuutos ei vaihda haastetta.
 *     Versio 1 sekoitti koko tason listan, joten yksikin uusi biisi
 *     vaihtoi kaikki biisit ja kaveri sai samasta linkistä eri sarjan. */
vaita("uusi koodi on versio 2", /-2$/.test(haasteKoodi(5, 3, [])) && lueHaaste(haasteKoodi(5, 3, [])).versio === 2);
vaita("tuntematon versio on kelvoton", lueHaaste("abc-3-0-3") === null);
const idt = (hb) => hb.map((t) => t.map((x) => x.id).join(",")).join("|");
let muuttui = 0, haasteita = 0;
const lisatty = pelattavat.concat(Array.from({ length: 20 }, (_, i) => ({
  id: 9e9 + i, artist: "Testi", title: "Uusi " + i, year: 2020, tier: 1 + (i % 5) })));
const lisatyilla = teeHaaste(lisatty);
for (let siemen = 0; siemen < 200; siemen++) {
  const k = haasteKoodi(siemen * 7919, 3, []);
  haasteita++;
  if (idt(haasteBiisit(lueHaaste(k))) !== idt(lisatyilla.haasteBiisit(lisatyilla.lueHaaste(k)))) muuttui++;
}
/* 20 uutta biisiä, neljä per taso, 15 valittua: odotus noin viidennes
 * haasteista. Versio 1:llä muuttuivat kaikki. */
vaita("20 uutta biisiä muuttaa harvaa haastetta", muuttui / haasteita < 0.35,
  `${muuttui}/${haasteita}`);
const tasoVaihto = pelattavat.map((x, i) => (i === 7 ? { ...x, tier: x.tier === 5 ? 4 : x.tier + 1 } : x));
const vaihdetulla = teeHaaste(tasoVaihto);
let tasoMuutti = 0;
for (let siemen = 0; siemen < 200; siemen++) {
  const k = haasteKoodi(siemen * 104729, 5, []);
  if (idt(haasteBiisit(lueHaaste(k))) !== idt(vaihdetulla.haasteBiisit(vaihdetulla.lueHaaste(k)))) tasoMuutti++;
}
vaita("yhden biisin tasomuutos muuttaa vain harvaa", tasoMuutti <= 10, `${tasoMuutti}/200`);
const v2 = lueHaaste(haasteKoodi(123, 5, ["1990"]));
const v2idt = [];
for (let k = 0; k < 5; k++) v2idt.push(...haasteKierros(v2, k).map((x) => x.id));
vaita("versio 2: ei toistoa", new Set(v2idt).size === 25);
vaita("versio 2: tasot 1-5", haasteKierros(v2, 0).map((x) => x.tier).join(",") === "1,2,3,4,5");

/* 13. Versio 1:n laskenta on ennallaan: sama koodi antaa saman sarjan kuin
 *     ennen versiota 2. Tilannekuva otettiin katalogista, joka oli
 *     käytössä commitissa 68527c7, joten vertailu tehdään sitä vasten.
 *     Nykyistä katalogia vasten tämä hälyttäisi jokaisesta katalogi-
 *     muutoksesta, koska juuri sitä versio 1 ei kestä. */
const vanhaPool = JSON.parse(execSync("git show 68527c7:katalogi.json", { encoding: "utf8", maxBuffer: 1 << 26 }))
  .filter((x) => x.peli !== false);
const vanhalla = teeHaaste(vanhaPool);
const vanhat = {"abc-3-0":[[1645551829,1277156034,722435361],[1442465677,1443345644,1872345095],[1879810403,1565587598,1866248688],[713624947,196453821,1067070098],[73629626,1248420559,1580370681]],"zz1-5-2":[[260655284,1443367787,1443109086,270298859,1442499567],[270986922,996916278,255078223,919408531,723543479],[1443110276,723446654,1669932412,299230665,1166857879],[299232053,270986882,655113864,209391816,255077995],[270987112,655511462,713940227,1442640603,258513836]],"k3x9-1-f":[[968108643],[79348840],[416693329],[1442344411],[252129229]],"q-3-g":[[1886521259,1646268330,1861801973],[1868742940,1613227754,1586167945],[1802728410,1796448265,1879810403],[6764760267,1869080009,1815701461],[1686474531,1558807605,1551380237]]};
for (const [k, odotus] of Object.entries(vanhat)) {
  const h = vanhalla.lueHaaste(k);
  vaita(`versio 1 ennallaan ${k}`, !!h && h.versio === 1 && h.koodi === k
    && JSON.stringify(vanhalla.haasteBiisit(h).map((t) => t.map((x) => x.id))) === JSON.stringify(odotus));
}

/* 14. 80-luku erotettiin 50–80-luvusta. Ennen jakoa jaettu linkki, jossa
 *     on bitti 0 (1950–89), antaa yhä saman sarjan ja pitää koodinsa,
 *     jotta kesken jäänyt haaste löytyy tallennuksesta. */
const vanha = lueHaaste("abc-3-1");   // versio 1, bitti 0
vaita("vanha 50–80-linkki kelpaa", !!vanha && vanha.kaudet.join(",") === "5070,1980",
  vanha && vanha.kaudet.join(","));
vaita("vanha linkki pitää koodinsa", vanha && vanha.koodi === "abc-3-1");
const uusi = lueHaaste(haasteKoodi(vanha.siemen, 3, ["5070", "1980"], 1));
const idt80 = (h) => haasteBiisit(h).map((t) => t.map((x) => x.id).join(",")).join("|");
vaita("vanha ja uusi 50–80 antavat samat biisit", idt80(vanha) === idt80(uusi));
const vanhaYhd = lueHaaste("abc-3-3");   // bitit 0 ja 1: 50–80 ja 90-luku
vaita("vanha yhdistelmä purkautuu", vanhaYhd && vanhaYhd.kaudet.join(",") === "5070,1980,1990",
  vanhaYhd && vanhaYhd.kaudet.join(","));
const kasi = lueHaaste(haasteKoodi(5, 1, ["1980"]));
vaita("80-luku omana", kasi && kasi.kaudet.join(",") === "1980");
const kasiVuodet = [];
for (let k = 0; k < 5; k++) kasiVuodet.push(...haasteKierros(lueHaaste(haasteKoodi(k, 1, ["1980"])), 0).map((x) => x.year));
vaita("80-luvun haaste 80-luvulta", kasiVuodet.every((v) => v >= 1980 && v <= 1989),
  kasiVuodet.filter((v) => v < 1980 || v > 1989).join(","));
const vanhaV2 = lueHaaste("abc-3-1-2");
const uusiV2 = lueHaaste(haasteKoodi(vanhaV2.siemen, 3, ["5070", "1980"]));
vaita("versio 2: vanha 50–80 ja uusi 50–70+80 samat biisit", idt80(vanhaV2) === idt80(uusiV2));
vaita("versio 2: vanha linkki pitää koodinsa", vanhaV2.koodi === "abc-3-1-2");

console.log(ok ? "\nLÄPI" : "\nHYLÄTTY");
process.exit(ok ? 0 : 1);
