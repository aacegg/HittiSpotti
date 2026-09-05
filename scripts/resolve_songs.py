#!/usr/bin/env python3
"""Hakee songs.json-katalogin biiseille iTunes-esikuuntelut.

Käyttö:
    python3 scripts/resolve_songs.py            # täydentää vain puuttuvat
    python3 scripts/resolve_songs.py --all      # hakee kaikki uudelleen

Skripti lukee songs.json-tiedoston, hakee jokaiselle biisille iTunes Search
API:sta (country=fi) parhaiten täsmäävän kappaleen ja tallentaa kentät
`id` (iTunes trackId), `preview` (30 s esikuuntelun URL) ja `art` (kansikuva).
Biisit, joille ei löydy osumaa, listataan lopuksi, jotta ne voi korjata käsin.

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

BAD_WORDS = (
    "live", "karaoke", "remix", "instrumental", "akustinen", "acoustic",
    "demo", "versio", "version", "edit", "mix", "cover", "tribute",
    "playback", "unplugged", "radio", "vain elämää", "tähdet, tähdet",
)


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.lower().replace("&", " and ")
    s = re.sub(r"[^a-z0-9 ]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def strip_extra(title: str) -> str:
    """Poistaa suluissa olevat lisäykset ja feat.-osat: 'Beibi (feat. X)' -> 'Beibi'."""
    t = re.split(r"\s*[\(\[]", title)[0]
    t = re.split(r"\s+(feat\.?|ft\.?)\s+", t, flags=re.I)[0]
    return t.strip(" -–")


def score(song: dict, r: dict) -> int:
    """Pisteyttää hakutuloksen: suurempi = parempi. Alle 0 = hylätään."""
    if r.get("kind") != "song" or not r.get("previewUrl"):
        return -1
    want_artist = norm(song["artist"])
    want_title = norm(strip_extra(song["title"]))
    got_artist = norm(r.get("artistName", ""))
    got_title_full = norm(r.get("trackName", ""))
    got_title = norm(strip_extra(r.get("trackName", "")))

    s = 0
    if got_title == want_title:
        s += 50
    elif got_title.startswith(want_title) or want_title.startswith(got_title):
        s += 25
    elif want_title in got_title_full:
        s += 10
    else:
        return -1

    if got_artist == want_artist:
        s += 40
    elif want_artist in got_artist or got_artist in want_artist:
        s += 25
    else:
        # Sallitaan feat.-artistit, jos nimi löytyy jostain kentästä
        blob = norm(" ".join(str(r.get(k, "")) for k in ("artistName", "trackName", "collectionName")))
        if want_artist in blob:
            s += 10
        else:
            return -1

    blob = norm(r.get("trackName", "") + " " + r.get("collectionName", ""))
    for w in BAD_WORDS:
        if w in blob and w not in want_title:
            s -= 15
    if got_title_full != got_title:
        s -= 3  # suluissa jotain ylimääräistä
    # Suosi vanhempaa julkaisua (todennäköisemmin alkuperäinen, ei kokoelma)
    year = int((r.get("releaseDate") or "9999")[:4])
    s -= max(0, (year - song.get("year", year))) // 5
    return s


def search(term: str, limit: int = 8) -> list:
    q = urllib.parse.urlencode({
        "term": term, "country": "fi", "media": "music",
        "entity": "song", "limit": limit,
    })
    req = urllib.request.Request(f"{API}?{q}", headers={"User-Agent": "SongSpot-Suomi/1.0"})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=20) as resp:
                return json.load(resp).get("results", [])
        except Exception as e:  # noqa: BLE001
            wait = 2 ** attempt
            print(f"   ! haku epäonnistui ({e}), yritetään {wait}s päästä", file=sys.stderr)
            time.sleep(wait)
    return []


def resolve(song: dict) -> dict | None:
    candidates = []
    seen = set()
    terms = [f'{song["artist"]} {strip_extra(song["title"])}', strip_extra(song["title"])]
    for term in terms:
        for r in search(term):
            tid = r.get("trackId")
            if tid in seen:
                continue
            seen.add(tid)
            sc = score(song, r)
            if sc >= 0:
                candidates.append((sc, r))
        if candidates and max(c[0] for c in candidates) >= 75:
            break
        time.sleep(0.25)
    if not candidates:
        return None
    candidates.sort(key=lambda c: -c[0])
    return candidates[0][1]


def main() -> int:
    refresh_all = "--all" in sys.argv
    songs = json.loads(SONGS.read_text(encoding="utf-8"))
    missing = []
    changed = 0
    for i, song in enumerate(songs, 1):
        if song.get("id") and song.get("preview") and not refresh_all:
            continue
        print(f"[{i}/{len(songs)}] {song['artist']} – {song['title']}")
        r = resolve(song)
        if not r:
            missing.append(song)
            print("   -> EI LÖYTYNYT")
            continue
        song["id"] = r["trackId"]
        song["preview"] = r["previewUrl"]
        song["art"] = r.get("artworkUrl100", "").replace("100x100", "300x300")
        song["itunes"] = f'{r.get("artistName")} – {r.get("trackName")} ({(r.get("releaseDate") or "")[:4]})'
        print(f"   -> {song['itunes']}")
        changed += 1
        time.sleep(1.0)  # ei kuormiteta rajapintaa

    SONGS.write_text(json.dumps(songs, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"\nPäivitetty {changed} biisiä.")
    if missing:
        print(f"\nIlman esikuuntelua jäi {len(missing)} biisiä:")
        for s in missing:
            print(f"  - {s['artist']} – {s['title']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
