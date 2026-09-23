#!/usr/bin/env python3
"""Vertaa käsin tehtyä kotipaikkalistaa Wikipediaan.

    python3 scripts/tarkista_kotipaikat.py lista.txt > raportti.txt

EI KORJAA MITÄÄN, VAAN RAPORTOI

Wikipedia ei kelpaa kotipaikan lähteeksi sellaisenaan. Se kertoo
ihmisestä syntymäpaikan, ei sitä paikkaa johon artisti yhdistetään:
Cheek syntyi Helsingissä mutta on Lahdesta, ja juuri jälkimmäinen on se
minkä pelaaja tietää. Yhtyeellä kenttä on lähempänä oikeaa, mutta
sielläkin "kotipaikka" voi olla nykyinen toimipaikka eikä se kaupunki
jossa yhtye perustettiin.

Siksi tämä tulostaa vain eron ja sen perustelun. Ihminen päättää kumpi
on oikea, eikä mitään kirjoiteta minnekään.

MITEN PAIKKA TUNNISTETAAN

Wikilinkeistä eikä leipätekstistä. Suomen kielessä paikannimi taipuu
("Hämeenlinnassa", "Lahdesta", "Turusta"), ja taivutettujen muotojen
tunnistaminen olisi oma ongelmansa. Wikilinkin sisällä nimi on
perusmuodossa: [[Hämeenlinna]]. Linkit haetaan erikseen
tietolaatikosta ja johdantokappaleesta, koska artikkelin lopussa voi
olla kymmeniä paikkoja joilla ei ole mitään tekemistä artistin
alkuperän kanssa.
"""
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from hae_artistit import UA, VIRHE, wikipedia_tarkenteet, wikipedia_teksti
from kotipaikat import KUNNAT, maakunta

# Artikkeli on oikea, jos se kertoo musiikista. Ilman tätä
# "Tehosekoitin" tarkoittaa kodinkonetta ja "Ares" DC Comicsin
# hahmoa, ja kummassakin voi olla paikkalinkkejä jotka näyttäisivät
# todisteilta.
MUSIIKKISANAT = re.compile(
    r"\b(yhtye|laulaja|muusikko|artisti|räppäri|rap-artisti|kitaristi|"
    r"rumpali|basisti|säveltäjä|sanoittaja|albumi|levy|bändi|duo|"
    r"musiikki|lauluyhtye|tuottaja|dj)", re.I)

# Tietolaatikon kentät joissa paikka yleensä on.
PAIKKAKENTAT = ("Kotipaikka", "Alkuperä", "Syntynyt", "Syntymäpaikka",
                "Perustettu", "Lähtöisin")

# Wikipedia vastasi 1,5 sekunnin välein koodilla 429 (liikaa pyyntöjä).
# Kolme sekuntia tarkoittaa täydelle listalle noin 15 minuuttia, mikä on
# halvempaa kuin uusintayritykset ja puolittain kaatunut ajo.
VIIVE = 3.0


def linkit(teksti: str):
    """Wikilinkkien kohteet, jotka ovat Suomen kuntia."""
    return [x.strip() for x in re.findall(r"\[\[([^\]|#]+)", teksti)
            if x.strip() in KUNNAT]


# Astevaihtelu. Paikannimi taipuu, ja juuri isoimmat kaupungit taipuvat
# niin ettei nimen alku säily: Lahti -> Lahdessa, Turku -> Turussa,
# Helsinki -> Helsingissä. Pelkkä alkuosan vertailu löytäisi siis
# Tampereen muttei Lahtea, eli juuri väärät tapaukset jäisivät pois.
#
# Säännöt eivät ole täydellinen kuvaus suomen astevaihtelusta eikä
# niiden tarvitse olla: jokaisesta nimestä kokeillaan sekä perusmuotoa
# että vaihdeltua vartaloa, ja tämä on raportti jonka ihminen lukee.
# Väärä osuma näkyy raportilla ja sen näkee, puuttuva osuma ei näy.
VAIHTELU = [
    (r"mäki$", "mäe"), (r"joki$", "joe"), (r"ki$", "gi"),
    (r"ti$", "de"), (r"ku$", "u"), (r"ky$", "y"),
    (r"mpu$", "mmu"), (r"kka$", "ka"), (r"kkä$", "kä"),
    (r"ppa$", "pa"), (r"tta$", "ta"), (r"nta$", "nna"), (r"ntä$", "nnä"),
    (r"udas$", "uta"), (r"us$", "ude"), (r"ys$", "yde"),
    (r"mi$", "me"), (r"vi$", "ve"), (r"pi$", "ve"), (r"si$", "de"),
]


