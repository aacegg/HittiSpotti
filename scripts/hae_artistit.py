#!/usr/bin/env python3
"""Hakee artistien taustatiedot MusicBrainzista Päivän artisti -peliä varten.

    python3 scripts/hae_artistit.py              # hae puuttuvat
    python3 scripts/hae_artistit.py --raportti   # vain yhteenveto, ei hakua

Kirjoittaa .artistit.json. Piste edessä, joten se ei mene julkaistuun
hakemistoon (ks. julkaise.yml).

MIKSI MUSICBRAINZ

Spotlen kaltainen peli vertailee artisteja attribuuteilla. Katalogissamme
on vain artistin nimi, joten attribuutit pitää hakea muualta. Applen
rajapinta antaa genren vain kappaleelle, ei artistille, ja se on karkea
("Pop", "Rock"). MusicBrainzissa on artistilla tyyppi, sukupuoli,
perustamisvuosi ja yhteisön ylläpitämät tyylitagit.

KAKSI HAKUA ARTISTIA KOHDEN

1. artist-haku antaa tyypin, sukupuolen, maan ja tagit.
2. release-group-haku antaa ensijulkaisun vuoden.

Toinen on välttämätön, koska life-span tarkoittaa eri asiaa riippuen
tyypistä: yhtyeellä se on perustamisvuosi mutta henkilöllä SYNTYMÄAIKA.
Mitattu: Cheek life-span 1981-12-22, ensijulkaisu 2001. Katri Helena
1945-08-17 ja 1963. Niitä ei voi laittaa samaan sarakkeeseen.

ARTISTIN NIMEN ERISTÄMINEN

Nimeä EI katkaista &-merkin eikä "ja"-sanan kohdalta. Suomessa molemmat
ovat usein osa yhtyeen nimeä: Matti ja Teppo, Eino ja Aapeli, Lauri Tähkä
& Elonkerjuu, Topi Sorsakoski & Agents. Katkaisu teki Matti ja Tepposta
artistin nimeltä "Matti". Vain pilkku ja feat. katkaisevat, koska ne ovat
katalogissa aina yhteistyömerkintöjä.

NOPEUSRAJOITUS

MusicBrainz sallii yhden pyynnön sekunnissa ja vaatii User-Agentin joka
kertoo kuka kysyy. Molempia noudatetaan. Tulokset tallennetaan, joten
keskeytynyt ajo voidaan jatkaa hakematta samoja uudelleen.
"""
import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
KATALOGI = ROOT / "katalogi.json"
ULOS = ROOT / ".artistit.json"
LISTA = Path(__file__).resolve().parent / "artistit-lista.txt"

VAHINTAAN_BIISEJA = 3
UA = "HittiSpotti/1.0 ( https://hittispotti.fi )"
VIIVE = 1.1          # sekuntia pyyntöjen välissä
OSUVUUS_RAJA = 90    # MusicBrainzin oma pistemäärä 0-100

# Erottaa epäonnistuneen haun aidosti tyhjästä tuloksesta, jottei
# verkkovirhe tallennu tietona "ei tyylilajeja".
VIRHE = object()

# Tietolaatikon parsinnan versio. Tallennetaan tuloksen viereen, jotta
# --uudelleen hakee vain ne jotka on haettu vanhalla parsinnalla.
# Ilman tätä nopeusrajaan kaatuneet jäisivät ikuisiksi ajoiksi vanhaan
# tulokseen, koska niillä on jo arvo eikä uusinta-ajo koskisi niihin.
WP_VERSIO = 4

# Tarkennettu sivunimi joka voi kertoa artistista: "Ares (artisti)",
# "Viivi (laulaja)", "Tehosekoitin (yhtye)".
MUSIIKKITARKENNE = re.compile(
    r"\((?:[^)]*\s)?(?:artisti|laulaja|laulajatar|muusikko|yhtye|bändi|"
    r"räppäri|rapp?ari|duo|kokoonpano|orkesteri|rap-artisti|tuottaja|"
    r"säveltäjä|muusikko)\)", re.I)


