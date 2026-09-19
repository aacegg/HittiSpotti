#!/usr/bin/env python3
"""Etsii katalogista saman biisin useampaan kertaan.

    python3 scripts/kaksoiskappaleet.py                  # raportoi
    python3 scripts/kaksoiskappaleet.py --poista 1,2,3   # poista rivit

Kaksoiskappale ei ole kosmeettinen vika. Arvaus tarkistetaan
tunnisteella (guess.id === r.song.id), joten jos sama äänite on
katalogissa kahdesti, pelaaja voi valita hakuehdotuksista väärän rivin
ja saada nollat vaikka tunnisti biisin. Hakuehdotuksissa rivit näyttävät
lähes samalta eikä pelaajalla ole keinoa tietää kumpi on oikea.

Mitattu tapaus: Kari Tapion Viisitoista kesää oli pelissä kahdesti,
tasoilla 4 ja 5, samana 3.25 äänitteenä. Toinen rivi tuli kokoelmalta
jossa nimen perään oli liimattu alkuperäinen englanninkielinen nimi:
"Viisitoista Kesää - Living Next Door to Alice -".

Juuri siksi nimet vertaillaan RAAKANA ajatusviivan kohdalta katkaisten.
base_title poistaa välimerkit, joten sen jälkeen viivaa ei enää ole
olemassa eikä katkaisu osu mihinkään.

Kesto kertoo onko kyse samasta äänitteestä vai eri levytyksestä. Sitä ei
haeta täältä; aja tarvittaessa tarkista_vuodet.py.

Ei vaadi ulkoisia riippuvuuksia (vain Python 3:n vakiokirjasto).
"""
import argparse
import collections
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SONGS = ROOT / "songs.json"
sys.path.insert(0, str(ROOT / "scripts"))
from hae_soittolistalta import base_title, first_artist, norm  # noqa: E402


def ydin(title):
    """Biisin nimi ilman kokoelmien liimaamaa alaotsikkoa."""
    return base_title(re.split(r"\s+[-–—]\s+", title)[0])


def ryhmat(songs):
    ulos = collections.defaultdict(list)
    for s in songs:
        ulos[(norm(first_artist(s["artist"])), ydin(s["title"]))].append(s)
    return [v for v in ulos.values() if len(v) > 1]


