#!/usr/bin/env python3
"""Hakee artistien taustatiedot MusicBrainzista Päivän artisti -peliä varten.

    python3 scripts/hae_artistit.py              # hae puuttuvat
    python3 scripts/hae_artistit.py --raportti   # vain yhteenveto, ei hakua

Kirjoittaa .artistit.json. Piste edessä, joten se ei mene julkaistuun
hakemistoon (ks. julkaise.yml).

MIKSI MUSICBRAINZ

Spotlen kaltainen peli vertailee artisteja attribuuteilla. Katalogissamme
on vain artistin nimi, joten attribuutit pitää hakea muualta. Applen
rajapinta antaa genren vain kappaleelle, ei artistille, ja se on karkea
("Pop", "Rock"). MusicBrainzissa on artistilla tyyppi, sukupuoli,
perustamisvuosi ja yhteisön ylläpitämät tyylitagit.

KAKSI HAKUA ARTISTIA KOHDEN

1. artist-haku antaa tyypin, sukupuolen, maan ja tagit.
2. release-group-haku antaa ensijulkaisun vuoden.

Toinen on välttämätön, koska life-span tarkoittaa eri asiaa riippuen
tyypistä: yhtyeellä se on perustamisvuosi mutta henkilöllä SYNTYMÄAIKA.
Mitattu: Cheek life-span 1981-12-22, ensijulkaisu 2001. Katri Helena
1945-08-17 ja 1963. Niitä ei voi laittaa samaan sarakkeeseen.

ARTISTIN NIMEN ERISTÄMINEN

Nimeä EI katkaista &-merkin eikä "ja"-sanan kohdalta. Suomessa molemmat
ovat usein osa yhtyeen nimeä: Matti ja Teppo, Eino ja Aapeli, Lauri Tähkä
& Elonkerjuu, Topi Sorsakoski & Agents. Katkaisu teki Matti ja Tepposta
artistin nimeltä "Matti". Vain pilkku ja feat. katkaisevat, koska ne ovat
katalogissa aina yhteistyömerkintöjä.

NOPEUSRAJOITUS

MusicBrainz sallii yhden pyynnön sekunnissa ja vaatii User-Agentin joka
kertoo kuka kysyy. Molempia noudatetaan. Tulokset tallennetaan, joten
keskeytynyt ajo voidaan jatkaa hakematta samoja uudelleen.
"""
import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
KATALOGI = ROOT / "katalogi.json"
ULOS = ROOT / ".artistit.json"

VAHINTAAN_BIISEJA = 3
UA = "HittiSpotti/1.0 ( https://hittispotti.fi )"
VIIVE = 1.1          # sekuntia pyyntöjen välissä
OSUVUUS_RAJA = 90    # MusicBrainzin oma pistemäärä 0-100


def paanimi(artist: str) -> str:
    """Yhteistyömerkinnät pois, yhtyeen nimi ehjänä."""
    return re.split(r"\s*,\s*|\s+feat\.?\s+|\s*\(feat", artist, flags=re.I)[0].strip()


def avain(nimi: str) -> str:
    return nimi.lower().replace("ä", "a").replace("ö", "o").strip()


def hae(polku: str, **params):
    url = "https://musicbrainz.org/ws/2/" + polku + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for yritys in range(4):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.load(r), None
        except urllib.error.HTTPError as e:
            if e.code == 503:      # rajoitin, hidasta ja yritä uudelleen
                time.sleep(2 ** yritys)
                continue
            return None, f"HTTP {e.code}"
        except Exception as e:
            if yritys == 3:
                return None, str(e)
            time.sleep(2 ** yritys)
    return None, "ei vastausta"


def etsi_artisti(nimi: str):
    """Ensin suomalaisista, sitten koko maailmasta.

    Rajaus maahan on tarpeen, koska lyhyet nimet osuvat muualle: "emma"
    löysi italialaisen artistin. Jos suomalaista ei löydy, otetaan paras
    osuma mutta merkitään se tarkistettavaksi.
    """
    for suodatin, lahde in ((' AND country:FI', "FI"), ("", "yleinen")):
        d, virhe = hae("artist", query=f'artist:"{nimi}"' + suodatin, fmt="json", limit="3")
        time.sleep(VIIVE)
        if virhe or not d.get("artists"):
            continue
        a = d["artists"][0]
        if a.get("score", 0) >= OSUVUUS_RAJA:
            return a, lahde
    return None, None


def ensijulkaisu(mbid: str):
    d, virhe = hae("release-group", artist=mbid, type="album|single",
                   fmt="json", limit="100")
    time.sleep(VIIVE)
    if virhe or not d:
        return None
    vuodet = []
    for r in d.get("release-groups", []):
        pvm = r.get("first-release-date") or ""
        if len(pvm) >= 4 and pvm[:4].isdigit():
            v = int(pvm[:4])
            if 1900 < v <= 2100:
                vuodet.append(v)
    return min(vuodet) if vuodet else None


