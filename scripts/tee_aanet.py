#!/usr/bin/env python3
"""Jakaa songs.jsonin kahteen osaan: kevyeen katalogiin ja äänipaloihin.

    python3 scripts/tee_aanet.py

Miksi
-----
songs.json on 1 047 kt, ja siitä 77 % on kahta kenttää joita ei tarvita
ennen kuin biisi tulee vastaan: esikuunteluosoite (preview) ja kansikuva
(art). Kolmas, itunes, on pelkkä ylläpitäjän tarkistuskenttä eikä peli lue
sitä lainkaan. Silti jokainen kävijä latasi koko tiedoston ennen kuin sivu
edes aukesi.

Peli tarvitsee heti vain sen, mistä ehdotuslista ja päivän arvonta
rakentuvat: artisti, nimi, vuosi, taso, tunniste. Se on katalogi.json,
206 kt eli pakattuna 53 kt entisen 249 kt:n sijaan.

Esikuuntelut ja kansikuvat menevät kansioon aanet/. Ne on jaettu paloihin
tunnisteen perusteella (id % PALOJA), koska yhtenä tiedostona ne olisivat
450 kt eikä mitään olisi säästetty, vain siirretty myöhemmäksi. Nyt viiden
biisin sarja hakee enintään viisi noin 7 kt:n palaa. Jako tunnisteen
perusteella on mielivaltainen ja juuri siksi oikea: se ei kerro biisistä
mitään, joten palan sisällöstä ei voi päätellä kumpi sen biiseistä on
tänään vuorossa.

Täytebiisit (peli: false) eivät saa palaa lainkaan. Ne ovat ehdotuslistalla
vain tekemässä siitä tiheän eivätkä koskaan tule arvattavaksi, joten niiden
esikuuntelua ei tarvita. Se on 678 riviä 2 226:sta.

Tämä ei piilota vastauksia. Katalogi.json kertoo yhä koko biisilistan, ja
päivän arvonta lasketaan siitä selaimessa, joten kuka tahansa voi laskea
saman. Kyse on latausajasta, ei suojauksesta.

Aja tämä aina kun songs.json muuttuu, ja kasvata sen jälkeen app.js:n
KATALOGI_K-numeroa. Sama numero versioi sekä katalogin että palat, joten
selaimet hakevat kaikki uudestaan.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SONGS = ROOT / "songs.json"
KATALOGI = ROOT / "katalogi.json"
AANET = ROOT / "aanet"

# Palojen määrä. Sama luku on app.js:n AANI_PALOJA-vakiossa, ja niiden on
# oltava samat: peli laskee palan numeron itse eikä hae hakemistoa.
PALOJA = 64

# Kevyeen katalogiin menevät kentät tässä järjestyksessä. preview, art ja
# itunes puuttuvat tarkoituksella.
KEVYET = ("artist", "title", "year", "tier", "id")


def rivit(olio_lista):
    """JSON-taulukko, yksi olio rivillä.

    Tiivis muoto yhdellä rivillä olisi muutaman tavun pienempi, mutta
    tekisi jokaisesta muutoksesta yhden rivin diffin jossa koko tiedosto
    on muuttunut. Rivinvaihdot katoavat pakkauksessa käytännössä
    kokonaan, joten tästä ei makseta mitään.
    """
    osat = [json.dumps(o, ensure_ascii=False, separators=(",", ":")) for o in olio_lista]
    return "[\n" + ",\n".join(osat) + "\n]\n"


def main() -> int:
    songs = json.loads(SONGS.read_text(encoding="utf-8"))

    kevyt, palat, ilman = [], {}, []
    for s in songs:
        if not s.get("id") or not s.get("artist") or not s.get("title"):
            continue
        rivi = {k: s[k] for k in KEVYET if k in s}
        arvattava = s.get("peli") is not False
        if not arvattava:
            rivi["peli"] = False
        kevyt.append(rivi)
        if not arvattava:
            continue
        if not s.get("preview"):
            # Arvattava biisi ilman esikuuntelua ei voi tulla vastaan.
            # Peli suodatti sen ennen pois preview-kentän puuttumisen
            # perusteella; nyt kevyessä katalogissa ei ole sitä kenttää,
            # joten suodatus on tässä.
            ilman.append(f'{s["artist"]} – {s["title"]}')
            kevyt.pop()
            continue
        palat.setdefault(s["id"] % PALOJA, {})[str(s["id"])] = [s["preview"], s.get("art", "")]

    KATALOGI.write_text(rivit(kevyt), encoding="utf-8")

    AANET.mkdir(exist_ok=True)
    pitaisi = set()
    for n in sorted(palat):
        nimi = f"{n:02d}.json"
        pitaisi.add(nimi)
        parit = [f'{json.dumps(k)}:{json.dumps(v, ensure_ascii=False, separators=(",", ":"))}'
                 for k, v in sorted(palat[n].items(), key=lambda kv: int(kv[0]))]
        (AANET / nimi).write_text("{\n" + ",\n".join(parit) + "\n}\n", encoding="utf-8")

    # Vanhentuneet palat pois. Ilman tätä PALOJA-luvun pienentäminen jättäisi
    # ylimääräiset tiedostot paikoilleen ja gittiin.
    poistettu = 0
    for f in AANET.glob("*.json"):
        if f.name not in pitaisi:
            f.unlink()
            poistettu += 1

    arvattavia = sum(1 for r in kevyt if r.get("peli") is not False)
    koot = sorted((AANET / n).stat().st_size for n in pitaisi)
    print(f"katalogi.json  {KATALOGI.stat().st_size:>9} tavua  "
          f"{len(kevyt)} riviä, {arvattavia} arvattavaa")
    print(f"aanet/         {sum(koot):>9} tavua  {len(pitaisi)} palaa, "
          f"pienin {koot[0]}, suurin {koot[-1]}")
    if poistettu:
        print(f"  poistettu {poistettu} vanhentunutta palaa")
    if ilman:
        print(f"\nVAROITUS: {len(ilman)} arvattavaa biisiä ilman esikuuntelua. "
              "Ne jätettiin pois katalogista:", file=sys.stderr)
        for r in ilman[:20]:
            print(f"  {r}", file=sys.stderr)
        if len(ilman) > 20:
            print(f"  ... ja {len(ilman) - 20} muuta", file=sys.stderr)
        print("Aja scripts/resolve_songs.py.", file=sys.stderr)
    print("\nMuista kasvattaa app.js:n KATALOGI_K-numeroa.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
