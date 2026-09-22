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

VAHINTAAN_BIISEJA = 3
UA = "HittiSpotti/1.0 ( https://hittispotti.fi )"
VIIVE = 1.1          # sekuntia pyyntöjen välissä
OSUVUUS_RAJA = 90    # MusicBrainzin oma pistemäärä 0-100

# Erottaa epäonnistuneen haun aidosti tyhjästä tuloksesta, jottei
# verkkovirhe tallennu tietona "ei tyylilajeja".
VIRHE = object()


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


def ensijulkaisu(mbid: str):
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
            if 1900 < v <= 2100:
                vuodet.append(v)
    return min(vuodet) if vuodet else None


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
    return [o["title"] for o in osumat if o.get("title", "").lower().startswith(alku)]


def tyylilajit_tekstista(teksti: str):
    """Tietolaatikon Tyylilajit-kentän arvot listana, None jos kenttää ei ole."""
    # Kentän arvo rivin loppuun asti. Katkaisu ensimmäiseen |-merkkiin
    # osuisi wikilinkin sisälle: [[Folkmusiikki|folk]]. Väli =-merkin
    # ympärillä ei saa olla \s, koska se nielaisisi rivinvaihdon ja
    # tyhjä kenttä lainaisi arvonsa seuraavalta riviltä.
    m = re.search(r"\|[^\S\n]*[Tt]yylilaj(?:it|i)[^\S\n]*="
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
    if teksti is not None:
        osat = tyylilajit_tekstista(teksti)
        if osat:
            return osat
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
            return osat
    return VIRHE if epaonnistui else None


def kerää_artistit():
    kat = json.loads(KATALOGI.read_text(encoding="utf-8"))
    pool = [s for s in kat if s.get("peli") is not False]
    ryhmat = defaultdict(lambda: {"nimi": None, "biisit": 0, "vuodet": []})
    for s in pool:
        nimi = paanimi(s["artist"])
        r = ryhmat[avain(nimi)]
        r["nimi"] = r["nimi"] or nimi
        r["biisit"] += 1
        r["vuodet"].append(s["year"])
    return {k: v for k, v in ryhmat.items() if v["biisit"] >= VAHINTAAN_BIISEJA}


def raportti(tiedot):
    n = len(tiedot)
    if not n:
        print("Ei dataa. Aja ensin ilman --raportti.")
        return
    loytyi = [a for a in tiedot.values() if a.get("mbid")]
    tagit = [a for a in loytyi if a.get("tagit")]
    debyytit = [a for a in loytyi if a.get("debyytti")]
    muualta = [a for a in loytyi if a.get("lahde") != "FI"]
    print(f"Artisteja (väh. {VAHINTAAN_BIISEJA} biisiä): {n}")
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
    a = ap.parse_args()

    artistit = kerää_artistit()
    tiedot = json.loads(ULOS.read_text(encoding="utf-8")) if ULOS.exists() else {}

    # Katalogista tulevat luvut päivitetään aina, ne ovat ilmaisia.
    for k, v in artistit.items():
        tiedot.setdefault(k, {})
        tiedot[k]["nimi"] = v["nimi"]
        tiedot[k]["biisit"] = v["biisit"]
        tiedot[k]["eka"] = min(v["vuodet"])
        tiedot[k]["vika"] = max(v["vuodet"])
        vuodet = sorted(v["vuodet"])
        tiedot[k]["mediaanivuosi"] = vuodet[len(vuodet) // 2]

    if a.raportti:
        raportti({k: tiedot[k] for k in artistit})
        return 0

    if a.wikipedia:
        kesken = [k for k in artistit
                  if a.uudelleen or "wp_tyylilajit" not in tiedot[k]]
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
            tiedot[k]["wp_tyylilajit"] = g
            # Sekunti pyyntöjen välissä. 0,3 s tuotti HTTP 429:ää niin
            # paljon, että 206 artistista löytyi vain 47 oikean 142 sijaan.
            time.sleep(1.0)
            if i % 20 == 0 or g:
                print(f"  {i}/{len(kesken)}  {tiedot[k]['nimi']}: "
                      f"{', '.join(g) if g else '-'}", file=sys.stderr)
            ULOS.write_text(json.dumps(tiedot, ensure_ascii=False, indent=1), encoding="utf-8")
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
            ULOS.write_text(json.dumps(tiedot, ensure_ascii=False, indent=1), encoding="utf-8")
        ULOS.write_text(json.dumps(tiedot, ensure_ascii=False, indent=1), encoding="utf-8")
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
            tiedot[k]["debyytti"] = ensijulkaisu(mb["id"])
            print(f"  {i}/{len(kesken)}  {nimi} -> {mb.get('name')} "
                  f"({mb.get('type')}, {tiedot[k]['debyytti']}, "
                  f"{len(tiedot[k]['tagit'])} tagia)", file=sys.stderr)
        # Tallennetaan joka kierroksella: keskeytys ei hukkaa tehtyä työtä.
        ULOS.write_text(json.dumps(tiedot, ensure_ascii=False, indent=1), encoding="utf-8")

    print(file=sys.stderr)
    raportti({k: tiedot[k] for k in artistit})
    return 0


if __name__ == "__main__":
    sys.exit(main())
