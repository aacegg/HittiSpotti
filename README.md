# HittiSpotti

Musiikkivisa suomalaisilla biiseillä, sekä suomen- että englanninkielisillä. Kuulet kappaleesta ensin vain **0,1 sekuntia** ja yrität tunnistaa sen. Jokainen väärä arvaus tai ohitus pidentää pätkää (0,1 s → 0,5 s → 2 s → 8 s → 15 s), mutta vie pisteitä.

Peli on puhdas selainsovellus: ei build-vaihetta, ei palvelinta, ei riippuvuuksia. Musiikkipätkät ovat Applen julkisia 30 sekunnin esikuunteluja.

## Pelimuodot

| Muoto | Kuvaus |
| --- | --- |
| **Päivän biisit** | Sama viisi biisiä kaikille pelaajille saman päivän aikana, yksi jokaiselta vaikeustasolta. Biisien välillä voi liikkua vapaasti ja palata kesken jääneeseen. Maksimi 6 000 pistettä. Tuloksen voi kopioida ja jakaa kavereille. |
| **Vapaa peli** | Loputtomasti kierroksia. Kiertää oletuksena kaikki tasot, mutta yhden tason voi lukita tasoriviltä ja purkaa lukituksen napauttamalla samaa tasoa uudelleen. |

Pisteet askeleittain: **1 200 · 975 · 750 · 525 · 300**. Jos 15 sekunnin jälkeenkään ei nappaa, kierroksesta saa nolla.

Tulokset ja tilastot tallentuvat vain omaan selaimeen (localStorage).

## Käyttöliittymä

Sivu avautuu suoraan päivän peliin. Vasemman yläkulman valikosta vaihdetaan vapaaseen peliin ja avataan tilastot ja ohjeet. Soittimen yläpuolella on tasorivi: päivän pelissä sillä siirrytään viisikon biisien välillä, vapaassa pelissä sillä vaihdetaan vaikeustasoa. Ulkoasu on tarkoituksella riisuttu: tumma tausta, yksi korostusväri ja ei liukuvärejä eikä varjoja.

## Mistä pätkä alkaa

Pätkä alkaa esikuuntelun alusta. Peli etsii puretusta äänestä ensimmäisen kohdan, jossa ääntä oikeasti kuuluu, joten mahdollinen hiljaisuus ohitetaan. Aloituskohta lasketaan kerran biisiä kohti, joten kaikki viisi askelta alkavat samasta kohdasta ja pidempi pätkä on aina sama kuin lyhyempi, vain jatkettuna.

Esikuuntelu ei kuitenkaan ole kappaleen alusta. Mittasin kahdentoista biisin iTunes-esikuuntelut: jokaisessa ääni on jo ensimmäisen 50 millisekunnin aikana muutaman desibelin päässä kappaleen mediaanitasosta, eikä yhdessäkään ole introa tai häivytystä. Apple leikkaa esikuuntelun keskeltä kappaletta, tyypillisesti kertosäkeen kohdalta, eikä rajapinnassa ole parametria aloituskohdan siirtämiseen. Spotify on poistanut esikuuntelut uusilta sovelluksilta.

**Deezer tarkistettu erikseen, ja se käyttäytyy samoin.** Tämä kappale luki ennen pelkkänä sivulauseena ("sama koskee Deezeriä") ilman mittausta, ja juuri siksi asiaa lähdettiin tutkimaan uudelleen. Nyt se on mitattu, joten sitä ei tarvitse tutkia kolmatta kertaa.

Deezerin esikuuntelu on 30 sekuntia ja kattavuus on hyvä: 70 satunnaisesta katalogin arvattavasta biisistä 80 prosenttia löytyi. Alkukohta on silti sama kuin Applella. **Deezer häivyttää jokaisen pätkän alun**, mikä saa amplitudimittauksen näyttämään intron kaltaiselta, ja tähän ansaan meni ensimmäinen kymmenen biisin mittaus. Ratkaiseva ero on se, kuinka nopeasti taso palaa: 56 biisin otoksessa 47 alkoi yli 6 dB mediaanin alapuolelta, mutta niistä 43 oli täydessä voimassa jo 300 millisekunnin kohdalla. Vain 3 biisiä 56:sta oli sekunnin kohdalla vielä hiljaa.

Mittaus ei erota introa hiljaisesta kohdasta keskellä kappaletta, joten lopputulos varmistettiin kuuntelemalla: kymmenen tunnetun suomalaisen biisin Apple- ja Deezer-pätkät vierekkäin, ja molemmat tulevat keskeltä kappaletta.

