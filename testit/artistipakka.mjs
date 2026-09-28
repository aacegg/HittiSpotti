/* Päivän artistin arvonnan testit.
 *
 *   node testit/artistipakka.mjs        (projektin juuresta)
 *
 * Funktiot luetaan app.js:stä säännöllisillä lausekkeilla eikä
 * kopioida tänne. Kopio vanhenisi huomaamatta ja testaisi lopulta
 * jotain muuta kuin peliä. */
import fs from "node:fs";
const src = fs.readFileSync("app.js", "utf8");
const pala = (h) => { const m = src.match(h); if (!m) throw new Error("ei löytynyt " + h); return m[0]; };
const artistit = JSON.parse(fs.readFileSync("artistit.json", "utf8"));

const teeKoodi = (lista) => `
  const DAY_MS = 86400000;
  const state = { artistit: ${JSON.stringify(lista)} };
  ${pala(/function hashString\(str\) \{[\s\S]*?\n  \}/)}
  ${pala(/function mulberry32\(seed\) \{[\s\S]*?\n  \}/)}
  ${pala(/function shuffled\(list, seed\) \{[\s\S]*?\n  \}/)}
  ${pala(/const ARTISTI_EPOCH = [\s\S]*?const ARTISTI_GAP = \d+;/)}
  ${pala(/function artistiDayIndex\(key\) \{[\s\S]*?\n  \}/)}
  ${pala(/const kiertoArtistit = [^\n]*/)}
  ${pala(/const artistiPakat = new Map\(\);/)}
  ${pala(/function artistiPakka\(cycle\) \{[\s\S]*?\n  \}/)}
  ${pala(/function paivanArtisti\(key\) \{[\s\S]*?\n  \}/)}
  return { paivanArtisti, artistiDayIndex, artistiPakka };
`;
const { paivanArtisti, artistiDayIndex } = new Function(teeKoodi(artistit))();

/* Kierrossa ovat vain artistit ilman x-merkintää. Myöhemmin lisätyt
 * (scripts/artistit-lisatyt.txt) ovat vain haussa. */
const kierrossa = artistit.filter((a) => !a.x);
const N = kierrossa.length;
const pvm = (i) => {
  const d = new Date(Date.UTC(2026, 8, 24) + i * 86400000);
  return d.toISOString().slice(0, 10);
};
let ok = true;
const vaita = (nimi, ehto, lisa = "") => {
  ok = ok && ehto;
  console.log((ehto ? "OK " : "EI ") + nimi + (lisa ? "  " + lisa : ""));
};

// 1. Determinismi
const a1 = paivanArtisti("2026-09-24"), a2 = paivanArtisti("2026-09-24");
vaita("sama päivä antaa saman artistin", a1.id === a2.id);

// 2. Eri päivä antaa eri artistin
vaita("peräkkäiset päivät eri artisti",
      paivanArtisti(pvm(0)).id !== paivanArtisti(pvm(1)).id);

// 3. Koko kierto ilman toistoja
const kierros = new Set();
for (let i = 0; i < N; i++) kierros.add(paivanArtisti(pvm(i)).id);
vaita(`kierros ${N} päivää ilman toistoja`, kierros.size === N, `${kierros.size}/${N}`);

// 4. Jokainen artisti tulee vuoroon
vaita("jokainen artisti kerran kierrossa", kierros.size === kierrossa.length);

/* 4b. Lisätyt artistit eivät muuta kiertoa. Jos tämä pettää, artistin
 *     lisääminen vaihtaa jo pelattujen päivien oikeat vastaukset. */
const ilman = new Function(teeKoodi(kierrossa))().paivanArtisti;
let sama = true;
for (let i = -10; i < N * 3; i++) {
  if (paivanArtisti(pvm(i)).id !== ilman(pvm(i)).id) { sama = false; break; }
}
vaita("lisätyt artistit eivät muuta kiertoa", sama);
const lisatyt = new Set(artistit.filter((a) => a.x).map((a) => a.id));
let tuli = 0;
for (let i = 0; i < N * 3; i++) if (lisatyt.has(paivanArtisti(pvm(i)).id)) tuli++;
vaita("lisätty artisti ei tule päivän artistiksi", tuli === 0, `${lisatyt.size} lisättyä`);

// 5. Sauma: lyhin väli saman artistin toistoon
const nahty = new Map();
let lyhin = Infinity;
for (let i = 0; i < N * 3; i++) {
  const id = paivanArtisti(pvm(i)).id;
  if (nahty.has(id)) {
    const vali = i - nahty.get(id);
    if (vali < lyhin) lyhin = vali;
  }
  nahty.set(id, i);
}
// Takuu on GAP + 1 päivää, luetaan sama luku app.js:stä
const GAP = Number(src.match(/const ARTISTI_GAP = (\d+);/)[1]);
vaita(`lyhin väli toistoon vähintään ${GAP + 1} päivää`, lyhin >= GAP + 1,
      `${lyhin} päivää`);
