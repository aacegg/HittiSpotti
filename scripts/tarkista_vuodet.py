#!/usr/bin/env python3
"""Etsii katalogista biisit, joihin on valittu väärä äänite.

    python3 scripts/tarkista_vuodet.py               # tarkista ja raportoi
    python3 scripts/tarkista_vuodet.py --raja 100    # vain N ensimmäistä

Peli näyttää paljastuksessa julkaisuvuoden, ja väärä vuosi on väärä tieto.
Vuosia ei kuitenkaan voi korjata automaattisesti, ja se kannattaa tietää
ennen kuin sitä yrittää.

Applen julkaisupäivä on sen levyn päivä jolta pätkä tulee, ei äänitteen,
ja se on väärin molempiin suuntiin. Mitattu: Jenni Vartiaisen Missä
muruseni on on päivätty 2001 kolmella eri levyllä, myös alkuperäisellä
Seilillä, vaikka biisi on vuodelta 2010. Sama väärä päivä siis toistuu,
joten useampi levy ei vahvista mitään. MusicBrainz on parempi mutta ei
sekään aukoton: se ei löytänyt Pelle Miljoonan alkuperäistä, koska se on
siellä nimellä "Pelle Miljoona Oy".

Mitä VOI tehdä luotettavasti: tunnistaa väärä äänite kestosta. Sama
äänite on yhtä pitkä riippumatta levystä. Jos samalta artistilta ja
samalla nimellä löytyy selvästi eri pituinen ja vanhempi julkaisu, peliin
on todennäköisesti valittu uudelleenlevytys, live-versio tai sovitus
alkuperäisen sijaan.

Mitattu esimerkki: Pelle Miljoonan Moottoritie on kuuma oli pelissä
vuoden 2002 uudelleenlevytyksenä (5.50), vaikka alkuperäinen vuodelta
1980 on 5.10. Haku oli hylännyt alkuperäisen, koska sen nimessä lukee
"Remastered".

Täytebiisit tarkistetaan --mukaan-valitsimella. Niiden vuosi ei näy
kenellekään ennen kuin biisi nostetaan peliin, mutta silloin se näkyy
heti, joten tarkistus kannattaa tehdä ennen nostoa eikä sen jälkeen.

Apple rajoittaa liikennettä rajusti. Viidellä rinnakkaisella haulla
mitattiin 695 biisin ajossa 279 kertaa 403 ja 118 kertaa 429, eikä se
näy tuloksessa virheenä vaan puuttuvina löydöksinä: tyhjä haku on
erottamaton siitä ettei vanhempaa versiota ole. --rinnakkain 1-2 on
hitaampi mutta rehellinen. Välitulokset tallennetaan levylle, joten
keskeytetyn ajon voi jatkaa.

Ei vaadi ulkoisia riippuvuuksia (vain Python 3:n vakiokirjasto).
"""
import argparse
import json
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SONGS = ROOT / "songs.json"
# Välitulokset, jotta pitkän ajon voi jatkaa keskeytyksen jälkeen.
VALIMUISTI = ROOT / ".aanitteet-tarkistus.json"
sys.path.insert(0, str(ROOT / "scripts"))
from hae_soittolistalta import (api, base_title, first_artist, has_word,  # noqa: E402
                                is_live, norm, SKIP_TITLE)

# Kuinka monta sekuntia kestot saavat erota ja olla silti sama äänite.
# Applen kestot pyöristyvät eri julkaisuissa hieman eri tavoin.
SAMA_KESTO = 2
# Tätä lyhyempi ero ei kerro mitään; tätä pidempi on eri äänite.
ERI_AANITE = 5
# Kuinka monta vuotta vanhempi julkaisun pitää olla, jotta se kiinnostaa.
VANHEMPI = 3


def kesto(r):
    return round((r.get("trackTimeMillis") or 0) / 1000)


def vuosi(r):
    return int((r.get("releaseDate") or "0")[:4]) or None


def mmss(s):
    return f"{s // 60}.{s % 60:02d}"


def omat_tiedot(idt):
    """Katalogin biisien omat kestot. Lookup ottaa monta tunnistetta kerralla."""
    ulos = {}
    for i in range(0, len(idt), 120):
        for r in api("lookup", id=",".join(str(x) for x in idt[i:i + 120])):
            if r.get("kind") == "song":
                ulos[r["trackId"]] = r
        time.sleep(0.2)
    return ulos


def versiot(s):
    """Kaikki saman artistin ja nimen äänitteet Applella."""
    nimi, biisi = first_artist(s["artist"]), base_title(s["title"])
    loydot = {}
    for term in (f"{nimi} {s['title']}", f"{nimi} {biisi}"):
        for r in api("search", term=term, media="music", entity="song", limit=25):
            if base_title(r.get("trackName", "")) != biisi:
                continue
            got, want = norm(r.get("artistName", "")), norm(nimi)
            if want != got and not got.startswith(want + " ") and want not in got.split():
                continue
            loydot[r["trackId"]] = r
        if loydot:
            break
    return list(loydot.values())


