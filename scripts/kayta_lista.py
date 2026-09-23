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

from kotipaikat import KUNNAT, ULKOMAAT

ROOT = Path(__file__).resolve().parent.parent
TIEDOT = ROOT / ".artistit.json"

# Sallitut arvot kentittäin. Tuntematon arvo on kirjoitusvirhe tai
# uusi luokka, ja kumpikin kuuluu huomata eikä tallentaa vaieten.
SALLITUT = {
    "genre": {"Rap", "Rock", "Pop", "Iskelmä", "Metalli", "Elektroninen",
              "Reggae", "Muu"},
    # Molemmat on mukana koska viisi artistia laulaa oikeasti kummallakin
    # kielellä tunnetuissa kappaleissaan. Se ei ole sama asia kuin
    # Wikipedian laulukieli-kenttä, joka listasi jokaisen kielen jolla
    # artisti on koskaan levyttänyt ja teki Juice Leskisestä
    # kaksikielisen.
    "laulukieli": {"Suomi", "Englanti", "Molemmat", "Ruotsi",
                   "Instrumentaali"},
    "kokoonpano": {"Soolo", "Duo", "Yhtye"},
    "sukupuoli_peli": {"Mies", "Nainen", "Seka"},
}

# Kotipaikka ei ole kiinteä joukko vaan Suomen kunnat, joten se
# tarkistetaan omaa taulukkoaan vasten. Tuntematon kunta pysäyttää ajon
# eikä mene läpi: pelissä siitä johdetaan maakunta, ja väärä maakunta
# näkyisi vain väärän värisenä ruutuna jota kukaan ei osaisi raportoida.
KUNTAKENTAT = {"kotipaikka"}

# Lukuarvoiset kentät. Jäsenmäärä on luku eikä luokka, koska peli
# vertailee sitä nuolella kuten debyyttivuotta, ja kokoonpano johdetaan
# siitä: 1 on soolo, 2 duo, 3 tai enemmän yhtye.
# Alaraja 1850 eikä 1900: Jean Sibelius debytoi 1892.
LUVUT = {"jasenluku": (1, 30), "debyytti": (1850, 2100)}

# Sama asia eri sanoin. Lista kirjoitetaan käsin, joten arvo voi olla
# pienellä tai eri muodossa: "ei laulukieltä" on instrumentaali.
SYNONYYMIT = {
    "ei laulukielta": "Instrumentaali",
    "sekayhtye": "Seka",
    "sekaduo": "Seka",
    "englanti suomi": "Molemmat",
    "suomi englanti": "Molemmat",
    "sekakokoonpano": "Seka",
    "mies ja nainen": "Seka",
    "ei laulua": "Instrumentaali",
    "instrumentaalimusiikki": "Instrumentaali",
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
    ap.add_argument("kentta",
                    choices=sorted(set(SALLITUT) | set(LUVUT) | KUNTAKENTAT))
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
    kunta = a.kentta in KUNTAKENTAT
    sallitut = SALLITUT.get(a.kentta)
    # Kirjoitusasu haetaan taulukosta, jotta "hämeenlinna" ja
    # "HÄMEENLINNA" tallentuvat molemmat muodossa "Hämeenlinna".
    kuntahakemisto = {avain(k): k for k in list(KUNNAT) + [ULKOMAAT]}
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
        elif kunta:
            oikea = kuntahakemisto.get(avain(arvo))
            if not oikea:
                tuntematon_arvo.append((nimi, arvo))
                continue
            arvo = oikea
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
        # Merkitään käsin asetetuksi, jotta hakukierros ei ylikirjoita.
        # debyytti tulee muuten MusicBrainzin julkaisuvuosista, ja
        # seuraava --julkaisut palauttaisi käsin korjatun arvon takaisin
        # ilman että kukaan huomaa.
        kasin = tiedot[k].setdefault("kasin", [])
        if a.kentta not in kasin:
            kasin.append(a.kentta)

    for nimi in tuntematon_nimi:
        print(f"TUNTEMATON NIMI: {nimi}", file=sys.stderr)
    for nimi, arvo in tuntematon_arvo:
        if luku:
            odotus = f"kokonaisluku {LUVUT[a.kentta][0]}-{LUVUT[a.kentta][1]}"
        elif a.kentta in KUNTAKENTAT:
            odotus = f"Suomen kunta tai {ULKOMAAT}, ks. scripts/kotipaikat.py"
        else:
            odotus = ", ".join(sorted(sallitut))
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
