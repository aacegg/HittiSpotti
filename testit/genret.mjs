/* Vapaan pelin genrevalinnan testit.
 *
 *   node testit/genret.mjs             (projektin juuresta)
 *
 * Funktiot luetaan app.js:stä kuten muissakin testeissä. Tarkistaa että
 * genre rajaa biisit, yhdistyy vuosikymmeneen, ja ettei tyhjä yhdistelmä
 * kaada peliä. */
import fs from "node:fs";
const src = fs.readFileSync("app.js", "utf8");
const pala = (h) => { const m = src.match(h); if (!m) throw new Error("ei löytynyt " + h); return m[0]; };
const kat = JSON.parse(fs.readFileSync("katalogi.json", "utf8")).filter((s) => s.peli !== false);

const teePeli = (genret, kaudet) => new Function(`
  const state = { pool: ${JSON.stringify(kat)}, used: new Set(),
                  genret: ${JSON.stringify(genret)}, kaudet: ${JSON.stringify(kaudet)} };
  ${pala(/  const KAUDET = \[[\s\S]*?\n  \];/)}
  ${pala(/  KAUDET\.forEach\(\(k\) => \{ k\.nimi = [^\n]*/)}
  ${pala(/  function valitutKaudet\([\s\S]*?\n  \}/)}
  ${pala(/  function kausiNimi\([\s\S]*?\n  \}/)}
  ${pala(/  const GENRET = [^\n]*/)}
  ${pala(/  function valitutGenret\([\s\S]*?\n  \}/)}
  ${pala(/  function genreNimi\([\s\S]*?\n  \}/)}
  ${pala(/  function rajausNimi\(\) \{[\s\S]*?\n  \}/)}
  ${pala(/  const TIER_CYCLE = \[[^\]]*\];/)}
  ${pala(/  function rajausOnnistuu\([\s\S]*?\n  \}/)}
  ${pala(/  const GENRE_PARTITIIVI = [^\n]*/)}
  ${pala(/  function mahdotonTeksti\([\s\S]*?\n  \}/)}
  ${pala(/  function pickFreeSong\(tier\) \{[\s\S]*?\n  \}/)}
  return { pickFreeSong, rajausNimi, rajausOnnistuu, mahdotonTeksti };`)();

let ok = true;
const vaita = (nimi, ehto, lisa = "") => {
  ok = ok && ehto;
  console.log((ehto ? "OK " : "EI ") + nimi + (lisa ? "  " + lisa : ""));
};
const otos = (peli, n = 60) => {
  const b = [];
  for (let i = 0; i < n; i++) for (const t of [1, 2, 3, 4, 5]) b.push(peli.pickFreeSong(t));
  return b;
};

vaita("jokaisella arvattavalla biisillä on genre", kat.every((s) => s.g), 
  String(kat.filter((s) => !s.g).length));
for (const g of ["Pop", "Rap", "Rock", "Iskelmä"]) {
  const b = otos(teePeli([g], []));
  vaita(`${g}: vain tätä genreä`, b.every((s) => s.g === g), `${b.filter((s) => s.g !== g).length} muuta`);
}
const kaksi = otos(teePeli(["Rap", "Rock"], []));
vaita("rap ja rock: molempia, ei muuta", kaksi.every((s) => ["Rap", "Rock"].includes(s.g))
  && kaksi.some((s) => s.g === "Rap") && kaksi.some((s) => s.g === "Rock"));
vaita("kaikki neljä = koko katalogi, myös Muu mahdollinen", teePeli(["Pop", "Rap", "Rock", "Iskelmä"], []).rajausNimi() === "");
const rock90 = otos(teePeli(["Rock"], ["1990"]));
vaita("rock ja 90-luku", rock90.every((s) => s.g === "Rock" && s.year >= 1990 && s.year <= 1999),
  `${rock90.filter((s) => !(s.g === "Rock" && s.year >= 1990 && s.year <= 1999)).length} ohi`);
/* Tyhjä yhdistelmä: genre pidetään, vuosikymmen jätetään. */
const tasot = [1, 2, 3, 4, 5].map((t) => kat.filter((s) => s.tier === t && s.g === "Rap" && s.year <= 1989).length);
const rapVanha = otos(teePeli(["Rap"], ["vanha"]), 10);
vaita("vajaa yhdistelmä ei kaadu ja pitää genren", rapVanha.length === 50 && rapVanha.every((s) => s.g === "Rap"),
  `50–80-luvun rapia tasoittain ${tasot.join(",")}`);
vaita("nimi: genre ensin", teePeli(["Rock"], ["1990"]).rajausNimi() === "Rock · 1990-luku",
  teePeli(["Rock"], ["1990"]).rajausNimi());
vaita("nimi: kaksi genreä", teePeli(["Pop", "Iskelmä"], []).rajausNimi() === "Pop ja Iskelmä",
  teePeli(["Pop", "Iskelmä"], []).rajausNimi());
vaita("nimi: ei rajausta", teePeli([], []).rajausNimi() === "");

/* Mahdottomat yhdistelmät estetään valittaessa. */
const p0 = teePeli([], []);
vaita("rap + 50–80 on mahdoton", !p0.rajausOnnistuu(["Rap"], ["vanha"]));
vaita("rap + 90 on mahdoton (yhdeltä tasolta puuttuu)", !p0.rajausOnnistuu(["Rap"], ["1990"]));
vaita("rock + 90 onnistuu", p0.rajausOnnistuu(["Rock"], ["1990"]));
vaita("rap + 50–80 + 2010 onnistuu", p0.rajausOnnistuu(["Rap"], ["vanha", "2010"]));
vaita("pelkkä genre onnistuu aina", ["Pop", "Rap", "Rock", "Iskelmä"].every((g) => p0.rajausOnnistuu([g], [])));
vaita("selitys", p0.mahdotonTeksti(["Rap"], ["vanha"]) === "1950–80-luvun rapia ei ole tarpeeksi.",
  p0.mahdotonTeksti(["Rap"], ["vanha"]));
vaita("selitys kahdella genrellä", p0.mahdotonTeksti(["Rock", "Iskelmä"], ["2020"]) === "2020-luvun rockia ja iskelmää ei ole tarpeeksi.",
  p0.mahdotonTeksti(["Rock", "Iskelmä"], ["2020"]));

console.log(ok ? "\nLÄPI" : "\nHYLÄTTY");
process.exit(ok ? 0 : 1);
