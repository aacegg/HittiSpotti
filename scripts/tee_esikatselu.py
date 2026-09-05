#!/usr/bin/env python3
"""Rakentaa sivustosta esikatseluversion, jonka voi julkaista erilliseen repoon.

    python3 scripts/tee_esikatselu.py --kohde ../hittispotti-testi

Esikatselu on paikka, jossa muutoksen näkee puhelimella ennen kuin se menee
hittispotti.fi:hin. Se ei ole kopio vaan muunnos: samanlaisena julkaistuna
siitä seuraisi kolme ongelmaa, jotka tämä hoitaa.

1. CNAME. Se sisältää "hittispotti.fi". Jos sama tiedosto on kahdessa
   GitHub Pages -sivustossa, ne kilpailevat samasta osoitteesta ja oikea sivu
   voi mennä nurin. Tämä on syy miksi kopiota ei saa tehdä käsin raahaamalla.

2. Tilastot. Esikatselussa klikkaillaan ulkoasua, ei pelata. Palvelimelle ne
   kirjautuisivat silti kierroksina, ja koska päivän biisit ovat kaikille
   samat, vääristymä osuisi aina saman päivän viiteen biisiin. Siksi
   palvelimen osoite tyhjennetään: peli tarkistaa sen ennen lähetystä, joten
   esikatselu ei lähetä mitään. Ei siis jää sen varaan että muistaa poistaa
   rastin.

3. Sekaannus. Kaksi samannäköistä sivustoa on helppo sekoittaa toisiinsa.
   Esikatselussa on siksi oma otsikko välilehdessä ja ohut väriraita yläreunassa.

Lisäksi hakukoneet suljetaan pois (robots.txt, noindex, sitemap pois).

Peliin itseensä ei kosketa: kaikki muutokset tehdään kopioon, ei työhakemistoon.
"""
import argparse
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Nämä eivät kuulu esikatseluun lainkaan.
POIS = {"CNAME", "sitemap.xml"}

# Projektin oma README kertoisi väärää tarinaa: tämä repo ei ole peli vaan
# sen esikatselu, ja kaikki täällä on koneen kirjoittamaa.
LUEMINUT = """# HittiSpotin esikatselu

Tämä repo on **kone­tuotettu**. Älä muokkaa tiedostoja käsin: seuraava ajo
ylikirjoittaa ne. Kaikki muutokset tehdään varsinaiseen projektiin ja tuodaan
tänne komennolla:

    python3 scripts/tee_esikatselu.py --kohde <tämän repon polku>

## Mikä tämä on

Paikka, jossa muutoksen näkee ennen kuin se menee hittispotti.fi:hin.

## Miten tämä eroaa oikeasta sivustosta

- **Ei CNAME-tiedostoa.** Se sisältäisi "hittispotti.fi", ja kaksi sivustoa
  samalla osoitteella voi kaataa oikean sivun.
- **Ei tilastoja.** Palvelimen osoite on tyhjä, joten täällä pelatut kierrokset
  eivät kirjaudu mihinkään. Se on tarkoituksellista: ulkoasua testatessa
  klikkaillaan läpi biisejä joita ei edes yritetä arvata, ja ne vääristäisivät
  vaikeustasojen kalibrointia aina saman päivän viideltä biisiltä.
- **Ei hakukoneille.** robots.txt kieltää kaiken ja sivulla on noindex.
- **Näyttää erilaiselta.** Välilehden otsikko alkaa sanalla ESIKATSELU ja
  yläreunassa on keltamusta raita.

Peli itse on tässä identtinen oikean kanssa.
"""

RAITA = """
<style id="esikatselu-raita">
  /* Ohut raita kertoo yhdellä silmäyksellä että tämä ei ole oikea sivusto.
     Kiinteä sijainti ja pointer-events:none, jottei se siirrä eikä peitä
     mitään: esikatselun pitää näyttää samalta kuin lopputuloksen. */
  #esikatselu-raita-el {
    position: fixed; inset: 0 0 auto 0; height: 3px; z-index: 100;
    background: repeating-linear-gradient(90deg, #e0a419 0 12px, #0a0908 12px 24px);
    pointer-events: none;
  }
</style>
<div id="esikatselu-raita-el" aria-hidden="true"></div>
"""


