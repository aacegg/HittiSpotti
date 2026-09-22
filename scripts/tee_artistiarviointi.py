#!/usr/bin/env python3
"""Rakentaa arviointisivun artistien taustatiedoille.

    python3 scripts/tee_artistiarviointi.py          # rakenna sivu
    python3 scripts/tee_artistiarviointi.py --kayta arviot.json

Lukee .artistit.json (ks. hae_artistit.py) ja kirjoittaa
.artistit-arviointi.html. Molemmat alkavat pisteellä eivätkä mene
julkaistuun hakemistoon.

MITÄ ARVIOIDAAN

Kolme asiaa, jotka kone ei osaa päättää luotettavasti:

1. GENRE. MusicBrainzin tagit ratkaisevat genren 135 artistille, mutta
   71:ltä ne puuttuvat tai eivät kerro genreä (esimerkiksi pelkkä
   "finnish" tai "eurovision"). Applen rajapinta antaa genren, mutta se on liian karkea
   juuri siinä kohdassa joka merkitsee: Jari Sillanpää, Danny ja Frederik
   ovat kaikki "Pop", vaikka ne ovat iskelmää. Applen arvaus näytetään
   esivalintana, mutta se on arvaus eikä data.

2. KOKOONPANO. MusicBrainz laskee taustamuusikot mukaan, joten JVG on
   siellä nelihenkinen ja PMMP viisihenkinen, vaikka molempia pidetään
   duoina. Lisäksi 12 yhtyeeltä jäsenet puuttuvat kokonaan. Peliin
   riittää karkea luokka: soolo, duo vai yhtye.

3. EPÄVARMAT OSUMAT. Sumealla haulla löytyneet ja ne joilta puuttuu
   debyyttivuosi.

Sivu tallentaa valinnat selaimeen, joten työn voi jättää kesken.
"""
import argparse
import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TIEDOT = ROOT / ".artistit.json"
ULOS = ROOT / ".artistit-arviointi.html"

GENRET = ["Rap", "Rock", "Pop", "Iskelmä", "Metalli", "Elektroninen", "Muu"]

# Tagi -> genre. Kansallisuus, ammatti ja tapahtumat eivät ole genrejä:
# "finnish" on 49 artistilla eikä erottele mitään, koska kaikki ovat
# suomalaisia. Sama koskee tageja singer, actor ja eurovision.
EI_GENRE = {"finnish", "finland", "finlandia", "suomi", "umk 2025", "umk",
            "instrumental", "live", "soundtrack", "singer", "finnish singer",
            "actor", "eurovision", "eurovision 2023 artists", "eurovision 2025"}

KARTTA = [
    ("Rap", ["hip hop", "rap", "pop rap", "finnish rap", "sport rap", "rapping",
             "trap", "gangsta rap", "horrorcore", "alternative rap"]),
    ("Metalli", ["metal", "heavy metal", "power metal", "symphonic metal",
                 "death metal", "black metal", "folk metal", "gothic metal",
                 "melodic death metal", "industrial metal", "nu metal"]),
    ("Iskelmä", ["iskelmä", "schlager", "tango", "humppa"]),
    ("Elektroninen", ["electronic", "eurodance", "techno", "house", "trance",
                      "edm", "synthpop", "electropop", "dance"]),
    ("Rock", ["rock", "alternative rock", "finnish rock", "punk", "punk rock",
              "post-grunge", "gothic rock", "alternative/indie rock", "manserock",
              "folk rock", "indie rock", "hard rock", "garage rock", "grunge",
              "progressive rock", "psychedelic rock", "rockabilly", "blues rock"]),
    ("Pop", ["pop", "pop rock", "art pop", "finnish pop", "dance-pop", "indie pop",
             "teen pop", "singer-songwriter", "soul", "r&b", "funk", "disco",
             "chamber pop", "synth-pop", "folk pop", "reggae"]),
]
TAGI_GENRE = {t: g for g, tagit in KARTTA for t in tagit}
# Järjestys ratkaisee tasapelin. Rap ennen poppia, koska "pop rap" on rap.
PAINO = {g: i for i, (g, _) in enumerate(KARTTA)}


def genre_tageista(tagit):
    """Yleisin genre artistin tageista, tasapeli kartan järjestyksellä."""
    osumat = [TAGI_GENRE[t] for t in tagit
              if t not in EI_GENRE and t in TAGI_GENRE]
    if not osumat:
        return None
    laskuri = Counter(osumat)
    paras = max(laskuri.values())
    ehdokkaat = [g for g, n in laskuri.items() if n == paras]
    return min(ehdokkaat, key=lambda g: PAINO[g])