def vartalot(kunta: str):
    """Perusmuoto ja mahdolliset taivutusvartalot."""
    ulos = [kunta]
    for saanto, tilalle in VAIHTELU:
        if re.search(saanto, kunta):
            ulos.append(re.sub(saanto, tilalle, kunta))
    return ulos


def taivutetut(teksti: str):
    """Kunnat jotka mainitaan tekstissä myös taivutettuina.

    Vain nimet joissa on vähintään neljä merkkiä: "Ii" ja "Kemi"
    lyhyempinä vartaloina osuisivat mihin tahansa.
    """
    ulos = []
    for kunta in KUNNAT:
        if len(kunta) < 4:
            continue
        for v in vartalot(kunta):
            if re.search(r"\b" + re.escape(v) + r"[a-zäöå]{0,8}\b", teksti):
                ulos.append(kunta)
                break
    return ulos


def osat(teksti: str):
    """Tietolaatikko ja johdanto erikseen.

    Johdanto alkaa lihavoidusta nimestä. Se on artikkelin ensimmäinen
    '''-merkintä, ja kaikki sitä ennen on tietolaatikkoa.
    """
    m = re.search(r"\n'''", teksti)
    if not m:
        return teksti[:1500], teksti[:1500]
    return teksti[:m.start()], teksti[m.start():m.start() + 900]


def kentat(teksti: str):
    """Paikkakentät sellaisenaan, raporttiin perusteluksi."""
    ulos = []
    for k in PAIKKAKENTAT:
        m = re.search(r"\|\s*" + k + r"\s*=([^\n]*)", teksti, re.I)
        if m and m.group(1).strip():
            arvo = re.sub(r"\[\[([^\]|]*)\|([^\]]*)\]\]", r"\2", m.group(1))
            arvo = re.sub(r"\[\[([^\]]*)\]\]", r"\1", arvo)
            arvo = re.sub(r"<[^>]*>", " ", arvo).strip()
            if arvo:
                ulos.append(f"{k}: {arvo}")
    return ulos


def hae_sivut(nimet):
    """Monta artikkelia yhdellä pyynnöllä.

    action=parse hakee yhden sivun kerrallaan, ja 246 pyyntöä 1,5
    sekunnin välein osui Wikipedian nopeusrajaan (HTTP 429): uusinnat
    venyttivät haun 17 sekuntiin artistia kohti eli koko listan noin
    tuntiin. action=query ottaa 50 otsikkoa kerralla, jolloin sama työ
    on viisi pyyntöä.

    redirects=1 seuraa ohjaussivut palvelimella, joten "#OHJAUS
    [[Alma (laulaja)]]" ei enää palaudu sisällöksi. Palautettu sanakirja
    on haettu nimi -> teksti, ja ohjatun sivun teksti asetetaan sille
    nimelle jolla sitä kysyttiin.
    """
    ulos = {}
    for i in range(0, len(nimet), 50):
        era = nimet[i:i + 50]
        url = ("https://fi.wikipedia.org/w/api.php?action=query&format=json"
               "&prop=revisions&rvprop=content&rvslots=main&redirects=1"
               "&titles=" + urllib.parse.quote("|".join(era), safe="|"))
        d = None
        for yritys in range(5):
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            try:
                with urllib.request.urlopen(req, timeout=60) as r:
                    d = json.load(r)
                break
            except Exception:
                time.sleep(2 ** yritys)
        if d is None:
            for n in era:
                ulos[n] = VIRHE
            continue
        q = d.get("query") or {}
        # Ohjaukset ja normalisoinnit takaisin kysyttyyn nimeen, jotta
        # kutsuja löytää tuloksen sillä nimellä jonka se antoi.
        polku = {}
        for r in q.get("normalized", []) + q.get("redirects", []):
            polku[r["to"]] = polku.get(r["from"], r["from"])
        for sivu in (q.get("pages") or {}).values():
            otsikko = sivu.get("title", "")
            alkup = polku.get(otsikko, otsikko)
            if "missing" in sivu:
                ulos[alkup] = None
                continue
            rev = (sivu.get("revisions") or [{}])[0]
            ulos[alkup] = ((rev.get("slots") or {}).get("main") or {}).get("*") or ""
        for n in era:
            ulos.setdefault(n, None)
        time.sleep(1.0)
    return ulos


