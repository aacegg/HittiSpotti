#!/usr/bin/env python3
"""Genreehdotus jokaiselle biisille ja arviointisivu epävarmoille.

    python3 scripts/tee_genrearviointi.py

Lukee:
  katalogi.json               pelattavat biisit
  songs.json                  esikuuntelun osoite
  .genret-apple.json          Applen genre biisikohtaisesti (id -> genre)
  .genrelahteet.json          artistin tyylilajit Wikipediasta ja tagit
                              MusicBrainzista (nimi -> {wp, mb})
  scripts/genret-lista.txt    oma arvio artistin genrestä

Kirjoittaa genret.html. Sivua ei linkitetä mistään eikä sitä indeksoida,
kuten arviointi.html:ää.

MIKSI KOLME LÄHDETTÄ

Yksikään ei riitä yksin. Applella genre on biisikohtainen, mutta
iskelmää sillä ei ole lainkaan: iskelmä on Popissa. Wikipedia ja
MusicBrainz tuntevat iskelmän, mutta kertovat genren vain artistille, ja
saman artistin biisit voivat olla eri genreä. Kun lähteet ovat samaa
mieltä, ehdotus on varma. Kun eivät, biisi menee ihmisen korvalle.

Applen Pop ei kumoa iskelmää. Se tarkoittaa Applella "pop tai iskelmä",
joten se lasketaan iskelmäksi aina kun jokin muu lähde sanoo iskelmä.

Oma arvio (genret-lista.txt) ratkaisee vain tasatilanteen. Se ei ole
lähde vaan arvaus, eikä se saa tehdä ehdotuksesta varmaa.
"""
import json
import re
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from hae_artistit import paanimi

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "genret.html"
GENRET = ["Pop", "Rap", "Rock", "Iskelmä", "Muu"]

APPLE = {
    "Hip-Hop/Rap": "Rap", "Rap": "Rap", "Hip-Hop": "Rap",
    "Rock": "Rock", "Hard Rock": "Rock", "Alternative": "Rock", "Punk": "Rock",
    "Pop Punk": "Rock", "Metal": "Rock", "Death Metal/Black Metal": "Rock",
    "Industrial": "Rock", "Adult Alternative": "Rock", "Blues": "Rock",
    "Pop": "Pop", "Dance": "Pop", "Electronic": "Pop", "Reggae": "Pop",
    "R&B/Soul": "Pop", "Disco": "Pop", "Adult Contemporary": "Pop",
    "Children’s Music": "Muu", "Classical": "Muu", "Soundtrack": "Muu",
    "Choral": "Muu", "Instrumental": "Muu",
}


def luokka(tagi: str):
    """Wikipedian tyylilaji tai MusicBrainzin tagi pelin genreksi.

    Järjestys ratkaisee yhdyssanat: "pop rock" ja "poprock" ovat rockia,
    "pop rap" rapia. Iskelmä ensin, koska "iskelmäpop" on iskelmää."""
    t = tagi.lower()
    if re.search(r"iskelm|schlager|tango|humppa|viihdemusiikki|valssi|jenkka", t):
        return "Iskelmä"
    if re.search(r"hip.?hop|rap|räp|trap|grime", t):
        return "Rap"
    if re.search(r"rock|metal|punk|grunge|hevi|rautalanka|garage|emo\b|hardcore|new wave", t):
        return "Rock"
    if re.search(r"lasten|children|klassi|classical|soundtrack|kuoro|choral", t):
        return "Muu"
    if re.search(r"pop|dance|disco|electro|edm|trance|house|techno|reggae|dancehall|"
                 r"r&b|soul|synth|elektron|tanssi", t):
        return "Pop"
    return None


def artistin_aani(tagit):
    """Ensimmäinen tunnistettu tagi. Wikipedia luettelee päägenren ensin
    ja MusicBrainzin tagit on järjestetty äänimäärän mukaan."""
    for t in tagit or []:
        g = luokka(t)
        if g:
            return g
    return None