def kerää_artistit():
    kat = json.loads(KATALOGI.read_text(encoding="utf-8"))
    pool = [s for s in kat if s.get("peli") is not False]
    ryhmat = defaultdict(lambda: {"nimi": None, "biisit": 0, "vuodet": []})
    for s in pool:
        nimi = paanimi(s["artist"])
        r = ryhmat[avain(nimi)]
        r["nimi"] = r["nimi"] or nimi
        r["biisit"] += 1
        r["vuodet"].append(s["year"])
    return {k: v for k, v in ryhmat.items() if v["biisit"] >= VAHINTAAN_BIISEJA}


def raportti(tiedot):
    n = len(tiedot)
    if not n:
        print("Ei dataa. Aja ensin ilman --raportti.")
        return
    loytyi = [a for a in tiedot.values() if a.get("mbid")]
    tagit = [a for a in loytyi if a.get("tagit")]
    debyytit = [a for a in loytyi if a.get("debyytti")]
    muualta = [a for a in loytyi if a.get("lahde") != "FI"]
    print(f"Artisteja (väh. {VAHINTAAN_BIISEJA} biisiä): {n}")
    print(f"  MusicBrainzista löytyi:  {len(loytyi)}  ({100*len(loytyi)//n} %)")
    print(f"  genretagit:              {len(tagit)}  ({100*len(tagit)//n} %)")
    print(f"  debyyttivuosi:           {len(debyytit)}  ({100*len(debyytit)//n} %)")
    print(f"  osuma muualta kuin FI:   {len(muualta)}  <- tarkistettava")
    puuttuu = [a["nimi"] for a in tiedot.values() if a.get("mbid") and not a.get("tagit")]
    if puuttuu:
        print(f"\nIlman genretagia ({len(puuttuu)}):")
        for nimi in sorted(puuttuu)[:40]:
            print("   " + nimi)
        if len(puuttuu) > 40:
            print(f"   ... ja {len(puuttuu)-40} muuta")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--raportti", action="store_true")
    a = ap.parse_args()

    artistit = kerää_artistit()
    tiedot = json.loads(ULOS.read_text(encoding="utf-8")) if ULOS.exists() else {}

    # Katalogista tulevat luvut päivitetään aina, ne ovat ilmaisia.
    for k, v in artistit.items():
        tiedot.setdefault(k, {})
        tiedot[k]["nimi"] = v["nimi"]
        tiedot[k]["biisit"] = v["biisit"]
        tiedot[k]["eka"] = min(v["vuodet"])
        tiedot[k]["vika"] = max(v["vuodet"])
        vuodet = sorted(v["vuodet"])
        tiedot[k]["mediaanivuosi"] = vuodet[len(vuodet) // 2]

    if a.raportti:
        raportti({k: tiedot[k] for k in artistit})
        return 0

    kesken = [k for k in artistit if "mbid" not in tiedot[k]]
    print(f"Artisteja {len(artistit)}, hakematta {len(kesken)}", file=sys.stderr)
    for i, k in enumerate(kesken, 1):
        nimi = tiedot[k]["nimi"]
        mb, lahde = etsi_artisti(nimi)
        if not mb:
            tiedot[k]["mbid"] = None
            print(f"  {i}/{len(kesken)}  EI OSUMAA  {nimi}", file=sys.stderr)
        else:
            tiedot[k].update({
                "mbid": mb["id"],
                "mbnimi": mb.get("name"),
                "tyyppi": mb.get("type"),
                "sukupuoli": mb.get("gender"),
                "maa": mb.get("country") or (mb.get("area") or {}).get("name"),
                "lahde": lahde,
                "osuvuus": mb.get("score"),
                "tagit": [t["name"] for t in sorted(mb.get("tags") or [],
                                                    key=lambda t: -t.get("count", 0))[:5]],
            })
            tiedot[k]["debyytti"] = ensijulkaisu(mb["id"])
            print(f"  {i}/{len(kesken)}  {nimi} -> {mb.get('name')} "
                  f"({mb.get('type')}, {tiedot[k]['debyytti']}, "
                  f"{len(tiedot[k]['tagit'])} tagia)", file=sys.stderr)
        # Tallennetaan joka kierroksella: keskeytys ei hukkaa tehtyä työtä.
        ULOS.write_text(json.dumps(tiedot, ensure_ascii=False, indent=1), encoding="utf-8")

    print(file=sys.stderr)
    raportti({k: tiedot[k] for k in artistit})
    return 0


if __name__ == "__main__":
    sys.exit(main())
