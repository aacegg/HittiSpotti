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

/* a = maakunta, n = artistin nimi. Molemmat ovat ruudukossa omina
   sarakkeinaan: nimi on rivin ensimmäinen ruutu. Oletusnimi on eri kuin
   vastauksen, koska arvaus on useimmissa testeissä väärä artisti. */
const tee = (g, j, s, p, v, a = "Uusimaa", n = "Bee") =>
  ({ n, g, j, s, p, v, a });
// Tilat yhtenä merkkijonona: helpompi lukea kuin kuusi oliota.
const merkit = { osui: "V", lahella: "K", ohi: "-" };
const rivi = (arvaus, oikea) =>
  artistiVertaa(arvaus, oikea).map((r) => merkit[r.tila]).join("");

const oikea = tee("Rock", 3, "Mies", "Helsinki", 2012, "Uusimaa", "Aava");

// 1. Täysosuma
vaita("sama artisti on kauttaaltaan vihreä",
  rivi(oikea, oikea) === "VVVVVV", rivi(oikea, oikea));

/* Näyttömuoto: yksi ja kaksi ovat sanoja, muut lukuja. Vertailu
   laskee silti luvulla, joten Soolo ja Duo ovat keltaisia keskenään. */
const ruutu = (arvaus, oikea, i) => artistiVertaa(arvaus, oikea)[i];
const soolo = tee("Rock", 1, "Mies", "Helsinki", 2012);
vaita("yksi jäsen on Soolo",
  ruutu(soolo, oikea, 2).teksti === "Soolo", ruutu(soolo, oikea, 2).teksti);
vaita("kaksi jäsentä on Duo",
  ruutu(tee("Rock", 2, "Mies", "Helsinki", 2012), oikea, 2).teksti === "Duo");
vaita("kolme jäsentä on luku",
  ruutu(tee("Rock", 3, "Mies", "Helsinki", 2012), oikea, 2).teksti === "3");
vaita("Soolo ja Duo ovat keltaisia keskenään",
  ruutu(tee("Rock", 2, "Mies", "Helsinki", 2012), soolo, 2).tila === "lahella");
vaita("sanamuoto ei sekoita nuolta",
  ruutu(soolo, oikea, 2).nuoli === "▲", ruutu(soolo, oikea, 2).nuoli);

// 2. Lukukentät
vaita("jäsenmäärä yhden päässä on keltainen",
  rivi(tee("Pop", 4, "Nainen", "Turku", 1800, "Varsinais-Suomi"), oikea)[2] === "K");
vaita("jäsenmäärä kahden päässä on musta",
  rivi(tee("Pop", 5, "Nainen", "Turku", 1800, "Varsinais-Suomi"), oikea)[2] === "-");
vaita("debyytti viiden päässä on keltainen",
  rivi(tee("Pop", 9, "Nainen", "Turku", 2007, "Varsinais-Suomi"), oikea)[5] === "K");
vaita("debyytti kuuden päässä on musta",
  rivi(tee("Pop", 9, "Nainen", "Turku", 2006, "Varsinais-Suomi"), oikea)[5] === "-");

// 3. Nuoli osoittaa oikeaan suuntaan
const alas = artistiVertaa(tee("Pop", 9, "Nainen", "Turku", 2020, "Varsinais-Suomi"), oikea);
vaita("liian suuri luku saa alanuolen", alas[2].nuoli === "▼" && alas[5].nuoli === "▼");
const ylos = artistiVertaa(tee("Pop", 1, "Nainen", "Turku", 1990, "Varsinais-Suomi"), oikea);
vaita("liian pieni luku saa ylänuolen", ylos[2].nuoli === "▲" && ylos[5].nuoli === "▲");

// 4. Osittainen osuma muissa kuin lukukentissä
vaita("sekayhtye on osittain miesyhtye",
  rivi(tee("Pop", 9, "Seka", "Turku", 1800, "Varsinais-Suomi"), oikea)[3] === "K");
vaita("nainen ei ole osittain mies",
  rivi(tee("Pop", 9, "Nainen", "Turku", 1800, "Varsinais-Suomi"), oikea)[3] === "-");
vaita("sama maakunta eri kunta on keltainen",
  rivi(tee("Pop", 9, "Nainen", "Espoo", 1800, "Uusimaa"), oikea)[4] === "K");
vaita("eri maakunta on musta",
  rivi(tee("Pop", 9, "Nainen", "Turku", 1800, "Varsinais-Suomi"), oikea)[4] === "-");
vaita("sama kunta on vihreä",
  rivi(tee("Pop", 9, "Nainen", "Helsinki", 1800), oikea)[4] === "V");
/* Genressä ei ole osittaista osumaa lainkaan: vain täysosuma on vihreä
   ja kaikki muu mustaa. Metalli oli hetken rockin kanssa keltainen, ja
   tämä on se testi joka kaatuu jos sellainen palaa takaisin. */
