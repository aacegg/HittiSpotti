#!/usr/bin/env python3
"""Vaihtaa biisin äänitteen toiseen vertailusivun valintojen mukaan.

    python3 scripts/vaihda_aanite.py valinnat.json            # näytä
    python3 scripts/vaihda_aanite.py valinnat.json --kirjoita # tee muutos

Syöte on vertailu.html:n "Näytä valinnat" -napin antama JSON. Rivit
joissa valinta on "nyt" ohitetaan: pelissä oleva äänite jää.

Katalogin artisti ja nimi EIVÄT muutu, vaikka uusi äänite olisi Applella
toisella kirjoitusasulla. Applen kokoelmilla ääkköset ovat usein
kadonneet ("Nelja Ruusua - Sun Taytyy Menna"), ja katalogin nimi on se
jota vasten pelaajan arvaus täsmätään. Vaihtuvat vain tunniste, vuosi,
esikuuntelu, kansikuva ja itunes-merkintä.

Biisi, jolta puuttuu esikuuntelu, ei kelpaa peliin lainkaan, joten
vaihto perutaan jos uudella äänitteellä ei ole sellaista.

Ei vaadi ulkoisia riippuvuuksia (vain Python 3:n vakiokirjasto).
"""
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SONGS = ROOT / "songs.json"
sys.path.insert(0, str(ROOT / "scripts"))
from hae_soittolistalta import api  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("valinnat", help="vertailu.html:n antama JSON")
    ap.add_argument("--kirjoita", action="store_true", help="kirjoita songs.json")
    a = ap.parse_args()

    valinnat = json.loads(Path(a.valinnat).read_text(encoding="utf-8"))
    vaihdot = [v for v in valinnat if v.get("valinta") == "vaihto"]
    pidetaan = [v for v in valinnat if v.get("valinta") == "nyt"]
    if not vaihdot:
        print("Ei vaihdettavia.", file=sys.stderr)
        return 1

    songs = json.loads(SONGS.read_text(encoding="utf-8"))
    idx = {s["id"]: s for s in songs}

    uudet = {r["trackId"]: r for r in
             api("lookup", id=",".join(str(v["uusi_id"]) for v in vaihdot))
             if r.get("kind") == "song"}

    tehdyt, ohitetut = [], []
    for v in vaihdot:
        s = idx.get(v["id"])
        if not s:
            ohitetut.append((v["id"], "ei katalogissa"))
            continue
        r = uudet.get(v["uusi_id"])
        if not r:
            ohitetut.append((s["title"], "uutta äänitettä ei löytynyt"))
            continue
        if not r.get("previewUrl"):
            ohitetut.append((s["title"], "uudelta puuttuu esikuuntelu"))
            continue
        if v["uusi_id"] in idx and v["uusi_id"] != v["id"]:
            ohitetut.append((s["title"], "uusi tunniste on jo katalogissa"))
            continue

        vanha = dict(s)
        s["id"] = r["trackId"]
        s["year"] = int(r["releaseDate"][:4])
        s["preview"] = r["previewUrl"]
        s["art"] = (r.get("artworkUrl100") or "").replace("100x100", "300x300")
        s["itunes"] = f"{s['artist']} – {s['title']} ({s['year']})"
        tehdyt.append((vanha, s, r.get("collectionName")))

    print(f"VAIHDETAAN {len(tehdyt)} ÄÄNITETTÄ\n")
    for vanha, uusi, levy in tehdyt:
        print(f"  {uusi['artist']} – {uusi['title']}")
        print(f"      {vanha['year']} -> {uusi['year']}   "
              f"id {vanha['id']} -> {uusi['id']}")
        print(f"      levy: {levy}")
    if pidetaan:
        print(f"\nPIDETÄÄN ENNALLAAN: {len(pidetaan)}")
        for v in pidetaan:
            print(f"  {v.get('biisi', v['id'])}")
    if ohitetut:
        print(f"\nOHITETTU: {len(ohitetut)}")
        for nimi, syy in ohitetut:
            print(f"  {nimi}: {syy}")

    if not a.kirjoita:
        print("\n(ei kirjoitettu, aja --kirjoita)")
        return 0

    SONGS.write_text(json.dumps(songs, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\nKirjoitettu. {len(tehdyt)} äänitettä vaihdettu.")
    if any(u["peli"] is not False for _, u, _ in tehdyt if "peli" in u):
        print("Joku vaihdetuista on arvattava: muista KATALOGI-versio app.js:ssä.")
    else:
        print("Kaikki vaihdetut ovat täytteitä, joten päivän pakka ei muutu.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