def tallenna(tiedot: dict):
    """Kirjoita tulos yhdistäen siihen mitä levyllä jo on.

    Jokainen hakukierros lukee koko tiedoston muistiin ja kirjoittaa sen
    takaisin. Jos kaksi kierrosta ajetaan rinnakkain, jälkimmäinen
    kirjoitus pyyhkii toisen työn: wikipediakierros luki tiedoston ennen
    yhtyekierroksen alkua, joten sen vanha kopio kumosi jäsentiedot 70
    yhtyeeltä. Yhdistäminen artistin kenttätasolla estää sen, koska
    kierros kirjoittaa vain ne kentät jotka se itse asetti.
    """
    levy = {}
    if ULOS.exists():
        try:
            levy = json.loads(ULOS.read_text(encoding="utf-8"))
        except Exception:
            levy = {}
    for k, v in tiedot.items():
        levy.setdefault(k, {}).update(v)
    ULOS.write_text(json.dumps(levy, ensure_ascii=False, indent=1), encoding="utf-8")


def paanimi(artist: str) -> str:
    """Yhteistyömerkinnät pois, yhtyeen nimi ehjänä."""
    return re.split(r"\s*,\s*|\s+feat\.?\s+|\s*\(feat", artist, flags=re.I)[0].strip()


def avain(nimi: str) -> str:
    return nimi.lower().replace("ä", "a").replace("ö", "o").strip()


def hae(polku: str, **params):
    url = "https://musicbrainz.org/ws/2/" + polku + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for yritys in range(4):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.load(r), None
        except urllib.error.HTTPError as e:
            if e.code == 503:      # rajoitin, hidasta ja yritä uudelleen
                time.sleep(2 ** yritys)
                continue
            return None, f"HTTP {e.code}"
        except Exception as e:
            if yritys == 3:
                return None, str(e)
            time.sleep(2 ** yritys)
    return None, "ei vastausta"


def etsi_artisti(nimi: str):
    """Ensin suomalaisista, sitten koko maailmasta.

    Rajaus maahan on tarpeen, koska lyhyet nimet osuvat muualle: "emma"
    löysi italialaisen artistin. Jos suomalaista ei löydy, otetaan paras
    osuma mutta merkitään se tarkistettavaksi.
    """
    kyselyt = [
        (f'artist:"{nimi}" AND country:FI', "FI"),
        (f'artist:"{nimi}"', "yleinen"),
        # Viimeisenä sumea haku ilman kenttää ja lainausmerkkejä.
        #
        # Tarkka lausehaku vaatii että katalogin nimi on merkilleen sama
        # kuin MusicBrainzin. Näin ei aina ole: Marion Rung on siellä
        # pelkkä "Marion", ja artist:"Marion Rung" palauttaa tyhjän vaikka
        # artisti on olemassa. Sumea haku löytää sen pistemäärällä 100.
        #
        # Tämä on kuitenkin altis väärille osumille, joten tulos merkitään
        # lähteellä "sumea" ja se kuuluu tarkistaa käsin.
        (nimi, "sumea"),
    ]
    for kysely, lahde in kyselyt:
        d, virhe = hae("artist", query=kysely, fmt="json", limit="3")
        time.sleep(VIIVE)
        if virhe or not d.get("artists"):
            continue
        a = d["artists"][0]
        if a.get("score", 0) >= OSUVUUS_RAJA:
            return a, lahde
    return None, None


def debyyttivuosi(rivi, mb_vuodet):
    """Debyytti: MusicBrainzin varhaisin julkaisu, rajattuna katalogilla.

    MusicBrainz tuntee osasta artisteja vain tuoreimmat julkaisut,
    jolloin debyytti asettuu vuosia liian myöhään. Korelonilta siellä
    on kaksi vuoden 2026 julkaisua, vaikka katalogissa on häneltä biisi
    vuodelta 2023, ja Reijo Taipaleella ero oli 29 vuotta.

    Katalogin varhaisin biisi on todiste siitä että artisti oli
    julkaissut viimeistään silloin, joten se on debyytin yläraja.
    Alaspäin se ei korjaa: MusicBrainz tuntee levyjä joita katalogissa
    ei ole, ja Vesa-Matti Loirin kaltaisilla katalogi alkaa vuosikymmeniä
    uran jälkeen.
    """
    ehdokkaat = [v for v in (min(mb_vuodet) if mb_vuodet else None,
                             rivi.get("eka")) if v]
    return min(ehdokkaat) if ehdokkaat else None