vaita("metalli ei ole osittain rock",
  rivi(tee("Metalli", 9, "Nainen", "Turku", 1800, "Varsinais-Suomi"), oikea)[1] === "-");
vaita("pop ei ole osittain rock",
  rivi(tee("Pop", 9, "Nainen", "Turku", 1800, "Varsinais-Suomi"), oikea)[1] === "-");

/* Nimiruutu. Se on rivin ensimmäinen ruutu, ja se on myös se sarake
   joka estää kaiken vihreän väärällä arvauksella: kaksi artistia voi
   jakaa kaikki viisi muuta tietoa, mutta ei nimeä. Keltainen tarkoittaa
   samaa alkukirjainta. */
vaita("väärä artisti on harmaa",
  rivi(tee("Pop", 9, "Nainen", "Turku", 1800, "Varsinais-Suomi", "Bee"), oikea)[0] === "-");
vaita("sama alkukirjain on keltainen",
  rivi(tee("Pop", 9, "Nainen", "Turku", 1800, "Varsinais-Suomi", "Ahti"), oikea)[0] === "K");
vaita("alkukirjain ei katso kirjainkokoa",
  rivi(tee("Pop", 9, "Nainen", "Turku", 1800, "Varsinais-Suomi", "ahti"), oikea)[0] === "K");
vaita("nimiruudussa ei ole nuolta",
  artistiVertaa(tee("Pop", 9, "Nainen", "Turku", 1800, "Varsinais-Suomi"), oikea)[0].nuoli === "");
vaita("nimiruudussa lukee arvattu nimi",
  artistiVertaa(tee("Pop", 9, "Nainen", "Turku", 1800, "Varsinais-Suomi", "Bee"), oikea)[0].teksti === "Bee");
/* Kaksoisolento: kaikki muu vihreää, nimi harmaa. Tämä on se rivi jota
   pelaaja ei saa nähdä kauttaaltaan vihreänä ja silti väärin. */
vaita("kaksoisolento ei saa kaikkea vihreää",
  rivi(tee("Rock", 3, "Mies", "Helsinki", 2012, "Uusimaa", "Bee"), oikea) === "-VVVVV",
  rivi(tee("Rock", 3, "Mies", "Helsinki", 2012, "Uusimaa", "Bee"), oikea));

// 5. Osittaisuus toimii kumpaankin suuntaan
const sekaOikea = tee("Rock", 3, "Seka", "Espoo", 2012, "Uusimaa", "Aava");
vaita("mies on osittain sekayhtye",
  rivi(tee("Rock", 3, "Mies", "Helsinki", 2012), sekaOikea) === "-VVKKV",
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
   on luvuissa mukana, joten sen on kadottava vertailusta.

   Keskiarvo ilman omaa: korit [2,10,29,30,15,4], summa
   2+20+87+120+75+24 = 328, ratkaisseita 90, eli 3,64 -> "3,6". */
const iso = { n: 101, g: [2, 10, 30, 30, 15, 4], epa: 10 };
vaita("keskiarvo lasketaan ilman omaa tulosta",
  V(iso, 3, true) === "Muut arvasivat keskimäärin 3,6 arvauksella.", V(iso, 3, true));
/* Ensimmäisellä osunut poistaa yhden nopeimmasta korista, joten muiden
   keskiarvo nousee: korit [1,10,30,30,15,4], summa 330, ratkaisseita
   90, eli 3,67 -> "3,7". */
vaita("oma tulos poistuu myös ykköskorista",
  V(iso, 1, true) === "Muut arvasivat keskimäärin 3,7 arvauksella.", V(iso, 1, true));
vaita("hävinneellä keskiarvo on kaikista ratkaisseista",
  V(iso, 6, false) === "Muut arvasivat keskimäärin 3,6 arvauksella.", V(iso, 6, false));
vaita("jos kukaan ei ratkaissut, keskiarvoa ei väitetä",
  V({ n: 21, g: [0,0,0,0,0,0], epa: 21 }, 6, false)
    === "Kukaan muu ei ratkaissut artistia.",
  V({ n: 21, g: [0,0,0,0,0,0], epa: 21 }, 6, false));
/* Ratkaisemattomat eivät kuulu keskiarvoon: he käyttivät kuusi mutta
   eivät osuneet, eikä se ole sama asia kuin kuudella osunut. */
vaita("ratkaisemattomat eivät nosta keskiarvoa",
  V({ n: 21, g: [0, 20, 0, 0, 0, 0], epa: 0 }, 2, true)
    === V({ n: 41, g: [0, 20, 0, 0, 0, 0], epa: 20 }, 2, true),
  V({ n: 41, g: [0, 20, 0, 0, 0, 0], epa: 20 }, 2, true));

console.log(ok ? "\nLÄPI" : "\nVIRHEITÄ");
process.exit(ok ? 0 : 1);
