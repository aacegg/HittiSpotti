/* Arkisto: menneiden päivien biisit ja artistit.
 *
 *   node scripts/arkisto.mjs sivu <hakemisto>   kirjoittaa <hakemisto>/arkisto.html
 *   node scripts/arkisto.mjs kiinnita [ref]     kiinnittää päivät tähän päivään asti
 *   node scripts/arkisto.mjs tarkista <ref>     vertaa refin laskentaa nykyiseen
 *
 * Miksi kiinnitys eikä pelkkä laskenta: päivän biisit ovat pakan funktio,
 * ja pakka riippuu koko katalogista. Uusi biisi tai vaihtunut taso vaihtaa
 * siis myös menneet päivät, jos ne lasketaan uudella katalogilla. Arkiston
 * pitää kertoa mitä pelaajat oikeasti pelasivat, joten menneet päivät
 * kirjoitetaan arkisto.json:iin sillä koodilla joka oli silloin tuotannossa.
 *
 * Kiinnityksen jälkeiset päivät lasketaan nykyisellä koodilla. Se on oikein
 * niin kauan kuin koodi ei ole muuttunut kiinnityksen jälkeen, ja siksi
 * jokaisessa julkaisussa kiinnitetään ensin (README: julkaisu). Tuotannon
 * julkaisu tarkistaa sen itse: jos edellinen versio laskee jonkin
 * kiinnittämättömän menneen päivän eri tavalla kuin uusi, julkaisu kaatuu
 * ennen kuin mitään menee ulos.
 *
 * Sivulle tulee vain mennyt päivä, ei koskaan kuluva. Päivän artisti
 * näytetään vasta kun sitä ei voi enää pelata jälkikäteen (ARTISTI_MENNEET
 * app.js:ssä), muuten arkisto paljastaisi vastauksen pelattavaan peliin.
 *
 * Päivämäärä on Suomen aikaa. Peli käyttää selaimen omaa päivää, ja
 * pelaajat ovat Suomessa.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const JUURI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ARKISTO = path.join(JUURI, "arkisto.json");
const ARTISTI_ALKU = "2026-09-24";   // ARTISTI_EPOCH
const TASOT = { 1: "Helppo", 2: "Keskitaso", 3: "Vaikea", 4: "Mestari", 5: "Mahdoton" };

function lue(ref, polku) {
  if (!ref) return fs.readFileSync(path.join(JUURI, polku), "utf8");
  return execFileSync("git", ["-C", JUURI, "show", `${ref}:${polku}`],
    { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
}

/* Pelin oma arvonta app.js:stä, ilman selainta. Palat haetaan nimillä
 * kuten testeissä, joten muutettu rakenne kaatuu tähän äänekkäästi eikä
 * tuota hiljaa vääriä päiviä. */
export function laskin(ref) {
  const src = lue(ref, "app.js");
  const kaikki = JSON.parse(lue(ref, "katalogi.json"));
  const artistit = JSON.parse(lue(ref, "artistit.json"));
  const pala = (h) => {
    const m = src.match(h);
    if (!m) throw new Error(`app.js${ref ? " (" + ref + ")" : ""}: ei löytynyt ${h}`);
    return m[0];
  };
  const valilta = (alku, loppuFunktio) => {
    const a = src.indexOf(alku);
    const f = src.indexOf(loppuFunktio, a);
    if (a < 0 || f < 0) throw new Error(`app.js: ei löytynyt ${alku} … ${loppuFunktio}`);
    return src.slice(a, src.indexOf("\n  }\n", f) + 4);
  };
  const songs = kaikki.filter((s) => s.id && s.artist && s.title);
  const koodi = `
    const state = { pool: songs.filter((s) => s.peli !== false), artistit };
    ${pala(/  const TIER_CYCLE = \[[^\]]*\];/)}
    ${pala(/  const DAILY_COUNT = \d+;/)}
    ${pala(/  function normalize\(s\) \{[\s\S]*?\n  \}/)}
    ${pala(/  function hashString\(str\) \{[\s\S]*?\n  \}/)}
    ${pala(/  function mulberry32\(seed\) \{[\s\S]*?\n  \}/)}
    ${valilta("  const DAY_MS = 86400000;", "  function paivanArtisti(")}
    ${valilta("  const KARANTEENI_PV", "  function karanteeni(")}
    ${valilta("  function dailySongs(", "  function dailySongs(")}
    return { dailySongs, paivanArtisti };`;
  const { dailySongs, paivanArtisti } = new Function("songs", "artistit", koodi)(songs, artistit);
  return {
    biisit: (k) => dailySongs(k).map((s) => ({ id: s.id, a: s.artist, t: s.title, v: s.year, taso: s.tier })),
    artisti: (k) => {
      if (k < ARTISTI_ALKU) return null;
      const a = paivanArtisti(k);
      return a ? { n: a.n } : null;
    },
  };
}

