#!/usr/bin/env python3
"""Rakentaa arviointisivun artistien taustatiedoille.

    python3 scripts/tee_artistiarviointi.py          # rakenna sivu
    python3 scripts/tee_artistiarviointi.py --kayta arviot.json

Lukee .artistit.json (ks. hae_artistit.py) ja kirjoittaa artistit.html.

Lähde alkaa pisteellä eikä mene julkaistuun hakemistoon, mutta sivu
menee, samoin kuin arviointi.html. Se on tarkoituskin: sivua käytetään
puhelimella, eikä ladattua HTML-tiedostoa saa iOS:ssä auki. Sivulla on
noindex eikä siihen ole linkkiä mistään, joten se löytyy vain osoitteen
tietävälle. Se ei myöskään näytä mitään mitä julkinen katalogi ei jo
kerro.

MITÄ ARVIOIDAAN

Kolme asiaa, jotka kone ei osaa päättää luotettavasti:

1. GENRE. Kaksi lähdettä yhdessä ratkaisee 177 artistia 206:sta:
   Wikipedia 113 ja MusicBrainz 64. Wikipedia on ensisijainen, koska se
   on suomalaisille tarkempi. Jari Sillanpää on MusicBrainzissa ilman
   tageja ja Applella "Pop", mutta Wikipediassa "tango, iskelmämusiikki".

   Applen genre kokeiltiin eikä se kelvannut: Jari Sillanpää, Danny ja
   Frederik ovat siellä kaikki "Pop", vaikka ne ovat iskelmää, ja sama
   artisti on kappaletasolla "Pop" ja artistitasolla "Rock".

   29 artistia jää ilman ehdotusta.

2. KOKOONPANO. MusicBrainz laskee taustamuusikot mukaan, joten JVG on
   siellä nelihenkinen ja PMMP viisihenkinen, vaikka molempia pidetään
   duoina. Lisäksi 12 yhtyeeltä jäsenet puuttuvat kokonaan. Peliin
   riittää karkea luokka: soolo, duo vai yhtye.

3. EPÄVARMAT OSUMAT. Sumealla haulla löytyneet ja ne joilta puuttuu
   debyyttivuosi.

Sivu tallentaa valinnat selaimeen, joten työn voi jättää kesken.
"""
import argparse
import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TIEDOT = ROOT / ".artistit.json"
LISTA = Path(__file__).resolve().parent / "artistit-lista.txt"
ULOS = ROOT / "artistit.html"

GENRET = ["Rap", "Rock", "Pop", "Iskelmä", "Metalli", "Elektroninen",
          "Reggae", "Muu"]

# Tagi -> genre. Kansallisuus, ammatti ja tapahtumat eivät ole genrejä:
# "finnish" on 49 artistilla eikä erottele mitään, koska kaikki ovat
# suomalaisia. Sama koskee tageja singer, actor ja eurovision.
EI_GENRE = {"finnish", "finland", "finlandia", "suomi", "umk 2025", "umk",
            "instrumental", "live", "soundtrack", "singer", "finnish singer",
            "actor", "eurovision", "eurovision 2023 artists", "eurovision 2025"}

