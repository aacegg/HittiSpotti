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
  ${pala(/  const ARTISTI_VERTAILU_RAJA = \d+;/)}
  ${pala(/  function artistiVertailuTeksti\(d, omatArvaukset, voitto\) \{[\s\S]*?\n  \}/)}
  return { artistiVertaa, ARTISTI_KENTAT, artistiVertailuTeksti };
`;
const { artistiVertaa, ARTISTI_KENTAT, artistiVertailuTeksti } = new Function(koodi)();

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

/* 8. Vertailu muihin pelaajiin.
      Palvelin palauttaa raa'at luvut ja peli laskee esityksen, joten
      laskenta on tässä eikä Workerissa ja se on testattavissa.
      Tärkein sääntö: pelaajan oma tulos ei saa olla mukana siinä
      joukossa johon häntä verrataan. */
const V = (d, n, voitto) => artistiVertailuTeksti(d, n, voitto);

vaita("ilman dataa ei tekstiä", V(null, 3, true) === "");
vaita("nollalla pelaajalla ei tekstiä", V({ n: 0, g: [0,0,0,0,0,0], epa: 0 }, 3, true) === "");
vaita("ensimmäinen pelaaja saa järjestysluvun",
  V({ n: 1, g: [0,0,1,0,0,0], epa: 0 }, 3, true) === "Olit päivän ensimmäinen pelaaja.");
vaita("pieni otos saa järjestysluvun",
  V({ n: 5, g: [0,1,2,1,0,0], epa: 1 }, 3, true) === "Olit päivän 5. pelaaja.");

/* Sata muuta pelaajaa: 90 ratkaisi, 10 ei. Oma kolmannella osunut tulos
   on luvuissa mukana, joten sen on kadottava vertailusta. */
const iso = { n: 101, g: [2, 10, 30, 30, 15, 4], epa: 10 };
const teksti = V(iso, 3, true);
vaita("iso otos: ratkaisuprosentti ilman omaa",
  teksti.includes("90 %"), teksti);
vaita("iso otos: keskiarvo ilman omaa", teksti.includes("3,6"), teksti);
/* Kolmannella osunutta hitaampia ovat 4., 5. ja 6. arvauksella
   osuneet (30+15+4) sekä ne jotka eivät ratkaisseet (10) = 59. */
vaita("iso otos: nopeampi kuin -osuus", teksti.includes("59 %"), teksti);

vaita("ensimmäisellä osunut on nopeampi kuin lähes kaikki",
  V(iso, 1, true).includes("99 %"), V(iso, 1, true));
vaita("hävinneelle ei kerrota nopeutta",
  !V(iso, 6, false).includes("nopeampi"), V(iso, 6, false));
vaita("hävinneen oma tulos poistuu epäonnistuneista",
  V(iso, 6, false).includes("91 %"), V(iso, 6, false));
vaita("jos kukaan ei ratkaissut, keskiarvoa ei väitetä",
  V({ n: 21, g: [0,0,0,0,0,0], epa: 21 }, 6, false) === "Muista 0 % ratkaisi artistin.",
  V({ n: 21, g: [0,0,0,0,0,0], epa: 21 }, 6, false));

console.log(ok ? "\nLÄPI" : "\nVIRHEITÄ");
process.exit(ok ? 0 : 1);
