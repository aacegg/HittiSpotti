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
  ${pala(/function asetaAakkosjarjestys\(lista\) \{[\s\S]*?\n  \}/)}
  ${pala(/function artistiAakkosnuoli\(arvaus, oikea\) \{[\s\S]*?\n  \}/)}
  return { artistiVertaa, ARTISTI_KENTAT, asetaAakkosjarjestys, artistiAakkosnuoli };
`;
const { artistiVertaa, ARTISTI_KENTAT, asetaAakkosjarjestys, artistiAakkosnuoli } =
  new Function(koodi)();

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

/* 8. Aakkosnuoli. Se on pelin ainoa uniikki vihje: ilman sitä 246
      artistista 56 oli sellaisia joista mikään arvaus ei tehnyt eroa,
      ja pelaaja saattoi nähdä viisi vihreää ja silti "väärin". */
const lista = JSON.parse(fs.readFileSync("artistit.json", "utf8"));
asetaAakkosjarjestys(lista);
const nimella = (n) => lista.find((a) => a.n === n);

vaita("aakkosjärjestys on uniikki",
  new Set(lista.map((a) => a.jarjestys)).size === lista.length);
/* Ä ja ö ovat suomen aakkosissa lopussa, mutta vain omalla
   kohdallaan sanassa: "Yö" on silti ennen "Zen Caféta", koska Y on
   ennen Z:aa. Vertailu tehdään siis kirjain kerrallaan eikä niin että
   ääkkönen heittäisi koko sanan loppuun. */
vaita("ä tulee u:n jälkeen",
  nimella("Käärijä").jarjestys > nimella("Kuumaa").jarjestys,
  `Käärijä ${nimella("Käärijä").jarjestys}, Kuumaa ${nimella("Kuumaa").jarjestys}`);
vaita("y tulee ennen z:aa",
  nimella("Yö").jarjestys < nimella("Zen Café").jarjestys,
  `Yö ${nimella("Yö").jarjestys}, Zen Café ${nimella("Zen Café").jarjestys}`);
vaita("aiempi arvaus saa ylänuolen",
  artistiAakkosnuoli(nimella("Apulanta"), nimella("Elonkerjuu")) === "▲");
vaita("myöhempi arvaus saa alanuolen",
  artistiAakkosnuoli(nimella("Yö"), nimella("Elonkerjuu")) === "▼");
vaita("osunut arvaus ei saa nuolta",
  artistiAakkosnuoli(nimella("Elonkerjuu"), nimella("Elonkerjuu")) === "");

/* 9. Kaksi artistia ei saa olla erottamattomia. Nuoli takaa sen, mutta
      testi vartioi ettei se katoa vahingossa. */
const profiilit = new Map();
for (const oikea of lista) {
  const prof = lista.map((g) =>
    artistiVertaa(g, oikea).map((r) => r.tila[0] + r.nuoli).join("|")
    + artistiAakkosnuoli(g, oikea)).join("#");
  if (!profiilit.has(prof)) profiilit.set(prof, []);
  profiilit.get(prof).push(oikea.n);
}
const siteet = [...profiilit.values()].filter((v) => v.length > 1);
vaita("yksikään artistipari ei ole erottamaton", siteet.length === 0,
  siteet.slice(0, 3).map((v) => v.join(" = ")).join(", "));

console.log(ok ? "\nLÄPI" : "\nVIRHEITÄ");
process.exit(ok ? 0 : 1);