KARTTA = [
    ("Rap", ["hip hop", "rap", "pop rap", "finnish rap", "sport rap", "rapping",
             "trap", "gangsta rap", "horrorcore", "alternative rap"]),
    ("Metalli", ["metal", "heavy metal", "power metal", "symphonic metal",
                 "death metal", "black metal", "folk metal", "gothic metal",
                 "melodic death metal", "industrial metal", "nu metal"]),
    ("Iskelmä", ["iskelmä", "schlager", "tango", "humppa"]),
    ("Elektroninen", ["electronic", "eurodance", "techno", "house", "trance",
                      "edm", "synthpop", "synth-pop", "electropop",
                      "electro-pop", "dance"]),
    ("Rock", ["rock", "alternative rock", "finnish rock", "punk", "punk rock",
              "post-grunge", "gothic rock", "alternative/indie rock", "manserock",
              "folk rock", "indie rock", "hard rock", "garage rock", "grunge",
              "progressive rock", "psychedelic rock", "rockabilly", "blues rock",
              "pop rock", "pop punk", "pop-punk"]),
    ("Pop", ["pop", "art pop", "finnish pop", "dance-pop", "indie pop",
             "teen pop", "singer-songwriter", "soul", "r&b", "funk", "disco",
             "chamber pop", "folk pop", "reggae"]),
]
# Suomenkielinen sanasto Wikipedian tietolaatikosta. Eri lista kuin
# MusicBrainzin, koska termit ovat eri: "suomirock", "iskelmä", "kantri".
#
# Yhdyssanan pääsana ratkaisee: "pop-rock" on rockia jota pop värittää,
# ei poppia. Sama sääntö antaa pop-punkille Rockin ja pop rapille Rapin,
# ja toisin päin rap-popille Popin. Poikkeus on syntikkapop ja sen
# sukulaiset, joissa nimenomaan määrite kertoo mistä on kyse.
KARTTA_FI = [
    ("Rap", ["rap", "räppi", "hip hop", "hiphop", "hip hop -musiikki",
             "trap", "suomirap", "suomiräp", "huumorirap", "hardcore rap",
             "horrorcore", "drill", "freestyle", "gangsta rap", "pop rap",
             "poprap", "rap rock", "battle rap"]),
    ("Metalli", ["metalli", "metal", "heavy metal", "power metal",
                 "raskas rock", "sinfoninen metalli", "symphonic metal",
                 "death metal", "black metal", "gootti-metalli",
                 "goottimetalli", "gothic metal", "melodinen death metal",
                 "melodic death metal", "progressiivinen metalli",
                 "progressive metal", "nu metal", "nu-metal", "nu-metalli",
                 "industrial metal", "teollisuusmetalli",
                 "neoklassinen metalli", "glam metal", "cello metal",
                 "folk metal", "kansanmetalli", "doom metal",
                 "thrash metal", "speed metal", "viking metal"]),
    ("Iskelmä", ["iskelmä", "iskelmämusiikki", "tango", "tangomusiikki",
                 "humppa", "cityhumppa", "polkka", "schlager", "laulelma",
                 "laulelmamusiikki", "kupletti", "viihde", "viihdemusiikki",
                 "tanssimusiikki", "rautalanka", "rautalankamusiikki"]),
    ("Elektroninen", ["elektroninen", "elektroninen musiikki",
                      "elektroninen tanssimusiikki", "edm", "dance",
                      "eurodance", "house", "progressiivinen house",
                      "electro house", "techno", "tekno", "trance",
                      "uplifting trance", "electro trance", "hard trance",
                      "acid trance", "progressiivinen trance",
                      "synapop", "syntikkapop", "synthpop", "synth-pop",
                      "elektropop", "electropop", "industrial",
                      "teollisuusmusiikki", "drum and bass", "drum'n'bass",
                      "drum’n’bass", "dnb", "breakbeat", "ambient"]),
    ("Rock", ["rock", "rockmusiikki", "suomirock", "manserock", "aikuisrock",
              "taiderock", "vaihtoehtorock", "vaihtoehtomusiikki",
              "alternative", "alternative rock", "hard rock", "kovarock",
              "folkrock", "folk rock", "rock and roll", "rock'n'roll",
              "uusi aalto", "new wave", "punk", "punkrock", "punk rock",
              "hardcore punk", "skate punk", "pop-punk", "pop punk",
              "poppunk", "post-hardcore", "blues", "bluesmusiikki",
              "blues rock", "bluesrock", "kantri", "country", "countryrock",
              "progressiivinen rock", "indierock", "indie rock",
              "garagerock", "garage rock", "grunge", "rockabilly",
              "goottirock", "gothic rock", "glam rock", "shock rock",
              "sleaze rock", "shoegaze", "poprock", "pop-rock", "pop rock",
              "stoner rock", "psykedeelinen rock"]),
    ("Pop", ["pop", "popmusiikki", "pop-musiikki", "suomipop", "iskelmäpop",
             "tanssipop", "dancepop", "dance-pop", "teinipop", "teini-pop",
             "hyperpop", "rap-pop", "art pop", "taidepop", "kamaripop",
             "r&b", "rnb", "r'n'b", "r’n’b", "rhythm and blues", "soul",
             "funk", "disko", "disco", "folk", "folkmusiikki",
             "kansanmusiikki", "indiepop", "indie pop", "singer-songwriter",
             "lauluntekijä", "reggae", "dancehall", "ska"]),
    # Pelin seitsemäs vastaus. Viimeisenä, joten tasapelissä se häviää
    # aina tarkemmalle genrelle.
    ("Muu", ["jazz", "jazzmusiikki", "swing", "gospel", "hengellinen musiikki",
             "klassinen musiikki", "kamarimusiikki", "musiikkiteatteri",
             "huumorimusiikki", "lastenmusiikki", "soundtrack",
             "elokuvamusiikki", "world music", "maailmanmusiikki"]),
]
TAGI_GENRE_FI = {t: g for g, tagit in KARTTA_FI for t in tagit}
PAINO_FI = {g: i for i, (g, _) in enumerate(KARTTA_FI)}

# Tietolaatikon parsinta vuotaa toisinaan seuraavaan kenttään, jolloin
# arvoksi tulee esimerkiksi "| laulukieli = suomi". Kieli ei ole genre.
EI_GENRE_FI = {"suomi", "englanti", "ruotsi", "instrumentaali", "saksa",
               "espanja", "italia", "ranska", "venäjä", "afrikaans",
               "unkari", "heprea", "viro", "norja", "tanska"}


