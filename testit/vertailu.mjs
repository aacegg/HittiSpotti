/* Biisipelin vertailu muihin pelaajiin.
 *
 *   node testit/vertailu.mjs        (projektin juuresta)
 *
 * Funktio luetaan app.js:stä eikä kopioida tänne.
 *
 * Miksi tämä on testattu: tuotannossa pelaaja näki "Olit parempi kuin
 * 101 %". Oma tulos vähennettiin luvuista aina, mutta palvelin pitää
 * vastausta minuutin välimuistissa, ja heti pelin jälkeen haetuissa
 * luvuissa omaa tulosta ei vielä ollut. Muiden määrä jäi yhden liian
 * pieneksi. */
import fs from "node:fs";
const src = fs.readFileSync("app.js", "utf8");
const pala = (h) => { const m = src.match(h); if (!m) throw new Error("ei löytynyt " + h); return m[0]; };
const vertailuTeksti = new Function(`
  ${pala(/  const fmt = [^\n]*/)}
  ${pala(/  const VERTAILU_RAJA = [^\n]*/)}
  ${pala(/  const KORI = [^\n]*/)}
  ${pala(/  function vertailuTeksti\(d, omat, sija\) \{[\s\S]*?\n  \}/)}
  return vertailuTeksti;`)();

let ok = true;
const vaita = (nimi, ehto, lisa = "") => {
  ok = ok && ehto;
  console.log((ehto ? "OK " : "EI ") + nimi + (lisa ? "  " + lisa : ""));
};
const prosentti = (t) => Number((t.match(/parempi kuin (\d+) %/) || [])[1]);

/* 100 muuta pelaajaa, kaikki alle 1 000 pisteen (korit 0 ja 1),
 * summa 124 600 eli keskiarvo 1 246. Oma tulos 4 175. */
const muut = { n: 100, summa: 124600, k: [50, 50, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] };

// Luvut ennen omaa tulosta: palvelin sanoi sijaksi 101, luvuissa on 100.
const vanhat = vertailuTeksti(muut, 4175, 101);
vaita("vanhoilla luvuilla ei yli 100 %", prosentti(vanhat) <= 100, vanhat);
vaita("vanhoilla luvuilla parempi kuin kaikki", prosentti(vanhat) === 100);
vaita("vanhoilla luvuilla keskiarvo oikein", /keskimäärin 1 246 p/.test(vanhat) || /keskimäärin 1 246 p/.test(vanhat), vanhat);

// Luvut oman tuloksen jälkeen: 101 pelaajaa, oma korissa 8.
const uudet = { n: 101, summa: 124600 + 4175, k: [50, 50, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0] };
const tuoreet = vertailuTeksti(uudet, 4175, 101);
vaita("tuoreilla luvuilla oma vähennetään", prosentti(tuoreet) === 100, tuoreet);
vaita("tuoreilla luvuilla keskiarvo sama", /keskimäärin 1.246 p/.test(tuoreet), tuoreet);

// Lähetys epäonnistui (ei sijaa): omaa ei vähennetä.
const ilman = vertailuTeksti(muut, 4175, undefined);
vaita("ilman sijaa ei yli 100 %", prosentti(ilman) <= 100, ilman);

// Keskivertopelaaja: puolet alapuolella.
const keski = { n: 101, summa: 0, k: [0, 25, 25, 50, 1, 0, 0, 0, 0, 0, 0, 0, 0] };
const k = vertailuTeksti({ ...keski, summa: 150000 }, 1600, 101);
vaita("keskikastissa osuus järkevä", prosentti(k) === 50, k);

console.log(ok ? "\nLÄPI" : "\nHYLÄTTY");
process.exit(ok ? 0 : 1);
