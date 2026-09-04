#!/usr/bin/env python3
"""Yhdistää tilastopalvelimen CSV:n katalogiin ja kertoo mikä biisi on
oikeasti minkäkin vaikea.

    python3 scripts/tasot.py tilastot.csv

Palvelin lähettää vain numerotunnisteita, koska sillä ei ole katalogia eikä
sen kuulu olla. Nimet haetaan songs.jsonista täällä.

VAIKEUSLUKU

Jokainen kierros saa hinnan sen mukaan, monenko sekunnin pätkästä biisi
tunnistettiin:

    0,1 s = 0    0,5 s = 1    2 s = 2    8 s = 3    15 s = 4
    ei tunnistettu = 5

Viisi on tahallaan huonompi kuin neljä: 15 sekunnista tunnistaminen on eri
asia kuin se ettei tunnistanut lainkaan. Biisin vaikeusluku on näiden
keskiarvo, eli 0 = kaikki tunnistavat heti, 5 = kukaan ei tunnista.

EHDOTETTU TASO

Tasot jaetaan viidenneksiin mitatun vaikeusluvun mukaan, ei kiinteillä
rajoilla. Syy: kiinteä raja olettaisi että tiedämme etukäteen mikä luku on
"Vaikea", emmekä tiedä. Suhteellinen jako antaa viisi suunnilleen yhtä
suurta tasoa, mikä on juuri se mitä peli tarvitsee.

Ehdotus tehdään vain biiseille joilla on tarpeeksi kierroksia. Kahden
kierroksen perusteella ei tiedä mitään.

ARVIO

Pelaajat voivat myös kertoa miltä biisi tuntui, 1-5. Se on eri asia kuin
mitattu vaikeus: askel kertoo mitä ihminen teki, arvio mitä hän ajatteli.
Nämä eivät aina ole samaa mieltä, ja juuri erimielisyys on kiinnostavaa.
Biisi joka tunnistetaan heti mutta jonka kaikki merkitsevät vaikeaksi on
todennäköisesti tuttu mutta hankalasti nimettävä, ja sellainen kuuluu
korkeammalle tasolle kuin pelkkä mitattu luku ehdottaisi.
"""
import csv
import json
import pathlib
import sys

VAHINTAAN = 10          # kierrosta ennen kuin ehdotetaan mitään
VAHINTAAN_ARVIOITA = 5  # arviota ennen kuin niiden keskiarvoa vertaillaan
TASOT = {1: "Helppo", 2: "Keskitaso", 3: "Vaikea", 4: "Mestari", 5: "Mahdoton"}


def lue_katalogi(polku):
    data = json.loads(pathlib.Path(polku).read_text(encoding="utf-8"))
    rivit = data if isinstance(data, list) else next(v for v in data.values() if isinstance(v, list))
    kaikki = {int(x["id"]): x for x in rivit if x.get("id")}
    # Harhautuksia ei koskaan jaeta arvattavaksi, joten ne eivät voi saada
    # kierroksia. Kattavuutta ei siis kuulu verrata niihin.
    arvattavat = {i: x for i, x in kaikki.items() if x.get("peli") is not False}
    return kaikki, arvattavat


def lue_tilastot(polku):
    with open(polku, encoding="utf-8-sig", newline="") as f:
        # Excel voi tallentaa puolipisteellä; kokeillaan molempia.
        teksti = f.read()
    erotin = ";" if teksti.count(";") > teksti.count(",") else ","
    return list(csv.DictReader(teksti.splitlines(), delimiter=erotin))


def arvio(r):
    """Pelaajien arvioiden keskiarvo ja määrä. (None, 0) jos ei arvioita.

    Vanha CSV ei sisällä arviosarakkeita lainkaan, joten puuttuva sarake on
    normaali tilanne eikä virhe."""
    try:
        jakauma = [int(r.get(f"arvio{i}") or 0) for i in range(1, 6)]
    except ValueError:
        return None, 0
    n = sum(jakauma)
    if not n:
        return None, 0
    return sum((i + 1) * k for i, k in enumerate(jakauma)) / n, n


def vaikeusluku(r):
    """Kierrosten keskimääräinen hinta. Ei-tunnistettu maksaa 5."""
    askeleet = [int(r[f"a{i}"]) for i in range(5)]
    osumia = sum(askeleet)
    kierroksia = int(r["kierroksia"])
    ohi = kierroksia - osumia
    summa = sum(i * n for i, n in enumerate(askeleet)) + ohi * 5
    return summa / kierroksia if kierroksia else None