# Sanavartalot johdantolauseesta. Suomi taivuttaa, joten "iskelmällinen",
# "rockia" ja "räppäri" pitää tunnistaa samaksi asiaksi. Populaarimusiikki
# ei ole pop, joten se suljetaan pois erikseen.
VARTALOT = [
    ("Rap", r"räpp\w*|räpp?äri\w*|\brap\w*|hip[\s-]?hop\w*|\btrap\b"),
    ("Metalli", r"metall\w*|\bmetal\b"),
    ("Iskelmä", r"iskelm\w*|tango\w*|humpp\w*|laulelm\w*|viihdemusiik\w*|kuplet\w*"),
    ("Elektroninen", r"elektronis\w*|elektronin\w*|tekno\w*|house|trance|syntikka\w*|"
                     r"\bdance\b|konemusiik\w*"),
    ("Rock", r"rock\w*|rokki\w*|punk\w*|blues\w*"),
    ("Pop", r"pop(?!ulaari)\w*|soul\w*|funk\w*|disko\w*|reggae\w*|folk\w*|r&b"),
    ("Muu", r"jazz\w*|gospel\w*|klassis\w*"),
]


# Sateenvarjotermit. Ne kertovat karkean kentän mutta eivät erottele
# mitään, koska lähes jokainen artisti mahtuu johonkin niistä.
# Eurodance kertoo enemmän kuin dance ja nu metal enemmän kuin rock.
YLEISTERMIT = {"pop", "popmusiikki", "pop-musiikki", "suomipop",
               "rock", "rockmusiikki", "suomirock", "dance", "alternative",
               "vaihtoehtomusiikki", "elektroninen", "elektroninen musiikki",
               "musiikki", "tanssimusiikki"}
# Lauseessa ratkaisee kielioppi eikä sanasto. "Ultra Bra on suomalainen
# popyhtye" on itsemäärittely ja kertoo mikä yhtye on. Movetron taas
# "tekee tanssi- ja muuta popmusiikkia", mikä kertoo mitä se tekee.
# Ensimmäinen on vahva todiste vaikka sana on pop, jälkimmäinen ei.
YLEISVARTALOT = r"^(?:pop|rock|rokki|dance|tanssi|elektronis|elektronin)"
ARTISTISANAT = (r"(?:yhtye|bändi|bandi|laulaja|laulajatar|artisti|muusikko|"
                r"duo|trio|kokoonpano|orkesteri|tähti|räppäri|rapp?ari|"
                r"kvartetti|kitaristi|tuottaja|tekijä)")
# Kilpailun nimi ei ole genre. Erika Vikman on "vuoden 2016
# tangokuningatar", mistä tuli Iskelmä, vaikka kaikki hänen pelissä
# olevat biisinsä ovat vuodesta 2020 eteenpäin eivätkä ole tangoa.
TITTELIT = r"kuninga|kuningat|kuninkuu|prinsess|markkina|kilpailu|finaali|voittaj|karsinta"


def genre_kuvauksesta(kuvaus, kerro_vahvuus=False):
    """Genre artikkelin johdantolauseesta.

    Tietolaatikko luettelee kaiken mihin artisti on koskenut, lause
    kertoo mikä artisti on. Mamban tietolaatikossa on iskelmä, pop,
    poprock ja suomirock, joista enemmistö antaa Rockin, mutta lause
    sanoo "iskelmällinen yhtye". Lause on se jonka pelaaja arvaisi.

    Palauttaa myös tiedon siitä nojaako tulos pelkkään yleistermiin.
    Movetronin lause sanoo "tanssi- ja muuta popmusiikkia tekevä
    yhtye", mistä tulee Pop, mutta tietolaatikossa lukee eurodance,
    joka kertoo enemmän. Silloin laatikko saa voittaa lauseen.
    """
    tyhja = (None, False) if kerro_vahvuus else None
    if not kuvaus:
        return tyhja
    t = kuvaus.lower()
    osumat = Counter()
    vahvat = set()
    for genre, hahmo in VARTALOT:
        # Titteli ei ole genre: tangokuningatar, iskelmämarkkinat.
        loydot = [m for m in re.finditer(hahmo, t)
                  if not re.search(TITTELIT, t[m.start():m.end() + 14])]
        if not loydot:
            continue
        osumat[genre] = len(loydot)
        for m in loydot:
            sana = m.group(0)
            if not re.match(YLEISVARTALOT, sana):
                vahvat.add(genre)      # iskelmällinen, metallin, räppäri
                continue
            # Yleissana kelpaa jos se on kiinni artistisanassa:
            # "popyhtye" ja "pop-laulaja" kyllä, "popmusiikkia tekevä" ei.
            ikkuna = t[m.start():m.end() + 12]
            if re.match(r"\w*[\s-]?" + ARTISTISANAT, ikkuna):
                vahvat.add(genre)
    if not osumat:
        return tyhja
    paras = max(osumat.values())
    ehdokkaat = [g for g, n in osumat.items() if n == paras]
    g = min(ehdokkaat, key=lambda g: PAINO_FI[g])
    return (g, g in vahvat) if kerro_vahvuus else g


