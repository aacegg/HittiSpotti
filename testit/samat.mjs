/* Sama biisi kahtena levytyksenä: kumpikin arvaus on oikein.
 *
 *   node testit/samat.mjs             (projektin juuresta)
 */
import fs from "node:fs";
const src = fs.readFileSync("app.js", "utf8");
const pala = (h) => { const m = src.match(h); if (!m) throw new Error("ei löytynyt " + h); return m[0]; };
const kat = JSON.parse(fs.readFileSync("katalogi.json", "utf8"));
const { SAMA_BIISI, samaBiisi, piilossaHaussa } = new Function(`
  ${pala(/  const SAMA_BIISI = [\s\S]*?const piilossaHaussa = [^\n]*/)}
  return { SAMA_BIISI, samaBiisi, piilossaHaussa };`)();
let ok = true;
const vaita = (nimi, ehto) => { ok = ok && ehto; console.log((ehto ? "OK " : "EI ") + nimi); };
const idt = new Set(kat.map((s) => String(s.id)));
vaita("ryhmien biisit ovat katalogissa", SAMA_BIISI.flat().every((id) => idt.has(String(id))));
for (const [a, b] of SAMA_BIISI) {
  vaita(`${a} ja ${b} sama kumpaankin suuntaan`, samaBiisi(a, b) && samaBiisi(b, a) && samaBiisi(String(a), b));
  vaita(`haussa näkyy ${a}, piilossa ${b}`, !piilossaHaussa.has(String(a)) && piilossaHaussa.has(String(b)));
}
vaita("eri biisit eivät ole samoja", !samaBiisi(209278450, 216691214));
vaita("biisi on sama kuin itsensä", samaBiisi(216691214, 216691214));
console.log(ok ? "\nLÄPI" : "\nHYLÄTTY");
process.exit(ok ? 0 : 1);
