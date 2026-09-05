#!/usr/bin/env python3
"""Soveltaa arviointityökalun viennin songs.jsoniin.

    python3 scripts/kayta_arviot.py vienti.json
    python3 scripts/kayta_arviot.py vienti.json --kuiva   # näytä, älä kirjoita
    pbpaste | python3 scripts/kayta_arviot.py -           # suoraan leikepöydältä

Syöte on arviointi.html:n "Vie arviot" -painikkeen tuottama JSON:

    arviot    [{id, taso, nimi}]  vaikeustason muutokset
    samat     [id]                arvioitu, taso pysyi ennallaan
    poista    [id]                pois pelistä (jää täytteeksi hakuun)
    palauta   [id]                takaisin peliin (täyte nostetaan pelattavaksi)

Tämä on tehty käsin kolme kertaa, ja käsin tehtynä se on virhealtis kahdesta
syystä. Muutoksia on kerralla satoja, ja sama tunniste voi olla kahdessa
listassa: täyte joka nostetaan peliin saa yleensä myös uuden vaikeustason.
Siksi kaikki tarkistetaan ensin ja kirjoitetaan vasta sitten.

"samat" ei aiheuta muutosta. Se on silti syötteessä, koska se kertoo mitkä
biisit on oikeasti kuunneltu ja todettu oikein arvioiduiksi; ilman sitä ei
tietäisi eroa "arvioitu ja hyvä" ja "ei vielä arvioitu" välillä.

Ei vaadi ulkoisia riippuvuuksia (vain Python 3:n vakiokirjasto).
"""
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SONGS = ROOT / "songs.json"

TASOT = {1: "Helppo", 2: "Keskitaso", 3: "Vaikea", 4: "Mestari", 5: "Mahdoton"}


def lue_syote(polku: str) -> dict:
    teksti = sys.stdin.read() if polku == "-" else Path(polku).read_text(encoding="utf-8")
    return json.loads(teksti)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("vienti", help="arviointityökalun JSON, tai - jos putkesta")
    ap.add_argument("--kuiva", action="store_true", help="älä kirjoita, näytä vain")
    a = ap.parse_args()

    data = lue_syote(a.vienti)
    songs = json.loads(SONGS.read_text(encoding="utf-8"))
    idx = {s["id"]: s for s in songs}

    arviot = data.get("arviot", [])
    palauta = data.get("palauta", [])
    poista = data.get("poista", [])
    samat = data.get("samat", [])

    # ---- Tarkistukset ennen kirjoittamista ----
    virheet = []
    for r in arviot:
        if r["id"] not in idx:
            virheet.append(f"tuntematon tunniste arvioissa: {r['id']} ({r.get('nimi', '?')})")
        elif r["taso"] not in TASOT:
            virheet.append(f"kelpaamaton taso {r['taso']}: {r.get('nimi', r['id'])}")
    for nimi, lista in (("palauta", palauta), ("poista", poista), ("samat", samat)):
        for i in lista:
            if i not in idx:
                virheet.append(f"tuntematon tunniste listassa {nimi}: {i}")
    paallekkain = set(palauta) & set(poista)
    if paallekkain:
        virheet.append(f"sama tunniste sekä palauta- että poista-listalla: {sorted(paallekkain)}")
    if virheet:
        print("Syötteessä on virheitä, mitään ei kirjoitettu:", file=sys.stderr)
        for v in virheet:
            print("  " + v, file=sys.stderr)
        return 1

    # ---- Muutokset ----
    tasot_muuttui, jo_oikein = [], []
    for r in arviot:
        s = idx[r["id"]]
        if s["tier"] == r["taso"]:
            jo_oikein.append(s)
            continue
        tasot_muuttui.append((s, s["tier"], r["taso"]))
        s["tier"] = r["taso"]

    nostettu, ei_ollut_taytetta = [], []
    for i in palauta:
        s = idx[i]
        if s.get("peli") is False:
            del s["peli"]
            nostettu.append(s)
        else:
            ei_ollut_taytetta.append(s)

    pudotettu = []
    for i in poista:
        s = idx[i]
        if s.get("peli") is not False:
            s["peli"] = False
            pudotettu.append(s)

    # ---- Raportti ----
    print(f"Vaikeustaso muuttui: {len(tasot_muuttui)}")
    for s, vanha, uusi in tasot_muuttui:
        print(f"  {TASOT[vanha]:>9} -> {TASOT[uusi]:<9} {s['artist']} – {s['title']}")
    if jo_oikein:
        print(f"\nArvio vastasi jo katalogia: {len(jo_oikein)}")
    print(f"\nNostettu peliin: {len(nostettu)}")
    for s in nostettu:
        print(f"  {TASOT.get(s['tier'], '?'):<9} {s['artist']} – {s['title']}")
    if ei_ollut_taytetta:
        print(f"\nOli jo pelissä, ei muutosta: {len(ei_ollut_taytetta)}")
    if pudotettu:
        print(f"\nPudotettu täytteeksi: {len(pudotettu)}")
        for s in pudotettu:
            print(f"  {s['artist']} – {s['title']}")
    if samat:
        print(f"\nVahvistettu ennallaan: {len(samat)}")

    pelattavia = sum(1 for s in songs if s.get("peli") is not False)
    muutos = len(nostettu) - len(pudotettu)
    print(f"\nKatalogi: {len(songs)} riviä, {pelattavia} pelattavaa "
          f"({muutos:+d} tästä ajosta)")

    if a.kuiva:
        print("\n(kuiva ajo, mitään ei kirjoitettu)")
        return 0
    SONGS.write_text(json.dumps(songs, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"\nKirjoitettu {SONGS.name}.")
    print("Muista kasvattaa app.js:n KATALOGI-versio (songs.json?k=N).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
