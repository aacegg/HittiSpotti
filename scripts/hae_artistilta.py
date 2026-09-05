#!/usr/bin/env python3
"""Poimii artistin suosituimmat kappaleet suoraan Applen katalogista.

    python3 scripts/hae_artistilta.py "Vesala" "Gettomasa:3" "HIM:1,6"

Argumentti on `artisti` tai `artisti:perustaso` tai `artisti:perustaso,määrä`.
Perustaso on vaikeustaso artistin suosituimmalle kappaleelle (oletus 2), ja
listalla alaspäin mentäessä taso kiristyy. Määrä kertoo montako kappaletta
artistilta otetaan (oletus 4).

Tämä on luotettavampi tapa kuin biisien nimien arvaaminen: rajapinta
palauttaa vain kappaleita, jotka oikeasti ovat katalogissa, suunnilleen
suosituimmuusjärjestyksessä.

Ei vaadi ulkoisia riippuvuuksia (vain Python 3:n vakiokirjasto).
"""
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

# Versiot, joita ei haluta peliin: pätkä ei vastaisi sitä mitä pelaaja odottaa.
# Kappaleen nimestä hylätään laajalla listalla.
SKIP_TITLE = (
    "live", "karaoke", "remix", "instrumental", "akustinen", "acoustic",
    "demo", "version", "versio", "mix", "cover", "remaster", "vain elamaa",
    "radio edit", "sped up", "slowed", "commentary",
)
# Albumin nimestä vain ne, jotka kertovat itse äänitteen olevan eri: albumin
# nimi voi muuten sisältää sanan aivan viattomasti, kuten PMMP:n
# "Kovemmat Kädet - Kumiversio".
SKIP_ALBUM = ("live", "karaoke", "instrumental", "unplugged", "akustinen", "vain elamaa")


def has_word(text: str, words) -> bool:
    """Osuma vain kokonaisena sanana, ettei 'versio' osu 'kumiversioon'."""
    return any(re.search(rf"(?<![a-z0-9]){re.escape(w)}(?![a-z0-9])", text) for w in words)


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.lower().replace("&", " ja ")
    s = re.sub(r"[^a-z0-9 ]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def base_title(title: str) -> str:
    """'Beibi (feat. X)' -> 'beibi', jotta sama biisi ei tule kahdesti."""
    t = re.split(r"\s*[\(\[]", title)[0]
    t = re.split(r"\s+(feat\.?|ft\.?|with)\s+", t, flags=re.I)[0]
    return norm(t)


def search(term: str, limit: int) -> list:
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


def parse_arg(arg: str) -> tuple:
    artist, _, rest = arg.partition(":")
    tier, _, count = rest.partition(",")
    return artist.strip(), int(tier or 2), int(count or 4)


def main() -> int:
    args = [a for a in sys.argv[1:] if a.strip()]
    if not args:
        print(__doc__)
        return 1

    songs = json.loads(SONGS.read_text(encoding="utf-8"))
    have_ids = {s.get("id") for s in songs}
    have_titles = {norm(s["artist"]) + "|" + base_title(s["title"]) for s in songs}

    added = []
    for arg in args:
        artist, base_tier, count = parse_arg(arg)
        results = search(artist, 40)
        want = norm(artist)
        picked = []
        seen = set()
        for r in results:
            if len(picked) >= count:
                break
            if r.get("kind") != "song" or not r.get("previewUrl"):
                continue
            got = norm(r.get("artistName", ""))
            if want != got and not got.startswith(want + " "):
                continue  # feat.-esiintymiset toisen artistin biisillä ohitetaan
            if has_word(norm(r.get("trackName", "")), SKIP_TITLE):
                continue
            if has_word(norm(r.get("collectionName", "")), SKIP_ALBUM):
                continue
            key = base_title(r["trackName"])
            if key in seen or want + "|" + key in have_titles or r["trackId"] in have_ids:
                continue
            seen.add(key)
            # Listalla alaspäin mentäessä biisit ovat vähemmän tunnettuja, mutta
            # tunnetun artistin syvä raita ei ole "Mahdoton": nousu on enintään
            # kaksi askelta perustasosta.
            tier = min(5, base_tier + 2, base_tier + len(picked) // 2)
            picked.append({
                "artist": r["artistName"],
                "title": r["trackName"],
                "year": int((r.get("releaseDate") or "0")[:4]) or None,
                "tier": tier,
                "id": r["trackId"],
                "preview": r["previewUrl"],
                "art": (r.get("artworkUrl100") or "").replace("100x100", "300x300"),
                "itunes": f'{r["artistName"]} – {r["trackName"]} ({(r.get("releaseDate") or "")[:4]})',
            })
        if not picked:
            print(f"{artist}: ei uusia kappaleita")
        else:
            print(f"{artist}: {len(picked)}")
            for p in picked:
                print(f"   [{p['tier']}] {p['title']} ({p['year']})")
        added.extend(picked)
        time.sleep(0.8)

    SONGS.write_text(json.dumps(songs + added, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"\nLisätty {len(added)} biisiä, katalogissa nyt {len(songs) + len(added)}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
