#!/usr/bin/env python3
"""Hakee jokaiselta katalogin artistilta muutaman puuttuvan suosituimman biisin.

    python3 scripts/hae_houkutuslinnut.py            # 3 per artisti
    python3 scripts/hae_houkutuslinnut.py --per 5    # 5 per artisti
    python3 scripts/hae_houkutuslinnut.py --kuiva    # näytä, älä kirjoita

Lisätyt biisit merkitään `"peli": false`, eli ne näkyvät vain hakulistassa
eivätkä koskaan tule arvattavaksi. Näin ehdotuslista tihenee: oikeaa vastausta
ei voi päätellä siitä, mitä listalla sattuu olemaan. Arviointityökalussa ne voi
nostaa peliin, jos jokin osoittautuu arvaamisen arvoiseksi.

Lähtötaso arvataan artistin nykyisten biisien keskitasosta yhtä kovemmaksi,
koska nämä ovat määritelmällisesti vähemmän soitettuja kuin jo mukana olevat.

Ei vaadi ulkoisia riippuvuuksia (vain Python 3:n vakiokirjasto).
"""
import argparse
import json
import re
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SONGS = ROOT / "songs.json"
API = "https://itunes.apple.com/search"

# Samat versiosuodattimet kuin muissakin hakuskripteissä: pätkän pitää vastata
# sitä äänitettä, jonka pelaaja tuntee.
SKIP_TITLE = (
    "live", "karaoke", "remix", "instrumental", "akustinen", "acoustic",
    "demo", "version", "versio", "mix", "cover", "remaster", "vain elamaa",
    "radio edit", "sped up", "slowed", "commentary",
)
SKIP_ALBUM = ("live", "karaoke", "instrumental", "unplugged", "akustinen", "vain elamaa")


def has_word(text: str, words) -> bool:
    return any(re.search(rf"(?<![a-z0-9]){re.escape(w)}(?![a-z0-9])", text) for w in words)


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.lower().replace("&", " ja ")
    s = re.sub(r"[^a-z0-9 ]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def base_title(title: str) -> str:
    t = re.split(r"\s*[\(\[]", title)[0]
    t = re.split(r"\s+(feat\.?|ft\.?|with)\s+", t, flags=re.I)[0]
    return norm(t)


def first_artist(artist: str) -> str:
    """'Gettomasa & Van Hegen' -> 'Gettomasa'. Katalogissa on yhteisnimiä."""
    return re.split(r"\s*[,&]\s*|\s+ja\s+", artist)[0].strip()


def search(term: str, limit: int = 40) -> list:
    q = urllib.parse.urlencode({
        "term": term, "attribute": "artistTerm", "country": "fi",
        "media": "music", "entity": "song", "limit": limit,
    })
    req = urllib.request.Request(f"{API}?{q}", headers={"User-Agent": "HittiSpotti/1.0"})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=25) as resp:
                return json.load(resp).get("results", [])
        except Exception as e:  # noqa: BLE001
            wait = 2 ** attempt
            print(f"   ! {e}, yritetään {wait}s päästä", file=sys.stderr)
            time.sleep(wait)
    return []


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--per", type=int, default=3, help="montako per artisti")
    ap.add_argument("--kuiva", action="store_true")
    a = ap.parse_args()

    songs = json.loads(SONGS.read_text(encoding="utf-8"))
    have_ids = {s["id"] for s in songs}
    have_titles = {norm(first_artist(s["artist"])) + "|" + base_title(s["title"]) for s in songs}

    # Artistit siinä järjestyksessä kuin ne katalogiin tulivat, ja kunkin
    # nykyinen keskitaso lähtöarvaukseksi.
    artistit, tasot = [], {}
    for s in songs:
        nimi = first_artist(s["artist"])
        if nimi not in tasot:
            artistit.append(nimi)
            tasot[nimi] = []
        tasot[nimi].append(s["tier"])

    print(f"{len(artistit)} artistia, haetaan {a.per} puuttuvaa kultakin\n")
    lisatyt = []
    tyhjat = []
    for i, artisti in enumerate(artistit, 1):
        want = norm(artisti)
        base = min(5, round(sum(tasot[artisti]) / len(tasot[artisti])) + 1)
        picked, seen = [], set()
        for r in search(artisti):
            if len(picked) >= a.per:
                break
            if r.get("kind") != "song" or not r.get("previewUrl"):
                continue
            got = norm(r.get("artistName", ""))
            if want != got and not got.startswith(want + " "):
                continue
            if has_word(norm(r.get("trackName", "")), SKIP_TITLE):
                continue
            if has_word(norm(r.get("collectionName", "")), SKIP_ALBUM):
                continue
            key = base_title(r["trackName"])
            if key in seen or want + "|" + key in have_titles or r["trackId"] in have_ids:
                continue
            seen.add(key)
            picked.append({
                "artist": r["artistName"],
                "title": r["trackName"],
                "year": int((r.get("releaseDate") or "0")[:4]) or None,
                "tier": base,
                "id": r["trackId"],
                "preview": r["previewUrl"],
                "art": (r.get("artworkUrl100") or "").replace("100x100", "300x300"),
                "itunes": f'{r["artistName"]} – {r["trackName"]} ({(r.get("releaseDate") or "")[:4]})',
                "peli": False,   # täytettä hakulistaan, ei arvattavaksi
            })
            have_ids.add(r["trackId"])
            have_titles.add(want + "|" + key)
        if picked:
            lisatyt.extend(picked)
        else:
            tyhjat.append(artisti)
        if i % 25 == 0 or i == len(artistit):
            print(f"  {i}/{len(artistit)} · löytynyt {len(lisatyt)}")
        time.sleep(0.7)

    print(f"\nUusia täytebiisejä {len(lisatyt)}")
    if tyhjat:
        print(f"Ei uutta annettavaa {len(tyhjat)} artistilta: {', '.join(tyhjat[:12])}"
              + (" …" if len(tyhjat) > 12 else ""))
    if lisatyt and not a.kuiva:
        SONGS.write_text(json.dumps(songs + lisatyt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"Katalogissa nyt {len(songs) + len(lisatyt)} biisiä, joista arvattavia "
              f"{sum(1 for s in songs + lisatyt if s.get('peli') is not False)}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
