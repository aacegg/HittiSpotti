#!/usr/bin/env python3
"""Rakentaa Päivän artisti -pelin datatiedoston.

    python3 scripts/tee_artistidata.py

Lukee .artistit.json (ylläpidon lähdetiedosto, ei julkaista) ja
kirjoittaa artistit.json (pelin lataama tiedosto, julkaistaan).

MIKSI ERILLINEN TIEDOSTO

Sama jako kuin songs.json -> katalogi.json. Lähdetiedostossa on
MusicBrainzin tunnisteet, tagit, Wikipedian johdantolauseet,
jäsenluettelot ja hakujen välimuistitiedot, yhteensä satoja kilotavuja.
Peli tarvitsee niistä kuusi kenttää. Kaikki muu on ylläpidon työkaluja
eikä kuulu pelaajan selaimeen.

TUNNISTE ON MUSICBRAINZ-ID EIKÄ NIMI

Päivän artisti johdetaan sekoitetusta listasta, ja lista järjestetään
tunnisteen mukaan, jottei lähdetiedoston rivijärjestys vaikuta
arvontaan. Nimi ei kelpaa tunnisteeksi: jos artistin kirjoitusasu
korjataan, koko kierto siirtyisi. MusicBrainz-tunniste ei muutu.

Artistin lisääminen tai poistaminen muuttaa kierron joka tapauksessa,
koska sekoitus riippuu listan sisällöstä. Se on sama tilanne kuin
biisipelissä uuden biisin kanssa, ja siksi pelin versionumero
nostetaan samalla kun data vaihtuu.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LAHDE = ROOT / ".artistit.json"
ULOS = ROOT / "artistit.json"
LISTA = Path(__file__).resolve().parent / "artistit-lista.txt"

# Peliin menevät kentät. Lyhyet avaimet, koska ne toistuvat 248 kertaa.
KENTAT = [
    ("id", "mbid"),
    ("n", "nimi"),
    ("g", "genre"),
    ("j", "jasenluku"),
    ("s", "sukupuoli_peli"),
    ("k", "laulukieli"),
    ("v", "debyytti"),
]


def main() -> int:
    tiedot = json.loads(LAHDE.read_text(encoding="utf-8"))
    nimet = [r.strip() for r in LISTA.read_text(encoding="utf-8").splitlines()
             if r.strip() and not r.startswith("#")]

    ulos, puutteet = [], []
    for v in tiedot.values():
        rivi = {}
        for lyhyt, pitka in KENTAT:
            arvo = v.get(pitka)
            if arvo in (None, ""):
                puutteet.append(f"{v.get('nimi')}: {pitka} puuttuu")
                break
            rivi[lyhyt] = arvo
        else:
            ulos.append(rivi)

    if puutteet:
        for p in puutteet:
            print("PUUTE:", p, file=sys.stderr)
        print(f"\nEI KIRJOITETTU: {len(puutteet)} artistilta puuttuu kenttä.",
              file=sys.stderr)
        return 1

    # Sama tunniste kahdella rivillä tarkoittaa että kyse on samasta
    # artistista kahdella nimellä. Peliin se ei kelpaa: sama artisti voisi
    # tulla päivän artistiksi kahdesti, ja pelaaja joka arvaa toisen nimen
    # näkisi viisi vihreää mutta saisi "väärin".
    kaksoset = {}
    for r in ulos:
        kaksoset.setdefault(r["id"], []).append(r["n"])
    for mbid, nimilista in kaksoset.items():
        if len(nimilista) > 1:
            print(f"SAMA ARTISTI KAHDESTI: {' ja '.join(nimilista)} "
                  f"(MusicBrainz {mbid})", file=sys.stderr)
    if any(len(x) > 1 for x in kaksoset.values()):
        print("\nEI KIRJOITETTU: poista toinen nimi roolilistalta.",
              file=sys.stderr)
        return 1

    if len(ulos) != len(nimet):
        print(f"EI KIRJOITETTU: roolilistalla {len(nimet)} nimeä mutta "
              f"datassa {len(ulos)}.", file=sys.stderr)
        return 1

    # Vakaa järjestys tunnisteen mukaan. Peli sekoittaa tästä, joten
    # lähdetiedoston rivijärjestys ei saa vaikuttaa arvontaan.
    ulos.sort(key=lambda r: r["id"])

    teksti = json.dumps(ulos, ensure_ascii=False, separators=(",", ":"))
    ULOS.write_text(teksti + "\n", encoding="utf-8")
    print(f"{ULOS.name}: {len(ulos)} artistia, {len(teksti) // 1024} kt")
    return 0


if __name__ == "__main__":
    sys.exit(main())