def main():
    if len(sys.argv) < 2:
        sys.exit("käyttö: python3 scripts/tasot.py tilastot.csv")
    juuri = pathlib.Path(__file__).resolve().parent.parent
    katalogi, arvattavat = lue_katalogi(juuri / "songs.json")
    rivit = lue_tilastot(sys.argv[1])

    mitatut, ohuet, tuntemattomat = [], [], []
    for r in rivit:
        tunnus = int(r["id"])
        biisi = katalogi.get(tunnus)
        if not biisi:
            tuntemattomat.append(tunnus)
            continue
        n = int(r["kierroksia"])
        keski, arvioita = arvio(r)
        tieto = {
            "id": tunnus,
            "nimi": f'{biisi.get("artist", "?")} – {biisi.get("title", "?")}',
            "taso": int(r["taso"]),
            "n": n,
            "osuma": sum(int(r[f"a{i}"]) for i in range(5)) / n if n else 0,
            "luku": vaikeusluku(r),
            "arvio": keski,
            "arvioita": arvioita,
        }
        (mitatut if n >= VAHINTAAN else ohuet).append(tieto)

    print(f"Rivejä CSV:ssä {len(rivit)} · katalogista löytyi {len(mitatut) + len(ohuet)}")
    if tuntemattomat:
        print(f"Tuntemattomia tunnisteita {len(tuntemattomat)}: {tuntemattomat[:5]}"
              " (testirivejä tai katalogista poistettuja)")
    print(f"Riittävästi dataa ({VAHINTAAN}+ kierrosta): {len(mitatut)} · liian vähän: {len(ohuet)}")
    arvioita = sum(b["arvioita"] for b in mitatut + ohuet)
    print(f"Arvioita yhteensä {arvioita}"
          + (" (vanha CSV ilman arviosarakkeita?)" if not arvioita else ""))
    if not mitatut:
        print("\nEi vielä yhtään biisiä jolla olisi tarpeeksi kierroksia. Anna kertyä.")
        return

    mitatut.sort(key=lambda x: x["luku"])
    # Viidennekset: yhtä monta biisiä tasoa kohti.
    koko = len(mitatut)
    for i, b in enumerate(mitatut):
        b["ehdotus"] = min(5, i * 5 // koko + 1)

    # Viidennesjako olettaa että mitatut biisit edustavat koko katalogia. Jos
    # mitattuja on vain kourallinen, jako venyttää nekin viiteen tasoon ja
    # ehdottaa muutosta lähes kaikelle. Se ei ole löydös vaan tilastoharha.
    kattavuus = koko / max(1, len(arvattavat))
    if kattavuus < 0.5:
        print(f"\nVAROITUS: mitattuja biisejä on {koko}, arvattavia katalogissa "
              f"{len(arvattavat)} ({kattavuus*100:.1f} %).")
        print("Viidennesjako olettaa että mitatut edustavat koko katalogia. Näin ohuella")
        print("otoksella ehdotukset kertovat vain näiden biisien keskinäisen järjestyksen,")
        print("eivät oikeaa tasoa. Käytä järjestystä, älä ehdotettua numeroa.")

    print(f"\n{'':<52} {'nyt':>4} {'ehd':>4} {'kierr':>6} {'osuma':>6} {'vaikeus':>8} {'arvio':>10}")
    print("-" * 98)
    for b in mitatut:
        merkki = "  " if b["taso"] == b["ehdotus"] else "->"
        a = f'{b["arvio"]:.1f} ({b["arvioita"]})' if b["arvio"] is not None else "-"
        print(f'{b["nimi"][:50]:<52} {b["taso"]:>4} {merkki}{b["ehdotus"]:>2} '
              f'{b["n"]:>6} {b["osuma"]*100:>5.0f}% {b["luku"]:>8.2f} {a:>10}')

    erimielet = [b for b in mitatut
                 if b["arvioita"] >= VAHINTAAN_ARVIOITA
                 and abs(b["arvio"] - b["ehdotus"]) >= 1.5]
    if erimielet:
        montako = "1 biisi" if len(erimielet) == 1 else f"{len(erimielet)} biisiä"
        print(f"\nMitattu ja koettu vaikeus eroavat ({montako}, "
              f"{VAHINTAAN_ARVIOITA}+ arviota):")
        for b in sorted(erimielet, key=lambda x: -abs(x["arvio"] - x["ehdotus"]))[:15]:
            suunta = "tuntuu vaikeammalta" if b["arvio"] > b["ehdotus"] else "tuntuu helpommalta"
            print(f'  {suunta}  mitattu {b["ehdotus"]}, koettu {b["arvio"]:.1f}  {b["nimi"][:40]}')
        print("Tämä ei ole virhe kummassakaan luvussa. Se kertoo yleensä biisistä joka")
        print("tunnistuu heti mutta jonka nimeäminen on hankalaa, tai päinvastoin.")

    muuttuu = [b for b in mitatut if b["taso"] != b["ehdotus"]]
    print(f"\nTaso muuttuisi {len(muuttuu)} biisillä {len(mitatut)}:stä.")
    isot = [b for b in muuttuu if abs(b["taso"] - b["ehdotus"]) >= 2]
    if isot:
        print(f"Niistä {len(isot)} siirtyisi vähintään kaksi tasoa:")
        for b in sorted(isot, key=lambda x: -abs(x["taso"] - x["ehdotus"]))[:15]:
            print(f'  {TASOT[b["taso"]]:<10} -> {TASOT[b["ehdotus"]]:<10} {b["nimi"][:44]}')


if __name__ == "__main__":
    main()