const suomenPaiva = (d = new Date()) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Helsinki" }).format(d);

function lisaa(k, n) {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function valit(alku, loppu) {
  const out = [];
  for (let k = alku; k <= loppu; k = lisaa(k, 1)) out.push(k);
  return out;
}

export function lueArkisto() {
  return JSON.parse(fs.readFileSync(ARKISTO, "utf8"));
}

const viimeinen = (ark) => Object.keys(ark.paivat).sort().at(-1);

const paiva = (l, k) => {
  const p = { b: l.biisit(k) };
  const a = l.artisti(k);
  if (a) p.a = a;
  return p;
};

/* Kaikki menneet päivät: kiinnitetyt sellaisinaan, loput nykyisellä
 * koodilla. Kuluvaa päivää ei koskaan palauteta. */
export function menneet(tanaan = suomenPaiva()) {
  const ark = lueArkisto();
  const out = {};
  for (const [k, p] of Object.entries(ark.paivat)) if (k < tanaan) out[k] = p;
  const loppu = lisaa(tanaan, -1);
  const alku = lisaa(viimeinen(ark), 1);
  if (alku <= loppu) {
    const l = laskin(null);
    for (const k of valit(alku, loppu)) out[k] = paiva(l, k);
  }
  return out;
}

// ---------- Sivu ----------

const VIIKONPAIVA = ["Sunnuntai", "Maanantai", "Tiistai", "Keskiviikko", "Torstai", "Perjantai", "Lauantai"];
const KUUKAUSI = ["tammikuu", "helmikuu", "maaliskuu", "huhtikuu", "toukokuu", "kesäkuu",
  "heinäkuu", "elokuu", "syyskuu", "lokakuu", "marraskuu", "joulukuu"];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const pvmTeksti = (k) => {
  const [y, m, d] = k.split("-").map(Number);
  return `${VIIKONPAIVA[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d}.${m}.${y}`;
};

/* Montako mennyttä artistipäivää pelissä voi vielä pelata. Luetaan
 * app.js:stä, ettei arkisto ja peli voi olla eri mieltä. */
function artistiMenneet() {
  const m = lue(null, "app.js").match(/const ARTISTI_MENNEET = (\d+);/);
  if (!m) throw new Error("app.js: ARTISTI_MENNEET puuttuu");
  return Number(m[1]);
}

export function teeSivu(tanaan = suomenPaiva()) {
  const paivat = menneet(tanaan);
  const avaimet = Object.keys(paivat).sort().reverse();
  const piiloon = lisaa(tanaan, -artistiMenneet());   // tästä eteenpäin vielä pelattavissa
  const biiseja = avaimet.reduce((n, k) => n + paivat[k].b.length, 0);

  let kuukausi = "";
  const osat = [];
  const kuukaudet = [];
  for (const k of avaimet) {
    const [y, m] = k.split("-").map(Number);
    const kk = `${KUUKAUSI[m - 1]} ${y}`;
    if (kk !== kuukausi) {
      if (kuukausi) osat.push("</section>");
      kuukausi = kk;
      const id = `kk-${y}-${String(m).padStart(2, "0")}`;
      kuukaudet.push(`<a href="#${id}">${kk[0].toUpperCase() + kk.slice(1)}</a>`);
      osat.push(`<section class="ark-kk" id="${id}"><h2>${kk[0].toUpperCase() + kk.slice(1)}</h2>`);
    }
    const p = paivat[k];
    const rivit = p.b.map((s) => `
          <li><span class="ark-taso" data-tier="${s.taso}">${TASOT[s.taso] || ""}</span>
            <span class="ark-biisi"><a href="https://music.apple.com/fi/song/${encodeURIComponent(s.id)}" rel="noopener external">${esc(s.t)}</a>
            <span class="ark-artisti">${esc(s.a)}${s.v ? ` · ${s.v}` : ""}</span></span></li>`).join("");
    let artisti = "";
    if (k >= ARTISTI_ALKU) {
      artisti = k >= piiloon
        ? `<p class="ark-pa">Päivän artisti: <span class="ark-piilossa">vielä pelattavissa <a href="/">ArtistiSpotissa</a></span></p>`
        : p.a ? `<p class="ark-pa">Päivän artisti: <strong>${esc(p.a.n)}</strong></p>` : "";
    }
    osat.push(`
      <article class="ark-paiva" id="p-${k}">
        <h3><time datetime="${k}">${pvmTeksti(k)}</time></h3>
        <ol class="ark-lista">${rivit}
        </ol>
        ${artisti}
      </article>`);
  }
  if (kuukausi) osat.push("</section>");

  const pohja = fs.readFileSync(path.join(JUURI, "scripts", "arkisto-pohja.html"), "utf8");
  const tayta = {
    PAIVIA: String(avaimet.length),
    BIISEJA: String(biiseja),
    KUUKAUDET: kuukaudet.join(" "),
    PAIVAT: osat.join("\n"),
  };
  return pohja.replace(/\{\{(\w+)\}\}/g, (_, n) => {
    if (!(n in tayta)) throw new Error("arkisto-pohja: tuntematon kenttä " + n);
    return tayta[n];
  });
}

// ---------- Komennot ----------

function kiinnita(ref = "origin/main", tanaan = suomenPaiva()) {
  const ark = lueArkisto();
  const alku = lisaa(viimeinen(ark), 1);
  if (alku > tanaan) { console.log(`Kiinnitetty jo ${viimeinen(ark)} asti.`); return; }
  const l = laskin(ref);
  for (const k of valit(alku, tanaan)) ark.paivat[k] = paiva(l, k);
  const jarj = Object.fromEntries(Object.entries(ark.paivat).sort(([a], [b]) => a.localeCompare(b)));
  ark.paivat = jarj;
  fs.writeFileSync(ARKISTO, JSON.stringify(ark, null, 1) + "\n");
  console.log(`Kiinnitetty ${alku} … ${tanaan} versiolla ${ref}.`);
}

/* Laskeeko nykyinen koodi kiinnittämättömät menneet päivät samoin kuin
 * ref? Jos ei, arkisto näyttäisi niille väärät biisit. */
function tarkista(ref, tanaan = suomenPaiva()) {
  const ark = lueArkisto();
  const paivat = valit(lisaa(viimeinen(ark), 1), lisaa(tanaan, -1));
  if (!paivat.length) { console.log("Arkisto: kaikki menneet päivät kiinnitetty."); return true; }
  const vanha = laskin(ref), uusi = laskin(null);
  const eri = paivat.filter((k) => JSON.stringify(paiva(vanha, k)) !== JSON.stringify(paiva(uusi, k)));
  if (eri.length) {
    console.error(`Arkisto: ${eri.length} kiinnittämätöntä päivää muuttuisi (${eri[0]} …).`
      + " Aja ensin: node scripts/arkisto.mjs kiinnita " + ref);
    return false;
  }
  console.log(`Arkisto: ${paivat.length} kiinnittämätöntä päivää pysyy ennallaan.`);
  return true;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [komento, arg] = process.argv.slice(2);
  if (komento === "sivu") {
    const kohde = path.resolve(arg || ".");
    fs.writeFileSync(path.join(kohde, "arkisto.html"), teeSivu());
    console.log(`Kirjoitettu ${path.join(kohde, "arkisto.html")}`);
  } else if (komento === "kiinnita") {
    kiinnita(arg);
  } else if (komento === "tarkista") {
    if (!arg) { console.error("Anna vertailtava versio, esim. origin/main"); process.exit(2); }
    process.exit(tarkista(arg) ? 0 : 1);
  } else {
    console.error("Käyttö: node scripts/arkisto.mjs sivu <hakemisto> | kiinnita [ref] | tarkista <ref>");
    process.exit(2);
  }
}
