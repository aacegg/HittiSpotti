#!/usr/bin/env python3
"""Kirjoittaa songs.jsonista luettavan biisilistan tekstitiedostoksi.

    python3 scripts/biisilista.py                  # biisilista.txt
    python3 scripts/biisilista.py --tiedosto x.txt
    python3 scripts/biisilista.py --muoto csv      # taulukkolaskentaan
    python3 scripts/biisilista.py --muoto ehdokkaat  # täytteet peliin nostoa varten

songs.json on koneen luettavaksi tehty: yhdellä rivillä on esikuunteluosoite,
kansikuva ja tunniste, eikä siitä näe silmällä mitä katalogissa on. Tämä
kirjoittaa saman tiedon niin että sitä voi lukea, selata ja etsiä.

Kaksi joukkoa pidetään erillään, koska ne ovat eri asioita:

  Pelattavat    biisit jotka voivat tulla arvattavaksi.
  Täytebiisit   rivit joissa on "peli": false. Ne eivät koskaan soi. Ne ovat
                hakuehdotuksissa, jotta oikean vastauksen löytäminen ei olisi
                pelkkää listan selaamista: ilman niitä hakukenttä paljastaisi
                että arvattava biisi on yksi harvoista vaihtoehdoista.

Lista ei sisällä esikuunteluosoitteita eikä tunnisteita. Ne ovat songs.jsonissa
sitä varten että peli toimii, eivät luettavaksi. Osoitteiden kunnon tarkistaa
scripts/tarkista_linkit.py.
"""
import argparse
import csv
import json
import sys
from collections import Counter
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SONGS = ROOT / "songs.json"

TASOT = {1: "Helppo", 2: "Keskitaso", 3: "Vaikea", 4: "Mestari", 5: "Mahdoton"}


def jarjestys(s):
    """Artisti, sitten vuosi, sitten nimi. Aakkostus ei erottele kirjainkokoa."""
    return (s["artist"].casefold(), s.get("year") or 0, s["title"].casefold())


def rivi(s):
    return f"{s['artist']} – {s['title']} ({s.get('year') or '?'})"


def kirjoita_teksti(pelattavat, taytteet, kaikki):
    out = []
    L = out.append

    L("HITTISPOTTI – BIISILISTA")
    L(f"Luotu {date.today().strftime('%-d.%-m.%Y')} tiedostosta songs.json")
    L("")
    L(f"Rivejä yhteensä      {len(kaikki)}")
    L(f"Pelattavia biisejä   {len(pelattavat)}")
    L(f"Täytebiisejä         {len(taytteet)}   (eivät koskaan soi, ks. selitys lopussa)")
    L(f"Artisteja            {len({s['artist'] for s in kaikki})}   "
      f"(pelattavissa {len({s['artist'] for s in pelattavat})})")
    L("")

    laskuri = Counter(s["tier"] for s in pelattavat)
    L("Pelattavat vaikeustasoittain:")
    for t in sorted(TASOT):
        L(f"  {TASOT[t]:<10} {laskuri.get(t, 0):>4}")
    L("")

    L("=" * 62)
    L("PELATTAVAT BIISIT")
    L("=" * 62)
    L("")
    L("Vaikeustaso on nykyinen arvio. Se on asetettu käsin ja tarkentuu")
    L("pelaajien arvioiden perusteella, joten se ei ole lopullinen.")
    for t in sorted(TASOT):
        joukko = sorted((s for s in pelattavat if s["tier"] == t), key=jarjestys)
        L("")
        L(f"--- {TASOT[t].upper()} ({len(joukko)}) " + "-" * max(0, 40 - len(TASOT[t])))
        for s in joukko:
            L(f"  {rivi(s)}")

    L("")
    L("=" * 62)
    L("TÄYTEBIISIT")
    L("=" * 62)
    L("")
    L("Nämä eivät koskaan tule arvattavaksi. Ne ovat mukana vain hakukentän")
    L("ehdotuksissa, jotta oikeaa vastausta ei voi päätellä siitä että")
    L("vaihtoehtoja on vähän. Jos jokin näistä kuuluisi peliin, riittää että")
    L("songs.jsonista poistaa kyseiseltä riviltä kohdan \"peli\": false.")
    L("")
    L(f"Yhteensä {len(taytteet)}, aakkosjärjestyksessä:")
    L("")
    for s in sorted(taytteet, key=jarjestys):
        L(f"  {rivi(s)}")

    L("")
    return "\n".join(out) + "\n"