def lue(polku: Path):
    parit = []
    for rivi in polku.read_text(encoding="utf-8").splitlines():
        rivi = re.sub(r"^\d+[.)]\s*", "", rivi.strip())
        if not rivi or rivi.startswith("#"):
            continue
        nimi, _, arvo = rivi.partition("—")
        parit.append((nimi.strip(), arvo.strip()))
    return parit


def main() -> int:
    parit = lue(Path(sys.argv[1]))
    sivut = hae_sivut([n for n, _ in parit])

    # Väärä sivu tai puuttuva sivu: kokeillaan tarkennettuja otsikoita
    # ("Nimi (yhtye)"). Näitä on kymmeniä eikä satoja, joten ne haetaan
    # yksitellen. Tarkenteiden haku on oma pyyntönsä, joten se tehdään
    # vain niille joille se oikeasti tarvitaan.
    epaillyt = [n for n, _ in parit
                if not isinstance(sivut.get(n), str)
                or not MUSIIKKISANAT.search(sivut[n][:1500])]
    toiset = {}
    for n in epaillyt:
        time.sleep(1.0)
        tarkenteet = wikipedia_tarkenteet(n)
        if tarkenteet is VIRHE or not tarkenteet:
            continue
        for t, teksti in hae_sivut(list(tarkenteet)).items():
            if isinstance(teksti, str) and MUSIIKKISANAT.search(teksti[:1500]):
                toiset[n] = (teksti, t)
                break

    samat = eri = tyhjat = virheet = 0
    for nimi, oma in parit:
        teksti, sivu = toiset.get(nimi, (sivut.get(nimi), nimi))
        if teksti is VIRHE:
            print(f"VIRHE      {nimi}: haku ei onnistunut")
            virheet += 1
            continue
        if not teksti:
            print(f"EI SIVUA   {nimi}  (oma: {oma})")
            tyhjat += 1
            continue
        ib, johdanto = osat(teksti)
        loydot = []
        def lisaa(kunta, lahde):
            if kunta not in [k for k, _ in loydot]:
                loydot.append((kunta, lahde))
        for lahde, pala in (("tietolaatikko", ib), ("johdanto", johdanto)):
            for kunta in linkit(pala):
                lisaa(kunta, lahde)
        for lahde, pala in (("laatikkoteksti", " ".join(kentat(ib))),
                            ("johdanto", johdanto)):
            for kunta in taivutetut(pala):
                lisaa(kunta, lahde)
        if not loydot:
            print(f"EI PAIKKAA {nimi}  (oma: {oma})")
            tyhjat += 1
            continue
        kunnat = [k for k, _ in loydot]
        if oma in kunnat:
            samat += 1
            continue
        oma_mk, wiki_mk = maakunta(oma), maakunta(kunnat[0])
        lippu = "SAMA MAAKUNTA" if oma_mk and oma_mk == wiki_mk else "ERI"
        print(f"{lippu:13} {nimi}")
        print(f"              oma: {oma}   wikipedia: "
              + ", ".join(f"{k} ({l})" for k, l in loydot[:4]))
        for k in kentat(ib)[:3]:
            print(f"              {k}")
        if sivu != nimi:
            print(f"              sivu: {sivu}")
        eri += 1
        print()
    print(f"\nYHTEENVETO: {samat} täsmää, {eri} eroaa, "
          f"{tyhjat} ilman tietoa, {virheet} virhettä, "
          f"{len(parit)} yhteensä")
    return 0


if __name__ == "__main__":
    sys.exit(main())
