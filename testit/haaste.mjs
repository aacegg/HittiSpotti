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
const src = fs.readFileSync("app.js", "utf8");
const pala = (h) => { const m = src.match(h); if (!m) throw new Error("ei löytynyt " + h); return m[0]; };
const kat = JSON.parse(fs.readFileSync("katalogi.json", "utf8"));

const koodi = `
  const state = { pool: POOL };
  ${pala(/  const TIER_CYCLE = \[[^\]]*\];/)}
  ${pala(/  const KAUDET = \[[\s\S]*?\n  \];/)}
  ${pala(/function mulberry32\(seed\) \{[\s\S]*?\n  \}/)}
  ${pala(/function shuffled\(list, seed\) \{[\s\S]*?\n  \}/)}
  ${pala(/  const HAASTE_KIERROKSET = \[[^\]]*\];/)}
  ${pala(/  const HAASTE_SIEMEN_MAX = [^\n]*/)}
  ${pala(/  function haasteKoodi\([\s\S]*?\n  \}/)}
  ${pala(/  function lueHaaste\(koodi\) \{[\s\S]*?\n  \}/)}
  ${pala(/  function haasteBiisit\(h\) \{[\s\S]*?\n  \}/)}
  ${pala(/  function haasteKierros\(h, kierros\) \{[\s\S]*?\n  \}/)}
  return { haasteKoodi, lueHaaste, haasteBiisit, haasteKierros, KAUDET };
`.replace("POOL", JSON.stringify(kat.filter((s) => s.peli !== false)));
const { haasteKoodi, lueHaaste, haasteBiisit, haasteKierros, KAUDET } = new Function(koodi)();

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

console.log(ok ? "\nLÄPI" : "\nHYLÄTTY");
process.exit(ok ? 0 : 1);
