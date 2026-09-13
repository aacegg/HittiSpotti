#!/usr/bin/env python3
"""Rakentaa vertailu.html: kumpi äänite biisistä kuuluu peliin.

    python3 scripts/tarkista_vuodet.py --mukaan taytteet --rinnakkain 2
    python3 scripts/tee_vertailu.py

Lukee tarkista_vuodet.py:n välimuistin ja tekee sivun, jolla molemmat
versiot voi kuunnella peräkkäin ja valita kumpi jää peliin.

Tätä ei voi päättää datasta. Kesto kertoo että äänitteet ovat eri, ja
vuosi kertoo kumpi on vanhempi, mutta peliin kuuluu se jonka kuulija
tunnistaa. Se on usein alkuperäinen, muttei aina: radiosoitossa on voinut
olla myöhempi versio, ja uudelleenlevytys on voinut jäädä mieleen
paremmin kuin alkuperäinen.

Live- ja joululevyt jätetään pois. Ne eivät ole vaihtoehtoja pelin
äänitteeksi, joten niiden esittäminen valintana olisi harhaanjohtavaa.

Valinnat tallentuvat selaimeen ja ne voi viedä JSONina.

Ei vaadi ulkoisia riippuvuuksia (vain Python 3:n vakiokirjasto).
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SONGS = ROOT / "songs.json"
VALIMUISTI = ROOT / ".aanitteet-tarkistus.json"
ULOS = ROOT / "vertailu.html"

# Vanhempi osuma näiltä levyiltä ei ole vaihtoehto vaan eri esitys.
OHITA = ("live", "joulu", "varietee", "christmas", "konsertti")
# Kuinka monta vuotta vanhempi ehdokkaan pitää olla ollakseen kiinnostava.
# Sama raja kuin tarkista_vuodet.py:ssä.
VANHEMPI = 3


def mmss(s):
    return f"{s // 60}.{s % 60:02d}"


def parit():
    if not VALIMUISTI.exists():
        print("Aja ensin tarkista_vuodet.py --mukaan taytteet", file=sys.stderr)
        return []
    tila = json.loads(VALIMUISTI.read_text(encoding="utf-8"))
    songs = {s["id"]: s for s in json.loads(SONGS.read_text(encoding="utf-8"))}
    ulos = []
    for avain, t in tila.items():
        if not t:
            continue
        s = songs.get(int(avain))
        if not s:
            continue
        v = t["vanhin"]
        if any(w in (v.get("collectionName") or "").lower() for w in OHITA):
            continue
        # Välimuisti on tallennettu ennen vuosikorjauksia, joten osa
        # pareista on jo ratkennut: kun katalogin vuosi korjattiin
        # äänitteen omaksi vuodeksi, ehdokas ei enää ole vanhempi.
        # Silloin pelissä on jo alkuperäinen eikä valittavaa ole.
        vv = int((v.get("releaseDate") or "0")[:4])
        if not s.get("year") or vv >= s["year"] - VANHEMPI:
            continue
        ulos.append({
            "id": s["id"],
            "artisti": s["artist"],
            "nimi": s["title"],
            "peli": s.get("peli") is not False,
            "nyt": {
                "id": s["id"], "vuosi": s.get("year"), "kesto": t["kesto"],
                "levy": s.get("itunes", ""), "preview": s.get("preview", ""),
                "art": s.get("art", ""),
            },
            "vaihto": {
                "id": v["trackId"], "vuosi": int((v.get("releaseDate") or "0")[:4]),
                "kesto": round((v.get("trackTimeMillis") or 0) / 1000),
                "levy": v.get("collectionName") or "",
                "artisti": v.get("artistName") or "",
                "preview": v.get("previewUrl") or "",
                "art": (v.get("artworkUrl100") or "").replace("100x100", "300x300"),
            },
        })
    # Katalogi tallentaa vain "artisti - nimi (vuosi)", mikä toistaa
    # otsikon eikä kerro mitään. Levyn nimi on koko vertailun ydin: se
    # paljastaa että kyse on kokoelmasta eikä artistin omasta levystä.
    if ulos:
        sys.path.insert(0, str(ROOT / "scripts"))
        from hae_soittolistalta import api  # noqa: E402
        levyt = {r["trackId"]: r.get("collectionName")
                 for r in api("lookup", id=",".join(str(p["id"]) for p in ulos))
                 if r.get("kind") == "song"}
        for p in ulos:
            p["nyt"]["levy"] = levyt.get(p["id"]) or p["nyt"]["levy"]

    ulos.sort(key=lambda p: p["nyt"]["vuosi"] - p["vaihto"]["vuosi"], reverse=True)
    return ulos


SIVU = """<!doctype html>
<html lang="fi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="color-scheme" content="dark">
<title>HittiSpotti – kumpi äänite?</title>
<style>
:root {
  --bg: #0a0908; --lift: #14120f; --line: #2a2521; --text: #f2ebdf;
  --dim: #948a7c; --faint: #6d6559; --live: #5ecf9a; --vaihto: #f5b32e;
  color-scheme: dark;
}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--bg); color: var(--text);
  font: 15px/1.55 system-ui, -apple-system, "Segoe UI", sans-serif;
  -webkit-font-smoothing: antialiased;
}
.kuori { max-width: 760px; margin: 0 auto; padding-inline: 18px; padding-block: 0 60px; }
header { padding-block: 36px 22px; border-bottom: 1px solid var(--line); }
h1 { margin: 0; font-size: 26px; letter-spacing: -.01em; }
header p { margin: 12px 0 0; color: var(--dim); max-width: 58ch; }
.edistys { margin-top: 18px; font: 600 13px/1 ui-monospace, monospace; color: var(--faint); }

