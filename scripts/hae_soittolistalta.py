#!/usr/bin/env python3
"""Etsii soittolistan biisit Applen katalogista ja lisää puuttuvat peliin.

    python3 scripts/hae_soittolistalta.py lista.json --taso 1:30 2:70 3:100

Syöte on JSON-lista muotoa [{"artist": "...", "title": "..."}, ...] siinä
järjestyksessä kuin soittolistalla. --taso kertoo, mihin sijaan asti kukin
vaikeustaso ulottuu (yllä: sijat 1-30 Helppo, 31-70 Keskitaso, 71-100 Vaikea).

Rivi saa kaksi vapaaehtoista kenttää. "tier" antaa sille oman vaikeustason
sijaan perustuvan säännön sijaan, mikä on tarpeen aina kun soittolista ei ole
suosituimmuusjärjestyksessä. "nimeksi" korvaa artistin nimen: Apple kreditoi
osan artisteista eri nimellä kuin millä heidät tunnetaan. "vuodeksi" korvaa
julkaisuvuoden niissä tapauksissa joissa alkuperäistä levytystä ei ole Applen
katalogissa lainkaan ja vanhinkin löytyvä päivä on kokoelmalta.

Nimillä hakeminen on epävarmempaa kuin artistin katalogin selaaminen, joten
skripti vaatii että sekä artisti että kappaleen nimi täsmäävät, ja tulostaa
erikseen ne joita ei löytynyt. Se ei koskaan lisää biisiä, jonka nimi tai
albumi kertoo äänitteen olevan eri versio kuin pelaaja odottaa.

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

# Samat suodattimet kuin hae_artistilta.py:ssä: pätkän pitää vastata sitä
# äänitettä, jonka pelaaja tuntee.
SKIP_TITLE = (
    "live", "karaoke", "remix", "instrumental", "akustinen", "acoustic",
    # "remastered" tarvitaan erikseen: sanahaku vaatii tarkan rajan, joten
    # pelkkä "remaster" ei osu taivutettuun muotoon. Eläkeläisten Humppaa tai
    # kuole valittiin sen takia muodossa "(Remastered Bonus)", vaikka sama
    # levytys on katalogissa myös ilman merkintää.
    "demo", "version", "versio", "mix", "cover", "remaster", "remastered",
    "remasteroitu", "vain elamaa",
    "radio edit", "sped up", "slowed", "commentary",
)
SKIP_ALBUM = ("live", "karaoke", "instrumental", "unplugged", "akustinen", "vain elamaa")


def has_word(text: str, words) -> bool:
    return any(re.search(rf"(?<![a-z0-9]){re.escape(w)}(?![a-z0-9])", text) for w in words)


"""Keikkamerkintä sulkeissa ilman sanaa "live".

Riki Sorsan Haaveissa vainko oot mun oli katalogissa muodossa
"(Gumbostrand 4.7 -93)", eli keikkapaikka ja päivämäärä. Sanahaku ei
huomannut sitä, ja koska vanhin julkaisu voittaa, se valittiin studioversion
ohi. Sulkeissa oleva päivä.kuukausi on Suomessa niin vakiintunut tapa merkitä
keikka, ettei se juuri muuta voi tarkoittaa."""
GIG = re.compile(r"\([^)]*\b\d{1,2}\.\d{1,2}\b[^)]*\)")


def is_live(title: str) -> bool:
    return bool(GIG.search(title))


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


def first_artist(artist: str) -> str:
    """'JVG, Sanni' -> 'JVG'. Soittolista listaa kaikki tekijät pilkuilla."""
    return re.split(r"\s*[,&]\s*|\s+ja\s+", artist)[0].strip()


def api(path: str, **params) -> list:
    params.setdefault("country", "fi")
    q = urllib.parse.urlencode(params)
    req = urllib.request.Request(f"https://itunes.apple.com/{path}?{q}",
                                 headers={"User-Agent": "HittiSpotti/1.0"})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=25) as resp:
                return json.load(resp).get("results", [])
        except Exception as e:  # noqa: BLE001
            wait = 2 ** attempt
            print(f"   ! {e}, yritetään {wait}s päästä", file=sys.stderr)
            time.sleep(wait)
    return []


def search(term: str, limit: int = 12) -> list:
    return api("search", term=term, media="music", entity="song", limit=limit)


"""Artistin koko tuotanto tunnisteen kautta.