def julkaisuvuodet(mbid: str):
    """Artistin omien julkaisujen vuodet.

    Kaikki vuodet talteen eikä pelkkä ensimmäinen, koska artistipeli
    kysyy myös aktiivisinta vuosikymmentä. Sitä ei saa päätellä
    HittiSpotin katalogista: katalogi kertoo mitä biisejä arvauspelissä
    sattuu olemaan, ei milloin artisti oli aktiivinen. Vesa-Matti
    Loirilla katalogi alkaa 1977 vaikka ura alkoi 1960-luvulla.
    """
    d, virhe = hae("release-group", artist=mbid, type="album|single",
                   fmt="json", limit="100")
    time.sleep(VIIVE)
    if virhe or not d:
        return None
    vuodet = []
    for r in d.get("release-groups", []):
        pvm = r.get("first-release-date") or ""
        if len(pvm) >= 4 and pvm[:4].isdigit():
            v = int(pvm[:4])
            # Alaraja 1850 eikä 1900, jotta 1800-luvun julkaisut eivät
            # katoa. Aineistossa on Jean Sibelius, joka debytoi 1892.
            if 1850 < v <= 2100:
                vuodet.append(v)
    return sorted(vuodet) or None


def jasenten_tiedot(mbid: str, valimuisti: dict):
    """Yhtyeen jäsenet nimineen ja sukupuolineen.

    Sukupuoli on tyhjä kaikilla 70 yhtyeellä, koska MusicBrainzin
    sukupuoli koskee vain henkilöitä. Yhtyeelle se pitää johtaa
    jäsenistä, eikä jäsensuhde sisällä sitä: suhteen artisti-olio antaa
    vain id:n, nimen, tyypin ja maan. Siksi jokainen jäsen haetaan
    erikseen. Välimuisti mbid:llä, koska sama muusikko on monessa
    yhtyeessä.

    Nykyiset jäsenet ensin. MusicBrainz laskee mukaan taustamuusikot,
    joten kokoonpanoon kuulumaton mies tekisi naisyhtyeestä sekayhtyeen.
    """
    d, virhe = hae(f"artist/{mbid}", inc="artist-rels", fmt="json")
    time.sleep(VIIVE)
    if virhe or not d:
        return None
    kaikki = [r for r in d.get("relations", []) if r.get("type") == "member of band"]
    nyt = [r for r in kaikki if not r.get("end") and not r.get("ended")]
    valitut = nyt or kaikki
    ulos = []
    for r in valitut:
        a = r.get("artist") or {}
        jid = a.get("id")
        if not jid:
            continue
        if jid not in valimuisti:
            j, jvirhe = hae(f"artist/{jid}", fmt="json")
            time.sleep(VIIVE)
            valimuisti[jid] = None if jvirhe or not j else j.get("gender")
        ulos.append({"nimi": a.get("name"), "sukupuoli": valimuisti[jid]})
    return ulos


def jasenmaara(mbid: str):
    """Yhtyeen nykyisten jäsenten määrä.

    Palauttaa myös kaikkien aikojen määrän, koska ero on iso ja kertoo
    onko kyse pitkäikäisestä bändistä: Apulanta 7 kaikkiaan mutta 3 nyt.

    HUOM: luku EI vastaa aina yleistä käsitystä. MusicBrainz laskee
    mukaan taustamuusikot, joten JVG on siellä nelihenkinen ja PMMP
    viisihenkinen, vaikka molempia pidetään duoina. Siksi nämä on
    tarkoitettu tarkistettaviksi, ei sellaisenaan peliin.
    """
    d, virhe = hae(f"artist/{mbid}", inc="artist-rels", fmt="json")
    time.sleep(VIIVE)
    if virhe or not d:
        return None, None
    jasenet = [r for r in d.get("relations", []) if r.get("type") == "member of band"]
    nyt = [r for r in jasenet if not r.get("end") and not r.get("ended")]
    return len(nyt), len(jasenet)


def wikipedia_teksti(nimi: str):
    """Sivun wikiteksti. None jos sivua ei ole, VIRHE jos haku kaatui."""
    url = ("https://fi.wikipedia.org/w/api.php?action=parse&page="
           + urllib.parse.quote(nimi) + "&prop=wikitext&format=json")
    d = None
    for yritys in range(5):
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                d = json.load(r)
            break
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None            # artikkelia ei ole, aito tyhjä
            if e.code in (429, 503):
                time.sleep(2 ** yritys)
                continue
            return VIRHE
        except Exception:
            time.sleep(2 ** yritys)
    if d is None:
        return VIRHE
    if "error" in d:                   # esim. sivua ei ole
        return None
    return (d.get("parse") or {}).get("wikitext", {}).get("*") or ""