def wp_termit(raaka):
    """Yksi kentän arvo pilkottuna vertailukelpoisiksi termeiksi.

    Tietolaatikossa lukee toisinaan "hip hop ja rap" yhtenä arvona tai
    "glam metal (aluksi)" tarkenteen kanssa.
    """
    t = raaka.lower().strip()
    t = re.sub(r"\s*\([^)]*\)", "", t)
    # &-merkin ympärillä vaaditaan välilyönnit, jottei "r&b" hajoa.
    return [x.strip(" -–—'\"") for x in re.split(r"\s+ja\s+|\s+&\s+", t)]


def genre_wikipediasta(tyylilajit, kerro_vahvuus=False):
    """Yleisin genre Wikipedian tyylilajeista.

    Sateenvarjotermi painaa puolikkaan. "pop" ja "dance" eivät erottele
    mitään, koska melkein jokainen artisti mahtuu niihin, kun taas
    eurodance ja nu metal kertovat suoraan mistä on kyse.
    """
    tyhja = (None, False) if kerro_vahvuus else None
    if not tyylilajit:
        return tyhja
    laskuri = Counter()
    vahvat = set()
    for raaka in tyylilajit:
        # Vuotanut kenttä: sisältää =-merkin tai alkaa putkella.
        if "=" in raaka or raaka.strip().startswith("|"):
            continue
        for t in wp_termit(raaka):
            if not t or t in EI_GENRE_FI or t not in TAGI_GENRE_FI:
                continue
            g = TAGI_GENRE_FI[t]
            if t in YLEISTERMIT:
                laskuri[g] += 0.5
            else:
                laskuri[g] += 1
                vahvat.add(g)
    if not laskuri:
        return tyhja
    paras = max(laskuri.values())
    ehdokkaat = [g for g, n in laskuri.items() if n == paras]
    g = min(ehdokkaat, key=lambda g: PAINO_FI[g])
    return (g, g in vahvat) if kerro_vahvuus else g


TAGI_GENRE = {t: g for g, tagit in KARTTA for t in tagit}
# Järjestys ratkaisee tasapelin. Rap ennen poppia, koska "pop rap" on rap.
PAINO = {g: i for i, (g, _) in enumerate(KARTTA)}


def genre_tageista(tagit):
    """Yleisin genre artistin tageista, tasapeli kartan järjestyksellä."""
    osumat = [TAGI_GENRE[t] for t in tagit
              if t not in EI_GENRE and t in TAGI_GENRE]
    if not osumat:
        return None
    laskuri = Counter(osumat)
    paras = max(laskuri.values())
    ehdokkaat = [g for g, n in laskuri.items() if n == paras]
    return min(ehdokkaat, key=lambda g: PAINO[g])


def genre_ehdotus(a):
    """Johdantolause, sitten tietolaatikko, sitten MusicBrainz.

    Wikipedia on suomalaisille tarkempi kuin MusicBrainz: Jari
    Sillanpää on MusicBrainzissa tagitta ja Applella "Pop", mutta
    Wikipediassa "tango, iskelmämusiikki".

    Wikipedian sisällä johdantolause voittaa tietolaatikon. Laatikko
    luettelee kaiken mihin artisti on koskenut ja enemmistöäänestys
    palkitsee saman genren monta alalajia: Melon seitsemästä
    tyylilajista neljä on rockin alalajeja, joten laatikko tekee
    räppäristä rockartistin. Lause sanoo suoraan mikä artisti on.
    """
    # Käsin asetettu voittaa aina. Automaattinen päättely osui 77 %
    # oikein mitattuna, mikä ei riitä peliin jossa vastaus on vihreä
    # tai punainen, joten ehdotus on vain pohja käymättömille.
    if a.get("genre"):
        return a["genre"], "käsin"
    lause, lause_vahva = genre_kuvauksesta(a.get("wp_kuvaus"), True)
    laatikko, laatikko_vahva = genre_wikipediasta(a.get("wp_tyylilajit"), True)
    if lause and lause_vahva:
        return lause, "Wikipedia (lause)"
    # Lause nojaa pelkkään sateenvarjotermiin. Jos laatikossa on
    # täsmällinen termi, se kertoo enemmän: Movetronin lause sanoo
    # "tanssi- ja muuta popmusiikkia", laatikko sanoo eurodance.
    if laatikko and laatikko_vahva:
        return laatikko, "Wikipedia"
    if lause:
        return lause, "Wikipedia (lause)"
    if laatikko:
        return laatikko, "Wikipedia"
    g = genre_tageista(a.get("tagit") or [])
    if g:
        return g, "MusicBrainz"
    return None, "ei tietoa"