def tutki(s, oma):
    """Onko pelissä oleva äänite uudempi kuin jokin selvästi eri pituinen."""
    if not oma:
        return None
    k, v = kesto(oma), s.get("year")
    if not k or not v:
        return None
    ehdokkaat = []
    for r in versiot(s):
        rv, rk = vuosi(r), kesto(r)
        if not rv or not rk or abs(rk - k) < ERI_AANITE:
            continue
        if rv > v - VANHEMPI:
            continue
        # Live ja karaoke eivät ole se alkuperäinen jota etsitään. Remaster
        # sen sijaan kelpaa: se on sama äänite uudelleen masteroituna.
        nimi = norm(r.get("trackName", ""))
        if is_live(r.get("trackName", "")) or has_word(
                nimi, [x for x in SKIP_TITLE if x not in ("remaster", "remastered", "remasteroitu")]):
            continue
        ehdokkaat.append(r)
    if not ehdokkaat:
        return None
    vanhin = min(ehdokkaat, key=vuosi)
    return {"kesto": k, "vanhin": vanhin,
            "muut": sorted({(vuosi(r), kesto(r)) for r in ehdokkaat})}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--raja", type=int, default=0, help="tarkista vain N ensimmäistä")
    ap.add_argument("--mukaan", choices=("peli", "taytteet", "kaikki"), default="peli",
                    help="ketkä tarkistetaan: arvattavat (oletus), täytteet vai molemmat")
    # Apple rajoittaa liikennettä rajusti. Viidellä rinnakkaisella haulla
    # mitattiin 695 biisin ajossa 279 kertaa 403 ja 118 kertaa 429, ja
    # tyhjäksi jäänyt haku näyttää samalta kuin "ei vanhempaa versiota":
    # tulos ei näytä vialliselta, se on vain vaiti. Pienempi luku on
    # hitaampi mutta kertoo totuuden.
    ap.add_argument("--rinnakkain", type=int, default=5,
                    help="montako hakua yhtä aikaa (oletus 5, hitaampi ja "
                         "luotettavampi 1-2)")
    a = ap.parse_args()

    songs = json.loads(SONGS.read_text(encoding="utf-8"))
    # Sama laajennus kuin vuodet_musicbrainz.py:ssä. Täytebiisiin on yhtä
    # helppo valita väärä äänite, ja se paljastuu vasta pelissä.
    if a.mukaan == "peli":
        pelattavat = [s for s in songs if s.get("peli") is not False]
    elif a.mukaan == "taytteet":
        pelattavat = [s for s in songs if s.get("peli") is False]
    else:
        pelattavat = list(songs)
    if a.raja:
        pelattavat = pelattavat[:a.raja]
    JOUKKO = {"peli": "arvattavaa biisiä", "taytteet": "täytebiisiä",
              "kaikki": "katalogin biisiä"}
    print(f"Tarkistetaan {len(pelattavat)} {JOUKKO[a.mukaan]}.", file=sys.stderr)

    omat = omat_tiedot([s["id"] for s in pelattavat])
    print(f"Omat kestot haettu: {len(omat)}/{len(pelattavat)}", file=sys.stderr)

    # Hitaalla rinnakkaisuudella koko katalogi kestää tunteja, ja ilman
    # välimuistia keskeytys hukkaa kaiken. Tulos tallennetaan biiseittäin,
    # joten keskeytetyn ajon voi jatkaa siitä mihin se jäi.
    tila = json.loads(VALIMUISTI.read_text(encoding="utf-8")) if VALIMUISTI.exists() else {}
    jaljella = [s for s in pelattavat if str(s["id"]) not in tila]
    print(f"{len(pelattavat) - len(jaljella)} valmiina, {len(jaljella)} jäljellä",
          file=sys.stderr)

    def talleta():
        VALIMUISTI.write_text(json.dumps(tila), encoding="utf-8")

    with ThreadPoolExecutor(max_workers=max(1, a.rinnakkain)) as ex:
        for i, (s, t) in enumerate(
                zip(jaljella, ex.map(lambda s: tutki(s, omat.get(s["id"])), jaljella)), 1):
            tila[str(s["id"])] = t
            if i % 25 == 0:
                talleta()
                print(f"  {i}/{len(jaljella)}", file=sys.stderr)
    talleta()

    osumat = [(s, tila[str(s["id"])]) for s in pelattavat if tila.get(str(s["id"]))]

    print(f"\nMAHDOLLISESTI VÄÄRÄ ÄÄNITE: {len(osumat)}")
    print("Vanhempi julkaisu on selvästi eri pituinen, eli eri äänite.")
    print("Tarkista kuuntelemalla kumpi on se jonka pelaajat tuntevat.\n")
    for s, t in sorted(osumat, key=lambda x: x[0]["year"] - vuosi(x[1]["vanhin"]), reverse=True):
        v = t["vanhin"]
        ero = s["year"] - vuosi(v)
        print(f"  {ero:>3} v  {s['artist']} – {s['title']}")
        print(f"         pelissä  {s['year']}  {mmss(t['kesto'])}  id {s['id']}")
        print(f"         vanhempi {vuosi(v)}  {mmss(kesto(v))}  {v.get('artistName')} · "
              f"{v.get('collectionName')}  id {v['trackId']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
