#!/usr/bin/env python3
"""Poimii Applen Suomen suosituimmista biiseistä ehdotuslistan lisäystyökalulle.

    python3 scripts/hae_ehdotukset.py

Kirjoittaa tiedoston ehdotukset.json, jossa on ne listan biisit, joita
songs.json ei vielä sisällä. Lisäystyökalu (lisaa.html) lukee tiedoston,
koska Applen listarajapinta ei salli selainhakua toiselta sivustolta.

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
OUT = ROOT / "ehdotukset.json"
# Applen listarajapinnasta on biiseille tarjolla vain most-played; muut
# nimet (top-songs, new-releases) vastaavat 404.
FEEDS = [
    ("Suosituimmat", "https://rss.marketingtools.apple.com/api/v2/fi/music/most-played/100/songs.json"),
]
LOOKUP = "https://itunes.apple.com/lookup"


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", "", s.lower())


def get(url: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": "HittiSpotti/1.0"})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=25) as resp:
                return json.load(resp)
        except Exception as e:  # noqa: BLE001
            wait = 2 ** attempt
            print(f"   ! {e}, yritetään {wait}s päästä", file=sys.stderr)
            time.sleep(wait)
    return {}


def main() -> int:
    songs = json.loads(SONGS.read_text(encoding="utf-8"))
    have_ids = {s.get("id") for s in songs}
    have_names = {norm(s["artist"]) + "|" + norm(s["title"]) for s in songs}

    seen = set()
    wanted = []
    for label, url in FEEDS:
        feed = get(url).get("feed", {})
        results = feed.get("results", [])
        print(f"{label}: {len(results)} biisiä listalla")
        for r in results:
            tid = int(r["id"])
            if tid in have_ids or tid in seen:
                continue
            if norm(r["artistName"]) + "|" + norm(r["name"]) in have_names:
                continue
            seen.add(tid)
            wanted.append((tid, label))

    # Listaus ei sisällä esikuuntelu-URLia, joten tiedot haetaan lookupilla.
    out = []
    ids = [t for t, _ in wanted]
    labels = dict(wanted)
    for i in range(0, len(ids), 100):
        chunk = ids[i:i + 100]
        data = get(f"{LOOKUP}?" + urllib.parse.urlencode({"id": ",".join(map(str, chunk)), "country": "fi"}))
        for r in data.get("results", []):
            if r.get("wrapperType") != "track" or not r.get("previewUrl"):
                continue
            out.append({
                "id": r["trackId"],
                "artist": r["artistName"],
                "title": r["trackName"],
                "year": int((r.get("releaseDate") or "0")[:4]) or None,
                "preview": r["previewUrl"],
                "art": (r.get("artworkUrl100") or "").replace("100x100", "300x300"),
                "lista": labels.get(r["trackId"], ""),
            })
        time.sleep(0.5)

    out.sort(key=lambda x: (x["lista"], x["artist"].lower(), x["title"].lower()))
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"\nKirjoitettu {OUT.name}: {len(out)} ehdotusta, jotka eivät ole vielä katalogissa.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
