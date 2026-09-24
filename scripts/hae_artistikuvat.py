#!/usr/bin/env python3
"""Hakee ArtistiSpotin artisteille kuvan iTunesista.

    python3 scripts/hae_artistikuvat.py
    python3 scripts/hae_artistikuvat.py --uudelleen     (myös jo haetut)
    python3 scripts/hae_artistikuvat.py --kuiva         (ei kirjoiteta)

MIKÄ KUVA

Artistin levynkansi, ei valokuva artistista. iTunesin hakurajapinta ei
palauta artistikuvia lainkaan, ja Wikipedian kuvista iso osa on
suomalaisilla artisteilla epävapaita eli niitä ei saa käyttää muualla.
Levynkansi on sama lähde ja sama käyttötapa kuin biisipelin kansikuvat,
joten tästä ei synny uutta kysymystä mihinkään.

Käytännössä kansi on usein kuva artistista itsestään, koska suomalainen
pop ja rap käyttää kansissa artistikuvaa. Klassisella ei: Jean
Sibeliuksen levyt on kreditoitu esittäjille, joten hänelle ei löydy
kuvaa eikä sellaista pidäkään väkisin etsiä.

NIMI TARKISTETAAN

Hakutulos kelpaa vain jos artistName täsmää normalisoituna. Ilman sitä
"Ahti" saisi kuvan keneltä tahansa jonka levyn nimessä sana esiintyy, ja
väärä kuva olisi hiljainen vika: se näyttää oikealta kunnes joku tuntee
artistin.
"""
import argparse
import json
import re
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TIEDOT = ROOT / ".artistit.json"

UA = "HittiSpotti/1.0 (+https://hittispotti.fi)"
# iTunes ei julkaise nopeusrajaansa. Sekunti kyselyä kohti on toiminut
# muissakin tämän repon hauissa.
VIIVE = 1.1


def avain(nimi: str) -> str:
    s = unicodedata.normalize("NFD", (nimi or "").lower().replace("’", "'"))
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", "", s)


def hae(nimi: str, entity: str):
    """Hakutulokset, tai None jos haku ei onnistunut.

    None eikä tyhjä lista: tyhjä lista tarkoittaisi "ei osumia" ja
    nopeusrajaan osunut haku tallentuisi tietona "ei kuvaa".
    """
    url = ("https://itunes.apple.com/search?country=FI&media=music"
           f"&entity={entity}&limit=8&term=" + urllib.parse.quote(nimi))
    for yritys in range(4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=25) as r:
                return json.load(r).get("results", [])
        except Exception:
            time.sleep(2 ** yritys)
    return None


def kuva_artistille(nimi: str):
    """Kansikuvan osoite, "" jos ei löydy, None jos haku kaatui."""
    kaatui = False
    for entity in ("album", "song"):
        osumat = hae(nimi, entity)
        time.sleep(VIIVE)
        if osumat is None:
            kaatui = True
            continue
        for r in osumat:
            if avain(r.get("artistName")) == avain(nimi) and r.get("artworkUrl100"):
                return r["artworkUrl100"].replace("100x100", "300x300")
    return None if kaatui else ""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--uudelleen", action="store_true",
                    help="hae myös niille joilla on jo kuva")
    ap.add_argument("--kuiva", action="store_true",
                    help="näytä tulos mutta älä kirjoita")
    a = ap.parse_args()

    tiedot = json.loads(TIEDOT.read_text(encoding="utf-8"))
    tehtavat = [k for k, v in tiedot.items()
                if a.uudelleen or not v.get("kuva")]
    print(f"{len(tehtavat)} artistia haettavana", file=sys.stderr)

    loytyi = tyhjat = virheet = 0
    for i, k in enumerate(tehtavat, 1):
        nimi = tiedot[k].get("nimi", "")
        osoite = kuva_artistille(nimi)
        if osoite is None:
            print(f"VIRHE      {nimi}", file=sys.stderr)
            virheet += 1
            continue
        if not osoite:
            print(f"EI KUVAA   {nimi}", file=sys.stderr)
            tiedot[k]["kuva"] = ""
            tyhjat += 1
            continue
        tiedot[k]["kuva"] = osoite
        loytyi += 1
        if i % 25 == 0:
            print(f"  {i}/{len(tehtavat)}", file=sys.stderr, flush=True)

    print(f"\nlöytyi {loytyi}, ei kuvaa {tyhjat}, virheitä {virheet}")
    if a.kuiva:
        print("(kuiva ajo, mitään ei kirjoitettu)")
        return 0
    TIEDOT.write_text(json.dumps(tiedot, ensure_ascii=False, indent=1),
                      encoding="utf-8")
    print(f"Kirjoitettu {TIEDOT.name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