def kirjoita_ehdokkaat(kaikki, pelattavat, taytteet):
    """Täytebiisit siinä järjestyksessä kuin niitä kannattaa harkita peliin.

    Täytteet haettiin aikanaan artistikohtaisesti "suosituimmat puuttuvat",
    joten ne eivät ole satunnaisia: ne ovat jo mukana olevien artistien
    tunnetuimpia biisejä, jotka vain sattuivat jäämään pois. Vahvin merkki
    siitä että täyte kuuluisi peliin on se, kuinka monta pelattavaa biisiä
    artistilla jo on: hänet on jo todettu pelin arvoiseksi.

    Tämä on järjestys, ei tuomio. Lopullinen ratkaisu tehdään kuuntelemalla
    arviointityökalussa (suodatin "vain täytebiisit").
    """
    paino = Counter(s["artist"] for s in pelattavat)
    # Monesko täyte tämä on omalta artistiltaan. Tiedostojärjestys artistin
    # sisällä on sama kuin haun osumajärjestys, eli ensimmäinen on artistin
    # suosituin puuttuva biisi.
    laskuri: Counter = Counter()
    sija = {}
    for s in taytteet:
        laskuri[s["artist"]] += 1
        sija[s["id"]] = laskuri[s["artist"]]

    jarj = sorted(taytteet, key=lambda s: (-paino.get(s["artist"], 0),
                                           sija[s["id"]], s["artist"].casefold()))
    out = ["TÄYTEBIISIT PELIIN NOSTAMISEN EHDOKKAINA",
           f"Luotu {date.today().strftime('%-d.%-m.%Y')} tiedostosta songs.json", "",
           f"Täytteitä yhteensä {len(taytteet)}.",
           "Järjestys: artistilla eniten pelattavia ensin, ja saman artistin",
           "sisällä hänen suosituin puuttuva biisinsä ensin.", "",
           "Sarake vasemmalla kertoo montako pelattavaa biisiä artistilla jo on.",
           "Nollan kohdalla artisti ei ole pelissä lainkaan; ne ovat listan",
           "lopussa, koska niiden lisääminen olisi uusi artisti eikä täydennys.",
           "", "=" * 62, ""]
    edellinen = None
    for s in jarj:
        n = paino.get(s["artist"], 0)
        if n != edellinen:
            otsikko = (f"--- artistilla {n} pelattavaa " if n
                       else "--- artisti ei ole pelissä lainkaan ")
            out += ["", otsikko + "-" * max(0, 40 - len(otsikko))]
            edellinen = n
        out.append(f"  [{n:>2}] {s['artist']} – {s['title']} ({s.get('year') or '?'})")
    return "\n".join(out) + "\n"


def kirjoita_csv(kaikki, kohde):
    with kohde.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["artisti", "kappale", "vuosi", "vaikeustaso", "taso_nro", "pelattava"])
        for s in sorted(kaikki, key=jarjestys):
            w.writerow([
                s["artist"], s["title"], s.get("year") or "",
                TASOT.get(s["tier"], "?"), s["tier"],
                "ei" if s.get("peli") is False else "kyllä",
            ])


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--tiedosto", default=None, help="kohdetiedosto")
    ap.add_argument("--muoto", choices=("txt", "csv", "ehdokkaat"), default="txt")
    a = ap.parse_args()

    kaikki = json.loads(SONGS.read_text(encoding="utf-8"))
    pelattavat = [s for s in kaikki if s.get("peli") is not False]
    taytteet = [s for s in kaikki if s.get("peli") is False]

    oletusnimi = ("taytebiisit-ehdokkaat.txt" if a.muoto == "ehdokkaat"
                  else f"biisilista.{a.muoto}")
    kohde = Path(a.tiedosto) if a.tiedosto else ROOT / oletusnimi
    if a.muoto == "csv":
        kirjoita_csv(kaikki, kohde)
    elif a.muoto == "ehdokkaat":
        kohde.write_text(kirjoita_ehdokkaat(kaikki, pelattavat, taytteet), encoding="utf-8")
    else:
        kohde.write_text(kirjoita_teksti(pelattavat, taytteet, kaikki), encoding="utf-8")

    print(f"{kohde}: {len(pelattavat)} pelattavaa, {len(taytteet)} täytettä")
    return 0


if __name__ == "__main__":
    sys.exit(main())
