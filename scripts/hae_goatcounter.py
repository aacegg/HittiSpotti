#!/usr/bin/env python3
"""Hakee HittiSpotin kävijätilastot GoatCounterista yhteen JSON-tiedostoon.

    export GOATCOUNTER_TOKEN='...'
    python3 scripts/hae_goatcounter.py > goatcounter.json

Token luodaan GoatCounterissa: käyttäjänimi oikeassa yläkulmassa -> API
-> uusi token. Riittää lukuoikeus ("Read statistics").

Token luetaan ympäristömuuttujasta eikä komentoriviltä, jottei se jää
komentohistoriaan. Sitä ei myöskään kirjoiteta tulostiedostoon.

Miksi API eikä CSV-vienti: raakojen sivulatausten vienti vaatii
asetuksen "Individual pageviews", joka on oletuksena pois päältä, eikä
sen kytkeminen päälle tuo takautuvasti aiempia käyntejä. Koostetut luvut
ovat olemassa joka tapauksessa.

Haettavat asiat:

    total     kokonaismäärät, sivulataukset ja kävijät
    hits      polut ja tapahtumat päivittäin eriteltynä
    sivut     selaimet, käyttöjärjestelmät, maat, näyttökoot, lähteet

Pelin omat tapahtumat näkyvät hits-listassa polkuina:

    paiva-aloitettu   pelaaja avasi päivän sarjan
    paiva-valmis      pelaaja pelasi sen loppuun

Näiden suhde on ainoa läpipeluuluku mitä meillä on.

Ei vaadi ulkoisia riippuvuuksia (vain Python 3:n vakiokirjasto).
"""
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date

SIVUSTO = os.environ.get("GOATCOUNTER_SIVUSTO", "hittispotti")
ALKU = os.environ.get("GOATCOUNTER_ALKU", "2026-01-01")

# Näitä alasivuja GoatCounterissa on ollut; osa voi puuttua versiosta
# riippuen. Puuttuva ei ole virhe, se vain ohitetaan.
SIVUT = ["browsers", "systems", "locations", "sizes", "toprefs",
         "campaigns", "languages"]


def hae(polku, token, **params):
    url = f"https://{SIVUSTO}.goatcounter.com/api/v0/{polku}"
    if params:
        url += "?" + urllib.parse.urlencode(
            {k: v for k, v in params.items() if v is not None})
    req = urllib.request.Request(url, headers={
        "Authorization": "Bearer " + token,
        "Content-Type": "application/json",
    })
    for yritys in range(4):
        try:
            with urllib.request.urlopen(req, timeout=40) as r:
                return json.load(r), None
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None, "ei löydy"
            if e.code in (401, 403):
                return None, f"ei oikeuksia ({e.code})"
            if e.code == 429:
                # Rajoitin kertoo otsikossa milloin saa jatkaa.
                odota = int(e.headers.get("X-Rate-Limit-Reset", 5))
                print(f"  rajoitin, odotetaan {odota} s", file=sys.stderr)
                time.sleep(odota + 1)
                continue
            return None, f"HTTP {e.code}"
        except Exception as e:
            if yritys == 3:
                return None, str(e)
            time.sleep(2 ** yritys)
    return None, "ei vastausta"


def main() -> int:
    token = os.environ.get("GOATCOUNTER_TOKEN", "").strip()
    if not token:
        print("Aseta ensin token:\n\n    export GOATCOUNTER_TOKEN='...'\n\n"
              "Sen saa GoatCounterista: käyttäjänimi oikeassa yläkulmassa "
              "-> API -> uusi token, lukuoikeus riittää.", file=sys.stderr)
        return 1

    loppu = date.today().isoformat()
    ulos = {"sivusto": SIVUSTO, "alku": ALKU, "loppu": loppu, "virheet": {}}

    print(f"Haetaan {SIVUSTO}.goatcounter.com, {ALKU} - {loppu}", file=sys.stderr)

    d, virhe = hae("stats/total", token, start=ALKU, end=loppu)
    if virhe:
        print(f"stats/total epäonnistui: {virhe}", file=sys.stderr)
        if "oikeuksia" in virhe:
            print("Tarkista että tokenilla on oikeus lukea tilastoja.", file=sys.stderr)
            return 1
    ulos["total"] = d
    print(f"  total: {d}", file=sys.stderr)

    # daily=true antaa jokaiselle polulle päiväkohtaisen sarjan. Se on
    # ainoa aikasarja mitä pelistä on olemassa.
    d, virhe = hae("stats/hits", token, start=ALKU, end=loppu, daily="true", limit=100)
    ulos["hits"] = d
    if virhe:
        ulos["virheet"]["hits"] = virhe
    else:
        print(f"  hits: {len(d.get('hits', []))} polkua", file=sys.stderr)

    ulos["sivut"] = {}
    for sivu in SIVUT:
        d, virhe = hae("stats/" + sivu, token, start=ALKU, end=loppu, limit=50)
        if virhe:
            ulos["virheet"][sivu] = virhe
            print(f"  {sivu}: {virhe}", file=sys.stderr)
        else:
            ulos["sivut"][sivu] = d
            n = len(d.get("stats", d.get(sivu, []))) if isinstance(d, dict) else 0
            print(f"  {sivu}: {n} riviä", file=sys.stderr)
        time.sleep(0.5)

    json.dump(ulos, sys.stdout, ensure_ascii=False, indent=1)
    print("\nValmis. Tiedostossa ei ole tokenia.", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
