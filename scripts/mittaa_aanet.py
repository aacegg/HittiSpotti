#!/usr/bin/env python3
"""Mittaa esikuuntelujen äänitason arviointityökalua varten.

    python3 scripts/mittaa_aanet.py              # mittaa vain puuttuvat
    python3 scripts/mittaa_aanet.py --uudelleen  # mittaa kaikki uudestaan
    python3 scripts/mittaa_aanet.py --raja 100   # enintään sata biisiä

Miksi
-----
Arviointityökalu soitti pätkän alusta ja 15 sekuntia. Peli hyppää
hiljaisuuden yli ja soittaa ensin 0,1 sekuntia. Arvioija kuuli siis eri
asian kuin pelaaja, eikä tasoa voi arvioida oikein sellaiselta pohjalta.

Mitattu esimerkki: Helsinki Philharmonicin Finlandia Op.26:n esikuuntelussa
on 6,06 sekuntia tasan nollia ja sen jälkeen hidas nousu. Pelin 0,1 sekunnin
pätkä on 29,5 dB katalogin mediaanin alapuolella eli käytännössä äänetön.
Työkalussa se kuulosti aivan normaalilta biisiltä, koska 15 sekunnin pätkä
ehtii nousta täyteen voimaan. Se arvioitiin tasolle 2, eli päivän toiseksi
biisiksi kaikille pelaajille.

Mitä tallennetaan
-----------------
Välimuistiin kirjoitetaan raaka-arvot eikä valmista arvosanaa, jotta
esitystapaa voi muuttaa mittaamatta uudestaan:

    alku        pelin aloituskohta sekunteina (sama laskenta kuin app.js)
    hiljaisuus  kuinka kauan alussa on tasan nollia
    huippu      koko pätkän huippuarvo
    p01, p05    RMS pelin 0,1 ja 0,5 sekunnin pätkistä
    mediaani    koko pätkän 50 ms ikkunoiden mediaani-RMS

Välimuisti on .aanitasot.json eikä se kuulu gittiin: se on johdettavissa
esikuunteluista ja painaa satoja kilotavuja.

Vaatii PyAV:n (AAC-purkuun) ja NumPyn.
"""
import argparse
import io
import json
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import av
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
SONGS = ROOT / "songs.json"
VALIMUISTI = ROOT / ".aanitasot.json"

# Applen palvelin hylkää oletus-User-Agentin.
UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36"}


def lataa(url):
    import urllib.request
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def purawa(raw):
    """AAC puretaan monoksi float-taulukoksi."""
    with av.open(io.BytesIO(raw)) as c:
        s = c.streams.audio[0]
        sr = s.codec_context.sample_rate
        osat = []
        for frame in c.decode(s):
            a = frame.to_ndarray()
            osat.append(a.mean(axis=0) if a.ndim > 1 and a.shape[0] > 1 else a.ravel())
        x = np.concatenate(osat).astype(np.float64)
    if np.abs(x).max() > 1.5:          # kokonaislukumuoto
        x = x / 32768.0
    return x, sr


def aloituskohta(x, sr):
    """Sama laskenta kuin app.js:n findAudioStart.

    Kirjoitettu uudestaan Pythonilla, joten se voi erota alkuperäisestä.
    Siksi kynnys, ikkuna ja 30 ms:n takaperoisuus on pidetty tismalleen
    samoina lukuina; jos app.js:n versio muuttuu, tämä on muutettava myös."""
    huippu = float(np.abs(x).max())
    if huippu < 0.005:
        return 0.0, huippu
    kynnys = max(huippu * 0.02, 0.004)
    win = max(1, round(sr * 0.01))
    n = len(x) // win * win
    r = np.sqrt((x[:n].reshape(-1, win) ** 2).mean(axis=1))
    osuu = np.flatnonzero(r >= kynnys)
    if not len(osuu):
        return 0.0, huippu
    return max(0.0, osuu[0] * win / sr - 0.03), huippu