def lue_lista():
    oma = {}
    for rivi in (ROOT / "scripts" / "genret-lista.txt").read_text(encoding="utf-8").splitlines():
        if rivi.startswith("#") or "—" not in rivi:
            continue
        nimi, genre = (x.strip() for x in rivi.rsplit("—", 1))
        # Listan metalli ja elektroninen yhdistettiin rockiin ja poppiin.
        oma[nimi] = {"Metalli": "Rock", "Elektroninen": "Pop"}.get(genre, genre)
    return oma


def ehdota(apple, wp, mb, oma):
    """Palauttaa (ehdotus, varma).

    Applen Pop on heikko ääni. Apple merkitsee popiksi 1 082 biisiä
    1 888:sta, myös rockyhtyeiden ja räppärien biisejä, joten se ei
    kumoa Wikipediaa ja MusicBrainzia vaan ratkaisee vain silloin kun
    niitä ei ole. Applen Rap ja Rock ovat vahvoja: niitä se ei jaa
    kevyesti. Sama koskee MusicBrainzin popia iskelmää vastaan, koska
    iskelmä on sielläkin usein merkitty popiksi."""
    taiteilija = [g for g in (wp, mb) if g]
    if "Iskelmä" in taiteilija:
        taiteilija = ["Iskelmä" if g == "Pop" else g for g in taiteilija]
    if apple == "Pop" and taiteilija:
        apple = None
    aanet = [g for g in [apple] + taiteilija if g]
    if not aanet:
        return oma, False
    laskuri = Counter(aanet).most_common()
    paras = [g for g, n in laskuri if n == laskuri[0][1]]
    ehdotus = oma if oma in paras else paras[0]
    # Yksikin artistilähde riittää kun mikään ei ole ristiriidassa: jos
    # Wikipedia sanoo rock eikä muuta tietoa ole, se on parempi kuin
    # ihmisen arvaus. Pelkkä Applen Pop ei riitä, koska se voi olla iskelmää.
    varma = len(set(aanet)) == 1 and (bool(taiteilija) or apple in ("Rap", "Rock", "Muu"))
    # Kaksi kolmesta riittää kun toinen niistä on Applen biisikohtainen
    # Rap tai Rock: se kertoo juuri tästä biisistä eikä vain artistista.
    if not varma and apple in ("Rap", "Rock") and ehdotus == apple and Counter(aanet)[apple] >= 2:
        varma = True
    return ehdotus, varma


def main() -> int:
    kat = [s for s in json.loads((ROOT / "katalogi.json").read_text(encoding="utf-8"))
           if s.get("peli") is not False]
    esikuuntelu = {s["id"]: s["preview"] for s in
                   json.loads((ROOT / "songs.json").read_text(encoding="utf-8"))}
    apple = {int(k): v for k, v in
             json.loads((ROOT / ".genret-apple.json").read_text(encoding="utf-8")).items()}
    lahteet = json.loads((ROOT / ".genrelahteet.json").read_text(encoding="utf-8"))
    oma = lue_lista()

    rivit, epavarmat = [], 0
    for s in kat:
        nimi = paanimi(s["artist"])
        l = lahteet.get(nimi, {})
        a = APPLE.get(apple.get(s["id"]))
        w, m = artistin_aani(l.get("wp")), artistin_aani(l.get("mb"))
        ehdotus, varma = ehdota(a, w, m, oma.get(nimi, "Pop"))
        epavarmat += not varma
        rivit.append({
            "id": s["id"], "a": s["artist"], "t": s["title"], "v": s["year"],
            "p": esikuuntelu.get(s["id"], ""), "e": ehdotus, "ok": varma,
            "la": apple.get(s["id"]) or "-",
            "lw": ", ".join((l.get("wp") or [])[:4]) or "-",
            "lm": ", ".join((l.get("mb") or [])[:4]) or "-",
        })
    # Epävarmat ensin, artistin mukaan, jotta saman artistin biisit
    # kuullaan peräkkäin ja eroja on helppo verrata.
    rivit.sort(key=lambda r: (r["ok"], r["a"].lower(), r["v"]))
    OUT.write_text(SIVU.replace("__DATA__", json.dumps(rivit, ensure_ascii=False))
                   .replace("__GENRET__", json.dumps(GENRET, ensure_ascii=False)),
                   encoding="utf-8")
    jakauma = Counter(r["e"] for r in rivit)
    print(f"{OUT.name}: {len(rivit)} biisiä, epävarmoja {epavarmat}")
    print("ehdotukset:", ", ".join(f"{g} {jakauma[g]}" for g in GENRET))
    return 0