def wikipedia_tarkenteet(nimi: str):
    """Sivut joiden otsikko on "nimi (jotain)".

    Tarpeen koska moni artistinimi on tavallinen sana. Sivu
    "Tehosekoitin" kertoo kodinkoneesta ja yhtye on "Tehosekoitin
    (yhtye)". Ilman tätä yhtyeen tyylilajit jäivät löytymättä.

    Epäonnistuminen palauttaa VIRHE eikä tyhjää listaa: tyhjä lista
    tarkoittaisi "ei tarkennettuja sivuja" ja nopeusrajaan osunut haku
    tallentuisi tietona "ei tyylilajeja".
    """
    url = ("https://fi.wikipedia.org/w/api.php?action=query&list=prefixsearch"
           "&pslimit=20&format=json&pssearch=" + urllib.parse.quote(nimi))
    d = None
    for yritys in range(5):
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                d = json.load(r)
            break
        except Exception:
            time.sleep(2 ** yritys)
    if d is None:
        return VIRHE
    osumat = (d.get("query") or {}).get("prefixsearch") or []
    alku = nimi.lower() + " ("
    kaikki = [o["title"] for o in osumat if o.get("title", "").lower().startswith(alku)]
    # Vain musiikkiin liittyvät tarkenteet. Ares tuottaa kuusi sivua,
    # joista viisi on DC Comicsia, raketti, yritys, Xena ja
    # täsmennyssivu. Jokainen turha haku on yksi mahdollisuus osua
    # nopeusrajaan, ja yksikin kaatunut haku merkitsee koko tuloksen
    # virheeksi. Turhat haut siis aiheuttavat itse sen virheen.
    osuvat = [t for t in kaikki if MUSIIKKITARKENNE.search(t)]
    return (osuvat or kaikki)[:4]


def kentan_arvot(teksti: str, kentta: str):
    """Tietolaatikon kentän arvot listana, None jos kenttää ei ole.

    Sama käsittely kaikille kentille, koska ne ovat samaa wikitekstiä:
    tyylilajit ja laulukieli luetellaan molemmat pilkulla tai <br>:llä
    erotettuina wikilinkkeinä.
    """
    # Kentän arvo rivin loppuun asti. Katkaisu ensimmäiseen |-merkkiin
    # osuisi wikilinkin sisälle: [[Folkmusiikki|folk]]. Väli =-merkin
    # ympärillä ei saa olla \s, koska se nielaisisi rivinvaihdon ja
    # tyhjä kenttä lainaisi arvonsa seuraavalta riviltä.
    m = re.search(r"\|[^\S\n]*" + kentta + r"[^\S\n]*="
                  r"[^\S\n]*((?:[^\n]|\n(?!\s*[|}]))*)", teksti)
    if not m:
        return None
    arvo = m.group(1)
    arvo = re.sub(r"<ref[^>]*>.*?</ref>", "", arvo, flags=re.S)
    arvo = re.sub(r"<ref[^>]*/>", "", arvo)
    # Rivinvaihtotagi on erotin, ei koriste. Jos sen poistaa muiden
    # tagien mukana, arvot liimautuvat yhteen: Tiktakin kolmesta
    # tyylilajista tuli yksi merkkijono "pop-rockvaihtoehtorockpop-punk".
    arvo = re.sub(r"<br\s*/?>", ",", arvo, flags=re.I)
    # Listamallit kääritään pois, sisältö jää: {{Plainlist|* rock * pop}}
    arvo = re.sub(r"\{\{\s*(?:plainlist|flatlist|hlist|lista|ubl|unbulleted list)\s*\|",
                  "", arvo, flags=re.I)
    arvo = re.sub(r"\[\[([^\]|]*)\|([^\]]*)\]\]", r"\2", arvo)
    arvo = re.sub(r"\[\[([^\]]*)\]\]", r"\1", arvo)
    arvo = re.sub(r"<[^>]*>|\{\{[^}]*\}\}|\}\}", "", arvo)
    osat = [x.strip(" *-–—'\t") for x in re.split(r"\s*[,;•·/\n]\s*|\s+\*\s*", arvo)]
    return [x for x in osat if x and len(x) < 40] or None


def tyylilajit_tekstista(teksti: str):
    return kentan_arvot(teksti, r"[Tt]yylilaj(?:it|i)")


def laulukieli_tekstista(teksti: str):
    """Tietolaatikon Laulukieli-kentän arvot.

    HUOM: tyhjä tulos ei tarkoita suomea. Darudella kenttä on tyhjä
    koska hän ei laula, Kotiteollisuudella koska kukaan ei ole
    täyttänyt sitä. Näitä ei voi erottaa toisistaan automaattisesti,
    joten puuttuva arvo merkitään käsin arviointisivulla.
    """
    return kentan_arvot(teksti, r"[Ll]aulukiel(?:i|et)")