Oikea kappaleen alku vaatisi siis toisen äänilähteen, esimerkiksi YouTube-soittimen tai itse isännöidyt näytteet. Molemmissa on hintansa: YouTuben kautta lyhin luotettava pätkä on noin sekunti, mikä murtaisi pelin 0,1 sekunnin idean, ja omien näytteiden julkaisu vaatii oikeudet musiikkiin.

Pelaajat kysyvät tätä toistuvasti, joten vastaus on myös pelin UKK:ssa omana kohtanaan.

## Pelaaminen paikallisesti

Selain ei anna sivun lukea katalogitiedostoja suoraan levyltä, joten käynnistä kevyt paikallinen palvelin projektin juuressa:

```bash
python3 -m http.server 8000
```

Avaa sitten <http://localhost:8000>. Mikä tahansa muu staattinen palvelin (esim. `npx serve`) käy yhtä hyvin.

## Testisivu

<https://hittispotti-testi.hittispotti.workers.dev>

Kehityshaaran oma osoite. `claude/`-alkuiseen haaraan työntäminen ajaa
`.github/workflows/testisivu.yml`:n, joka julkaisee haaran erilliseen
Workeriin `hittispotti-testi`. Tuotantoon se ei voi koskea: liipaisin on
rajattu `claude/`-haaroihin, `julkaise.yml` ajetaan vain mainista, ja
Workerin nimi tarkistetaan vielä ennen julkaisua.

Testisivu on irti oikeista luvuista. Julkaistavasta kopiosta riisutaan
kävijälaskuri ja tilastopalvelimen osoite (`PALVELIN = ""`), joten
testiklikkailu ei näy GoatCounterissa eikä testipelaaminen mene siihen
pelidataan josta vaikeustasot johdetaan. Samasta syystä testisivu ei ota
yhteyttä palvelimen päätepisteisiin lainkaan, eli ArtistiSpottia voi
kokeilla siellä ennen kuin `paiva_artisti`-taulun migraatio on ajettu.
Hakukoneilta sivu on suljettu `_headers`- ja `robots.txt`-tiedostoilla.

Välimuistista ei tarvitse huolehtia: jokainen ajo saa oman
versioleimansa commitista (esim. `v=121tccc3dd1`), joten service worker
ei tarjoile edellisen ajon tiedostoja.

## Julkaisu GitHub Pagesiin

1. Avaa repon **Settings → Pages**.
2. Valitse *Build and deployment* → *Source*: **Deploy from a branch**.
3. Valitse haara **`main`** ja kansio **/ (root)**, tallenna.

Muutaman minuutin päästä peli löytyy osoitteesta `https://<käyttäjä>.github.io/<repon-nimi>/`.
Tässä projektissa osoite on **hittispotti.fi** (`CNAME`-tiedosto).

### Kolme haaraa, kolme tarkoitusta

Aiemmin Pages julkaisi suoraan kehityshaaraa, jolloin **jokainen työntö oli
julkaisu**: keskeneräinen muutos näkyi pelaajille minuutissa eikä välissä ollut
mitään. Nyt ketju on:

| Vaihe | Missä | Kuka näkee |
| --- | --- | --- |
| Kehitys | `claude/...`-kehityshaara | ei kukaan |
| Esikatselu | repo `hittispotti-testi` | vain osoitteen tietävä |
| Julkaisu | `main` | kaikki, osoitteessa hittispotti.fi |

Esikatselu rakennetaan komennolla `python3 scripts/tee_esikatselu.py --kohde
<polku>`. Se ei ole kopio vaan muunnos: `CNAME` poistetaan (kaksi sivustoa
samalla osoitteella kaataisi oikean sivun) ja tilastopalvelimen osoite
tyhjennetään (testiklikkailu vääristäisi vaikeustasojen kalibrointia).

Julkaisu on kehityshaaran yhdistäminen `main`-haaraan:

    git checkout main
    git merge claude/<kehityshaara>
    git push origin main

**Älä siis työnnä kehityshaaraa siinä uskossa että se julkaisee.** Se ei enää
julkaise, ja se on tarkoitus.

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

### Mitä peli oikeasti lataa

`songs.json` on ylläpidon lähdetiedosto eikä peli lue sitä. Se on suljettu pois julkaistavalta sivustolta (`_config.yml`), koska sitä ei tarvita siellä. Pelin lataamat tiedostot rakennetaan siitä:

```bash
python3 scripts/tee_aanet.py
```

| Tiedosto | Sisältö | Koko | Milloin haetaan |
| --- | --- | --- | --- |
| `katalogi.json` | artisti, nimi, vuosi, taso, tunniste | 206 kt (pakattuna 53 kt) | heti sivun avautuessa |
| `aanet/00.json` … `63.json` | esikuunteluosoite ja kansikuva, avaimena tunniste | 7 kt kukin (pakattuna 2 kt) | vasta kun tiedetään mitkä biisit ovat vuorossa |

Ennen tätä jakoa peli latasi koko `songs.json`-tiedoston, 1 047 kt eli pakattuna 249 kt, ennen kuin sivu edes aukesi. Siitä 77 % oli esikuunteluosoitteita ja kansikuvia, joita tarvitaan kerrallaan viisi biisiä. Nyt päivän sarja lataa 53 kt + enintään viisi palaa eli noin 69 kt: **73 % vähemmän.**

Palat on jaettu tunnisteen jäännöksen mukaan (`id % 64`). Jako on mielivaltainen ja juuri siksi oikea: se ei kerro biisistä mitään, joten palan sisällöstä ei voi päätellä kumpi sen biiseistä on tänään vuorossa. Täytebiisit (`peli: false`) eivät saa palaa lainkaan, koska ne eivät koskaan tule arvattavaksi.

Tämä on latausaikaa koskeva muutos, ei suojaus. `katalogi.json` kertoo yhä koko biisilistan, ja päivän arvonta lasketaan siitä selaimessa, joten kuka tahansa voi laskea saman. Repo on julkinen, joten `songs.json` on luettavissa GitHubista vaikka sivusto ei sitä tarjoakaan.

### Uusien biisien lisääminen

1. Lisää `songs.json`-tiedostoon rivi, jossa on vain `artist`, `title`, `year` ja `tier`.
2. Aja hakuskripti, joka täydentää puuttuvat esikuuntelut:

   ```bash
   python3 scripts/resolve_songs.py
   ```

   Skripti käyttää vain Pythonin vakiokirjastoa. Se ohittaa biisit, joilla on jo esikuuntelu, ja listaa lopuksi ne, joille ei löytynyt osumaa iTunesin Suomen katalogista. Lipulla `--all` kaikki haetaan uudestaan.
3. Tarkista `itunes`-kentästä, että osuma on oikea kappale (ei live- tai karaokeversio). Korjaa tarvittaessa artistin tai biisin nimeä ja aja skripti uudelleen.
4. Rakenna julkaistavat tiedostot ja kasvata `app.js`:n `KATALOGI_K`-numeroa:

   ```bash
   python3 scripts/tee_aanet.py
   ```

   Sama numero versioi sekä katalogin että palat, joten vanha versio ei jää välimuistiin. Ilman sitä osa pelaajista saisi eri päivän biisit kuin muut.

Jos jokin esikuuntelun URL vanhenee, peli hakee sen pelin aikana automaattisesti uudestaan `id`-kentän avulla. Sama varareitti hoitaa senkin, jos äänipalan haku epäonnistuu.

## Muutosten julkaisu

GitHub Pages käskee selainta pitämään tiedostot välimuistissa kymmenen minuuttia. Siksi `index.html` viittaa tyyleihin ja koodiin versionumerolla (`style.css?v=2`, `app.js?v=2`). **Kasvata numeroa aina kun muutat `style.css`- tai `app.js`-tiedostoa**, niin selaimet hakevat uuden version heti.

## Rakenne

```
index.html                sivun rakenne ja tekstit
style.css                 ulkoasu
app.js                    pelilogiikka, ääni (Web Audio API), ehdotukset, tilastot
sw.js                     service worker: nopea avaus ja offline-varasivu
favicon.svg               kuvake
songs.json                biisikatalogin lähde, ei julkaista
katalogi.json             kevyt katalogi, tämän peli lataa   (tee_aanet.py)
aanet/NN.json             esikuuntelut ja kansikuvat paloina (tee_aanet.py)
scripts/resolve_songs.py  esikuuntelujen haku katalogiin
scripts/tee_aanet.py      katalogin jako julkaistaviin osiin
```

`katalogi.json` ja `aanet/` ovat koneen kirjoittamia. Älä muokkaa niitä käsin: seuraava `tee_aanet.py`-ajo ylikirjoittaa ne. Kaikki muutokset tehdään `songs.json`-tiedostoon.