SUKUPUOLET = ["Mies", "Nainen", "Seka"]


def jasenlista(a):
    """Jäsenet ilman kaksoiskappaleita.

    Sama muusikko on jäsensuhteissa kerran per soitin, joten Risto
    Paananen esiintyy Leevi and the Leavingsissä kolmesti.
    """
    nahdyt, ulos = set(), []
    for j in a.get("jasenet_tiedot") or []:
        nimi = (j.get("nimi") or "").strip()
        if nimi.lower() in nahdyt:
            continue
        nahdyt.add(nimi.lower())
        ulos.append(j)
    return ulos


def sukupuoli_ehdotus(a):
    """Mies, nainen vai seka.

    Sooloartistille MusicBrainzin sukupuoli. Yhtyeelle se johdetaan
    jäsenistä, koska MusicBrainzin sukupuoli koskee vain henkilöitä ja
    on tyhjä kaikilla 70 yhtyeellä: pelkkä miehistä koostuva yhtye on
    Mies, pelkkä naisista Nainen, sekakokoonpano Seka.

    HUOM: MusicBrainz laskee jäseniksi myös taustamuusikot, joten yksi
    ylimääräinen mies tekisi naisyhtyeestä sekayhtyeen. Siksi jäsenten
    nimet ja sukupuolet näkyvät arviointisivulla tarkistettaviksi.
    """
    # Pieniksi kirjaimiksi aina. MusicBrainzin hakuendpoint palauttaa
    # "male" mutta /artist/{id} palauttaa "Male", ja isolla kirjaimella
    # vertaaminen teki jokaisesta yhtyeestä sekakokoonpanon.
    if a.get("sukupuoli_peli"):
        return a["sukupuoli_peli"], "käsin"
    if a.get("tyyppi") == "Person":
        g = (a.get("sukupuoli") or "").lower()
        if g == "male":
            return "Mies", "MusicBrainz"
        if g == "female":
            return "Nainen", "MusicBrainz"
        return None, "ei tietoa"
    jas = jasenlista(a)
    tunnetut = {(j.get("sukupuoli") or "").lower() for j in jas if j.get("sukupuoli")}
    if not tunnetut:
        return None, "ei tietoa"
    if tunnetut == {"male"}:
        return "Mies", f"{len(jas)} jäsentä"
    if tunnetut == {"female"}:
        return "Nainen", f"{len(jas)} jäsentä"
    return "Seka", f"{len(jas)} jäsentä"


KIELET = ["Suomi", "Englanti", "Molemmat", "Ruotsi", "Instrumentaali"]
KIELI_NIMET = {"suomi": "Suomi", "suomen kieli": "Suomi", "finnish": "Suomi",
               "englanti": "Englanti", "englannin kieli": "Englanti",
               "english": "Englanti", "instrumentaali": "Instrumentaali",
               "instrumentaalimusiikki": "Instrumentaali"}


def laulukieli_ehdotus(a):
    """Se kieli josta artisti tunnetaan, ei kaikki joita hän on käyttänyt.

    Sama vika kuin tyylilajeissa: kenttä luettelee kaiken mitä artisti
    on joskus tehnyt. Elastinen, Apulanta, Juice Leskinen, Kirka, Danny,
    Anssi Kela ja Neljä Ruusua ovat kaikki listattu suomeksi ja
    englanniksi, vaikka yleisölle he ovat suomenkielisiä artisteja.
    Nightwish on päinvastainen tapaus: englanti ensin, pari suomenkielistä
    kappaletta perässä, eikä kukaan arvaisi heitä kaksikielisiksi.

    Ensimmäinen listattu on ensisijainen, kuten tietolaatikoissa yleensä.
    Ei arvoa "molemmat": genrekin on yksi per artisti.
    """
    if a.get("laulukieli"):
        return a["laulukieli"], "käsin"
    lista = a.get("wp_laulukieli") or []
    for raaka in lista:
        t = raaka.lower().strip()
        # "muun muassa suomi" -> "suomi"
        t = re.sub(r"^(?:muun muassa|mm\.?|esim\.?|pääosin|enimm\w*)\s+", "", t)
        if t in KIELI_NIMET:
            return KIELI_NIMET[t], "Wikipedia"
    return None, "ei tietoa"


