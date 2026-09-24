/* Päivän artistin arvonnan testit.
 *
 *   node testit/artistipakka.mjs        (projektin juuresta)
 *
 * Funktiot luetaan app.js:stä säännöllisillä lausekkeilla eikä
 * kopioida tänne. Kopio vanhenisi huomaamatta ja testaisi lopulta
 * jotain muuta kuin peliä. */
import fs from "node:fs";
const src = fs.readFileSync("app.js", "utf8");
const pala = (h) => { const m = src.match(h); if (!m) throw new Error("ei löytynyt " + h); return m[0]; };
const artistit = JSON.parse(fs.readFileSync("artistit.json", "utf8"));

const koodi = `
  const DAY_MS = 86400000;
  const state = { artistit: ARTISTIT };
  ${pala(/function hashString\(str\) \{[\s\S]*?\n  \}/)}
  ${pala(/function mulberry32\(seed\) \{[\s\S]*?\n  \}/)}
  ${pala(/function shuffled\(list, seed\) \{[\s\S]*?\n  \}/)}
  ${pala(/const ARTISTI_EPOCH = [\s\S]*?const ARTISTI_GAP = \d+;/)}
  ${pala(/function artistiDayIndex\(key\) \{[\s\S]*?\n  \}/)}
  ${pala(/const artistiPakat = new Map\(\);/)}
  ${pala(/function artistiVastausjoukko\(lista\) \{[\s\S]*?\n  \}/)}
  ${pala(/function artistiPakka\(cycle\) \{[\s\S]*?\n  \}/)}
  ${pala(/function paivanArtisti\(key\) \{[\s\S]*?\n  \}/)}
  return { paivanArtisti, artistiDayIndex, artistiPakka, artistiVastausjoukko };
`.replace("ARTISTIT", JSON.stringify(artistit));
const { paivanArtisti, artistiDayIndex, artistiVastausjoukko } = new Function(koodi)();

/* Kierron pituus on vastausjoukko eikä koko lista. Osa artisteista on
   rajattu pois päivän artistista, koska heillä on kaksoisolento: joku
   jolla on täsmälleen samat viisi tietoa. Sellainen vastaus antaisi
   pelaajalle viisi vihreää väärästä arvauksesta. */
const vastaukset = artistiVastausjoukko(artistit);
const N = vastaukset.length;
const pvm = (i) => {
  const d = new Date(Date.UTC(2026, 8, 24) + i * 86400000);
  return d.toISOString().slice(0, 10);
};
let ok = true;
const vaita = (nimi, ehto, lisa = "") => {
  ok = ok && ehto;
  console.log((ehto ? "OK " : "EI ") + nimi + (lisa ? "  " + lisa : ""));
};

// 1. Determinismi
const a1 = paivanArtisti("2026-09-24"), a2 = paivanArtisti("2026-09-24");
vaita("sama päivä antaa saman artistin", a1.id === a2.id, a1.n);

// 2. Eri päivä antaa eri artistin
vaita("peräkkäiset päivät eri artisti",
      paivanArtisti(pvm(0)).id !== paivanArtisti(pvm(1)).id,
      `${paivanArtisti(pvm(0)).n} -> ${paivanArtisti(pvm(1)).n}`);

// 3. Koko kierto ilman toistoja
const kierros = new Set();
for (let i = 0; i < N; i++) kierros.add(paivanArtisti(pvm(i)).id);
vaita(`kierros ${N} päivää ilman toistoja`, kierros.size === N, `${kierros.size}/${N}`);

// 4. Jokainen vastausjoukon artisti tulee vuoroon, eikä yksikään muu
vaita("jokainen vastaus kerran kierrossa", kierros.size === vastaukset.length,
      `${kierros.size}/${vastaukset.length} (koko lista ${artistit.length})`);
const sallitut = new Set(vastaukset.map((a) => a.id));
vaita("kierrossa ei ole rajattuja artisteja",
      [...kierros].every((id) => sallitut.has(id)));

/* Vastausjoukossa ei saa olla kaksoisolentoja. Tämä on se vartija joka
   kaatuu jos rajaus katoaa tai jos uusi artisti tuo mukanaan parin. */
const profiilit = new Map();
for (const a of vastaukset) {
  const k = [a.g, a.j, a.s, a.p, a.v].join("|");
  profiilit.set(k, (profiilit.get(k) || 0) + 1);
}
const parit = [...profiilit.values()].filter((n) => n > 1).length;
vaita("vastausjoukossa ei ole kaksoisolentoja", parit === 0, `${parit} paria`);
vaita("rajattuja on vain se määrä jolla on kaksoisolento",
      artistit.length - vastaukset.length === 25,
      `${artistit.length - vastaukset.length} rajattu`);

// 5. Sauma: lyhin väli saman artistin toistoon
const nahty = new Map();
let lyhin = Infinity, saumapari = null;
for (let i = 0; i < N * 3; i++) {
  const id = paivanArtisti(pvm(i)).id;
  if (nahty.has(id)) {
    const vali = i - nahty.get(id);
    if (vali < lyhin) { lyhin = vali; saumapari = paivanArtisti(pvm(i)).n; }
  }
  nahty.set(id, i);
}
// Takuu on GAP + 1 päivää, luetaan sama luku app.js:stä
const GAP = Number(src.match(/const ARTISTI_GAP = (\d+);/)[1]);
vaita(`lyhin väli toistoon vähintään ${GAP + 1} päivää`, lyhin >= GAP + 1,
      `${lyhin} päivää (${saumapari})`);
vaita(`artisteja riittää saumakorjaukseen (n >= 3*GAP)`, N >= 3 * GAP, `${N} >= ${3 * GAP}`);

// 6. Menneisyys ei kaadu (negatiivinen dayIndex)
const menneet = paivanArtisti("2026-01-01");
vaita("ennen aloituspäivää ei kaadu", !!menneet && !!menneet.n, menneet && menneet.n);

console.log(`\nEnsimmäiset 10 päivää:`);
for (let i = 0; i < 10; i++) {
  const a = paivanArtisti(pvm(i));
  console.log(`  ${pvm(i)}  ${a.n}  (${a.g}, ${a.j} jäsentä, ${a.s}, ${a.p}, ${a.v})`);
}
console.log(ok ? "\nLÄPI" : "\nHYLÄTTY");
process.exit(ok ? 0 : 1);