vaita(`artisteja riittää saumakorjaukseen (n >= 3*GAP)`, N >= 3 * GAP, `${N} >= ${3 * GAP}`);

// 6. Menneisyys ei kaadu (negatiivinen dayIndex)
const menneet = paivanArtisti("2026-01-01");
vaita("ennen aloituspäivää ei kaadu", !!menneet && !!menneet.n);

/* 7. Testipäivän ohitus ei saa toimia tuotannossa.
      Siellä se olisi tapa kurkata tulevat päivät etukäteen, ja koko
      pelin idea on että kaikilla on sama artisti samana päivänä. */
const testipaiva = new Function("location", "dayKey",
  pala(/  function artistiTestipaiva\(\) \{[\s\S]*?\n  \}/)
  + "; return artistiTestipaiva;");
const aja = (hostname, haku) =>
  testipaiva({ hostname, search: haku }, () => "2027-01-01")();

for (const host of ["hittispotti.fi", "www.hittispotti.fi"]) {
  vaita(`tuotanto ${host} ei tottele päivää`,
        aja(host, "?artisti=2026-12-24") === "");
  vaita(`tuotanto ${host} ei tottele satunnaista`,
        aja(host, "?artisti=satunnainen") === "");
}
vaita("testisivu tottelee päivää",
      aja("hittispotti-testi.hittispotti.workers.dev", "?artisti=2026-12-24")
        === "2026-12-24");
vaita("localhost tottelee päivää",
      aja("localhost", "?artisti=2026-12-24") === "2026-12-24");
vaita("ilman parametria ei ohitusta", aja("localhost", "") === "");
vaita("kelvoton päivä ei kelpaa", aja("localhost", "?artisti=abc") === "");
vaita("vaillinainen päivä ei kelpaa", aja("localhost", "?artisti=2026-12") === "");

/* Testi ei tulosta yhtään artistin nimeä, ei edes esimerkkinä.
 *
 * Aiemmin lopussa oli lista kymmenestä ensimmäisestä päivästä ja
 * väitteiden perässä nimiä. Se oli kätevä kehittäessä, mutta jokainen
 * testiajo paljasti tulevat artistit sille joka ajoi testin, ja se on
 * pelin ylläpitäjä eli juuri se ihminen joka haluaa pelata itsekin.
 * Järjestys jouduttiin siksi arpomaan kerran uusiksi ennen julkaisua
 * (ARTISTI_SEKOITUS 1 -> ... -> 6). Väitteet todistavat järjestyksen
 * ominaisuudet, eikä niihin tarvita yhtään nimeä. */
/* 8. Pelattavat päivät: tämä päivä ja viisi edellistä, ei yhtään tulevaa.
      Tuleva päivä listalla olisi tapa nähdä huomisen artisti etukäteen. */
const paivatFn = (host, haku, tanaan) => new Function("location", "todayKey", `
  const pad = (n) => String(n).padStart(2, "0");
  const dayKey = (d) => \`\${d.getFullYear()}-\${pad(d.getMonth() + 1)}-\${pad(d.getDate())}\`;
  const keyToDate = (key) => { const [y, m, d] = key.split("-").map(Number); return new Date(y, m - 1, d); };
  ${pala(/  function artistiTestipaiva\(\) \{[\s\S]*?\n  \}/)}
  ${pala(/  const ARTISTI_MENNEET = \d+;/)}
  let artistiTestiMuisti = null;
  ${pala(/  function artistiTanaan\(\) \{[\s\S]*?\n  \}/)}
  ${pala(/  function artistiPaivat\(\) \{[\s\S]*?\n  \}/)}
  return artistiPaivat();`)({ hostname: host, search: haku }, () => tanaan);
const lista = paivatFn("hittispotti.fi", "", "2026-10-01");
vaita("kuusi päivää", lista.length === 6, lista.join(" "));
vaita("viimeinen on tämä päivä", lista[5] === "2026-10-01");
vaita("ensimmäinen on viisi päivää sitten, kuun vaihteen yli", lista[0] === "2026-09-26");
vaita("ei tulevia päiviä", lista.every((p) => p <= "2026-10-01"));
vaita("tuotannossa testipäivä ei siirrä listaa",
  paivatFn("hittispotti.fi", "?artisti=2027-01-10", "2026-10-01")[5] === "2026-10-01");

console.log(ok ? "\nLÄPI" : "\nHYLÄTTY");
process.exit(ok ? 0 : 1);
