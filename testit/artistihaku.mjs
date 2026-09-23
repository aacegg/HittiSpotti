/* ArtistiSpotin hakuehdotusten testit.
 *
 *   node testit/artistihaku.mjs        (projektin juuresta)
 *
 * Funktiot luetaan app.js:stä eikä kopioida tänne, samasta syystä kuin
 * muissakin testeissä: kopio vanhenisi huomaamatta.
 *
 * Miksi haku on testattu: jos pelaaja ei löydä artistia jonka hän
 * tarkoittaa, peli näyttää rikkinäiseltä tai siltä että artisti ei ole
 * mukana. Kumpikaan ei näy missään lokissa, ja pelaaja lopettaa
 * ennemmin kuin raportoi.
 */
import fs from "node:fs";
const src = fs.readFileSync("app.js", "utf8");
const pala = (h) => { const m = src.match(h); if (!m) throw new Error("ei löytynyt " + h); return m[0]; };
const artistit = JSON.parse(fs.readFileSync("artistit.json", "utf8"));

const koodi = `
  const state = { artistit: ARTISTIT };
  const artistiTila = { arvaukset: [] };
  ${pala(/  function normalize\(s\) \{[\s\S]*?\n  \}/)}
  ${pala(/  const ARTISTI_ALIAKSET = \{[\s\S]*?\n  \};/)}
  ${pala(/  function artistiEhdotukset\(teksti\) \{[\s\S]*?\n  \}/)}
  for (const a of state.artistit) {
    const alias = ARTISTI_ALIAKSET[a.n];
    a.haku = normalize(a.n + (alias ? " " + alias : ""));
    a.haku2 = normalize((a.n + (alias ? " " + alias : "")).replace(/['’]/g, ""));
  }
  return { artistiEhdotukset, artistiTila };
`.replace("ARTISTIT", JSON.stringify(artistit));
const { artistiEhdotukset, artistiTila } = new Function(koodi)();

let ok = true;
const vaita = (nimi, ehto, lisa = "") => {
  ok = ok && ehto;
  console.log((ehto ? "OK " : "EI ") + nimi + (lisa ? "  " + lisa : ""));
};

/* Haku löytää artistin: odotettu nimi on ehdotuslistalla, ja mielellään
   ensimmäisenä. Ensimmäisyyttä vaaditaan, koska Enter valitsee
   ensimmäisen: jos oikea on kolmantena, Enter arvaa väärän artistin. */
const loytyy = (haku, odotus) => {
  const lista = artistiEhdotukset(haku).map((a) => a.n);
  vaita(`"${haku}" -> ${odotus}`, lista[0] === odotus,
    lista.length ? `sai: ${lista.slice(0, 3).join(", ")}` : "ei osumia");
};

// 1. Tavallinen nimi
loytyy("Apulanta", "Apulanta");
loytyy("nightwish", "Nightwish");
loytyy("popeda", "Popeda");

// 2. Skandit ja kirjainkoko
loytyy("KÄÄRIJÄ", "Käärijä");
// Skandit saa kirjoittaa ilman pisteitä, koska normalize poistaa ne
// molemmilta puolilta. Kirjoitusvirheitä haku EI siedä eikä sen ole
// tarkoituskaan: biisipelissä on sama sääntö.
loytyy("kaarija", "Käärijä");
loytyy("yolintu", "Yölintu");
loytyy("jean sibelius", "Jean Sibelius");

// 3. Heittomerkki. normalize tekee siitä välin, joten ilman omaa
//    avaintaan "waldos people" ei osu mihinkään.
loytyy("Waldo's People", "Waldo's People");
loytyy("waldos people", "Waldo's People");
loytyy("bomfunk mcs", "Bomfunk MC's");
loytyy("Bomfunk MC's", "Bomfunk MC's");

// 4. Aliakset: nimi jolla artisti tunnetaan mutta jota ei ole listalla.
loytyy("Tarja Turunen", "Tarja");
loytyy("Anna Abreu", "ABREU");
loytyy("Paula Vesala", "Vesala");

// 5. Osittainen nimi
loytyy("hanoi", "Hanoi Rocks");
loytyy("sir elwoodin", "Sir Elwoodin Hiljaiset Värit");

// 6. Numerot ja väliviivat nimessä
loytyy("22-pistepirkko", "22-Pistepirkko");
loytyy("22 pistepirkko", "22-Pistepirkko");
loytyy("stam1na", "Stam1na");

// 7. Jo arvattua ei tarjota uudestaan: se olisi hukkaan heitetty arvaus.
const apulanta = artistiEhdotukset("Apulanta")[0];
artistiTila.arvaukset.push(apulanta);
vaita("jo arvattua ei ehdoteta",
  !artistiEhdotukset("Apulanta").some((a) => a.id === apulanta.id));
artistiTila.arvaukset.length = 0;

// 8. Tyhjä haku ei ehdota mitään.
vaita("tyhjä haku ei ehdota", artistiEhdotukset("").length === 0);
vaita("pelkkä väli ei ehdota", artistiEhdotukset("   ").length === 0);

// 9. Aliakset osoittavat olemassa oleviin artisteihin. Kirjoitusvirhe
//    aliaksen avaimessa ei näkyisi missään muualla.
const nimet = new Set(artistit.map((a) => a.n));
const ALIAKSET = new Function(
  pala(/  const ARTISTI_ALIAKSET = \{[\s\S]*?\n  \};/) + "; return ARTISTI_ALIAKSET;")();
for (const nimi of Object.keys(ALIAKSET)) {
  vaita(`alias "${nimi}" on listalla`, nimet.has(nimi));
}

console.log(ok ? "\nLÄPI" : "\nHYLÄTTY");
process.exit(ok ? 0 : 1);