def mittaa(song):
    try:
        x, sr = purawa(lataa(song["preview"]))
        a, huippu = aloituskohta(x, sr)
        i0 = int(a * sr)
        ikkuna = max(1, sr // 20)          # 50 ms
        n = len(x) // ikkuna * ikkuna
        mediaani = float(np.median(np.sqrt((x[:n].reshape(-1, ikkuna) ** 2).mean(axis=1))))
        nollia = np.flatnonzero(np.abs(x) > 1e-6)
        return song["id"], {
            "alku": round(a, 3),
            "hiljaisuus": round(float(nollia[0]) / sr, 3) if len(nollia) else round(len(x) / sr, 3),
            "huippu": round(huippu, 4),
            "p01": round(float(np.sqrt((x[i0:i0 + int(0.1 * sr)] ** 2).mean())), 5),
            "p05": round(float(np.sqrt((x[i0:i0 + int(0.5 * sr)] ** 2).mean())), 5),
            "mediaani": round(mediaani, 5),
        }
    except Exception as e:  # noqa: BLE001
        return song["id"], {"virhe": str(e)[:120]}


def tallenna(tulokset):
    """Kirjoitus tilapäistiedoston kautta.

    Suoraan kirjoitettaessa keskeytetty ajo jättää puolikkaan JSONin, jota
    seuraava ajo ei osaa lukea. Sen lisäksi kaksi yhtä aikaa ajettua
    mittausta kirjoittivat kerran toistensa päälle: molemmat lukivat
    välimuistin käynnistyessään ja kirjoittivat lopuksi oman kuvansa, jolloin
    168 mittausta katosi jälkiä jättämättä. Tämä ei estä sitä, mutta tekee
    jokaisesta kirjoituksesta ehjän.
    """
    tmp = VALIMUISTI.with_suffix(".tmp")
    tmp.write_text(json.dumps({str(k): v for k, v in tulokset.items()},
                              ensure_ascii=False), encoding="utf-8")
    tmp.replace(VALIMUISTI)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--uudelleen", action="store_true", help="mittaa kaikki uudestaan")
    ap.add_argument("--raja", type=int, default=0, help="enintään näin monta tällä ajolla")
    ap.add_argument("--rinnakkain", type=int, default=6)
    a = ap.parse_args()

    songs = [s for s in json.loads(SONGS.read_text(encoding="utf-8")) if s.get("preview")]
    vanha = {}
    if VALIMUISTI.exists() and not a.uudelleen:
        vanha = {int(k): v for k, v in json.loads(VALIMUISTI.read_text(encoding="utf-8")).items()}

    # Virheelliset yritetään uudestaan: syy on yleensä ollut hetkellinen.
    jono = [s for s in songs if s["id"] not in vanha or "virhe" in vanha[s["id"]]]
    puuttuu = len(jono)
    if a.raja:
        jono = jono[:a.raja]
    print(f"{len(songs)} biisiä, mitattuna jo {len(songs) - puuttuu}, "
          f"puuttuu {puuttuu}, mitataan nyt {len(jono)}")
    if not jono:
        return 0

    tulokset = dict(vanha)
    valmis = 0
    with ThreadPoolExecutor(max_workers=a.rinnakkain) as ex:
        for tid, arvot in ex.map(mittaa, jono):
            tulokset[tid] = arvot
            valmis += 1
            if valmis % 50 == 0 or valmis == len(jono):
                tallenna(tulokset)
                print(f"  {valmis}/{len(jono)}", flush=True)

    tallenna(tulokset)
    virheet = [k for k, v in tulokset.items() if "virhe" in v]
    print(f"\nValmis. Välimuistissa {len(tulokset)} biisiä, virheitä {len(virheet)}.")
    if virheet:
        print("Virheelliset yritetään uudestaan seuraavalla ajolla.")
    print("Aja seuraavaksi: python3 scripts/tee_arviointi.py")
    return 0


if __name__ == "__main__":
    sys.exit(main())