def kokoonpano_ehdotus(a):
    """Soolo, duo vai yhtye.

    Nimi on usein varmempi kuin MusicBrainzin jäsenlista: "Pasi ja Anssi"
    ja "Ida Paul & Kalle Lindroth" ovat duoja nimensä perusteella, vaikka
    tietokanta sanoo muuta.
    """
    # Jäsenmäärä käsin annettuna ratkaisee. MusicBrainz laskee mukaan
    # taustamuusikot ja entiset jäsenet, joten se oli eri mieltä 43
    # yhtyeestä 199:stä: PMMP 5 vaikka duo, JVG 4 vaikka duo, Leevi and
    # the Leavings 10 vaikka 3.
    n = a.get("jasenluku")
    if isinstance(n, int):
        luokka = "Soolo" if n == 1 else ("Duo" if n == 2 else "Yhtye")
        return luokka, f"käsin, {n} jäsentä"
    if a.get("kokoonpano"):
        return a["kokoonpano"], "käsin"
    if a.get("tyyppi") == "Person":
        return "Soolo", "tyyppi on Person"
    nimi = a.get("nimi", "")
    # Kaksi henkilönnimeä yhdistettynä: "X ja Y", "X & Y".
    if re.search(r"\w+\s+(ja|&)\s+\w+", nimi) and len(nimi.split()) <= 6:
        return "Duo", "nimessä kaksi nimeä"
    # Nykyisiä jäseniä on nolla jos yhtye on hajonnut: MusicBrainzissa
    # jokaisella jäsenyydellä on silloin päättymispäivä. Tiktakilla se
    # on 0 vaikka jäseniä oli kaikkiaan 6. Siksi kaikkiaan-luku varalle.
    n = a.get("jasenet") or a.get("jasenet_kaikkiaan")
    if n == 2:
        return "Duo", "MusicBrainz: 2 jäsentä"
    if isinstance(n, int) and n >= 3:
        return "Yhtye", f"MusicBrainz: {n} jäsentä"
    return "Yhtye", "jäsenmäärä puuttuu, oletus"


def esc(t):
    return (str(t).replace("&", "&amp;").replace("<", "&lt;")
            .replace(">", "&gt;").replace('"', "&quot;"))