.pari { padding-block: 26px; border-bottom: 1px solid var(--line); }
.pari h2 { margin: 0; font-size: 18px; }
.pari .artisti { color: var(--dim); font-size: 14px; }
.ero { margin-top: 6px; font: 600 12px/1 ui-monospace, monospace; color: var(--vaihto); }

.puolet { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 16px; }
@media (max-width: 620px) { .puolet { grid-template-columns: 1fr; } }

.puoli {
  padding: 14px; background: var(--lift); border: 1px solid var(--line);
  border-radius: 4px; display: flex; flex-direction: column; gap: 10px;
}
.puoli.valittu { border-color: var(--live); }
.rooli { font: 600 10.5px/1 ui-monospace, monospace; letter-spacing: .12em;
         text-transform: uppercase; color: var(--faint); }
.puoli.valittu .rooli { color: var(--live); }
.meta { font: 400 13px/1.5 ui-monospace, monospace; color: var(--dim); }
.meta b { color: var(--text); font-size: 17px; }
.levy { font-size: 12.5px; color: var(--faint); word-break: break-word; }

.napit { display: flex; gap: 8px; margin-top: auto; }
button {
  flex: 1; padding: 10px; border-radius: 4px; border: 1px solid var(--line);
  background: transparent; color: var(--text); font: 600 13px/1 inherit;
  cursor: pointer;
}
button:hover { border-color: var(--dim); }
button.soi { border-color: var(--vaihto); color: var(--vaihto); }
.valitse.on { background: var(--live); border-color: var(--live); color: #07120c; }
:focus-visible { outline: 2px solid var(--vaihto); outline-offset: 2px; }

.vienti { margin-top: 30px; display: flex; gap: 10px; flex-wrap: wrap; }
.vienti button { flex: 0 1 auto; padding-inline: 18px; }
textarea {
  width: 100%; margin-top: 14px; min-height: 150px; padding: 12px;
  background: var(--lift); color: var(--text); border: 1px solid var(--line);
  border-radius: 4px; font: 12px/1.5 ui-monospace, monospace;
}
</style>
</head>
<body>
<div class="kuori">
<header>
  <h1>Kumpi äänite kuuluu peliin?</h1>
  <p>
    Näissä biiseissä katalogissa oleva äänite on eri pituinen kuin vanhempi
    julkaisu, eli kyse on eri levytyksestä eikä samasta äänitteestä eri
    levyllä. Kuuntele molemmat ja valitse se jonka suomalainen tunnistaa.
    Se on usein alkuperäinen, muttei aina.
  </p>
  <p class="edistys" id="edistys"></p>
</header>
<div id="lista"></div>

<div class="vienti">
  <button id="vie">Näytä valinnat</button>
  <button id="tyhjenna">Tyhjennä</button>
</div>
<textarea id="tuloste" readonly hidden></textarea>
</div>

<script>
const PARIT = __DATA__;
const KEY = "hittispotti-vertailu:v1";
let valinnat = {};
try { valinnat = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) { valinnat = {}; }

const mmss = (s) => Math.floor(s / 60) + "." + String(s % 60).padStart(2, "0");
const pako = (s) => String(s == null ? "" : s).replace(/[&<>"]/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

let soiva = null;
function soita(url, nappi) {
  if (soiva) { soiva.audio.pause(); soiva.nappi.classList.remove("soi"); }
  if (soiva && soiva.nappi === nappi) { soiva = null; return; }
  const audio = new Audio(url);
  audio.play().catch(() => {});
  nappi.classList.add("soi");
  audio.addEventListener("ended", () => nappi.classList.remove("soi"));
  soiva = { audio, nappi };
}

function puoli(p, mika) {
  const d = p[mika];
  const on = valinnat[p.id] === mika;
  return `<div class="puoli ${on ? "valittu" : ""}" data-id="${p.id}" data-mika="${mika}">
    <span class="rooli">${mika === "nyt" ? "pelissä nyt" : "vanhempi"}</span>
    <p class="meta"><b>${d.vuosi}</b> · ${mmss(d.kesto)}</p>
    <p class="levy">${pako(d.levy)}</p>
    <div class="napit">
      <button type="button" class="kuuntele" data-url="${pako(d.preview)}">Kuuntele</button>
      <button type="button" class="valitse ${on ? "on" : ""}">${on ? "Valittu" : "Valitse"}</button>
    </div>
  </div>`;
}

function piirra() {
  document.getElementById("lista").innerHTML = PARIT.map((p) => `
    <section class="pari">
      <h2>${pako(p.nimi)}</h2>
      <p class="artisti">${pako(p.artisti)}</p>
      <p class="ero">${p.nyt.vuosi - p.vaihto.vuosi} vuoden ero · kestoero
         ${(p.vaihto.kesto - p.nyt.kesto > 0 ? "+" : "")}${p.vaihto.kesto - p.nyt.kesto} s</p>
      <div class="puolet">${puoli(p, "nyt")}${puoli(p, "vaihto")}</div>
    </section>`).join("");
  const n = Object.keys(valinnat).length;
  document.getElementById("edistys").textContent = `${n} / ${PARIT.length} valittu`;
}

document.addEventListener("click", (e) => {
  const kuuntele = e.target.closest(".kuuntele");
  if (kuuntele) { soita(kuuntele.dataset.url, kuuntele); return; }
  const valitse = e.target.closest(".valitse");
  if (!valitse) return;
  const puoli = valitse.closest(".puoli");
  const id = Number(puoli.dataset.id);
  valinnat[id] = valinnat[id] === puoli.dataset.mika ? undefined : puoli.dataset.mika;
  if (!valinnat[id]) delete valinnat[id];
  try { localStorage.setItem(KEY, JSON.stringify(valinnat)); } catch (err) {}
  piirra();
});

document.getElementById("vie").addEventListener("click", () => {
  const ulos = PARIT.filter((p) => valinnat[p.id]).map((p) => ({
    id: p.id, biisi: p.artisti + " – " + p.nimi,
    valinta: valinnat[p.id],
    uusi_id: valinnat[p.id] === "vaihto" ? p.vaihto.id : p.nyt.id,
    uusi_vuosi: valinnat[p.id] === "vaihto" ? p.vaihto.vuosi : p.nyt.vuosi,
  }));
  const t = document.getElementById("tuloste");
  t.hidden = false;
  t.value = JSON.stringify(ulos, null, 1);
  t.select();
});

document.getElementById("tyhjenna").addEventListener("click", () => {
  if (!confirm("Tyhjennetäänkö kaikki valinnat?")) return;
  valinnat = {};
  try { localStorage.removeItem(KEY); } catch (err) {}
  document.getElementById("tuloste").hidden = true;
  piirra();
});

piirra();
</script>
</body>
</html>
"""


def main() -> int:
    p = parit()
    if not p:
        return 1
    ULOS.write_text(SIVU.replace("__DATA__", json.dumps(p, ensure_ascii=False)),
                    encoding="utf-8")
    print(f"vertailu.html: {len(p)} paria, {ULOS.stat().st_size // 1024} kt")
    for x in p:
        print(f"  {x['nyt']['vuosi']} -> {x['vaihto']['vuosi']}  "
              f"{x['artisti']} – {x['nimi']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
