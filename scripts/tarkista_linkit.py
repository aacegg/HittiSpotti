#!/usr/bin/env python3
"""Tarkistaa että jokaisen biisin äänipätkä ja kansikuva vastaavat yhä.

    python3 scripts/tarkista_linkit.py            # koko katalogi
    python3 scripts/tarkista_linkit.py --otos 50  # nopea pistokoe

Peli on staattinen sivusto, mutta se ei ole omavarainen: äänipätkät ja
kansikuvat tulevat Applen palvelimilta. Jos yksi osoite lakkaa vastaamasta,
sitä ei huomaa mistään. Pahin tapaus on päivän biisi, joka on silloin rikki
kaikilla pelaajilla saman vuorokauden ajan, eikä siitä tule tietoa muuta
kuin palautteena.

Pätkä on olennainen: ilman sitä biisiä ei voi arvata lainkaan. Kansikuva on
kosmeettinen, se näkyy vasta paljastuksessa. Siksi ne raportoidaan erikseen.

Haetaan vain ensimmäinen tavu (Range), joten koko tiedostoa ei ladata.
Ei vaadi ulkoisia riippuvuuksia (vain Python 3:n vakiokirjasto).
"""
import argparse
import json
import random
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SONGS = ROOT / "songs.json"


def vastaako(url: str) -> str:
    """Palauttaa tyhjän jos osoite vastaa, muuten syyn."""
    if not url:
        return "osoite puuttuu"
    pyynto = urllib.request.Request(url, headers={
        "User-Agent": "HittiSpotti/1.0", "Range": "bytes=0-1",
    })
    for yritys in range(3):
        try:
            with urllib.request.urlopen(pyynto, timeout=20) as v:
                # 200 ja 206 ovat molemmat kunnossa: osa palvelimista ei tue
                # osittaista hakua ja vastaa koko tiedostolla.
                return "" if v.status in (200, 206) else f"HTTP {v.status}"
        except urllib.error.HTTPError as e:
            return f"HTTP {e.code}"          # palvelin vastasi, sisältö puuttuu
        except Exception as e:                # noqa: BLE001 - verkko voi töksähtää
            if yritys == 2:
                return f"ei yhteyttä ({type(e).__name__})"
    return "ei yhteyttä"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--otos", type=int, default=0, help="tarkista vain n satunnaista")
    ap.add_argument("--vain-pelattavat", action="store_true",
                    help="ohita harhautukset, jotka eivät koskaan soi")
    ap.add_argument("--rinnakkain", type=int, default=8)
    a = ap.parse_args()

    songs = json.loads(SONGS.read_text(encoding="utf-8"))
    if a.vain_pelattavat:
        songs = [s for s in songs if s.get("peli") is not False]
    if a.otos:
        songs = random.sample(songs, min(a.otos, len(songs)))

    print(f"Tarkistetaan {len(songs)} biisiä, {a.rinnakkain} rinnakkain…\n")

    def tarkista(s):
        return s, vastaako(s.get("preview")), vastaako(s.get("art"))

    patka_rikki, kansi_rikki, tehty = [], [], 0
    with ThreadPoolExecutor(max_workers=a.rinnakkain) as pool:
        for s, patka, kansi in pool.map(tarkista, songs):
            tehty += 1
            if patka:
                patka_rikki.append((s, patka))
                print(f"  PÄTKÄ RIKKI  {s['artist']} – {s['title']}  ({patka})")
            if kansi:
                kansi_rikki.append((s, kansi))
            if tehty % 200 == 0:
                print(f"  … {tehty}/{len(songs)}", file=sys.stderr)

    print(f"\nTarkistettu {len(songs)} biisiä.")
    print(f"  äänipätkä rikki: {len(patka_rikki)}")
    print(f"  kansikuva rikki: {len(kansi_rikki)}")
    if kansi_rikki:
        print("\nKansikuva puuttuu (kosmeettinen, näkyy vasta paljastuksessa):")
        for s, syy in kansi_rikki[:20]:
            print(f"  {s['artist']} – {s['title']}  ({syy})")
    if patka_rikki:
        print("\nRikkinäiset pätkät tunnisteina, hae ne uudelleen artistin katalogista:")
        print("  " + " ".join(str(s["id"]) for s, _ in patka_rikki))
        return 1
    print("\nKaikki äänipätkät vastaavat.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