def kuvaus_tekstista(teksti: str):
    """Artikkelin johdantolause.

    Tietolaatikko luettelee kaiken mihin artisti on koskenut, mutta
    johdantolause kertoo mikä artisti on: Mamban tietolaatikossa lukee
    iskelmä, pop, poprock ja suomirock, mutta artikkelin ensimmäinen
    lause sanoo "iskelmällinen yhtye". Jälkimmäinen on se mitä pelaaja
    arvaisi.
    """
    t = teksti
    # Tietolaatikot, kuvat ja ohjemallit pois alusta. {{ }} voi olla
    # sisäkkäin, joten kuoritaan uloin kerros kerrallaan.
    for _ in range(40):
        uusi = re.sub(r"\{\{[^{}]*\}\}", "", t)
        if uusi == t:
            break
        t = uusi
    t = re.sub(r"\[\[(?:Kuva|Tiedosto|File|Image):[^\]]*\]\]", "", t, flags=re.I)
    t = re.sub(r"<ref[^>]*>.*?</ref>|<ref[^>]*/>", "", t, flags=re.S)
    t = re.sub(r"<[^>]*>", "", t)
    t = re.sub(r"\[\[([^\]|]*)\|([^\]]*)\]\]", r"\2", t)
    t = re.sub(r"\[\[([^\]]*)\]\]", r"\1", t)
    t = t.replace("'''", "").replace("''", "")
    for rivi in t.split("\n"):
        rivi = rivi.strip()
        if len(rivi) < 30 or rivi.startswith(("|", "=", "*", "#", ":")):
            continue
        # Ensimmäinen virke. Piste lyhenteessä (esim. "s. 1970") ei
        # katkaise, koska sen jälkeen ei tule isoa alkukirjainta.
        m = re.match(r"(.{30,400}?[.!?])(?:\s+[A-ZÅÄÖ]|\s*$)", rivi)
        return (m.group(1) if m else rivi)[:400]
    return None


def wikipedia_tyylilajit(nimi: str):
    """Tyylilajit suomenkielisen Wikipedian tietolaatikosta.

    Tarpeen, koska MusicBrainzin tagit eivät kata suomalaista kenttää.
    Mitattu 206 artistilla: MusicBrainz 135, Wikipedia 142, yhdessä 182.
    Ilman Wikipediaa ihmisen täytettäväksi jäisi 71, sen kanssa 24.

    Wikipedia on myös tarkempi juuri siinä mikä merkitsee. Jari
    Sillanpää on Applella "Pop" ja Wikidatassa "popmusiikki", mutta
    Wikipediassa "tango, iskelmämusiikki", mikä on oikein.

    Tietolaatikko on vapaata wikitekstiä eikä rakenteista dataa, joten
    tämä on hauraampi kuin rajapintahaku. Siksi tulos on ehdotus joka
    tarkistetaan, ei suoraan pelidataa.

    Nopeusrajoitus on otettava vakavasti. Ensimmäinen versio nielaisi
    kaikki poikkeukset ja palautti None, jolloin HTTP 429 tallentui
    tuloksena "ei tyylilajeja": 206 artistista löytyi 47, vaikka
    oikea luku on 142. Siksi 429 ja verkkovirhe erotetaan nyt tyhjästä
    tuloksesta, ja epäonnistuminen palauttaa VIRHE jottei sitä tallenneta.
    """
    teksti = wikipedia_teksti(nimi)
    if teksti is VIRHE:
        return VIRHE
    paras = None                       # paras sivu jolta on edes kuvaus
    if teksti is not None:
        osat = tyylilajit_tekstista(teksti)
        if osat:
            return {"tyylilajit": osat, "kuvaus": kuvaus_tekstista(teksti),
                    "laulukieli": laulukieli_tekstista(teksti)}
        paras = {"tyylilajit": None, "kuvaus": kuvaus_tekstista(teksti),
                 "laulukieli": laulukieli_tekstista(teksti)}
    # Ei kenttää oikealla nimellä: ehkä sivu kertoo jostain muusta.
    # Kokeillaan tarkennetut sivut ja hyväksytään ensimmäinen jossa
    # Tyylilajit-kenttä oikeasti on.
    tarkenteet = wikipedia_tarkenteet(nimi)
    if tarkenteet is VIRHE:
        return VIRHE
    epaonnistui = False
    for otsikko in tarkenteet:
        aputeksti = wikipedia_teksti(otsikko)
        time.sleep(0.5)
        if aputeksti is VIRHE:
            epaonnistui = True
            continue
        if aputeksti is None:
            continue
        osat = tyylilajit_tekstista(aputeksti)
        if osat:
            return {"tyylilajit": osat, "kuvaus": kuvaus_tekstista(aputeksti),
                    "laulukieli": laulukieli_tekstista(aputeksti)}
    if epaonnistui:
        return VIRHE
    return paras


