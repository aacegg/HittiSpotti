#!/usr/bin/env python3
"""Tarkistaa katalogin julkaisuvuodet MusicBrainzista.

    python3 scripts/vuodet_musicbrainz.py            # tarkista ja raportoi
    python3 scripts/vuodet_musicbrainz.py --korjaa   # kirjoita ehdotetut vuodet

Peli näyttää paljastuksessa julkaisuvuoden. Applen päivämäärä ei kelpaa
siihen: se on sen levyn päivä jolta pätkä tulee, ei äänitteen, ja se on
väärin molempiin suuntiin. Mitattu kolme kertaa:

    JVG – Kran Turismo          Apple 2006   katalogi 2016   oikea 2012
    Jenni Vartiainen – Missä muruseni on
                                Apple 2001 (kolmella levyllä)  oikea 2010
    Pelle Miljoona – Moottoritie on kuuma
                                Apple 2002 (uudelleenlevytys)  oikea 1980

MusicBrainz on tietokanta jossa äänitteellä on oma ensijulkaisupäivänsä
levystä riippumatta. Se osui Kran Turismoon ja Missä muruseniin oikein.

Kaksi asiaa tekee hausta luotettavamman:

1. Kesto. Sama äänite on yhtä pitkä, joten ehdokas kelpaa vain jos sen
   kesto on muutaman sekunnin päässä pelissä olevasta. Näin sovitukset ja
   live-versiot eivät sotke vuotta.

2. Artistin nimen muunnelmat. Pelle Miljoonan alkuperäinen on
   MusicBrainzissa nimellä "Pelle Miljoona Oy", eikä pelkkä "Pelle
   Miljoona" löydä sitä. Siksi haku tehdään myös ilman artistirajausta ja
   nimi tarkistetaan vasta tuloksista.

Vuosia ei kirjoiteta ilman --korjaa, ja silloinkin vain ne joissa kesto
täsmää. Loput raportoidaan päätettäväksi.

Välitulokset tallennetaan levylle, joten keskeytetyn ajon voi jatkaa
siitä mihin se jäi. MusicBrainz sallii yhden pyynnön sekunnissa, joten
koko katalogi kestää noin puoli tuntia.

Ei vaadi ulkoisia riippuvuuksia (vain Python 3:n vakiokirjasto).
"""
import argparse
import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SONGS = ROOT / "songs.json"
VALIMUISTI = ROOT / ".vuodet-musicbrainz.json"
sys.path.insert(0, str(ROOT / "scripts"))
from hae_soittolistalta import api, base_title, first_artist, norm  # noqa: E402

# MusicBrainz vaatii tunnistautuvan User-Agentin ja enintään yhden
# pyynnön sekunnissa. Molempien rikkominen johtaa estoon.
UA = "HittiSpotti/1.0 (suomalainen biisivisa; https://hittispotti.fi)"
VALI = 1.1
# Kuinka monta sekuntia kesto saa erota ja olla silti sama äänite.
SAMA_KESTO = 3
# Tätä pienempää vuosieroa ei raportoida: kyse on levyn päivästä.
MERKITTAVA = 2


def mb_haku(kysely):
    url = ("https://musicbrainz.org/ws/2/recording?fmt=json&limit=25&query="
           + urllib.parse.quote(kysely))
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for yritys in range(3):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.load(r)
        except Exception:
            time.sleep(2 ** yritys)
    return {}


def vuodet_recordingista(rec):
    """Kaikki vuodet joita tämä äänite on nähnyt, ensijulkaisu mukaan lukien."""
    ulos = set()
    if rec.get("first-release-date"):
        ulos.add(int(rec["first-release-date"][:4]))
    for r in rec.get("releases", []):
        if r.get("date"):
            ulos.add(int(r["date"][:4]))
    return {v for v in ulos if 1900 < v < 2100}


def artisti_tasmaa(rec, haluttu):
    """Riittää että haluttu nimi on jonkin kreditoidun artistin alussa.

    "Pelle Miljoona Oy" kelpaa haulle "Pelle Miljoona", koska kyse on
    saman artistin kokoonpanosta eikä eri esittäjästä."""
    for ac in rec.get("artist-credit", []):
        nimi = norm((ac.get("artist") or {}).get("name", "") or ac.get("name", ""))
        if nimi == haluttu or nimi.startswith(haluttu + " ") or haluttu in nimi.split():
            return True
    return False


def tutki(s, oma_kesto):
    nimi = first_artist(s["artist"])
    biisi = base_title(s["title"])
    haluttu = norm(nimi)

    kyselyt = [f'artist:"{nimi}" AND recording:"{biisi}"', f'recording:"{biisi}"']
    ehdokkaat = []
    for k in kyselyt:
        d = mb_haku(k)
        time.sleep(VALI)
        for rec in d.get("recordings", []):
            if base_title(rec.get("title", "")) != biisi:
                continue
            if not artisti_tasmaa(rec, haluttu):
                continue
            pituus = rec.get("length")
            kesto_s = round(pituus / 1000) if pituus else None
            vuodet = vuodet_recordingista(rec)
            if not vuodet:
                continue
            ehdokkaat.append({"kesto": kesto_s, "vuosi": min(vuodet),
                              "nimi": rec.get("title"),
                              "artisti": rec.get("artist-credit", [{}])[0].get("name")})
        if ehdokkaat:
            break

    if not ehdokkaat:
        return {"tila": "ei löytynyt"}

    tasmaavat = [e for e in ehdokkaat
                 if e["kesto"] and oma_kesto and abs(e["kesto"] - oma_kesto) <= SAMA_KESTO]
    if tasmaavat:
        paras = min(tasmaavat, key=lambda e: e["vuosi"])
        return {"tila": "kesto täsmää", "vuosi": paras["vuosi"], "ehdokas": paras}
    paras = min(ehdokkaat, key=lambda e: e["vuosi"])
    return {"tila": "vain nimi", "vuosi": paras["vuosi"], "ehdokas": paras}