def rivi(k, a):
    genre, lahde = genre_ehdotus(a)
    kokoonpano, peruste = kokoonpano_ehdotus(a)
    kieli, kieliperuste = laulukieli_ehdotus(a)
    sp, spperuste = sukupuoli_ehdotus(a)
    wp = ", ".join(a.get("wp_tyylilajit") or [])
    mb = ", ".join(a.get("tagit") or [])
    tagit = " &middot; ".join(x for x in (
        ("WP: " + wp) if wp else "", ("MB: " + mb) if mb else "") if x) or "ei tietoja"
    varoitus = []
    if a.get("lahde") == "sumea":
        varoitus.append(f"sumea osuma: {a.get('mbnimi')}")
    if not a.get("debyytti"):
        varoitus.append("debyyttivuosi puuttuu")
    if not genre:
        varoitus.append("genre puuttuu")
    if not kieli:
        varoitus.append("laulukieli puuttuu")
    if not sp:
        varoitus.append("sukupuoli puuttuu")
    napit = "".join(
        f'<button type="button" class="g{" on" if g == genre else ""}" data-g="{esc(g)}">{esc(g)}</button>'
        for g in GENRET)
    kokot = "".join(
        f'<button type="button" class="k{" on" if x == kokoonpano else ""}" data-k="{x}">{x}</button>'
        for x in ("Soolo", "Duo", "Yhtye"))
    spt = "".join(
        f'<button type="button" class="s{" on" if x == sp else ""}" data-s="{x}">{x}</button>'
        for x in SUKUPUOLET)
    kielet = "".join(
        f'<button type="button" class="l{" on" if x == kieli else ""}" data-l="{esc(x)}">{esc(x)}</button>'
        for x in KIELET)
    # Kaikki listatut kielet näkyviin, koska ehdotus on vain ensimmäinen.
    kaikki_kielet = ", ".join(a.get("wp_laulukieli") or [])
    # Jäsenet näkyviin, koska MusicBrainz laskee taustamuusikot mukaan.
    jasenet = ", ".join(
        f'{j["nimi"]} ({ {"male": "m", "female": "n"}.get((j.get("sukupuoli") or "").lower(), "?") })'
        for j in jasenlista(a))
    return f"""<tr data-k="{esc(k)}" data-genre="{esc(genre or '')}" data-kokoonpano="{esc(kokoonpano)}"
      data-kieli="{esc(kieli or '')}" data-sp="{esc(sp or '')}" class="{'huomio' if varoitus else ''}">
  <td class="nimi"><b>{esc(a['nimi'])}</b>
    <span>{a['biisit']} biisiä &middot; {a['eka']}&ndash;{a['vika']} &middot; debyytti {esc(a.get('debyytti') or '?')}</span>
    <span class="tagit">{esc(tagit)}</span>
    {'<span class="kuvaus">' + esc(a['wp_kuvaus']) + '</span>' if a.get('wp_kuvaus') else ''}
    {'<span class="tagit">kielet: ' + esc(kaikki_kielet) + '</span>' if kaikki_kielet else ''}
    {'<span class="tagit">jäsenet: ' + esc(jasenet) + '</span>' if jasenet else ''}
    {'<span class="varo">' + esc(' &middot; '.join(varoitus)) + '</span>' if varoitus else ''}
  </td>
  <td class="napit">{napit}<div class="rivi2">{kokot}</div>
    <div class="rivi2">{spt}</div>
    <div class="rivi2">{kielet}</div>
    <span class="peruste">{esc(lahde)} &middot; {esc(peruste)} &middot; kieli {esc(kieliperuste)}
      &middot; sp {esc(spperuste)}</span></td>
</tr>"""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--kayta", help="lue arviot JSON-tiedostosta ja kirjoita .artistit.json")
    a = ap.parse_args()

    tiedot = json.loads(TIEDOT.read_text(encoding="utf-8"))
    # Pelin joukko tulee roolilistasta, ei katalogin biisimäärästä.
    # Lista sisältää artisteja joilla on katalogissa alle kolme
    # pelattavaa biisiä tai ei yhtään.
    if LISTA.exists():
        import unicodedata as _ud

        def _av(n):
            n = n.replace("\u2019", "'").lower().strip()
            n = _ud.normalize("NFD", n)
            n = "".join(c for c in n if _ud.category(c) != "Mn")
            return re.sub(r"[^a-z0-9]+", " ", n).strip()

        halutut = {_av(r.strip()) for r in LISTA.read_text(encoding="utf-8").splitlines()
                   if r.strip() and not r.startswith("#")}
        mukana = {k: v for k, v in tiedot.items() if _av(v.get("nimi", "")) in halutut}
    else:
        mukana = {k: v for k, v in tiedot.items() if v.get("biisit", 0) >= 3}

    if a.kayta:
        arviot = json.loads(Path(a.kayta).read_text(encoding="utf-8"))
        n = 0
        for k, v in arviot.get("artistit", {}).items():
            if k not in tiedot:
                print(f"tuntematon avain: {k}", file=sys.stderr)
                continue
            tiedot[k]["genre"] = v.get("genre")
            tiedot[k]["kokoonpano"] = v.get("kokoonpano")
            tiedot[k]["laulukieli"] = v.get("kieli")
            tiedot[k]["sukupuoli_peli"] = v.get("sukupuoli")
            n += 1
        TIEDOT.write_text(json.dumps(tiedot, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"Päivitetty {n} artistia")
        return 0

    # Huomiota vaativat ensin, muuten biisimäärän mukaan.
    def jarjestys(kv):
        k, v = kv
        puuttuu = (not genre_ehdotus(v)[0] or not laulukieli_ehdotus(v)[0]
                   or not sukupuoli_ehdotus(v)[0]
                   or v.get("lahde") == "sumea" or not v.get("debyytti"))
        return (0 if puuttuu else 1, -v["biisit"])

    rivit = "".join(rivi(k, v) for k, v in sorted(mukana.items(), key=jarjestys))
    huomio = sum(1 for k, v in mukana.items()
                 if not genre_ehdotus(v)[0] or not laulukieli_ehdotus(v)[0]
                 or not sukupuoli_ehdotus(v)[0]
                 or v.get("lahde") == "sumea" or not v.get("debyytti"))

    html = SIVU.replace("{{RIVIT}}", rivit).replace("{{N}}", str(len(mukana))) \
               .replace("{{HUOMIO}}", str(huomio))
    ULOS.write_text(html, encoding="utf-8")
    print(f"{ULOS.name}: {len(mukana)} artistia, {huomio} vaatii huomiota")
    return 0


SIVU = """<!doctype html><html lang="fi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Artistien arviointi</title><style>
:root{--bg:#0a0908;--text:#f2ebdf;--muted:#8a8073;--dim:#857c6f;--line:#2a2521;
--live:#5ecf9a;--varo:#e0b341}
*{box-sizing:border-box}
body{margin:0;padding:18px 14px 86px;background:var(--bg);color:var(--text);
 font:15px/1.4 system-ui,-apple-system,sans-serif}
h1{font-size:20px;margin:0 0 4px}
.lead{color:var(--muted);font-size:13px;margin:0 0 14px}
table{width:100%;border-collapse:collapse}
td{padding:10px 4px;border-bottom:1px solid #16130f;vertical-align:top}
tr.huomio .nimi b{color:var(--varo)}
.nimi{width:42%}
.nimi b{display:block;font-size:14px}
.nimi span{display:block;color:var(--muted);font-size:11.5px;margin-top:2px}
.nimi .tagit{color:var(--dim);font-style:italic}
.nimi .kuvaus{color:var(--dim)}
.nimi .varo{color:var(--varo)}
.napit{text-align:right}
.rivi2{margin-top:5px}
button{background:transparent;border:1px solid var(--line);border-radius:999px;
 color:var(--dim);font:inherit;font-size:11.5px;padding:4px 9px;margin:0 0 4px 4px;cursor:pointer}
button.on{border-color:var(--live);color:var(--live);font-weight:700}
button.k.on{border-color:var(--varo);color:var(--varo)}
button.l.on{border-color:var(--dim);color:var(--teksti)}
button.s.on{border-color:var(--dim);color:var(--teksti)}
.peruste{display:block;color:var(--dim);font-size:10.5px;margin-top:3px}
#ala{position:fixed;left:0;right:0;bottom:0;background:#12100e;border-top:1px solid var(--line);
 padding:10px 14px;display:flex;gap:10px;align-items:center}
#ala button{background:var(--live);color:#0a0908;border:0;font-weight:700;font-size:14px;padding:9px 16px}
#luku{color:var(--muted);font-size:12.5px}
#ta{position:fixed;left:-9999px}
</style></head><body>
<h1>Artistien arviointi</h1>
<p class="lead">{{N}} artistia, joista {{HUOMIO}} vaatii huomiota ja on nostettu ylimmäksi.
Keltainen nimi tarkoittaa puuttuvaa tai epävarmaa tietoa. Valinnat tallentuvat selaimeen,
joten voit jättää kesken.</p>
<table><tbody>{{RIVIT}}</tbody></table>
<div id="ala"><button onclick="kopioi()">Kopioi valinnat</button><span id="luku"></span></div>
<textarea id="ta"></textarea>
<script>
const AVAIN="hittispotti:artistiarviot";
const rivit=[...document.querySelectorAll("tbody tr")];
let tila={};
try{ tila=JSON.parse(localStorage.getItem(AVAIN)||"{}"); }catch(e){}
function piirra(){
  let muutettu=0;
  for(const tr of rivit){
    const k=tr.dataset.k;
    const g=(tila[k]&&tila[k].genre)||tr.dataset.genre;
    const ko=(tila[k]&&tila[k].kokoonpano)||tr.dataset.kokoonpano;
    const ki=(tila[k]&&tila[k].kieli)||tr.dataset.kieli;
    const sp=(tila[k]&&tila[k].sukupuoli)||tr.dataset.sp;
    tr.querySelectorAll("button.g").forEach(b=>b.classList.toggle("on",b.dataset.g===g));
    tr.querySelectorAll("button.k").forEach(b=>b.classList.toggle("on",b.dataset.k===ko));
    tr.querySelectorAll("button.l").forEach(b=>b.classList.toggle("on",b.dataset.l===ki));
    tr.querySelectorAll("button.s").forEach(b=>b.classList.toggle("on",b.dataset.s===sp));
    if(tila[k]) muutettu++;
  }
  document.getElementById("luku").textContent=muutettu+" muutettu / "+rivit.length;
}
document.addEventListener("click",(e)=>{
  const b=e.target.closest("button.g, button.k, button.l, button.s"); if(!b) return;
  const tr=b.closest("tr"), k=tr.dataset.k;
  tila[k]=tila[k]||{genre:tr.dataset.genre,kokoonpano:tr.dataset.kokoonpano,
                    kieli:tr.dataset.kieli,sukupuoli:tr.dataset.sp};
  if(b.dataset.g) tila[k].genre=b.dataset.g;
  else if(b.dataset.l) tila[k].kieli=b.dataset.l;
  else if(b.dataset.s) tila[k].sukupuoli=b.dataset.s;
  else tila[k].kokoonpano=b.dataset.k;
  try{ localStorage.setItem(AVAIN,JSON.stringify(tila)); }catch(e){}
  piirra();
});
piirra();
function kopioi(){
  const ulos={};
  for(const tr of rivit){
    const k=tr.dataset.k;
    ulos[k]={genre:(tila[k]&&tila[k].genre)||tr.dataset.genre,
             kokoonpano:(tila[k]&&tila[k].kokoonpano)||tr.dataset.kokoonpano,
             kieli:(tila[k]&&tila[k].kieli)||tr.dataset.kieli,
             sukupuoli:(tila[k]&&tila[k].sukupuoli)||tr.dataset.sp};
  }
  const t=JSON.stringify({artistit:ulos});
  const ta=document.getElementById("ta"); ta.value=t; ta.select();
  try{document.execCommand("copy");}catch(e){}
  if(navigator.clipboard) navigator.clipboard.writeText(t).catch(()=>{});
  document.getElementById("luku").textContent="Kopioitu ("+rivit.length+" artistia)";
}
</script></body></html>"""


if __name__ == "__main__":
    sys.exit(main())