def lue_roolilista():
    """Pelin artistijoukko tiedostosta, tai None jos tiedostoa ei ole."""
    if not LISTA.exists():
        return None
    nimet = []
    for rivi in LISTA.read_text(encoding="utf-8").splitlines():
        rivi = rivi.strip()
        if rivi and not rivi.startswith("#"):
            nimet.append(rivi)
    return nimet or None


def kerää_artistit():
    """Pelin artistit ja niiden katalogitilastot.

    Joukko tulee roolilistasta jos sellainen on. Katalogin biisimäärään
    perustuva sääntö ei kanna: se pudotti Hanoi Rocksin ja Amorphiksen,
    joilla on katalogissa 13 ja 7 biisiä mutta vain kaksi pelattavana,
    eikä se tunne artisteja jotka eivät ole katalogissa lainkaan.
    Artistipeli on oma pelinsä. Ilman roolilistaa palataan vanhaan
    sääntöön, jolla ensimmäinen joukko koottiin.
    """
    kat = json.loads(KATALOGI.read_text(encoding="utf-8"))
    pool = [s for s in kat if s.get("peli") is not False]
    ryhmat = defaultdict(lambda: {"nimi": None, "biisit": 0, "vuodet": []})
    for s in pool:
        nimi = paanimi(s["artist"])
        r = ryhmat[avain(nimi)]
        r["nimi"] = r["nimi"] or nimi
        r["biisit"] += 1
        r["vuodet"].append(s["year"])

    lista = lue_roolilista()
    if lista is None:
        return {k: v for k, v in ryhmat.items() if v["biisit"] >= VAHINTAAN_BIISEJA}

    ulos = {}
    for nimi in lista:
        k = avain(nimi)
        kat_tiedot = ryhmat.get(k)
        ulos[k] = {
            "nimi": nimi,                       # listan kirjoitusasu voittaa
            "biisit": (kat_tiedot or {}).get("biisit", 0),
            "vuodet": (kat_tiedot or {}).get("vuodet", []),
        }
    return ulos