SIVU = """<!doctype html>
<html lang="fi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="color-scheme" content="dark">
<title>HittiSpotti – genrejen arviointi</title>
<style>
:root { --bg:#0a0908; --lift:#14120f; --line:#2a2521; --text:#f2ebdf; --muted:#8a8073;
  --ok:#5ecf9a; --warn:#f5b32e; }
* { box-sizing: border-box; }
body { margin:0; background:var(--bg); color:var(--text);
  font:15px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif; }
header { position:sticky; top:0; z-index:5; background:var(--bg);
  border-bottom:1px solid var(--line); padding:12px 16px; }
h1 { margin:0 0 6px; font-size:17px; }
.rivi { display:flex; flex-wrap:wrap; gap:8px; align-items:center; font-size:13px; color:var(--muted); }
button, select { font:inherit; color:inherit; background:var(--lift); border:1px solid var(--line);
  border-radius:6px; padding:6px 10px; cursor:pointer; }
.edistys { height:3px; background:var(--lift); margin:10px -16px -12px; }
.edistys i { display:block; height:100%; width:0; background:var(--ok); }
ol { list-style:none; margin:0; padding:0 0 40vh; }
li { padding:12px 16px; border-bottom:1px solid var(--lift); }
li.valmis { opacity:.55; }
.yla { display:flex; gap:12px; align-items:center; }
.play { width:40px; height:40px; flex:none; border-radius:50%; padding:0; }
.play.on { background:var(--ok); color:#101010; border-color:var(--ok); }
.nimi { font-weight:600; }
.pieni { color:var(--muted); font-size:12.5px; }
.lahteet { margin:6px 0 8px 52px; color:var(--muted); font-size:12.5px; }
.lahteet b { color:var(--text); font-weight:500; }
.napit { display:flex; flex-wrap:wrap; gap:6px; margin-left:52px; }
.napit button { padding:7px 12px; }
.napit button.ehdotus { border-color:var(--muted); }
.napit button.valittu { background:var(--ok); border-color:var(--ok); color:#101010; font-weight:600; }
.merkki { font-size:11px; padding:1px 6px; border-radius:4px; margin-left:6px; }
.merkki.epa { background:var(--warn); color:#101010; }
</style>
</head>
<body>
<header>
  <h1>Genrejen arviointi</h1>
  <div class="rivi">
    <select id="suodin">
      <option value="epa">Vain epävarmat</option>
      <option value="kaikki">Kaikki biisit</option>
    </select>
    <span id="laskuri"></span>
    <span style="flex:1"></span>
    <button id="vie">Kopioi tulokset</button>
  </div>
  <div class="edistys"><i id="palkki"></i></div>
</header>
<p class="pieni" style="padding:10px 16px;margin:0">Kuuntele ja paina genreä, joka kuulostaa oikealta.
Reunustettu nappi on ehdotus. Valinnat tallentuvat tähän selaimeen. Lopuksi paina
"Kopioi tulokset" ja liitä ne keskusteluun.</p>
<ol id="lista"></ol>
<audio id="soitin" preload="none"></audio>
<script>
const DATA = __DATA__;
const GENRET = __GENRET__;
const AVAIN = "hittispotti:genrearvio";
let valinnat = {};
try { valinnat = JSON.parse(localStorage.getItem(AVAIN) || "{}"); } catch (e) {}
const tallenna = () => { try { localStorage.setItem(AVAIN, JSON.stringify(valinnat)); } catch (e) {} };
const soitin = document.getElementById("soitin");
let soiva = null;

function piirra() {
  const kaikki = document.getElementById("suodin").value === "kaikki";
  const nakyvat = DATA.filter((r) => kaikki || !r.ok);
  const lista = document.getElementById("lista");
  lista.innerHTML = "";
  for (const r of nakyvat) {
    const li = document.createElement("li");
    li.className = valinnat[r.id] ? "valmis" : "";
    const yla = document.createElement("div"); yla.className = "yla";
    const play = document.createElement("button"); play.className = "play"; play.textContent = "▶";
    play.onclick = () => soita(r, play);
    const tiedot = document.createElement("div");
    tiedot.innerHTML = `<div class="nimi"></div><div class="pieni"></div>`;
    tiedot.children[0].textContent = r.t;
    tiedot.children[1].textContent = `${r.a} · ${r.v}`;
    if (!r.ok) {
      const m = document.createElement("span"); m.className = "merkki epa"; m.textContent = "epävarma";
      tiedot.children[0].appendChild(m);
    }
    yla.append(play, tiedot);
    const l = document.createElement("div"); l.className = "lahteet";
    l.innerHTML = `Apple: <b></b> · Wikipedia: <b></b> · MusicBrainz: <b></b>`;
    const b = l.querySelectorAll("b");
    b[0].textContent = r.la; b[1].textContent = r.lw; b[2].textContent = r.lm;
    const napit = document.createElement("div"); napit.className = "napit";
    for (const g of GENRET) {
      const n = document.createElement("button"); n.textContent = g;
      if (g === r.e) n.classList.add("ehdotus");
      if (valinnat[r.id] === g) n.classList.add("valittu");
      n.onclick = () => {
        valinnat[r.id] = g; tallenna();
        li.className = "valmis";
        napit.querySelectorAll("button").forEach((x) => x.classList.toggle("valittu", x === n));
        laske();
      };
      napit.appendChild(n);
    }
    li.append(yla, l, napit);
    lista.appendChild(li);
  }
  laske();
}

function laske() {
  const epa = DATA.filter((r) => !r.ok);
  const tehty = epa.filter((r) => valinnat[r.id]).length;
  document.getElementById("laskuri").textContent = `${tehty} / ${epa.length} epävarmaa tehty`;
  document.getElementById("palkki").style.width = (100 * tehty / Math.max(1, epa.length)) + "%";
}

function soita(r, nappi) {
  if (soiva === nappi) { soitin.pause(); nappi.classList.remove("on"); nappi.textContent = "▶"; soiva = null; return; }
  if (soiva) { soiva.classList.remove("on"); soiva.textContent = "▶"; }
  soitin.src = r.p; soitin.currentTime = 0; soitin.play().catch(() => {});
  nappi.classList.add("on"); nappi.textContent = "❚❚"; soiva = nappi;
}
soitin.onended = () => { if (soiva) { soiva.classList.remove("on"); soiva.textContent = "▶"; soiva = null; } };

document.getElementById("suodin").onchange = piirra;
document.getElementById("vie").onclick = async () => {
  const teksti = JSON.stringify(valinnat);
  try { await navigator.clipboard.writeText(teksti); alert(`Kopioitu (${Object.keys(valinnat).length} biisiä). Liitä keskusteluun.`); }
  catch (e) { prompt("Kopioi tämä:", teksti); }
};
piirra();
</script>
</body>
</html>
"""

if __name__ == "__main__":
    sys.exit(main())
