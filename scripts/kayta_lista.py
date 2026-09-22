#!/usr/bin/env python3
"""Vie käsin tehdyn attribuuttilistan .artistit.json:iin.

    python3 scripts/kayta_lista.py genre lista.txt
    python3 scripts/kayta_lista.py laulukieli kielet.txt --kuiva

Listan muoto on rivi per artisti, nimi ja arvo erotettuna ajatusviivalla,
väliviivalla tai kaksoispisteellä:

    Tapio Rautavaara — Iskelmä
    Nightwish - Metalli
    Darude: Elektroninen

MIKSI KÄSIN

Genre mitattiin automaattisesti kolmesta lähteestä ja tulos oli 77 %
oikein: Wikipedian johdantolause 90 %, tietolaatikko 71 %, MusicBrainz
71 %. Peliin se ei riitä, koska vastaus on vihreä tai punainen eikä
osittaista osumaa ole. 206 artistia on niin pieni joukko, että
ihmisen kirjoittama lista on sekä nopeampi että tarkempi kuin mikään
päättelyketju. Automaattinen ehdotus jää silti arviointisivulle
pohjaksi niille kentille joita ei ole vielä käyty käsin läpi.

NIMIEN TÄSMÄYS

Nimi normalisoidaan ennen vertailua: pienet kirjaimet, aksentit pois,
kaarevat heittomerkit suoriksi ja välimerkit väliksi. Niin "Waldo's
People" ja "Waldo’s People" ovat sama artisti, samoin "Bomfunk MC's"
ja "Bomfunk MC’s". Tuntematon nimi raportoidaan eikä sitä ohiteta
hiljaa, koska hiljainen ohitus jättäisi artistin vanhaan arvoon ilman
että kukaan huomaa.
"""
import argparse
import json
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TIEDOT = ROOT / ".artistit.json"

# Sallitut arvot kentittäin. Tuntematon arvo on kirjoitusvirhe tai
# uusi luokka, ja kumpikin kuuluu huomata eikä tallentaa vaieten.
SALLITUT = {
    "genre": {"Rap", "Rock", "Pop", "Iskelmä", "Metalli", "Elektroninen",
              "Reggae", "Muu"},
    "laulukieli": {"Suomi", "Englanti", "Instrumentaali"},
    "kokoonpano": {"Soolo", "Duo", "Yhtye"},
    "sukupuoli_peli": {"Mies", "Nainen", "Seka"},
}

# Lukuarvoiset kentät. Jäsenmäärä on luku eikä luokka, koska peli
# vertailee sitä nuolella kuten debyyttivuotta, ja kokoonpano johdetaan
# siitä: 1 on soolo, 2 duo, 3 tai enemmän yhtye.
LUVUT = {"jasenluku": (1, 30)}

# Sama asia eri sanoin. Lista kirjoitetaan käsin, joten arvo voi olla
# pienellä tai eri muodossa: "ei laulukieltä" on instrumentaali.
SYNONYYMIT = {
    "ei laulukielta": "Instrumentaali",
    "sekayhtye": "Seka",
    "sekakokoonpano": "Seka",
    "mies ja nainen": "Seka",
    "ei laulua": "Instrumentaali",
    "instrumentaalimusiikki": "Instrumentaali",
    "molemmat": None,        # ei enää käytössä, ks. laulukielen perustelu
}


def normalisoi(arvo: str, sallitut):
    """Kirjainkoko ja tavalliset synonyymit siedetään."""
    if not sallitut:
        return arvo
    avainmuoto = avain(arvo)
    for s in sallitut:
        if avain(s) == avainmuoto:
            return s
    return SYNONYYMIT.get(avainmuoto, arvo)


def avain(nimi: str) -> str:
    s = nimi.replace("’", "'").lower().strip()
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def lue_lista(polku: Path):
    """Rivit muodossa 'Nimi — Arvo' pareiksi."""
    parit = []
    for rivi in polku.read_text(encoding="utf-8").splitlines():
        rivi = rivi.strip()
        if not rivi or rivi.startswith("#"):
            continue
        # Numerointi pois: "1. Nimi — Arvo"
        rivi = re.sub(r"^\d+[.)]\s*", "", rivi)
        # Ajatusviiva ensin: väliviiva voi olla osa nimeä (Tippa-T).
        for erotin in ("—", "–", ":", " - "):
            if erotin in rivi:
                nimi, _, arvo = rivi.partition(erotin)
                parit.append((nimi.strip(), arvo.strip()))
                break
        else:
            parit.append((rivi, ""))
    return parit


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("kentta", choices=sorted(set(SALLITUT) | set(LUVUT)))
    ap.add_argument("tiedosto")
    ap.add_argument("--kuiva", action="store_true",
                    help="näytä muutokset mutta älä kirjoita")
    a = ap.parse_args()

    tiedot = json.loads(TIEDOT.read_text(encoding="utf-8"))
    hakemisto = {}
    for k, v in tiedot.items():
        hakemisto.setdefault(avain(v.get("nimi", "")), k)

    parit = lue_lista(Path(a.tiedosto))
    luku = a.kentta in LUVUT
    sallitut = SALLITUT.get(a.kentta)
    tuntematon_nimi, tuntematon_arvo, muuttui, ennallaan = [], [], [], 0

    for nimi, arvo in parit:
        k = hakemisto.get(avain(nimi))
        if not k:
            tuntematon_nimi.append(nimi)
            continue
        if luku:
            ala, yla = LUVUT[a.kentta]
            if not arvo.isdigit() or not (ala <= int(arvo) <= yla):
                tuntematon_arvo.append((nimi, arvo))
                continue
            arvo = int(arvo)
        else:
            arvo = normalisoi(arvo, sallitut)
            if arvo not in sallitut:
                tuntematon_arvo.append((nimi, arvo))
                continue
        if tiedot[k].get(a.kentta) == arvo:
            ennallaan += 1
            continue
        muuttui.append((tiedot[k]["nimi"], tiedot[k].get(a.kentta), arvo))
        tiedot[k][a.kentta] = arvo

    for nimi in tuntematon_nimi:
        print(f"TUNTEMATON NIMI: {nimi}", file=sys.stderr)
    for nimi, arvo in tuntematon_arvo:
        odotus = (f"kokonaisluku {LUVUT[a.kentta][0]}-{LUVUT[a.kentta][1]}"
                  if luku else ", ".join(sorted(sallitut)))
        print(f"TUNTEMATON ARVO: {nimi} -> {arvo!r} (odotettiin: {odotus})",
              file=sys.stderr)

    print(f"{a.kentta}: {len(muuttui)} muuttui, {ennallaan} oli jo oikein, "
          f"{len(tuntematon_nimi)} tuntematonta nimeä, "
          f"{len(tuntematon_arvo)} tuntematonta arvoa")

    if a.kuiva:
        print("(kuiva ajo, mitään ei kirjoitettu)")
        return 0
    if tuntematon_nimi or tuntematon_arvo:
        print("EI KIRJOITETTU: korjaa yllä olevat ensin.", file=sys.stderr)
        return 1
    TIEDOT.write_text(json.dumps(tiedot, ensure_ascii=False, indent=1),
                      encoding="utf-8")
    print(f"Kirjoitettu {TIEDOT.name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