def raportti(tiedot):
    n = len(tiedot)
    if not n:
        print("Ei dataa. Aja ensin ilman --raportti.")
        return
    loytyi = [a for a in tiedot.values() if a.get("mbid")]
    tagit = [a for a in loytyi if a.get("tagit")]
    debyytit = [a for a in loytyi if a.get("debyytti")]
    muualta = [a for a in loytyi if a.get("lahde") != "FI"]
    print(f"Artisteja: {n}")
    print(f"  MusicBrainzista löytyi:  {len(loytyi)}  ({100*len(loytyi)//n} %)")
    print(f"  genretagit:              {len(tagit)}  ({100*len(tagit)//n} %)")
    print(f"  debyyttivuosi:           {len(debyytit)}  ({100*len(debyytit)//n} %)")
    print(f"  osuma muualta kuin FI:   {len(muualta)}  <- tarkistettava")
    puuttuu = [a["nimi"] for a in tiedot.values() if a.get("mbid") and not a.get("tagit")]
    if puuttuu:
        print(f"\nIlman genretagia ({len(puuttuu)}):")
        for nimi in sorted(puuttuu)[:40]:
            print("   " + nimi)
        if len(puuttuu) > 40:
            print(f"   ... ja {len(puuttuu)-40} muuta")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--raportti", action="store_true")
    ap.add_argument("--jasenet", action="store_true",
                    help="hae yhtyeiden jäsenmäärät (oma kierroksensa)")
    ap.add_argument("--wikipedia", action="store_true",
                    help="hae tyylilajit fi.wikipediasta (oma kierroksensa)")
    ap.add_argument("--uudelleen", action="store_true",
                    help="hae myös jo haetut uudestaan (parsinta muuttui)")
    ap.add_argument("--yhtyeet", action="store_true",
                    help="hae yhtyeiden jäsenten sukupuolet (oma kierroksensa)")
    ap.add_argument("--julkaisut", action="store_true",
                    help="hae julkaisuvuodet aktiivisinta vuosikymmentä "
                         "varten (oma kierroksensa)")
    a = ap.parse_args()

    artistit = kerää_artistit()
    tiedot = json.loads(ULOS.read_text(encoding="utf-8")) if ULOS.exists() else {}

    # Katalogista tulevat luvut päivitetään aina, ne ovat ilmaisia.
    for k, v in artistit.items():
        tiedot.setdefault(k, {})
        tiedot[k]["nimi"] = v["nimi"]
        tiedot[k]["biisit"] = v["biisit"]
        # Roolilistalla voi olla artisteja joita katalogissa ei ole
        # lainkaan, esimerkiksi Battle Beast. Vuodet jäävät silloin
        # tyhjiksi eikä se ole virhe.
        vuodet = sorted(v["vuodet"])
        tiedot[k]["eka"] = vuodet[0] if vuodet else None
        tiedot[k]["vika"] = vuodet[-1] if vuodet else None
        tiedot[k]["mediaanivuosi"] = vuodet[len(vuodet) // 2] if vuodet else None

    if a.raportti:
        raportti({k: tiedot[k] for k in artistit})
        return 0

    if a.yhtyeet:
        yhtyeet = [k for k in artistit
                   if tiedot[k].get("tyyppi") == "Group"
                   and tiedot[k].get("mbid") and "jasenet_tiedot" not in tiedot[k]]
        print(f"Yhtyeitä hakematta {len(yhtyeet)}", file=sys.stderr)
        valimuisti = {}
        for i, k in enumerate(yhtyeet, 1):
            jas = jasenten_tiedot(tiedot[k]["mbid"], valimuisti)
            tiedot[k]["jasenet_tiedot"] = jas
            tunnetut = [j["sukupuoli"] for j in (jas or []) if j["sukupuoli"]]
            print(f"  {i}/{len(yhtyeet)}  {tiedot[k]['nimi']}: "
                  f"{len(jas or [])} jäsentä, sukupuoli tiedossa {len(tunnetut)} "
                  f"({', '.join(sorted(set(tunnetut))) or '-'})", file=sys.stderr)
            tallenna(tiedot)
        loytyi = sum(1 for k in artistit
                     if any(j["sukupuoli"] for j in (tiedot[k].get("jasenet_tiedot") or [])))
        print(f"\nJäsenten sukupuoli tiedossa {loytyi} / {len(yhtyeet)} yhtyeelle",
              file=sys.stderr)
        return 0

    if a.julkaisut:
        kesken = [k for k in artistit
                  if tiedot[k].get("mbid") and "julkaisuvuodet" not in tiedot[k]]
        print(f"Hakematta {len(kesken)}", file=sys.stderr)
        for i, k in enumerate(kesken, 1):
            vuodet = julkaisuvuodet(tiedot[k]["mbid"])
            tiedot[k]["julkaisuvuodet"] = vuodet
            if "debyytti" not in (tiedot[k].get("kasin") or []):
                v = debyyttivuosi(tiedot[k], vuodet)
                if v:
                    tiedot[k]["debyytti"] = v
            print(f"  {i}/{len(kesken)}  {tiedot[k]['nimi']}: "
                  f"{len(vuodet) if vuodet else 0} julkaisua "
                  f"{min(vuodet) if vuodet else '?'}-{max(vuodet) if vuodet else '?'}",
                  file=sys.stderr)
            tallenna(tiedot)
        loytyi = sum(1 for k in artistit if tiedot[k].get("julkaisuvuodet"))
        print(f"\nJulkaisuvuodet {loytyi} / {len(artistit)}", file=sys.stderr)
        return 0

    if a.wikipedia:
        kesken = [k for k in artistit
                  if "wp_tyylilajit" not in tiedot[k]
                  or (a.uudelleen and tiedot[k].get("wp_versio") != WP_VERSIO)]
        print(f"Hakematta {len(kesken)}", file=sys.stderr)
        virheita = 0
        for i, k in enumerate(kesken, 1):
            g = wikipedia_tyylilajit(tiedot[k]["nimi"])
            if g is VIRHE:
                # EI tallenneta. Muuten verkkovirhe jäisi tietokantaan
                # tietona "ei tyylilajeja" eikä sitä yritettäisi uudelleen.
                virheita += 1
                print(f"  {i}/{len(kesken)}  {tiedot[k]['nimi']}: VIRHE, jätetään "
                      f"hakematta", file=sys.stderr)
                time.sleep(2)
                continue
            lajit = (g or {}).get("tyylilajit")
            tiedot[k]["wp_tyylilajit"] = lajit
            tiedot[k]["wp_kuvaus"] = (g or {}).get("kuvaus")
            tiedot[k]["wp_laulukieli"] = (g or {}).get("laulukieli")
            tiedot[k]["wp_versio"] = WP_VERSIO
            # Puolitoista sekuntia pyyntöjen välissä. 0,3 s tuotti HTTP
            # 429:ää niin paljon, että 206 artistista löytyi vain 47
            # oikean 142 sijaan, ja 1,0 s kaatoi vielä 34 hakua.
            time.sleep(1.5)
            if i % 20 == 0 or lajit:
                print(f"  {i}/{len(kesken)}  {tiedot[k]['nimi']}: "
                      f"{', '.join(lajit) if lajit else '-'}", file=sys.stderr)
            tallenna(tiedot)
        if virheita:
            print(f"  {virheita} epäonnistui, aja uudestaan", file=sys.stderr)
        loytyi = sum(1 for k in artistit if tiedot[k].get("wp_tyylilajit"))
        print(f"\nTyylilajit {loytyi} / {len(artistit)}", file=sys.stderr)
        return 0

    if a.jasenet:
        # Sooloartistille jäsenmäärä on 1 ilman hakua. MusicBrainzin
        # "member of band" tarkoittaa henkilöllä päinvastaista: niitä
        # bändejä joihin hän kuuluu.
        yhtyeet = [k for k in artistit
                   if tiedot[k].get("tyyppi") == "Group"
                   and tiedot[k].get("mbid") and "jasenet" not in tiedot[k]]
        for k in artistit:
            if tiedot[k].get("tyyppi") == "Person":
                tiedot[k]["jasenet"] = 1
                tiedot[k]["jasenet_kaikkiaan"] = 1
        print(f"Yhtyeitä hakematta: {len(yhtyeet)}", file=sys.stderr)
        for i, k in enumerate(yhtyeet, 1):
            nyt, kaikki = jasenmaara(tiedot[k]["mbid"])
            tiedot[k]["jasenet"] = nyt
            tiedot[k]["jasenet_kaikkiaan"] = kaikki
            print(f"  {i}/{len(yhtyeet)}  {tiedot[k]['nimi']}: {nyt} nyt, {kaikki} kaikkiaan",
                  file=sys.stderr)
            tallenna(tiedot)
        tallenna(tiedot)
        print("\nValmis. Tarkista jäsenmäärät käsin: MusicBrainz laskee "
              "taustamuusikot mukaan.", file=sys.stderr)
        return 0

    kesken = [k for k in artistit if "mbid" not in tiedot[k]]
    print(f"Artisteja {len(artistit)}, hakematta {len(kesken)}", file=sys.stderr)
    for i, k in enumerate(kesken, 1):
        nimi = tiedot[k]["nimi"]
        mb, lahde = etsi_artisti(nimi)
        if not mb:
            tiedot[k]["mbid"] = None
            print(f"  {i}/{len(kesken)}  EI OSUMAA  {nimi}", file=sys.stderr)
        else:
            tiedot[k].update({
                "mbid": mb["id"],
                "mbnimi": mb.get("name"),
                "tyyppi": mb.get("type"),
                "sukupuoli": mb.get("gender"),
                "maa": mb.get("country") or (mb.get("area") or {}).get("name"),
                "lahde": lahde,
                "osuvuus": mb.get("score"),
                "tagit": [t["name"] for t in sorted(mb.get("tags") or [],
                                                    key=lambda t: -t.get("count", 0))[:5]],
            })
            vuodet = julkaisuvuodet(mb["id"])
            tiedot[k]["julkaisuvuodet"] = vuodet
            if "debyytti" not in (tiedot[k].get("kasin") or []):
                tiedot[k]["debyytti"] = debyyttivuosi(tiedot[k], vuodet)
            print(f"  {i}/{len(kesken)}  {nimi} -> {mb.get('name')} "
                  f"({mb.get('type')}, {tiedot[k]['debyytti']}, "
                  f"{len(tiedot[k]['tagit'])} tagia)", file=sys.stderr)
        # Tallennetaan joka kierroksella: keskeytys ei hukkaa tehtyä työtä.
        tallenna(tiedot)

    print(file=sys.stderr)
    raportti({k: tiedot[k] for k in artistit})
    return 0


if __name__ == "__main__":
    sys.exit(main())
