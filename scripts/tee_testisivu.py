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

Testisivu saa omat manifestin ja service workerin, molemmat rajattuna
/testi/-polkuun. Aiemmin ne riisuttiin pois, mutta ne ovat nimenomaan ne
kaksi ehtoa jotka Chrome vaatii ennen kuin se tarjoaa asennusta. Ilman
niitä "Lisää aloitusnäyttöön" ei olisi testattavissa lainkaan.

Rinnakkaisuus on turvallista, koska service workerin laajuudessa tarkin
voittaa: /testi/sw.js ottaa vastuun tämän kansion sivuista ja juuren sw.js
jatkaa kaikesta muusta. Testin service worker hakee aina verkosta, joten
testisivu ei voi jäädä jumiin välimuistiin.

Sovellus asentuu omalla nimellään ("HittiSpotti testi"), joten sen erottaa
oikeasta eikä se korvaa sitä aloitusnäytöllä.

Katalogi ja äänipalat kopioidaan mukaan: haaran katalogi.json voi olla eri
kuin livenä oleva, ja juuri vuosiluvut ratkaisevat vuosikymmenpelin. Aja
scripts/tee_aanet.py ensin, jos songs.json on muuttunut.

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
VERSIO = "t8"

# Testisovelluksen oma manifesti. Kuvakkeet haetaan juuresta (../), mutta
# start_url ja scope osoittavat tähän kansioon, joten asennettu testi avaa
# testisivun eikä oikeaa peliä.
MANIFESTI = {
    "name": "HittiSpotti testi",
    "short_name": "HS testi",
    "description": "Testiversio. Tulokset eivät tallennu oikeisiin tilastoihin.",
    "lang": "fi",
    "start_url": "./",
    "scope": "./",
    "display": "standalone",
    "orientation": "portrait",
    "background_color": "#0a0908",
    "theme_color": "#3a2f10",
    "icons": [
        {"src": "../icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any"},
        {"src": "../icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any"},
        {"src": "../icon-512-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"},
    ],
}

# Verkko ensin eikä välimuisti ensin: testisivun pitää aina näyttää uusin
# versio, muuten testaaja katsoo eilistä koodia. Fetch-käsittelijä on silti
# pakko olla olemassa, koska Chrome ei tarjoa asennusta ilman sitä.
SW = """/* Testisivun service worker. Laajuus on /testi/, joten tämä ei koske
 * oikeaa peliä: service workerin laajuudessa tarkin voittaa.
 *
 * Tehtävä on yksi: tehdä testisivusta asennuskelpoinen. Chrome vaatii
 * manifestin JA service workerin jolla on fetch-käsittelijä ennen kuin se
 * laukaisee beforeinstallprompt-tapahtuman.
 *
 * Välimuistia ei käytetä kuin verkon kaatuessa, jottei testisivu voi jäädä
 * jumiin vanhaan versioon.
 *
 * Poistaminen: selaimen kehitystyökaluista Application -> Service Workers
 * -> Unregister, tai koko sivuston tiedot tyhjentämällä.
 */
const VERSIO = "%%VERSIO%%";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (e) => e.waitUntil((async () => {
  const nimet = await caches.keys();
  await Promise.all(nimet
    .filter((n) => n.startsWith("hittispotti-testi-") && n !== VERSIO)
    .map((n) => caches.delete(n)));
  await self.clients.claim();
})()));

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith((async () => {
    try {
      const vastaus = await fetch(e.request);
      if (vastaus.ok) {
        const c = await caches.open(VERSIO);
        c.put(e.request, vastaus.clone());
      }
      return vastaus;
    } catch (err) {
      const osuma = await caches.match(e.request);
      if (osuma) return osuma;
      throw err;
    }
  })());
});
"""


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
    # Fontit ja kuvakkeet juuresta: sama origin, ei kopioita. Manifest sen
    # sijaan on testisivun oma, jotta asennus osoittaa tänne eikä oikeaan
    # peliin, ja jotta asennettu sovellus erottuu nimeltään.
    html = re.sub(r'\n([^\n]*)rel="manifest"[^\n]*\n',
                  f'\n\\1rel="manifest" href="manifest.webmanifest?v={VERSIO}">\n', html)
    # Applen oma otsikko kotivalikon kuvakkeelle: sama erottelu kuin nimessä.
    html = html.replace('content="HittiSpotti">', 'content="HittiSpotti testi">')
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
    # Katalogin versio testisivun omaksi, jottei juuren välimuistissa oleva
    # katalogi ja äänipalat sekoitu tähän. KATALOGI_K on luku app.js:ssä,
    # joten se korvataan merkkijonolla joka kelpaa osoitteen osaksi.
    js, n = re.subn(r"const KATALOGI_K = \d+;",
                    f'const KATALOGI_K = "{VERSIO}";', js)
    if n != 1:
        print("VAROITUS: KATALOGI_K-vakiota ei löytynyt app.js:stä.", file=sys.stderr)
    # Service worker jätetään paikalleen. Rekisteröinti tapahtuu sivun
    # osoitteeseen nähden, eli /testi/sw.js laajuudella /testi/, joten se ei
    # kosketa oikeaa peliä. Ilman sitä Chrome ei tarjoaisi asennusta.
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

    # ---- manifest.webmanifest ja sw.js ----
    (ULOS / "manifest.webmanifest").write_text(
        json.dumps(MANIFESTI, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (ULOS / "sw.js").write_text(
        SW.replace("%%VERSIO%%", f"hittispotti-testi-{VERSIO}"), encoding="utf-8")

    # ---- katalogi.json ja aanet/ ----
    # Peli hakee molemmat omasta kansiostaan (suhteelliset osoitteet), joten
    # ne kopioidaan tänne. Haaran katalogi voi olla eri kuin livenä oleva.
    shutil.copyfile(ROOT / "katalogi.json", ULOS / "katalogi.json")
    if (ULOS / "aanet").exists():
        shutil.rmtree(ULOS / "aanet")
    shutil.copytree(ROOT / "aanet", ULOS / "aanet")
    songs = json.loads((ULOS / "katalogi.json").read_text(encoding="utf-8"))
    pelattavat = sum(1 for s in songs if s.get("peli") is not False)
    palat = sorted((ULOS / "aanet").glob("*.json"))

    print(f"testi/ rakennettu, versio {VERSIO}")
    print(f"  {len(songs)} riviä, {pelattavat} arvattavaa")
    print(f"  aanet/ {len(palat)} palaa, {sum(f.stat().st_size for f in palat)} tavua")
    for f in sorted(ULOS.iterdir()):
        if f.is_dir():
            continue
        print(f"  {f.name:16} {f.stat().st_size:>9} tavua")
    print("\nJulkaise:  git add testi && git commit && git push origin HEAD:main")
    print("Poista:    git rm -r testi")
    return 0


if __name__ == "__main__":
    sys.exit(main())
