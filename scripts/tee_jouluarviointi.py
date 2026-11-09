#!/usr/bin/env python3
"""Rakentaa joulukalenterin valintatyökalun ehdokaslistasta.

    python3 scripts/tee_jouluarviointi.py

Lukee scripts/joulu-ehdokkaat.json (haut Applelta, kustakin muutama
versio) ja kirjoittaa joulu-arviointi.html. Työkalussa valitaan jokaiselle
biisille versio tai jätetään biisi pois, ja annetaan vaikeustaso. Valinnat
pysyvät selaimessa, ja Vie-nappi kopioi ne JSONina, joka liitetään
keskusteluun.

Sivu julkaistaan kuten arviointi.html: ei linkkiä mistään, ei indeksointia.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EHDOKKAAT = ROOT / "scripts" / "joulu-ehdokkaat.json"
OUT = ROOT / "joulu-arviointi.html"

TEMPLATE = """<!doctype html>
<html lang="fi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>HittiSpotti – joulubiisien valinta</title>
<style>
:root { --bg:#101014; --pinta:#1c1c22; --viiva:#2c2c35; --teksti:#f1f0f5; --himmea:#9a98a6;
  --valittu:#3b82f6; --pois:#ef4444; --t1:#5ecf9a; --t2:#bcd14a; --t3:#f5b32e; --t4:#ff8a4c; --t5:#ff5f6d; }
* { box-sizing:border-box; }
body { margin:0; background:var(--bg); color:var(--teksti); font:15px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; }
header { position:sticky; top:0; z-index:5; background:var(--bg); border-bottom:1px solid var(--viiva); padding:12px 14px; }
h1 { margin:0 0 6px; font-size:17px; }
.tila { color:var(--himmea); font-size:14px; }
.tila b { color:var(--teksti); }
.rivi { display:flex; flex-wrap:wrap; gap:8px; margin-top:8px; align-items:center; }
button { font:inherit; border:1px solid var(--viiva); background:var(--pinta); color:var(--teksti); border-radius:8px; padding:7px 12px; cursor:pointer; }
button.paalla { background:var(--valittu); border-color:var(--valittu); }
main { padding:8px 14px 80px; max-width:720px; margin:0 auto; }
.biisi { border:1px solid var(--viiva); border-radius:12px; padding:12px; margin-top:12px; background:var(--pinta); }
.biisi.pois { opacity:.45; }
.biisi.valmis { border-color:#2f5e45; }
.haku { font-weight:700; }
.versio { display:flex; align-items:center; gap:10px; margin-top:8px; padding:6px; border-radius:8px; cursor:pointer; }
.versio.valittu { background:#1d2a44; outline:1px solid var(--valittu); }
.versio img { width:44px; height:44px; border-radius:4px; background:var(--viiva); }
.versio .nimi { flex:1; }
.versio small { color:var(--himmea); display:block; }
.soita { width:40px; padding:7px 0; }
.alarivi { display:flex; flex-wrap:wrap; gap:6px; margin-top:10px; align-items:center; }
.taso { padding:6px 10px; }
.taso.valittu[data-t="1"] { background:var(--t1); color:#111; }
.taso.valittu[data-t="2"] { background:var(--t2); color:#111; }
.taso.valittu[data-t="3"] { background:var(--t3); color:#111; }
.taso.valittu[data-t="4"] { background:var(--t4); color:#111; }
.taso.valittu[data-t="5"] { background:var(--t5); color:#111; }
.poisnappi { margin-left:auto; }
.poisnappi.valittu { background:var(--pois); border-color:var(--pois); }
.ei { color:var(--himmea); margin-top:6px; }
textarea { width:100%; height:140px; margin-top:8px; background:var(--pinta); color:var(--teksti); border:1px solid var(--viiva); border-radius:8px; }
</style>
</head>
<body>
<header>
  <h1>Joulubiisien valinta</h1>
  <div class="tila" id="tila"></div>
  <div class="rivi">
    <button id="suodata">Näytä vain käsittelemättömät</button>
    <button id="vie">Vie valinnat</button>
  </div>
  <textarea id="vienti" hidden readonly></textarea>
</header>
<main id="lista"></main>
<script>
const DATA = __DATA__;
const TASOT = ["Helppo", "Keskitaso", "Vaikea", "Mestari", "Mahdoton"];
const AVAIN = "hittispotti:joulu:valinnat";
let valinnat = {};
try { valinnat = JSON.parse(localStorage.getItem(AVAIN)) || {}; } catch {}
const tallenna = () => { try { localStorage.setItem(AVAIN, JSON.stringify(valinnat)); } catch {} };
const aani = new Audio();
let soiva = null;
let vainKesken = false;

function valmis(i) {
  const v = valinnat[i];
  return v && (v.pois || (v.id && v.taso));
}

function piirra() {
  const lista = document.getElementById("lista");
  lista.innerHTML = "";
  DATA.forEach((b, i) => {
    if (vainKesken && valmis(i)) return;
    const v = valinnat[i] || {};
    const el = document.createElement("div");
    el.className = "biisi" + (v.pois ? " pois" : "") + (valmis(i) && !v.pois ? " valmis" : "");
    el.innerHTML = `<div class="haku">${i + 1}. ${b.haku.replace("|", " – ").replace(/^ – /, "")}</div>`;
    if (!b.vaihtoehdot.length) el.innerHTML += `<div class="ei">Applelta ei löytynyt esikuuntelua.</div>`;
    b.vaihtoehdot.forEach((o) => {
      const r = document.createElement("div");
      r.className = "versio" + (v.id === o.id ? " valittu" : "");
      r.innerHTML = `<button class="soita">${soiva === o.esikuuntelu ? "■" : "▶"}</button>
        <img src="${o.kansi}" alt="" loading="lazy">
        <div class="nimi">${o.nimi}<small>${o.artisti}, ${o.vuosi}</small></div>`;
      r.querySelector(".soita").onclick = (e) => {
        e.stopPropagation();
        if (soiva === o.esikuuntelu) { aani.pause(); soiva = null; }
        else { aani.src = o.esikuuntelu; aani.play(); soiva = o.esikuuntelu; }
        piirra();
      };
      r.onclick = () => { valinnat[i] = { ...v, id: o.id, pois: false }; tallenna(); piirra(); };
      el.appendChild(r);
    });
    const ala = document.createElement("div");
    ala.className = "alarivi";
    TASOT.forEach((n, t) => {
      const nappi = document.createElement("button");
      nappi.className = "taso" + (v.taso === t + 1 ? " valittu" : "");
      nappi.dataset.t = t + 1;
      nappi.textContent = n;
      nappi.onclick = () => { valinnat[i] = { ...v, taso: t + 1, pois: false, id: v.id || (b.vaihtoehdot[0] || {}).id }; tallenna(); piirra(); };
      ala.appendChild(nappi);
    });
    const pois = document.createElement("button");
    pois.className = "poisnappi" + (v.pois ? " valittu" : "");
    pois.textContent = "Ei mukaan";
    pois.onclick = () => { valinnat[i] = { pois: !v.pois }; tallenna(); piirra(); };
    ala.appendChild(pois);
    el.appendChild(ala);
    lista.appendChild(el);
  });
  const mukana = DATA.filter((_, i) => valmis(i) && !valinnat[i].pois).length;
  const tasoittain = [1, 2, 3, 4, 5].map((t) => DATA.filter((_, i) => valmis(i) && valinnat[i].taso === t && !valinnat[i].pois).length);
  const kasitelty = DATA.filter((_, i) => valmis(i)).length;
  document.getElementById("tila").innerHTML =
    `Käsitelty <b>${kasitelty}</b> / ${DATA.length}. Mukana <b>${mukana}</b> (tavoite 120). ` +
    `Tasoittain: ${tasoittain.map((n, t) => TASOT[t] + " " + n).join(", ")}.`;
}

document.getElementById("suodata").onclick = (e) => {
  vainKesken = !vainKesken;
  e.target.classList.toggle("paalla", vainKesken);
  piirra();
};
document.getElementById("vie").onclick = async () => {
  const ulos = DATA.map((b, i) => {
    const v = valinnat[i];
    if (!v || v.pois || !v.id) return null;
    const o = b.vaihtoehdot.find((x) => x.id === v.id);
    return { id: o.id, artisti: o.artisti, nimi: o.nimi, vuosi: o.vuosi, taso: v.taso || null };
  }).filter(Boolean);
  const teksti = JSON.stringify(ulos);
  const ta = document.getElementById("vienti");
  ta.hidden = false;
  ta.value = teksti;
  try { await navigator.clipboard.writeText(teksti); e.target.textContent = "Kopioitu"; } catch { ta.select(); }
};
aani.onended = () => { soiva = null; piirra(); };
piirra();
</script>
</body>
</html>
"""


def main():
    data = json.loads(EHDOKKAAT.read_text(encoding="utf-8"))
    OUT.write_text(TEMPLATE.replace("__DATA__", json.dumps(data, ensure_ascii=False)), encoding="utf-8")
    print(f"{OUT.name}: {len(data)} ehdokasta, "
          f"{sum(1 for b in data if b['vaihtoehdot'])} löytyi Applelta")


if __name__ == "__main__":
    main()
