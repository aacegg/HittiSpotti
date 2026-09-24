/* Montako arvausta ArtistiSpotti vaatii?
 *
 * Vertailu luetaan app.js:stä, joten säännöt ovat samat kuin pelissä.
 * Kaksi pelaajamallia:
 *
 *   taydellinen  tietää jokaisen artistin kaikki attribuutit ja valitsee
 *                arvauksen joka pienentää jäljellä olevaa joukkoa eniten
 *   satunnainen  tietää attribuutit mutta arvaa vain jonkin joka sopii
 *                tähänastisiin vihjeisiin
 *
 * Kumpikaan ei ole ihminen. Ihminen ei muista 246 artistin debyyttivuosia,
 * joten molemmat ovat parhaita tapauksia: jos nämä eivät mahdu kuuteen,
 * ihminen ei varmasti mahdu.
 */
import fs from "node:fs";
const src = fs.readFileSync("app.js", "utf8");
const pala = (h) => { const m = src.match(h); if (!m) throw new Error("ei löytynyt " + h); return m[0]; };
const koodi = `
  ${pala(/const ARTISTI_KENTAT = \[[\s\S]*?\n  \];/)}
  ${pala(/function artistiVertaa\(arvaus, oikea\) \{[\s\S]*?\n  \}/)}
  return artistiVertaa;`;
const artistiVertaa = new Function(koodi)();
const kaikki = JSON.parse(fs.readFileSync("artistit.json", "utf8"));
/* Alkukirjain johdetaan nimestä kuten pelissäkin: se ei ole datassa
   vaan lasketaan latauksessa. Ilman tätä kuudes sarake olisi
   mittauksessa aina tyhjä ja peli näyttäisi vaikeammalta kuin on. */
kaikki.forEach((a) => { a.kirjain = a.n[0].toUpperCase(); });

// Palaute yhtenä merkkijonona, jotta samanlaiset palautteet niputtuvat.
const palaute = (arvaus, oikea) =>
  artistiVertaa(arvaus, oikea).map((r) => r.tila[0] + r.nuoli).join("|");

// Esilasketaan kaikki palautteet: 246 x 246 on pieni taulukko.
const idx = new Map(kaikki.map((a, i) => [a.id, i]));
const taulu = kaikki.map((g) => kaikki.map((o) => palaute(g, o)));

function pelaa(oikeaIdx, tapa) {
  let ehdokkaat = kaikki.map((_, i) => i);
  for (let kierros = 1; kierros <= 20; kierros++) {
    let arvaus;
    if (tapa === "satunnainen") {
      arvaus = ehdokkaat[Math.floor(Math.random() * ehdokkaat.length)];
    } else if (ehdokkaat.length <= 2) {
      arvaus = ehdokkaat[0];
    } else {
      /* Valitaan arvaus jonka pahin mahdollinen lopputulos on pienin.
       * Ehdokkaista, jotta osuma on aina mahdollinen. */
      let paras = null, parasArvo = Infinity;
      for (const g of ehdokkaat) {
        const korit = new Map();
        for (const o of ehdokkaat) {
          const p = taulu[g][o];
          korit.set(p, (korit.get(p) || 0) + 1);
        }
        const pahin = Math.max(...korit.values());
        if (pahin < parasArvo) { parasArvo = pahin; paras = g; }
      }
      arvaus = paras;
    }
    if (arvaus === oikeaIdx) return kierros;
    const p = taulu[arvaus][oikeaIdx];
    ehdokkaat = ehdokkaat.filter((c) => c !== arvaus && taulu[arvaus][c] === p);
    if (!ehdokkaat.length) return 99;
  }
  return 99;
}

for (const tapa of ["taydellinen", "satunnainen"]) {
  const toistot = tapa === "satunnainen" ? 20 : 1;
  const jakauma = new Map();
  let summa = 0, n = 0;
  for (let t = 0; t < toistot; t++) {
    for (let i = 0; i < kaikki.length; i++) {
      const k = pelaa(i, tapa);
      jakauma.set(k, (jakauma.get(k) || 0) + 1);
      summa += Math.min(k, 20); n++;
    }
  }
  const alle6 = [...jakauma].filter(([k]) => k <= 6).reduce((a, [, v]) => a + v, 0);
  console.log(`\n== ${tapa} pelaaja (${n} peliä) ==`);
  const avaimet = [...jakauma.keys()].sort((a, b) => a - b);
  for (const k of avaimet) {
    const osuus = (100 * jakauma.get(k) / n);
    console.log(`  ${k === 99 ? "yli 20" : k} arvausta: ${osuus.toFixed(1).padStart(5)} % `
      + "#".repeat(Math.round(osuus / 2)));
  }
  console.log(`  ratkesi kuudella: ${(100 * alle6 / n).toFixed(1)} %`);
  console.log(`  keskimäärin ${(summa / n).toFixed(2)} arvausta`);
}
