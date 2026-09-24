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

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kotipaikat import maakunta

ROOT = Path(__file__).resolve().parent.parent
LAHDE = ROOT / ".artistit.json"
ULOS = ROOT / "artistit.json"
LISTA = Path(__file__).resolve().parent / "artistit-lista.txt"

# Peliin menevät kentät. Lyhyet avaimet, koska ne toistuvat 246 kertaa.
#
# laulukieli oli tässä ennen kotipaikkaa. Se poistettiin koska se oli
# mitattuna selvästi heikoin sarake: 211 artistia 247:stä lauloi
# suomeksi, joten yhden arvauksen jälkeen siitä jäi jäljelle 75 %
# artisteista. Kotipaikasta jää 58 %. Kenttä on yhä lähdetiedostossa,
# joten se saadaan takaisin ilman uutta hakukierrosta.
KENTAT = [
    ("id", "mbid"),
    ("n", "nimi"),
    ("g", "genre"),
    ("j", "jasenluku"),
    ("s", "sukupuoli_peli"),
    ("p", "kotipaikka"),
    ("v", "debyytti"),
]

# Valinnaiset kentät. Kuva puuttuu Jean Sibeliukselta, koska klassisen
# musiikin levyt on kreditoitu esittäjille eikä säveltäjälle. Yksi
# puuttuva kuva ei saa estää koko tiedoston kirjoittamista, joten nämä
# eivät ole KENTAT-listassa.
VALINNAISET = [
    ("c", "kuva"),
]

# Kansikuvan osoitteesta tallennetaan vain keskiosa. Kaikki 245 osoitetta
# alkavat ja päättyvät samalla tavalla, ja kokonaisina ne kaksinkertaistivat
# tiedoston: 32 kt -> 64 kt. Karsittuna kenttä on noin puolet siitä.
# Peli kokoaa osoitteen takaisin, ks. app.js:n ARTISTI_KUVA_ETU.
KUVA_ETU = "https://is1-ssl.mzstatic.com/image/thumb/"
KUVA_PAATE = "/300x300bb.jpg"


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
            for lyhyt, pitka in VALINNAISET:
                arvo = v.get(pitka)
                if not arvo:
                    continue
                if lyhyt == "c":
                    if not (arvo.startswith(KUVA_ETU) and arvo.endswith(KUVA_PAATE)):
                        # Tuntematon muoto: jätetään pois kokonaan eikä
                        # tallenneta puolikasta osoitetta jota peli ei
                        # osaa koota takaisin.
                        print(f"OUTO KUVAOSOITE, jätetään pois: {v.get('nimi')}",
                              file=sys.stderr)
                        continue
                    arvo = arvo[len(KUVA_ETU):-len(KUVA_PAATE)]
                rivi[lyhyt] = arvo
            # Maakunta mukaan valmiiksi laskettuna. Peli tarvitsee sen
            # keltaista ruutua varten, ja vaihtoehto olisi kuljettaa
            # 344 kunnan taulukko selaimeen. Kaksi kenttää per artisti
            # on halvempi kuin koko taulukko kerran.
            rivi["a"] = maakunta(rivi["p"])
            if not rivi["a"]:
                puutteet.append(f"{v.get('nimi')}: tuntematon kunta "
                                f"{rivi['p']!r}")
                continue
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
