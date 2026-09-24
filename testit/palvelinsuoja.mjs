/* Tilastopalvelimen suojan testit.
 *
 *   node testit/palvelinsuoja.mjs      (projektin juuresta)
 *
 * Kaksi asiaa joiden on oltava totta yhtä aikaa:
 *
 *   1. Paikallisesti kehitettäessä palvelimelle ei puhuta. Muuten
 *      jokainen läpipeluu kehityksessä kirjaisi rivin oikeisiin
 *      lukuihin, ja ne luvut ovat se aineisto josta biisien
 *      vaikeustasot johdetaan.
 *
 *   2. Tuotannossa puhutaan. Suoja joka estää liikaa on yhtä paha kuin
 *      puuttuva suoja, ja se vika näkyisi vasta siinä että tilastot
 *      lakkaavat karttumasta.
 *
 * Lisäksi testisivun työnkulku korvaa PALVELIN-rivin tyhjällä ja vaatii
 * osuman tasan kerran. Jos rivi kirjoitetaan ehtolauseeksi, testisivun
 * julkaisu kaatuu, joten sekin muoto tarkistetaan tässä.
 */
import fs from "node:fs";
const src = fs.readFileSync("app.js", "utf8");

let ok = true;
const vaita = (nimi, ehto, lisa = "") => {
  ok = ok && ehto;
  console.log((ehto ? "OK " : "EI ") + nimi + (lisa ? "  " + lisa : ""));
};

// 1. Työnkulun korvaus osuu tasan kerran.
const osumat = src.match(/const PALVELIN = "[^"]*";/g) || [];
vaita("PALVELIN on yksi merkkijonovakio", osumat.length === 1,
  `${osumat.length} osumaa`);

// 2. Paikallisuuden tunnistus. Luetaan sama lauseke app.js:stä.
const pala = (h) => { const m = src.match(h); if (!m) throw new Error("ei löytynyt " + h); return m[0]; };
const koodi = pala(/const PAIKALLINEN = [\s\S]*?location\.protocol === "file:";/);

const paikallinenko = (hostname, protocol) =>
  new Function("location", koodi + "; return PAIKALLINEN;")({ hostname, protocol });

for (const [host, proto] of [
  ["localhost", "http:"],
  ["127.0.0.1", "http:"],
  ["[::1]", "http:"],
  ["", "file:"],
]) {
  vaita(`paikallinen: ${host || "file://"}`, paikallinenko(host, proto) === true);
}

for (const [host, proto] of [
  ["hittispotti.fi", "https:"],
  ["www.hittispotti.fi", "https:"],
  ["hittispotti-testi.hittispotti.workers.dev", "https:"],
  // Ei saa osua pelkkään osajonoon: oma verkkotunnus jonka nimessä
  // sattuu lukemaan localhost on yhä tuotantoa.
  ["localhost.example.com", "https:"],
  ["notlocalhost", "https:"],
]) {
  vaita(`tuotanto: ${host}`, paikallinenko(host, proto) === false);
}

// 3. Jokainen palvelinkutsu kulkee suojan läpi.
const kutsut = (src.match(/fetch\(PALVELIN|sendBeacon\(PALVELIN/g) || []).length;
const suojat = (src.match(/if \(!saaLahettaa\(\)\)|!saaLahettaa\(\)\)/g) || []).length;
vaita("palvelinkutsuja on ja ne on suojattu", kutsut > 0 && suojat >= 5,
  `${kutsut} kutsua, ${suojat} suojaa`);

// 4. dataLupa() ei saa riippua paikallisuudesta: se on pelaajan oma
//    valinta ja näkyy asetusruudun valintana.
const lupa = pala(/const dataLupa = \(\)[^\n]*/);
vaita("dataLupa on vain pelaajan valinta", !lupa.includes("PAIKALLINEN"), lupa.trim());

console.log(ok ? "\nLÄPI" : "\nVIRHEITÄ");
process.exit(ok ? 0 : 1);