## Ideoita jatkoon

- Useampi pelaaja samalla laitteella (vuorottelu ja pistetaulu)
- Lisää biisejä ja artistikohtaiset tai vuosikymmenkohtaiset pelit
- Osittaiset pisteet, jos artisti on oikein mutta biisi väärin
- Verkkotulostaulu päivän tuloksille
- Vapaan pelin `state.used` talteen selaimeen (nyt se nollautuu joka
  sivunlatauksella, jolloin toisto alkaa noin 20. sarjassa)

### Ankkurimainos ylälaitaan

Jätetty hautumaan 22.9.2026. Idea tuli Spotle.io:sta, jossa on alapalkki
ja tulosruudun ylälaidan banneri, ja kumpikaan ei häiritse peliä.

Ankkurimainos **kelluu sisällön päällä eikä työnnä mitään**. Se ratkaisee
sen umpikujan johon tulossivun kanssa jäätiin: tilaa ei tarvitse ottaa
biisilistalta eikä pelialueelta. AdSense tukee muotoa virallisesti ja
siinä on sulkemisrasti, joten se ei ole harmaata aluetta kuten mainoksen
virkistäminen olisi.

**Alalaita ei sovi tähän peliin.** Mitattu iPhone SE:llä: arvauslomake on
519-641 px ja ruutu 667 px, eli ankkuri peittäisi juuri syöttökentän ja
napin. Spotlessa kenttä on ylhäällä, siksi alapalkki toimii heillä.
**Yläreuna sopii**, siellä on vain otsikkopalkki.

Toteutus joko AdSensen Auto adsilla (vain ankkuri päälle, muut muodot
pois, ei koodia lainkaan) tai omana kiinnitettynä paikkanaan.

Hinta: ankkuri näkyy myös kesken biisin, joten ohjeiden lause "Peli ei
näytä mainoksia silloin kun kuuntelet pätkää tai kirjoitat arvausta" pitää
kirjoittaa uusiksi. Se on eri linja kuin se mihin 21.9. päädyttiin.

Hyöty: oma mainospaikkansa paljastuksen mainoksen lisäksi, eli aito
lisänäyttö joka sivunlatausta kohden.

### Spotlen kaltainen artistipeli

Arvaa päivän suomalainen artisti, esimerkiksi kymmenellä yrityksellä.
Vihjeitä annetaan yritysten välissä: vuosikymmen, vaikeustaso, montako
biisiä artistilla on katalogissa, ehkä pätkä tunnetuimmasta.

Katalogi on jo olemassa: 1 744 arvattavaa biisiä, joissa artisti, vuosi ja
mitattu vaikeus. Valmiina on myös päivän pakan johtaminen puhtaana
funktiona (sama kaikille ilman palvelinta), tilastoworker ja service
worker. Uutta olisi lähinnä vihjelogiikka ja oma näkymä.

**Nimi "Päivän artisti" ja sama sovellus.** Ensin kirjattiin suositus
omasta osoitteesta sillä perusteella, että kaksi päivittäistä peliä
sekoittaisi päivän sarjan käsitteen. Nimi kumoaa sen: valikossa
"Päivän artisti" heti "Päivän biisien" alla on ilmiselvä pari eikä
sekaannuksen aihe.

Samassa sovelluksessa on myös etuja jotka painavat enemmän:

- 13 000 päivittäistä kävijää on jo täällä, uusi osoite alkaisi nollasta
- katalogi, service worker, tilastopalvelin ja päivän pakan johtaminen
  ovat valmiina
- yksi AdSense-sivusto, ei uutta hyväksyntää
- kaksi päivittäistä peliä pidentää käyntiä eli lisää mainosnäyttöjä

**Nimi: ArtistiSpotti.** Iso S kuten HittiSpotissa, koska se on saman
perheen peli. Työnimi oli Päivän artisti.

**Perussääntö: ArtistiSpotti on kokonaan eri peli.** Se on samalla
sivulla ja samassa sovelluksessa, mutta siinä kaikki yhteys loppuu.
Pisteet, tilastot, putki, tallennusavaimet, palvelinkooste ja jakoteksti
ovat omansa eivätkä vaikuta Päivän biiseihin millään tavalla. Myöskään
artistijoukkoa ei johdeta biisikatalogista. Tämä on kirjattu tähän
siksi, että se on jouduttu sanomaan kolmesti.

