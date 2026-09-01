# HittiSpotti

Musiikkivisa suomalaisilla biiseillä, sekä suomen- että englanninkielisillä. Kuulet kappaleesta ensin vain **0,1 sekuntia** ja yrität tunnistaa sen. Jokainen väärä arvaus tai ohitus pidentää pätkää (0,1 s → 0,5 s → 2 s → 8 s → 15 s), mutta vie pisteitä.

Peli on puhdas selainsovellus: ei build-vaihetta, ei palvelinta, ei riippuvuuksia. Musiikkipätkät ovat Applen julkisia 30 sekunnin esikuunteluja.

## Pelimuodot

| Muoto | Kuvaus |
| --- | --- |
| **Päivän biisit** | Sama viisi biisiä kaikille pelaajille saman päivän aikana, yksi jokaiselta vaikeustasolta helpoimmasta vaikeimpaan. Maksimi 6 000 pistettä. Tuloksen voi kopioida ja jakaa kavereille. |
| **Vapaa peli** | Loputtomasti kierroksia. Vaikeustaso valitaan sivupalkista (Helppo–Mahdoton tai Kaikki). |

Pisteet askeleittain: **1 200 · 975 · 750 · 525 · 300**. Jos 15 sekunnin jälkeenkään ei nappaa, kierroksesta saa nolla.

Tulokset ja tilastot tallentuvat vain omaan selaimeen (localStorage).

## Käyttöliittymä

Sivu avautuu suoraan päivän peliin. Vasemman yläkulman valikosta vaihdetaan vapaaseen peliin, valitaan vaikeustaso ja avataan tilastot ja ohjeet. Ulkoasu on tarkoituksella riisuttu: tumma tausta, yksi korostusväri ja ei liukuvärejä eikä varjoja.

## Mistä pätkä alkaa

Pätkä alkaa esikuuntelun alusta. Peli etsii puretusta äänestä ensimmäisen kohdan, jossa ääntä oikeasti kuuluu, joten mahdollinen hiljaisuus ohitetaan. Aloituskohta lasketaan kerran biisiä kohti, joten kaikki viisi askelta alkavat samasta kohdasta ja pidempi pätkä on aina sama kuin lyhyempi, vain jatkettuna.

Esikuuntelu ei kuitenkaan ole kappaleen alusta. Mittasin kahdentoista biisin iTunes-esikuuntelut: jokaisessa ääni on jo ensimmäisen 50 millisekunnin aikana muutaman desibelin päässä kappaleen mediaanitasosta, eikä yhdessäkään ole introa tai häivytystä. Apple leikkaa esikuuntelun keskeltä kappaletta, tyypillisesti kertosäkeen kohdalta, eikä rajapinnassa ole parametria aloituskohdan siirtämiseen. Sama koskee Deezeriä, ja Spotify on poistanut esikuuntelut uusilta sovelluksilta.

Oikea kappaleen alku vaatisi siis toisen äänilähteen, esimerkiksi YouTube-soittimen tai itse isännöidyt näytteet. Molemmissa on hintansa: YouTuben kautta lyhin luotettava pätkä on noin sekunti, mikä murtaisi pelin 0,1 sekunnin idean, ja omien näytteiden julkaisu vaatii oikeudet musiikkiin.

## Pelaaminen paikallisesti

Selain ei anna sivun lukea `songs.json`-tiedostoa suoraan levyltä, joten käynnistä kevyt paikallinen palvelin projektin juuressa:

```bash
python3 -m http.server 8000
```

Avaa sitten <http://localhost:8000>. Mikä tahansa muu staattinen palvelin (esim. `npx serve`) käy yhtä hyvin.

## Julkaisu GitHub Pagesiin

1. Avaa repon **Settings → Pages**.
2. Valitse *Build and deployment* → *Source*: **Deploy from a branch**.
3. Valitse haara (esim. `main`) ja kansio **/ (root)**, tallenna.

Muutaman minuutin päästä peli löytyy osoitteesta `https://<käyttäjä>.github.io/<repon-nimi>/`.

## Biisikatalogi

Kaikki biisit ovat tiedostossa [`songs.json`](songs.json). Yksi biisi näyttää tältä:

```json
{
  "artist": "Haloo Helsinki!",
  "title": "Beibi",
  "year": 2014,
  "tier": 1,
  "id": 968108641,
  "preview": "https://audio-ssl.itunes.apple.com/…/mzaf_….m4a",
  "art": "https://…/300x300bb.jpg",
  "itunes": "Haloo Helsinki! – Beibi (2014)"
}
```

- `tier` on vaikeustaso 1–5, joka näkyy pelissä nimillä **1** Helppo, **2** Keskitaso, **3** Vaikea, **4** Mestari ja **5** Mahdoton. Ykkönen on biisi, jonka kaikki tuntevat, vitonen harvinaisempi helmi. Päivän biisit -pelissä arvotaan yksi biisi jokaiselta tasolta, ja ne soitetaan järjestyksessä helpoimmasta vaikeimpaan.
- `id`, `preview`, `art` ja `itunes` tulevat iTunesista. Niitä ei tarvitse kirjoittaa käsin.

### Uusien biisien lisääminen

1. Lisää `songs.json`-tiedostoon rivi, jossa on vain `artist`, `title`, `year` ja `tier`.
2. Aja hakuskripti, joka täydentää puuttuvat esikuuntelut:

   ```bash
   python3 scripts/resolve_songs.py
   ```

   Skripti käyttää vain Pythonin vakiokirjastoa. Se ohittaa biisit, joilla on jo esikuuntelu, ja listaa lopuksi ne, joille ei löytynyt osumaa iTunesin Suomen katalogista. Lipulla `--all` kaikki haetaan uudestaan.
3. Tarkista `itunes`-kentästä, että osuma on oikea kappale (ei live- tai karaokeversio). Korjaa tarvittaessa artistin tai biisin nimeä ja aja skripti uudelleen.

Jos jokin esikuuntelun URL vanhenee, peli hakee sen pelin aikana automaattisesti uudestaan `id`-kentän avulla.

## Muutosten julkaisu

GitHub Pages käskee selainta pitämään tiedostot välimuistissa kymmenen minuuttia. Siksi `index.html` viittaa tyyleihin ja koodiin versionumerolla (`style.css?v=2`, `app.js?v=2`). **Kasvata numeroa aina kun muutat `style.css`- tai `app.js`-tiedostoa**, niin selaimet hakevat uuden version heti.

## Rakenne

```
index.html                sivun rakenne ja tekstit
style.css                 ulkoasu
app.js                    pelilogiikka, ääni (Web Audio API), ehdotukset, tilastot
favicon.svg               kuvake
songs.json                biisikatalogi
scripts/resolve_songs.py  esikuuntelujen haku katalogiin
```

## Ideoita jatkoon

- Useampi pelaaja samalla laitteella (vuorottelu ja pistetaulu)
- Lisää biisejä ja artistikohtaiset tai vuosikymmenkohtaiset pelit
- Osittaiset pisteet, jos artisti on oikein mutta biisi väärin
- Verkkotulostaulu päivän tuloksille