def omat_kestot(idt):
    ulos = {}
    for i in range(0, len(idt), 120):
        for r in api("lookup", id=",".join(str(x) for x in idt[i:i + 120])):
            if r.get("kind") == "song" and r.get("trackTimeMillis"):
                ulos[r["trackId"]] = round(r["trackTimeMillis"] / 1000)
        time.sleep(0.3)
    return ulos


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--korjaa", action="store_true", help="kirjoita vuodet joissa kesto täsmää")
    ap.add_argument("--raja", type=int, default=0)
    ap.add_argument("--mukaan", choices=("peli", "taytteet", "kaikki"), default="peli",
                    help="ketkä tarkistetaan: arvattavat (oletus), täytteet vai molemmat")
    a = ap.parse_args()

    songs = json.loads(SONGS.read_text(encoding="utf-8"))
    # Täytebiisin vuosi on yhtä väärä kuin arvattavan, ja se paljastuu
    # vasta kun täyte nostetaan peliin. Neljä Ruusua - Sun Täytyy Mennä
    # oli katalogissa vuonna 2000 eli kokoelman päivällä, vaikka äänite on
    # vuodelta 1992. Ensimmäinen ajo ei löytänyt sitä, koska se katsoi
    # vain arvattavia.
    if a.mukaan == "peli":
        pelattavat = [s for s in songs if s.get("peli") is not False]
    elif a.mukaan == "taytteet":
        pelattavat = [s for s in songs if s.get("peli") is False]
    else:
        pelattavat = list(songs)
    if a.raja:
        pelattavat = pelattavat[:a.raja]

    tila = json.loads(VALIMUISTI.read_text(encoding="utf-8")) if VALIMUISTI.exists() else {}
    kestot = tila.get("kestot") or {}
    # Puuttuvat haetaan tunnisteittain, ei määrää vertaamalla. Aiemmin
    # ehtona oli len(kestot) < len(pelattavat), mikä meni pieleen heti kun
    # joukko vaihtui: välimuistissa oli 1486 arvattavan kestot, täytteitä
    # on 695, eikä 1486 < 695, joten yhtään täytteen kestoa ei haettu.
    # Silloin kesto puuttuu jokaiselta, mikään ei voi täsmätä, ja koko
    # tarkistuksen luotettavin osa jää käyttämättä.
    puuttuvat = [s["id"] for s in pelattavat if str(s["id"]) not in kestot]
    if puuttuvat:
        print(f"Haetaan {len(puuttuvat)} puuttuvaa kestoa Applelta...", file=sys.stderr)
        # Päivitetään, ei korvata: muiden joukkojen kestot säilyvät.
        kestot.update({str(k): v for k, v in omat_kestot(puuttuvat).items()})
        tila["kestot"] = kestot
        VALIMUISTI.write_text(json.dumps(tila), encoding="utf-8")

    tulokset = tila.get("tulokset") or {}
    jaljella = [s for s in pelattavat if str(s["id"]) not in tulokset]
    print(f"{len(tulokset)} valmiina, {len(jaljella)} jäljellä "
          f"(~{len(jaljella) * VALI / 60:.0f} min)", file=sys.stderr)

    for i, s in enumerate(jaljella, 1):
        tulokset[str(s["id"])] = tutki(s, kestot.get(str(s["id"])))
        if i % 25 == 0:
            tila["tulokset"] = tulokset
            VALIMUISTI.write_text(json.dumps(tila), encoding="utf-8")
            print(f"  {i}/{len(jaljella)}", file=sys.stderr)
    tila["tulokset"] = tulokset
    VALIMUISTI.write_text(json.dumps(tila), encoding="utf-8")

    varmat, epavarmat = [], []
    for s in pelattavat:
        t = tulokset.get(str(s["id"])) or {}
        v = t.get("vuosi")
        if not v or not s.get("year") or v > s["year"] - MERKITTAVA:
            continue
        (varmat if t["tila"] == "kesto täsmää" else epavarmat).append((s, t))

    print(f"\nVUOSI LIIAN UUSI, KESTO TÄSMÄÄ: {len(varmat)}")
    print("Sama äänite, vanhempi ensijulkaisu. Nämä voi korjata.\n")
    for s, t in sorted(varmat, key=lambda x: x[1]["vuosi"] - x[0]["year"]):
        print(f"  {s['year']} -> {t['vuosi']}  {s['artist']} – {s['title']}")

    print(f"\nVUOSI LIIAN UUSI, KESTO EI TÄSMÄÄ TAI PUUTTUU: {len(epavarmat)}")
    print("Voi olla eri äänite. Vaatii tarkistuksen.\n")
    for s, t in sorted(epavarmat, key=lambda x: x[1]["vuosi"] - x[0]["year"]):
        e = t["ehdokas"]
        print(f"  {s['year']} -> {t['vuosi']}  {s['artist']} – {s['title']}")
        print(f"        MusicBrainz: {e['artisti']} – {e['nimi']} · {e['kesto']}s")

    if a.korjaa and varmat:
        idx = {s["id"]: s for s in songs}
        for s, t in varmat:
            idx[s["id"]]["year"] = t["vuosi"]
        SONGS.write_text(json.dumps(songs, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"\nKorjattu {len(varmat)} vuotta.")
        print("Muista kasvattaa app.js:n KATALOGI-versio (songs.json?k=N).")
    elif varmat:
        print("\n(ei kirjoitettu, aja --korjaa jos vuodet saa korjata)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