Seuraus, joka on helppo unohtaa: **artistipelissä ei ole pisteitä
lainkaan.** Tulos on se monellako arvauksella artisti ratkesi, 1-6 tai
ei lainkaan. Pisteytys olisi lainaa biisipelistä eikä toisi mitään.

**Ulkoasu.** Ruudukko on viisi saraketta kuusi riviä, sarakeotsikot
yllä ja väriselite alla. Selite on siksi, että keltainen ei kerro
itsestään mitään: pelaaja näkee värin muttei tiedä tarkoittaako se
lähellä vai väärin. Ruutu on matala suorakaide eikä neliö, jotta koko
peli mahtuu puhelimen ruudulle kerralla.

Spotle.io tekee saman toisin: yksi arvaus kerrallaan, kuusi isoa korttia
kahdella rivillä, otsikko jokaisessa kortissa. Se on selkeä yhdelle
arvaukselle mutta vaatii vierittämistä kuudelle, ja sarakeotsikko
kuudesti toistettuna olisi kohinaa. Selite ja korttien pyöreys ovat
sieltä lainattuja, asettelu ei.

**Paljastusanimaatio.** Uusin rivi kääntyy auki ruutu kerrallaan
vasemmalta oikealle, ja väri tulee näkyviin käännön mukana. Ruudussa on
jo lopullinen värinsä, joten mitään ei vaihdeta kesken animaation.
Vastaus odottaa animaation ohi: muuten "Päivän artisti oli X" lukisi
ruudulla ennen kuin pelaaja on ehtinyt katsoa sitä riviä josta se olisi
pitänyt päätellä. Vain uusin rivi animoituu, koska kesken jääneen pelin
avaaminen piirtää samat rivit eikä niitä saa paljastaa uudestaan kuin
ne olisi juuri arvattu. `prefers-reduced-motion` ottaa liikkeen pois.

**Päätetyt asiat 22.9.2026:**

- Artistijoukko: ne joilla on katalogissa vähintään kolme biisiä, eli
  **206 artistia**. Kierto 7 kuukautta.
- **Kuusi arvausta**, ei Spotlen kymmentä.
- Attribuutit: **genre, kokoonpano (soolo/duo/yhtye), sukupuoli,
  debyyttivuosi, laulukieli**. Maa pudotettiin, koska kaikki ovat
  suomalaisia eikä sarake erottelisi mitään.
- **Aktiivisin vuosikymmen pudotettiin, tilalle laulukieli.** Sille ei
  ole luotettavaa lähdettä. MusicBrainzin julkaisumäärät vääristyvät
  uusintajulkaisuista niin pahasti että Olavi Virran aktiivisin
  vuosikymmen olisi 1990-luku, vaikka hän kuoli 1972; Annikki Tähdestä
  tulisi 2010-luvun artisti. Wikipedian `aktiivisena`-kenttä antaa vain
  ura-välin, josta vuosikymmenen saa vain uudella oletuksella (Tähden
  väli 1952-2008 antaisi keskikohtana 1980-luvun). Katalogin vuodet
  eivät kelpaa: ne kertovat mitä biisejä arvauspelissä sattuu olemaan,
  ja artistipeli on oma pelinsä.
- **Laulukieli: suomi / englanti / molemmat / instrumentaali.** Lähde on
  Wikipedian `laulukieli`-kenttä. Neljäs arvo tarvitaan Darudelle, joka
  ei laula mitään. HUOM: tyhjä kenttä EI tarkoita suomea. Darudella se
  on tyhjä koska hän ei laula, Kotiteollisuudella koska kukaan ei ole
  täyttänyt sitä, eikä näitä voi erottaa automaattisesti. Puuttuvat
  merkitään käsin arviointisivulla, arviolta 40-60 artistia.
- **Genre on yksi per artisti eikä osittaista osumaa ole**, eli vihreä
  tai punainen. Spotlessa artistilla on useita genrejä ja yhteinen genre
  antaa keltaisen. Seuraus: väärä arvaus kertoo genrestä vähemmän, joten
  muut attribuutit kantavat enemmän. Kannattaa testata riittääkö kuusi
  arvausta kun peli on pystyssä.