def kokoonpano_ehdotus(a):
    """Soolo, duo vai yhtye.

    Nimi on usein varmempi kuin MusicBrainzin jäsenlista: "Pasi ja Anssi"
    ja "Ida Paul & Kalle Lindroth" ovat duoja nimensä perusteella, vaikka
    tietokanta sanoo muuta.
    """
    if a.get("tyyppi") == "Person":
        return "Soolo", "tyyppi on Person"
    nimi = a.get("nimi", "")
    # Kaksi henkilönnimeä yhdistettynä: "X ja Y", "X & Y".
    if re.search(r"\w+\s+(ja|&)\s+\w+", nimi) and len(nimi.split()) <= 6:
        return "Duo", "nimessä kaksi nimeä"
    n = a.get("jasenet")
    if n == 2:
        return "Duo", "MusicBrainz: 2 jäsentä"
    if isinstance(n, int) and n >= 3:
        return "Yhtye", f"MusicBrainz: {n} jäsentä"
    return "Yhtye", "jäsenmäärä puuttuu, oletus"


def esc(t):
    return (str(t).replace("&", "&amp;").replace("<", "&lt;")
            .replace(">", "&gt;").replace('"', "&quot;"))


def rivi(k, a):
    genre = genre_tageista(a.get("tagit") or [])
    lahde = "MusicBrainz" if genre else "ei tietoa"
    kokoonpano, peruste = kokoonpano_ehdotus(a)
    tagit = ", ".join(a.get("tagit") or []) or "ei tageja"
    varoitus = []
    if a.get("lahde") == "sumea":
        varoitus.append(f"sumea osuma: {a.get('mbnimi')}")
    if not a.get("debyytti"):
        varoitus.append("debyyttivuosi puuttuu")
    if not genre:
        varoitus.append("genre puuttuu")
    napit = "".join(
        f'<button type="button" class="g{" on" if g == genre else ""}" data-g="{esc(g)}">{esc(g)}</button>'
        for g in GENRET)
    kokot = "".join(
        f'<button type="button" class="k{" on" if x == kokoonpano else ""}" data-k="{x}">{x}</button>'
        for x in ("Soolo", "Duo", "Yhtye"))
    return f"""<tr data-k="{esc(k)}" data-genre="{esc(genre or '')}" data-kokoonpano="{esc(kokoonpano)}"
      class="{'huomio' if varoitus else ''}">
  <td class="nimi"><b>{esc(a['nimi'])}</b>
    <span>{a['biisit']} biisiä &middot; {a['eka']}&ndash;{a['vika']} &middot; debyytti {esc(a.get('debyytti') or '?')}</span>
    <span class="tagit">{esc(tagit)}</span>
    {'<span class="varo">' + esc(' &middot; '.join(varoitus)) + '</span>' if varoitus else ''}
  </td>
  <td class="napit">{napit}<div class="rivi2">{kokot}</div>
    <span class="peruste">{esc(lahde)} &middot; {esc(peruste)}</span></td>
</tr>"""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--kayta", help="lue arviot JSON-tiedostosta ja kirjoita .artistit.json")
    a = ap.parse_args()

    tiedot = json.loads(TIEDOT.read_text(encoding="utf-8"))
    mukana = {k: v for k, v in tiedot.items() if v.get("biisit", 0) >= 3}

    if a.kayta:
        arviot = json.loads(Path(a.kayta).read_text(encoding="utf-8"))
        n = 0
        for k, v in arviot.get("artistit", {}).items():
            if k not in tiedot:
                print(f"tuntematon avain: {k}", file=sys.stderr)
                continue
            tiedot[k]["genre"] = v.get("genre")
            tiedot[k]["kokoonpano"] = v.get("kokoonpano")
            n += 1
        TIEDOT.write_text(json.dumps(tiedot, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"Päivitetty {n} artistia")
        return 0

    # Huomiota vaativat ensin, muuten biisimäärän mukaan.
    def jarjestys(kv):
        k, v = kv
        puuttuu = (not genre_tageista(v.get("tagit") or [])
                   or v.get("lahde") == "sumea" or not v.get("debyytti"))
        return (0 if puuttuu else 1, -v["biisit"])

    rivit = "".join(rivi(k, v) for k, v in sorted(mukana.items(), key=jarjestys))
    huomio = sum(1 for k, v in mukana.items()
                 if not genre_tageista(v.get("tagit") or [])
                 or v.get("lahde") == "sumea" or not v.get("debyytti"))

    html = SIVU.replace("{{RIVIT}}", rivit).replace("{{N}}", str(len(mukana))) \
               .replace("{{HUOMIO}}", str(huomio))
    ULOS.write_text(html, encoding="utf-8")
    print(f"{ULOS.name}: {len(mukana)} artistia, {huomio} vaatii huomiota")
    return 0


SIVU = """<!doctype html><html lang="fi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Artistien arviointi</title><style>
:root{--bg:#0a0908;--text:#f2ebdf;--muted:#8a8073;--dim:#857c6f;--line:#2a2521;
--live:#5ecf9a;--varo:#e0b341}
*{box-sizing:border-box}
body{margin:0;padding:18px 14px 86px;background:var(--bg);color:var(--text);
 font:15px/1.4 system-ui,-apple-system,sans-serif}
h1{font-size:20px;margin:0 0 4px}
.lead{color:var(--muted);font-size:13px;margin:0 0 14px}
table{width:100%;border-collapse:collapse}
td{padding:10px 4px;border-bottom:1px solid #16130f;vertical-align:top}
tr.huomio .nimi b{color:var(--varo)}
.nimi{width:42%}
.nimi b{display:block;font-size:14px}
.nimi span{display:block;color:var(--muted);font-size:11.5px;margin-top:2px}
.nimi .tagit{color:var(--dim);font-style:italic}
.nimi .varo{color:var(--varo)}
.napit{text-align:right}
.rivi2{margin-top:5px}
button{background:transparent;border:1px solid var(--line);border-radius:999px;
 color:var(--dim);font:inherit;font-size:11.5px;padding:4px 9px;margin:0 0 4px 4px;cursor:pointer}
button.on{border-color:var(--live);color:var(--live);font-weight:700}
button.k.on{border-color:var(--varo);color:var(--varo)}
.peruste{display:block;color:var(--dim);font-size:10.5px;margin-top:3px}
#ala{position:fixed;left:0;right:0;bottom:0;background:#12100e;border-top:1px solid var(--line);
 padding:10px 14px;display:flex;gap:10px;align-items:center}
#ala button{background:var(--live);color:#0a0908;border:0;font-weight:700;font-size:14px;padding:9px 16px}
#luku{color:var(--muted);font-size:12.5px}
#ta{position:fixed;left:-9999px}
</style></head><body>
<h1>Artistien arviointi</h1>
<p class="lead">{{N}} artistia, joista {{HUOMIO}} vaatii huomiota ja on nostettu ylimmäksi.
Keltainen nimi tarkoittaa puuttuvaa tai epävarmaa tietoa. Valinnat tallentuvat selaimeen,
joten voit jättää kesken.</p>
<table><tbody>{{RIVIT}}</tbody></table>
<div id="ala"><button onclick="kopioi()">Kopioi valinnat</button><span id="luku"></span></div>
<textarea id="ta"></textarea>
<script>
const AVAIN="hittispotti:artistiarviot";
const rivit=[...document.querySelectorAll("tbody tr")];
let tila={};
try{ tila=JSON.parse(localStorage.getItem(AVAIN)||"{}"); }catch(e){}
function piirra(){
  let muutettu=0;
  for(const tr of rivit){
    const k=tr.dataset.k;
    const g=(tila[k]&&tila[k].genre)||tr.dataset.genre;
    const ko=(tila[k]&&tila[k].kokoonpano)||tr.dataset.kokoonpano;
    tr.querySelectorAll("button.g").forEach(b=>b.classList.toggle("on",b.dataset.g===g));
    tr.querySelectorAll("button.k").forEach(b=>b.classList.toggle("on",b.dataset.k===ko));
    if(tila[k]) muutettu++;
  }
  document.getElementById("luku").textContent=muutettu+" muutettu / "+rivit.length;
}
document.addEventListener("click",(e)=>{
  const b=e.target.closest("button.g, button.k"); if(!b) return;
  const tr=b.closest("tr"), k=tr.dataset.k;
  tila[k]=tila[k]||{genre:tr.dataset.genre,kokoonpano:tr.dataset.kokoonpano};
  if(b.dataset.g) tila[k].genre=b.dataset.g; else tila[k].kokoonpano=b.dataset.k;
  try{ localStorage.setItem(AVAIN,JSON.stringify(tila)); }catch(e){}
  piirra();
});
piirra();
function kopioi(){
  const ulos={};
  for(const tr of rivit){
    const k=tr.dataset.k;
    ulos[k]={genre:(tila[k]&&tila[k].genre)||tr.dataset.genre,
             kokoonpano:(tila[k]&&tila[k].kokoonpano)||tr.dataset.kokoonpano};
  }
  const t=JSON.stringify({artistit:ulos});
  const ta=document.getElementById("ta"); ta.value=t; ta.select();
  try{document.execCommand("copy");}catch(e){}
  if(navigator.clipboard) navigator.clipboard.writeText(t).catch(()=>{});
  document.getElementById("luku").textContent="Kopioitu ("+rivit.length+" artistia)";
}
</script></body></html>"""


if __name__ == "__main__":
    sys.exit(main())