def ryhmat_nimimuoto(songs):
    """Sama biisi, artistin nimi eri muodossa.

    Yllä oleva ryhmittely avaimena on norm(first_artist(...)), eli se
    olettaa artistin nimen kirjoitetun joka rivillä samalla tavalla. Sama
    artisti esiintyy kuitenkin sekä lyhyellä että pitkällä nimellään, ja
    silloin avaimet eroavat eikä paria huomata lainkaan:

        Marion Rung & Four Cats – Joulupukin Maa   -> "marion rung"
        Marion & Four Cats – Joulupukin Maa        -> "marion"
        Marion Rung – Tipi-Tii                     -> "marion rung"
        Marion – Tipi-tii                          -> "marion"

    Kumpikin pari on sama äänite kahdesti, ja kumpikin meni raportista
    läpi kunnes pelaaja huomasi ne itse.

    Siksi tämä vertailee saman nimisiä biisejä keskenään ja katsoo
    artistista sanajoukkoa eikä merkkijonoa: jos toisen artistin sanat
    ovat toisen osajoukko, kyse on samasta nimestä eri muodossa. Koko
    artistikenttä otetaan mukaan eikä vain ensimmäistä nimeä, jotta
    "& Four Cats" erottuu silloin kun se on aito ero.

    Osajoukkosääntö on tahallaan varovainen: se ei yhdistä eri artisteja,
    koska kummankaan sanat eivät ole toisen osajoukko. Se ei myöskään
    korvaa ihmisen silmää, vaan nostaa parin katsottavaksi.
    """
    def sanat(artist):
        return frozenset(norm(artist).split())

    nimen_mukaan = collections.defaultdict(list)
    for s in songs:
        nimen_mukaan[ydin(s["title"])].append(s)

    ulos = []
    for ryhma in nimen_mukaan.values():
        if len(ryhma) < 2:
            continue
        for i, x in enumerate(ryhma):
            for y in ryhma[i + 1:]:
                ax, ay = sanat(x["artist"]), sanat(y["artist"])
                if ax == ay or not (ax <= ay or ay <= ax):
                    continue  # sama avain jo ylempänä, tai aidosti eri artisti
                ulos.append([x, y])
    return ulos


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--poista", default="", help="pilkuin eroteltu lista tunnisteita")
    a = ap.parse_args()

    songs = json.loads(SONGS.read_text(encoding="utf-8"))

    if not a.poista:
        loydot = ryhmat(songs)
        pelissa = sum(1 for v in loydot if sum(1 for s in v if s.get("peli") is not False) > 1)
        print(f"SAMA ARTISTI JA SAMA BIISI: {len(loydot)} ryhmää")
        print(f"Näistä {pelissa} sellaista, joissa useampi on arvattavana.\n")
        for v in sorted(loydot, key=lambda v: -sum(1 for s in v if s.get("peli") is not False)):
            monta = sum(1 for s in v if s.get("peli") is not False) > 1
            print(f"  {v[0]['artist']}{'   <-- USEAMPI PELISSÄ' if monta else ''}")
            for s in v:
                print(f"      {s.get('year')}  taso {s['tier']}  "
                      f"{'PELISSÄ' if s.get('peli') is not False else 'täyte '}  "
                      f"{s['title']}  id {s['id']}")
        muoto = ryhmat_nimimuoto(songs)
        muoto_pelissa = sum(
            1 for v in muoto if sum(1 for s in v if s.get("peli") is not False) > 1)
        print(f"\nSAMA BIISI, ARTISTIN NIMI ERI MUODOSSA: {len(muoto)} paria")
        print(f"Näistä {muoto_pelissa} sellaista, joissa useampi on arvattavana.\n")
        for v in sorted(muoto, key=lambda v: -sum(1 for s in v if s.get("peli") is not False)):
            monta = sum(1 for s in v if s.get("peli") is not False) > 1
            print(f"  {v[0]['title']}{'   <-- USEAMPI PELISSÄ' if monta else ''}")
            for s in v:
                print(f"      {s.get('year')}  taso {s['tier']}  "
                      f"{'PELISSÄ' if s.get('peli') is not False else 'täyte '}  "
                      f"{s['artist']}  id {s['id']}")

        if loydot or muoto:
            print("\nPoista valitsemasi rivit: --poista id,id,...")
        return 0

    poistettavat = {int(x) for x in a.poista.split(",") if x.strip()}
    idx = {s["id"]: s for s in songs}
    puuttuu = poistettavat - set(idx)
    if puuttuu:
        print(f"Ei katalogissa: {sorted(puuttuu)}", file=sys.stderr)
        return 1

    jaljelle = [s for s in songs if s["id"] not in poistettavat]
    print(f"POISTETAAN {len(poistettavat)} riviä\n")
    for i in sorted(poistettavat):
        s = idx[i]
        print(f"  {s['year']}  taso {s['tier']}  "
              f"{'PELISSÄ' if s.get('peli') is not False else 'täyte '}  "
              f"{s['artist']} – {s['title']}")
    arvattavia = sum(1 for s in jaljelle if s.get("peli") is not False)
    poistui_pelista = sum(1 for i in poistettavat if idx[i].get("peli") is not False)
    print(f"\nRivejä {len(songs)} -> {len(jaljelle)}, arvattavia {arvattavia}")
    if poistui_pelista:
        print(f"Arvattavista poistui {poistui_pelista}, joten PÄIVÄN PAKKA MUUTTUU.")
        print("Julkaise vuorokauden rajalla ja kasvata KATALOGI-versio app.js:ssä.")
    SONGS.write_text(json.dumps(jaljelle, ensure_ascii=False, indent=1), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