**Datan tila:** ks. `scripts/hae_artistit.py` ja `.artistit.json`.
206/206 löytyy MusicBrainzista, debyyttivuosi 201:lle, tyyppi 205:lle
(135 henkilöä, 70 yhtyettä). Genre kolmesta lähteestä: Wikipedian
johdantolause 107, tietolaatikko 73, MusicBrainz 14, ilman 12.
Tarkistus `scripts/tee_artistiarviointi.py` -> artistit.html.

**Genren päättely, kolme sääntöä jotka syntyivät mittaamalla:**

1. *Johdantolause ennen tietolaatikkoa.* Laatikko luettelee kaiken mihin
   artisti on koskenut ja enemmistöäänestys palkitsee sen genren jolla on
   eniten alalajeja: Melon seitsemästä tyylilajista neljä on rockin
   alalajeja, joten laatikko teki räppäristä rockartistin. Lause kertoo
   mikä artisti on ("iskelmällinen yhtye", "nu metal -yhtye").
2. *Täsmällinen termi ennen sateenvarjotermiä.* Pop, rock, dance ja
   suomirock eivät erottele mitään, eurodance ja nu metal erottelevat.
   Siksi lause voittaa laatikon vain jos sen tulos nojaa täsmälliseen
   sanaan. Movetronin lause sanoo "tanssi- ja muuta popmusiikkia", mutta
   laatikossa lukee eurodance, joka on oikeampi.
3. *Lauseessa ratkaisee kielioppi.* Yleissana kelpaa todisteeksi vain
   kiinni artistisanassa: "on popyhtye" ja "on poplaulaja" kertovat mikä
   artisti on, "tekee popmusiikkia" ei. Ilman tätä Ultra Bra muuttui
   Rockiksi vaikka artikkeli sanoo suoraan "suomalainen popyhtye".

Lisäksi yhdyssanan pääsana ratkaisee genren (pop-rock on rockia,
rap-pop on poppia), ja kilpailun nimi ei ole genre (Erika Vikman on
"vuoden 2016 tangokuningatar", mikä ei tee hänestä iskelmäartistia).

**Avoin kohta:** sukupuoli on tyhjä kaikilla 70 yhtyeellä, eli
kolmasosalla artisteista yksi attribuutti puuttuu. Pitää täyttää
MusicBrainzin jäsensuhteista muotoon miesyhtye / naisyhtye /
sekayhtye.

Mitä pitää ratkaista ennen kuin koodia kirjoitetaan:

- ~~Tallennusavaimet erilleen.~~ **tehty.** Avaimet ovat `app.js`:n
  `AVAIN`-taulussa peleittäin. Biisipelin avaimet pysyivät ennallaan,
  koska ne ovat jo pelaajien selaimissa; artistipeli sai etuliitteen
  `artisti:`. Tilastojen nollaus ja keskeneräisten siivous käyvät
  molemmat pelit läpi `PELIT`-listan kautta.
- ~~Palvelimen `/paiva`~~ **tehty.** Artistipelillä on oma taulu
  `paiva_artisti` ja omat päätepisteet `POST /artisti` ja
  `GET /artisti?p=`. Oma taulu eikä sarake `paiva`-tauluun, koska
  avaimen muuttaminen vaatisi SQLitessä koko taulun uudelleenluonnin
  tuotantokannassa, ja koska datan muoto on eri: biisipelissä 0-6000
  pistettä 13 korissa, artistipelissä monellako arvauksella ratkesi
  eli 1-6 tai ei lainkaan. **Vaatii migraation:**
  `npx wrangler d1 execute hittispotti --remote --file=palvelin/migraatio-artisti.sql`
- ~~Tilastonäkymä ja jakoteksti.~~ **tehty.** Oma näkymä
  `#view-artisti-tulos` ja omat tilastot avaimessa `artisti:stats`:
  pelatut, voitot, putki, pisin putki ja jakauma kuudessa korissa.
  Pisteitä ei ole missään, koska artistipelissä ei ole pisteitä.
  Jakoteksti on Wordlen muotoa (🟩 osui, 🟨 numero lähellä, ⬛ ohi) ja
  se kootaan samasta `artistiVertaa()`:sta kuin ruudukko, ei DOM:ista
  luetuista väreistä. Arvattujen artistien nimet ja sarakeotsikot
  jäävät pois: jaettu tulos ei saa paljastaa vastaanottajalle mitä
  ruudut tarkoittavat ennen kuin hän on itse pelannut.
- `state`-olio on nyt yhden pelin muotoinen (rounds, at, score). Kannattaa
  miettiä kumpi on halvempi: erillinen tila artistipelille vai yhteinen.
