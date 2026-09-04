# Tilastopalvelin

Kerää kaikilta pelaajilta tiedon siitä, monenko sekunnin pätkästä kukin biisi
tunnistetaan. Se on ainoa luotettava tapa saada vaikeustasot kohdalleen, koska
se mittaa mitä ihmiset oikeasti tekevät eikä mitä he arvelevat.

Pyörii Cloudflare Workersissa ja D1-tietokannassa. Molemmat ilmaisia tähän
käyttöön: ilmaisessa Workers-tasossa on 100 000 pyyntöä vuorokaudessa, ja peli
lähettää viisi pyyntöä pelaajaa ja päivää kohti.

## Mitä tallennetaan

Yksi rivi biisiä kohti, ei tapahtumarivejä. Taulu ei siis kasva pelaajien eikä
ajan mukana, vaan siinä on enintään yhtä monta riviä kuin katalogissa on
biisejä.

```
id  taso  kierroksia  osumia  a0  a1  a2  a3  a4  arvio1 .. arvio5
```

`a0..a4` kertovat monellako askeleella biisi tunnistettiin (0,1 s ... 15 s), ja
`kierroksia - osumia` kertoo montako kertaa se jäi tunnistamatta.

`arvio1..arvio5` on pelaajien oma vastaus kysymykseen "Miltä tämä tuntui?"
(1 = Helppo, 5 = Mahdoton). Se on eri asia kuin `a0..a4`: nuo mittaavat mitä
pelaaja teki, nämä mitä hän ajatteli. Kannattaa katsoa molempia, koska ne eivät
aina ole samaa mieltä.

Palvelin ei tallenna IP-osoitetta, aikaleimaa eikä tunnistetta. Kahta kierrosta
ei siis voi yhdistää samaan pelaajaan, koska mitään yhdistävää tietoa ei ole
olemassa. Tämä on tietoinen valinta: vastineeksi menetetään aikasarja, eli
emme näe muuttuiko biisin vaikeus vuoden aikana.

## Julkaisu

Tarvitset Cloudflare-tilin (ilmainen) ja Noden. Kaikki komennot ajetaan tässä
hakemistossa.

**1. Kirjaudu.**

```
npx wrangler login
```

**2. Luo tietokanta.**

```
npx wrangler d1 create hittispotti
```

Komento tulostaa `database_id`-arvon. Liitä se `wrangler.toml`-tiedostoon
kohtaan `TÄYTÄ_TÄHÄN`.

**3. Luo taulu.**

```
npx wrangler d1 execute hittispotti --remote --file=schema.sql
```

Jos taulu on luotu jo aiemmin, ilman arviosarakkeita, aja lisäksi kerran:

```
npx wrangler d1 execute hittispotti --remote --file=migraatio-arviot.sql
```

Saman voi liittää D1-konsoliin selaimessa. Tämä on tehtävä ennen uuden
workerin julkaisua, koska worker lukee noita sarakkeita.

**4. Aseta koosteen lukuavain.** Keksi pitkä satunnainen merkkijono; sitä
tarvitaan vain kun luet dataa, eikä se päädy peliin.

```
npx wrangler secret put AVAIN
```

**5. Julkaise.**

```
npx wrangler deploy
```

Komento tulostaa osoitteen, esimerkiksi
`https://hittispotti-tilastot.<tunnuksesi>.workers.dev`.

**6. Kytke peli lähettämään.** Anna osoite Claudelle, joka asettaa sen
`app.js`-tiedoston `PALVELIN`-vakioon ja julkaisee. Ennen sitä peli ei lähetä
mitään, eli tämän hakemiston voi julkaista rauhassa etukäteen.

## Datan lukeminen

```
curl "https://<osoitteesi>/tilastot?avain=<avaimesi>" > tilastot.csv
```

`&muoto=json` antaa saman JSONina. Rivit ovat suosituimmuusjärjestyksessä,
eniten pelatut ensin.

## Väärinkäytön esto

Osoite on julkinen, joten kuka tahansa voi lähettää sinne mitä tahansa. Suojana
on tiukka kelpoisuustarkistus: `taso` 1–5, `askel` 0–4, `osui` totuusarvo,
`tila` joko `daily` tai `free`, `id` positiivinen kokonaisluku, runko enintään
4 kt ja erä enintään kymmenen kierrosta. Arvioissa `arvio` on 1–5. Kaikki muu
hylätään.

Arvion sarakenimi rakennetaan luvusta vasta tarkistuksen jälkeen, joten
SQL-lauseeseen ei pääse mitään pelaajan lähettämää.

Se ei estä sitä, että joku lähettäisi tuhansia kelvollisen näköisiä kierroksia
ja vääristäisi lukuja. Jos se joskus tapahtuu, Cloudflaren omat
nopeusrajoitukset ovat helpoin lisäsuoja. Tässä vaiheessa se olisi
ennenaikaista työtä.

## Testit

Palvelimen logiikan voi ajaa ilman Cloudflarea väärennetyllä tietokannalla:

```
node worker.test.mjs
```

(Testitiedosto on projektin scratchpad-hakemistossa, ei tässä repossa.)
