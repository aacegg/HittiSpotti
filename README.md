# SongSpot Suomi

Musiikkivisa suomenkielisillä biiseillä. Kuulet kappaleesta ensin vain **0,1 sekuntia** ja yrität tunnistaa sen. Jokainen väärä arvaus tai ohitus pidentää pätkää (0,1 s → 0,5 s → 2 s → 8 s → 15 s), mutta vie pisteitä.

Peli on puhdas selainsovellus: ei build-vaihetta, ei palvelinta, ei riippuvuuksia. Musiikkipätkät ovat iTunesin julkisia 30 sekunnin esikuunteluja.

## Pelimuodot

| Muoto | Kuvaus |
| --- | --- |
| **Päivän 5** | Sama viisi biisiä kaikille pelaajille saman päivän aikana. Maksimi 6 000 pistettä. Tuloksen voi kopioida ja jakaa kavereille. |
| **Vapaa peli** | Loputtomasti kierroksia. Vaikeustaso valitaan ennen peliä (Helppo–Mestari tai Kaikki). |

Pisteet askeleittain: **1 200 · 975 · 750 · 525 · 300**. Jos 15 sekunnin jälkeenkään ei nappaa, kierroksesta saa nolla.

Tulokset ja tilastot tallentuvat vain omaan selaimeen (localStorage).

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

Muutaman minuutin päästä peli löytyy osoitteesta `https://<käyttäjä>.github.io/SongSpot-Suomi/`.

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

- `tier` on vaikeustaso 1–5: **1** = kaikki tuntevat, **5** = harvinaisempi helmi. Päivän 5 -pelissä viisikko arvotaan tasoilta 1, 2, 3, 4 ja 3.
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

## Rakenne

```
index.html              sivun rakenne ja tekstit
style.css               ulkoasu
app.js                  pelilogiikka, ääni (Web Audio API), ehdotukset, tilastot
songs.json              biisikatalogi
scripts/resolve_songs.py  iTunes-esikuuntelujen haku katalogiin
```

## Ideoita jatkoon

- Useampi pelaaja samalla laitteella (vuorottelu ja pistetaulu)
- Lisää biisejä ja artistikohtaiset tai vuosikymmenkohtaiset pelit
- Osittaiset pisteet, jos artisti on oikein mutta biisi väärin
- Verkkotulostaulu Päivän 5 -tuloksille
