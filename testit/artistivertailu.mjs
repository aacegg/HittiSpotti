/* Arvausrivin vertailun testit.
 *
 *   node testit/artistivertailu.mjs     (projektin juuresta)
 *
 * Funktiot luetaan app.js:stä eikä kopioida tänne, samasta syystä kuin
 * artistipakka.mjs:ssä: kopio vanhenisi huomaamatta.
 *
 * Miksi tämä on testattu: vertailu on pelin ainoa sääntö. Jos keltainen
 * osuu väärään kohtaan, pelaaja päättelee siitä väärään suuntaan eikä
 * mikään ruudulla kerro että vika on pelissä eikä hänessä. */
import fs from "node:fs";
const src = fs.readFileSync("app.js", "utf8");
const pala = (h) => { const m = src.match(h); if (!m) throw new Error("ei löytynyt " + h); return m[0]; };

const koodi = `
  ${pala(/const ARTISTI_KENTAT = \[[\s\S]*?\n  \];/)}
  ${pala(/function artistiVertaa\(arvaus, oikea\) \{[\s\S]*?\n  \}/)}
  return { artistiVertaa, ARTISTI_KENTAT };
`;
const { artistiVertaa, ARTISTI_KENTAT } = new Function(koodi)();

let ok = true;
const vaita = (nimi, ehto, lisa = "") => {
  ok = ok && ehto;
  console.log((ehto ? "OK " : "EI ") + nimi + (lisa ? "  " + lisa : ""));
};

// a = suuralue, joka tulee datassa kotipaikan rinnalla.
const tee = (g, j, s, p, v, a = "Helsinki-Uusimaa") => ({ g, j, s, p, v, a });
// Tilat yhtenä merkkijonona: helpompi lukea kuin viisi olioa.
const merkit = { osui: "V", lahella: "K", ohi: "-" };
const rivi = (arvaus, oikea) =>
  artistiVertaa(arvaus, oikea).map((r) => merkit[r.tila]).join("");

const oikea = tee("Rock", 3, "Mies", "Helsinki", 2012);

// 1. Täysosuma
vaita("sama artisti on kauttaaltaan vihreä",
  rivi(oikea, oikea) === "VVVVV", rivi(oikea, oikea));

// 2. Lukukentät
vaita("jäsenmäärä yhden päässä on keltainen",
  rivi(tee("Pop", 4, "Nainen", "Turku", 1800, "Länsi-Suomi"), oikea)[1] === "K");
vaita("jäsenmäärä kahden päässä on musta",
  rivi(tee("Pop", 5, "Nainen", "Turku", 1800, "Länsi-Suomi"), oikea)[1] === "-");
vaita("debyytti viiden päässä on keltainen",
  rivi(tee("Pop", 9, "Nainen", "Turku", 2007, "Länsi-Suomi"), oikea)[4] === "K");
vaita("debyytti kuuden päässä on musta",
  rivi(tee("Pop", 9, "Nainen", "Turku", 2006, "Länsi-Suomi"), oikea)[4] === "-");

// 3. Nuoli osoittaa oikeaan suuntaan
const alas = artistiVertaa(tee("Pop", 9, "Nainen", "Turku", 2020, "Länsi-Suomi"), oikea);
vaita("liian suuri luku saa alanuolen", alas[1].nuoli === "▼" && alas[4].nuoli === "▼");
const ylos = artistiVertaa(tee("Pop", 1, "Nainen", "Turku", 1990, "Länsi-Suomi"), oikea);
vaita("liian pieni luku saa ylänuolen", ylos[1].nuoli === "▲" && ylos[4].nuoli === "▲");

// 4. Osittainen osuma muissa kuin lukukentissä
vaita("sekayhtye on osittain miesyhtye",
  rivi(tee("Pop", 9, "Seka", "Turku", 1800, "Länsi-Suomi"), oikea)[2] === "K");
vaita("nainen ei ole osittain mies",
  rivi(tee("Pop", 9, "Nainen", "Turku", 1800, "Länsi-Suomi"), oikea)[2] === "-");
vaita("sama suuralue eri kunta on keltainen",
  rivi(tee("Pop", 9, "Nainen", "Espoo", 1800, "Helsinki-Uusimaa"), oikea)[3] === "K");
vaita("eri suuralue on musta",
  rivi(tee("Pop", 9, "Nainen", "Turku", 1800, "Länsi-Suomi"), oikea)[3] === "-");
vaita("sama kunta on vihreä",
  rivi(tee("Pop", 9, "Nainen", "Helsinki", 1800), oikea)[3] === "V");
/* Genressä ei ole osittaista osumaa lainkaan: vain täysosuma on vihreä
   ja kaikki muu mustaa. Metalli oli hetken rockin kanssa keltainen, ja
   tämä on se testi joka kaatuu jos sellainen palaa takaisin. */
vaita("metalli ei ole osittain rock",
  rivi(tee("Metalli", 9, "Nainen", "Turku", 1800, "Länsi-Suomi"), oikea)[0] === "-");
vaita("pop ei ole osittain rock",
  rivi(tee("Pop", 9, "Nainen", "Turku", 1800, "Länsi-Suomi"), oikea)[0] === "-");

// 5. Osittaisuus toimii kumpaankin suuntaan
const sekaOikea = tee("Rock", 3, "Seka", "Espoo", 2012);
vaita("mies on osittain sekayhtye",
  rivi(tee("Rock", 3, "Mies", "Helsinki", 2012), sekaOikea) === "VVKKV",
  rivi(tee("Rock", 3, "Mies", "Helsinki", 2012), sekaOikea));

// 6. Yläkenttä on eri kenttä kuin arvo itse. Jos ne olisivat sama,
//    jokainen väärä arvaus olisi keltainen eikä musta.
for (const kentta of ARTISTI_KENTAT) {
  if (kentta.ylakentta) {
    vaita(`${kentta.avain}: yläkenttä ${kentta.ylakentta} on eri kenttä`,
      kentta.ylakentta !== kentta.avain);
  }
}

// 7. Pari ei saa olla itsensä kanssa osittainen: se söisi vihreän.
for (const kentta of ARTISTI_KENTAT) {
  for (const [x, y] of kentta.osittain || []) {
    vaita(`${kentta.avain}: ${x} ja ${y} ovat eri arvot`, x !== y);
  }
}

console.log(ok ? "\nLÄPI" : "\nVIRHEITÄ");
process.exit(ok ? 0 : 1);
