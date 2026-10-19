/* Arkisto: kiinnitetyt päivät, sivun rajat ja julkaisun tarkistus.
 *
 *   node testit/arkisto.mjs             (projektin juuresta)
 */
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { lueArkisto, laskin, menneet, teeSivu } from "../scripts/arkisto.mjs";

let ok = true;
const vaita = (nimi, ehto) => { ok = ok && ehto; console.log((ehto ? "OK " : "EI ") + nimi); };
const lisaa = (k, n) => {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

const ark = lueArkisto();
const avaimet = Object.keys(ark.paivat);
vaita("arkisto alkaa pelin ensimmäisestä päivästä", avaimet[0] === "2026-09-03");
vaita("päivät ovat järjestyksessä ilman aukkoja",
  avaimet.every((k, i) => i === 0 || lisaa(avaimet[i - 1], 1) === k));
vaita("jokaisessa päivässä viisi biisiä tasoilla 1-5",
  avaimet.every((k) => ark.paivat[k].b.map((s) => s.taso).join() === "1,2,3,4,5"));
vaita("jokaisella biisillä nimi, artisti ja tunniste",
  avaimet.every((k) => ark.paivat[k].b.every((s) => s.id && s.a && s.t)));
vaita("päivän artisti on jokaisena päivänä 24.9. alkaen eikä ennen",
  avaimet.every((k) => (k >= "2026-09-24") === !!(ark.paivat[k].a && ark.paivat[k].a.n)));

// Laskin toimii nykyisellä koodilla ja antaa saman muodon kuin arkisto.
const l = laskin(null);
const huomenna = lisaa(avaimet.at(-1), 1);
const laskettu = l.biisit(huomenna);
vaita("laskin antaa viisi biisiä", laskettu.length === 5 && laskettu.every((s) => s.id && s.t));
vaita("laskin antaa päivän artistin", !!(l.artisti(huomenna) || {}).n);

// Sivulle ei tule kuluvaa eikä tulevaa päivää.
const tanaan = lisaa(avaimet.at(-1), 3);
const m = menneet(tanaan);
vaita("menneet loppuvat eiliseen", Object.keys(m).sort().at(-1) === lisaa(tanaan, -1));
vaita("kuluva päivä ei ole mukana", !(tanaan in m));
const sivu = teeSivu(tanaan);
vaita("sivulla ei ole kuluvaa päivää", !sivu.includes(`id="p-${tanaan}"`));
vaita("sivulla on eilinen", sivu.includes(`id="p-${lisaa(tanaan, -1)}"`));
vaita("pohjan kentät on täytetty", !/\{\{\w+\}\}/.test(sivu));

// Vielä pelattavan päivän artisti ei näy, vanhempi näkyy.
const menneetMaara = Number(fs.readFileSync("app.js", "utf8").match(/const ARTISTI_MENNEET = (\d+);/)[1]);
const pelattava = lisaa(tanaan, -menneetMaara);
const vanha = lisaa(tanaan, -menneetMaara - 1);
const osio = (k) => sivu.slice(sivu.indexOf(`id="p-${k}"`), sivu.indexOf("</article>", sivu.indexOf(`id="p-${k}"`)));
vaita("vielä pelattavan päivän artisti on piilossa",
  osio(pelattava).includes("vielä pelattavissa") && !osio(pelattava).includes("<strong>"));
vaita("vanhemman päivän artisti näkyy", osio(vanha).includes("<strong>"));

// Pelattujen karanteeni: viimeisen PELATUT_PV päivän biisit eivät palaa
// ikkunassa. Vaihtokohteiden loppuminen näkyisi tässä.
const appSrc = fs.readFileSync("app.js", "utf8");
const pAlku = appSrc.match(/const PELATUT_ALKU = dayIndex\("([\d-]+)"\);/)[1];
const pPv = Number(appSrc.match(/const PELATUT_PV = (\d+);/)[1]);
const pIdt = new Set([...appSrc.match(/const PELATUT_IDT = new Set\(\[([\s\S]*?)\]\)/)[1].matchAll(/\d+/g)].map((m) => Number(m[0])));
let palaa = 0;
for (let i = 0; i <= pPv; i++) for (const s of l.biisit(lisaa(pAlku, i))) if (pIdt.has(s.id)) palaa++;
vaita(`karanteenin ${pIdt.size} biisiä eivät palaa ${pPv} päivään (${pAlku} alkaen)`, palaa === 0);
const pelatut = new Set(avaimet.filter((k) => k >= lisaa(pAlku, -pPv) && k < pAlku).flatMap((k) => ark.paivat[k].b.map((s) => s.id)));
vaita("karanteeni kirjoitettu viimeisimmän kiinnityksen jälkeen (kiinnita ja karanteeni yhdessä)",
  avaimet.at(-1) === lisaa(pAlku, -1));
vaita("karanteenissa ovat kaikki ikkunaa edeltävät pelatut", [...pelatut].every((id) => pIdt.has(id)));

// Julkaisun tarkistus: tuotannon koodi laskee kiinnittämättömät menneet
// päivät samoin kuin nykyinen. Sama ajetaan julkaisussa.
let tuotanto = null;
try { execFileSync("git", ["rev-parse", "--verify", "-q", "origin/main"], { stdio: "ignore" }); tuotanto = "origin/main"; } catch {}
if (tuotanto) {
  let tarkistus = true;
  try { execFileSync(process.execPath, ["scripts/arkisto.mjs", "tarkista", tuotanto], { stdio: "pipe" }); }
  catch { tarkistus = false; }
  vaita(`kiinnittämättömät päivät pysyvät (${tuotanto})`, tarkistus);
} else {
  console.log("-- origin/main puuttuu, julkaisun tarkistus ohitettu");
}

console.log(ok ? "\nLÄPI" : "\nHYLÄTTY");
process.exit(ok ? 0 : 1);