Vapaatekstihaku ei löydä läheskään kaikkea. Mitattu esimerkki: haku
"NRO1 BÄMÄ" palauttaa nolla osumaa, vaikka OLGAn Nro1 Bämä on Applen
Suomen katalogissa ja löytyy heti artistin tunnisteella. Näin katosi
seitsemän biisiä yhdeltä soittolistalta ilman että mikään kertoi siitä.

Siksi haku tehdään kahdessa vaiheessa: ensin nopea vapaatekstihaku, ja
jos se ei tuota tulosta, artistin koko tuotanto ja nimien vertailu
paikallisesti. Tuotanto haetaan artistia kohti kerran ja pidetään
muistissa, joten toinen vaihe maksaa yhden kyselyn artistilta eikä
biisiltä.
"""
_tuotannot: dict = {}


def artist_songs(artist: str) -> list:
    nimi = first_artist(artist)
    if nimi in _tuotannot:
        return _tuotannot[nimi]
    kaikki = []
    for a in api("search", term=nimi, entity="musicArtist", limit=8):
        # Samannimisiä artisteja on useita; kaikki samannimiset käydään läpi
        # ja pick() ratkaisee lopulta kappaleen nimen perusteella.
        if norm(a.get("artistName", "")) != norm(nimi):
            continue
        tulos = api("lookup", id=a["artistId"], entity="song", limit=200)
        kaikki += [t for t in tulos if t.get("kind") == "song"]
        time.sleep(0.3)
    _tuotannot[nimi] = kaikki
    return kaikki


def pick(results: list, artist: str, title: str):
    """Paras osuma: artisti ja kappaleen nimi täsmäävät, versio on oikea.

    Kelvollisista valitaan vanhin julkaisu. Sama biisi on katalogissa usein
    monta kertaa: alkuperäinen levy, kokoelmat ja uudelleenjulkaisut. Apple
    antaa kullekin oman julkaisupäivänsä, ja peli näyttää vuoden pelaajalle
    paljastuksessa. Ilman tätä Raptorin Oi Beibi olisi vuodelta 2010 ja Pojun
    Poika saunoo vuodelta 2026, vaikka molemmat ovat vuosikymmeniä vanhempia.
    Äänite on sama, joten vanhin päivä on lähinnä totuutta."""
    want_a, want_t = norm(first_artist(artist)), base_title(title)
    kelpaavat = []
    for r in results:
        if r.get("kind") != "song" or not r.get("previewUrl"):
            continue
        got_a = norm(r.get("artistName", ""))
        if want_a != got_a and not got_a.startswith(want_a + " ") and want_a not in got_a.split():
            continue
        if base_title(r.get("trackName", "")) != want_t:
            continue
        if has_word(norm(r.get("trackName", "")), SKIP_TITLE) or is_live(r.get("trackName", "")):
            continue
        if has_word(norm(r.get("collectionName", "")), SKIP_ALBUM):
            continue
        kelpaavat.append(r)
    if not kelpaavat:
        return None
    return min(kelpaavat, key=lambda r: r.get("releaseDate") or "9999")


def parse_tiers(args) -> list:
    """['1:30', '2:70'] -> [(30, 1), (70, 2)] sijarajoina."""
    out = []
    for a in args:
        tier, _, upto = a.partition(":")
        out.append((int(upto), int(tier)))
    return sorted(out)


def tier_for(rank: int, rules: list, default: int) -> int:
    for upto, tier in rules:
        if rank <= upto:
            return tier
    return default


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("lista", help="JSON-tiedosto, jossa [{artist,title}, ...]")
    ap.add_argument("--taso", nargs="*", default=["1:30", "2:70", "3:100"],
                    help="taso:sijaan_asti, esim. 1:30 2:70 3:100")
    ap.add_argument("--oletustaso", type=int, default=3)
    ap.add_argument("--kuiva", action="store_true", help="älä kirjoita, näytä vain")
    a = ap.parse_args()

    rules = parse_tiers(a.taso)
    wanted = json.loads(Path(a.lista).read_text(encoding="utf-8"))
    songs = json.loads(SONGS.read_text(encoding="utf-8"))
    have_ids = {s.get("id") for s in songs}
    have_titles = {norm(s["artist"]) + "|" + base_title(s["title"]) for s in songs}

    added, already, missing = [], [], []
    for i, w in enumerate(wanted, 1):
        artist, title = w["artist"], w["title"]
        key = norm(first_artist(artist)) + "|" + base_title(title)
        if key in have_titles:
            already.append(f"{artist} – {title}")
            continue
        hit = pick(search(f"{first_artist(artist)} {title}"), artist, title)
        if hit is None:                      # toinen yritys pelkällä nimellä
            hit = pick(search(title), artist, title)
        if hit is None:                      # kolmas: artistin koko tuotanto
            hit = pick(artist_songs(artist), artist, title)
        time.sleep(0.35)
        if hit is None:
            missing.append(f"{i:>3}. {artist} – {title}")
            continue
        if hit["trackId"] in have_ids or norm(hit["artistName"]) + "|" + base_title(hit["trackName"]) in have_titles:
            already.append(f"{artist} – {title}")
            continue
        # Rivikohtainen taso voittaa sijaan perustuvan säännön. Soittolista on
        # harvoin suosituimmuusjärjestyksessä, joten sija on huono arvaus.
        tier = w.get("tier") or tier_for(i, rules, a.oletustaso)
        rec = {
            # Apple kreditoi joskus artistin eri nimellä kuin millä hänet
            # tunnetaan ("Abreu" / Anna Abreu) tai kirjoittaa nimen väärin
            # ("Nelja Ruusua"). Kumpikin sotkisi haun pelissä.
            "artist": w.get("nimeksi") or hit["artistName"],
            "title": hit["trackName"],
            # Applen julkaisupäivä on sen levyn päivä jolta pätkä tulee. Jos
            # alkuperäistä levytystä ei ole katalogissa lainkaan, vanhinkin
            # päivä on väärä: Raptorin Oi Beibi on siellä vain vuoden 2010
            # kokoelmalla vaikka biisi on vuodelta 1990. Silloin oikea vuosi
            # annetaan käsin.
            "year": w.get("vuodeksi") or int((hit.get("releaseDate") or "0")[:4]) or None,
            "tier": tier,
            "id": hit["trackId"],
            "preview": hit["previewUrl"],
            "art": (hit.get("artworkUrl100") or "").replace("100x100", "300x300"),
            "itunes": f'{hit["artistName"]} – {hit["trackName"]} ({(hit.get("releaseDate") or "")[:4]})',
        }
        added.append(rec)
        have_ids.add(rec["id"])
        have_titles.add(norm(rec["artist"]) + "|" + base_title(rec["title"]))
        print(f"{i:>3}. [{tier}] {rec['artist']} – {rec['title']} ({rec['year']})")

    print(f"\nUusia {len(added)} · jo katalogissa {len(already)} · ei löytynyt {len(missing)}")
    if missing:
        print("\nEi löytynyt Applen katalogista:")
        for m in missing:
            print("  " + m)
    if added and not a.kuiva:
        SONGS.write_text(json.dumps(songs + added, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"\nKatalogissa nyt {len(songs) + len(added)} biisiä.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
