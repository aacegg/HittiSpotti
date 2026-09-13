#!/usr/bin/env python3
"""Rakentaa testi/-kansion kehityshaaran tiedostoista.

    python3 scripts/tee_testisivu.py

Testiversio pitää voida kokeilla puhelimella oikeassa osoitteessa, koska
äänipätkät ja kansikuvat tulevat Applen palvelimelta eivätkä lataudu
missään eristetyssä esikatselussa. Sama ratkaisu kuin arviointityökalulla:
oma sivu saman sivuston alla.

Testisivu on samassa originissa kuin oikea peli, joten se jakaisi
localStoragen, tilastot ja palvelimelle lähtevät arviot sen kanssa. Kaikki
kolme eristetään:

    STORE      hittispotti: -> hittispotti-testi:   omat tilastot
    PALVELIN   tyhjäksi                             ei arvioita palvelimelle
    goatcounter poistetaan                          ei kävijälaskuriin

Service worker jätetään rekisteröimättä. Juuren service worker on
laajuudeltaan koko sivusto, joten toinen rekisteröinti tämän alla olisi
vain sekaannus, eikä testisivun kuulu jäädä kenenkään välimuistiin.

Katalogi kopioidaan mukaan: haaran songs.json voi olla eri kuin livenä
oleva, ja juuri vuosiluvut ratkaisevat vuosikymmenpelin.

Kansion voi poistaa kun testaus on ohi:  git rm -r testi
"""
import json
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ULOS = ROOT / "testi"
# Oma versiotunnus, jottei juuren service worker tarjoa vanhaa testisivua
# välimuististaan. Kasvata kun testisivu päivitetään.
VERSIO = "t3"


def banneri(versio):
    return (
        '<div class="testibanneri">Testiversio. Tulokset eivät tallennu '
        'oikeisiin tilastoihin. <a href="/">Oikea peli</a></div>\n'
    )


def main() -> int:
    if not (ROOT / "index.html").exists():
        print("index.html puuttuu", file=sys.stderr)
        return 1
    ULOS.mkdir(exist_ok=True)

    # ---- index.html ----
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    html = re.sub(r"\?v=\d+", f"?v={VERSIO}", html)
    # Kävijälaskuri pois: testiklikit eivät ole kävijöitä.
    html = re.sub(r"\n[^\n]*data-goatcounter[^\n]*\n[^\n]*</script>\n", "\n", html)
    # Fontit, kuvakkeet ja manifest juuresta: sama origin, ei kopioita.
    # Manifest pois kokonaan, jottei testisivua voi asentaa sovelluksena.
    html = re.sub(r'\n[^\n]*rel="manifest"[^\n]*\n', "\n", html)
    html = html.replace('href="fonts/', 'href="../fonts/')
    html = html.replace('href="favicon.svg', 'href="../favicon.svg')
    html = html.replace('href="icon-180.png', 'href="../icon-180.png')
    html = html.replace('href="icon-192.png', 'href="../icon-192.png')
    # Hakukoneet eivät saa indeksoida testisivua oikean pelin rinnalle.
    html = html.replace('<link rel="canonical" href="https://hittispotti.fi/">',
                        '<meta name="robots" content="noindex, nofollow">')
    html = html.replace("<body>\n", "<body>\n" + banneri(VERSIO))
    (ULOS / "index.html").write_text(html, encoding="utf-8")

    # ---- app.js ----
    js = (ROOT / "app.js").read_text(encoding="utf-8")
    js = js.replace('const STORE = "hittispotti:";',
                    'const STORE = "hittispotti-testi:";')
    # Vanhan nimen siirto pois: se lukisi oikean pelin tiedot tänne.
    js = js.replace('const STORE_OLD = "songspot-suomi:";',
                    'const STORE_OLD = "hittispotti-testi-ei-vanhaa:";')
    js = re.sub(r'const PALVELIN = "[^"]*";', 'const PALVELIN = "";', js)
    js = js.replace('const KATALOGI = "songs.json?k=12";',
                    f'const KATALOGI = "songs.json?k={VERSIO}";')
    js = re.sub(r'const KATALOGI = "songs\.json\?k=\d+";',
                f'const KATALOGI = "songs.json?k={VERSIO}";', js)
    # Service worker pois: juuren SW kattaa jo koko sivuston.
    js = js.replace('navigator.serviceWorker.register("sw.js")',
                    'Promise.resolve()')
    (ULOS / "app.js").write_text(js, encoding="utf-8")

    # ---- style.css ----
    css = (ROOT / "style.css").read_text(encoding="utf-8")
    # Fontit haetaan juuresta, ei testi/fonts/-kansiosta jota ei ole.
    css = css.replace('url("fonts/', 'url("../fonts/')
    css += """
/* Testisivun banneri. Riittävän näkyvä, jottei testiä luule oikeaksi
   peliksi, mutta ei pelin päällä: se työntää sivun alaspäin. */
.testibanneri {
  background: #3a2f10;
  color: #f4e4b0;
  font: 600 13px/1.4 system-ui, sans-serif;
  padding: 10px 16px;
  text-align: center;
}
.testibanneri a { color: inherit; }
"""
    (ULOS / "style.css").write_text(css, encoding="utf-8")

    # ---- songs.json ----
    shutil.copyfile(ROOT / "songs.json", ULOS / "songs.json")
    songs = json.loads((ULOS / "songs.json").read_text(encoding="utf-8"))
    pelattavat = sum(1 for s in songs if s.get("peli") is not False)

    print(f"testi/ rakennettu, versio {VERSIO}")
    print(f"  {len(songs)} riviä, {pelattavat} arvattavaa")
    for f in sorted(ULOS.iterdir()):
        print(f"  {f.name:14} {f.stat().st_size:>9} tavua")
    print("\nJulkaise:  git add testi && git commit && git push origin HEAD:main")
    print("Poista:    git rm -r testi")
    return 0


if __name__ == "__main__":
    sys.exit(main())