def tiedostot() -> list[str]:
    """Gitin seuraamat tiedostot. Näin mukaan ei tule roskaa eikä .git."""
    ulos = subprocess.run(["git", "ls-files"], cwd=ROOT, capture_output=True,
                          text=True, check=True).stdout
    return [r for r in ulos.splitlines() if r]


def muunna_index(teksti: str) -> str:
    teksti = teksti.replace(
        "<title>HittiSpotti",
        "<title>ESIKATSELU · HittiSpotti", 1)
    # Hakukoneet pois. Kanoninen osoite osoittaisi oikealle sivulle, joten se
    # poistetaan: muuten esikatselu kertoisi hakukoneelle olevansa se sivu.
    teksti = teksti.replace(
        '<meta name="color-scheme" content="dark">',
        '<meta name="color-scheme" content="dark">\n'
        '  <meta name="robots" content="noindex, nofollow">', 1)
    teksti = re.sub(r'\s*<link rel="canonical"[^>]*>', "", teksti)
    return teksti.replace("</body>", RAITA + "</body>", 1) \
        if "</body>" in teksti else teksti + RAITA


def muunna_app(teksti: str) -> tuple[str, bool]:
    """Tyhjentää palvelimen osoitteen. Palauttaa myös tiedon osuiko."""
    uusi, n = re.subn(
        r'const PALVELIN = "[^"]*";',
        'const PALVELIN = "";  /* Esikatselu ei lähetä tilastoja. */',
        teksti, count=1)
    return uusi, n == 1


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--kohde", required=True, help="hakemisto johon esikatselu kirjoitetaan")
    a = ap.parse_args()

    kohde = Path(a.kohde).resolve()
    if kohde == ROOT:
        print("Kohde on sama kuin projekti. Se ylikirjoittaisi pelin.", file=sys.stderr)
        return 1
    kohde.mkdir(parents=True, exist_ok=True)

    kopioitu, ohitettu = 0, []
    palvelin_ok = False

    for rivi in tiedostot():
        if rivi in POIS or rivi.startswith(("scripts/", "palvelin/")):
            ohitettu.append(rivi)
            continue
        lahde, maali = ROOT / rivi, kohde / rivi
        maali.parent.mkdir(parents=True, exist_ok=True)

        if rivi == "index.html":
            maali.write_text(muunna_index(lahde.read_text(encoding="utf-8")), encoding="utf-8")
        elif rivi == "app.js":
            uusi, palvelin_ok = muunna_app(lahde.read_text(encoding="utf-8"))
            maali.write_text(uusi, encoding="utf-8")
        elif rivi == "robots.txt":
            maali.write_text("# Esikatselu, ei hakukoneille.\n"
                             "User-agent: *\nDisallow: /\n", encoding="utf-8")
        elif rivi == "README.md":
            maali.write_text(LUEMINUT, encoding="utf-8")
        else:
            shutil.copy2(lahde, maali)
        kopioitu += 1

    if not palvelin_ok:
        print("VAROITUS: palvelimen osoitetta ei löytynyt app.js:stä.\n"
              "          Esikatselu saattaa lähettää tilastoja oikealle palvelimelle.\n"
              "          Tarkista rivi 'const PALVELIN = ...' ennen julkaisua.",
              file=sys.stderr)

    # Varmistus: CNAME ei saa päätyä kohteeseen edes vanhasta ajosta.
    vanha_cname = kohde / "CNAME"
    if vanha_cname.exists():
        vanha_cname.unlink()
        print("Poistettiin aiemmasta ajosta jäänyt CNAME.")

    print(f"Esikatselu kirjoitettu: {kohde}")
    print(f"  tiedostoja {kopioitu}, ohitettu {len(ohitettu)}")
    print(f"  palvelin tyhjennetty: {'kyllä' if palvelin_ok else 'EI'}")
    print("\nSeuraavaksi kohdehakemistossa:")
    print("  git add -A && git commit -m 'Esikatselu' && git push")
    return 0 if palvelin_ok else 1


if __name__ == "__main__":
    sys.exit(main())
