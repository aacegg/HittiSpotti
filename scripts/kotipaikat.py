#!/usr/bin/env python3
"""Kunta -> maakunta ArtistiSpotin kotipaikkasaraketta varten.

Pelissä kotipaikka toimii kuten Spotlen maa-sarake: vihreä tarkoittaa
samaa kuntaa, keltainen samaa maakuntaa. Keltainen noudattaa siis samaa
sääntöä kuin muutkin: arvattu arvo SISÄLTYY oikeaan, koska kunta on osa
maakuntaa. Se on hallinnollinen fakta eikä makuasia, toisin kuin
"rock on lähellä metallia".

TAULUKKO ON VAJAA JA SE ON TARKOITUS

Suomessa on yli 300 kuntaa, eikä niitä kaikkia kirjoiteta tähän
etukäteen. Tunnistamaton kunta on virhe joka pysäyttää ajon, ei arvaus:
väärä maakunta olisi hiljainen vika, joka näkyisi pelissä vain väärän
värisenä ruutuna, eikä kukaan osaisi raportoida sitä. Puuttuva kunta
lisätään tähän kun se ensimmäisen kerran tulee vastaan.

KUNTALIITOKSET

Lakkautetut kunnat ovat mukana omilla riveillään (Kuusankoski, Nurmo,
Jalasjärvi, Nilsiä...), koska artisti on kotoisin siitä paikasta jossa
hän kasvoi eikä siitä nimestä joka kartalla on nyt. Maakunta on sama
kummin päin tahansa, joten pelin kannalta ero ei näy, mutta lista saa
sanoa sen mitä ihminen kirjoittaisi.
"""

# Ulkomaalaisen kotipaikan maakunta. Peliin ei tarvita maakohtaista
# erottelua: artistit ovat suomalaisia, ja ulkomailla syntynyt on tässä
# sarakkeessa yksinkertaisesti "muualta".
ULKOMAAT = "Ulkomaat"

MAAKUNNAT = {
    "Uusimaa": [
        "Helsinki", "Espoo", "Vantaa", "Kauniainen", "Kerava", "Järvenpää",
        "Tuusula", "Nurmijärvi", "Hyvinkää", "Vihti", "Lohja", "Kirkkonummi",
        "Porvoo", "Loviisa", "Sipoo", "Mäntsälä", "Karkkila", "Raasepori",
        "Tammisaari", "Karjaa", "Inkoo", "Siuntio", "Askola", "Pornainen",
        "Pukkila", "Myrskylä", "Lapinjärvi", "Hanko", "Vantaankoski",
    ],
    "Varsinais-Suomi": [
        "Turku", "Salo", "Kaarina", "Raisio", "Naantali", "Lieto", "Paimio",
        "Uusikaupunki", "Laitila", "Loimaa", "Somero", "Parainen", "Masku",
        "Nousiainen", "Mynämäki", "Sauvo", "Kustavi", "Taivassalo", "Pöytyä",
        "Aura", "Marttila", "Koski Tl", "Rusko", "Vehmaa", "Pyhäranta",
    ],
    "Satakunta": [
        "Pori", "Rauma", "Ulvila", "Kankaanpää", "Harjavalta", "Kokemäki",
        "Huittinen", "Eura", "Eurajoki", "Nakkila", "Säkylä", "Noormarkku",
        "Merikarvia", "Pomarkku", "Jämijärvi", "Siikainen", "Luvia",
        "Karvia", "Honkajoki", "Kiikoinen", "Lavia", "Köyliö",
    ],
    "Kanta-Häme": [
        "Hämeenlinna", "Forssa", "Riihimäki", "Janakkala", "Hattula", "Loppi",
        "Tammela", "Hausjärvi", "Ypäjä", "Jokioinen", "Humppila", "Renko",
    ],
    "Pirkanmaa": [
        "Tampere", "Nokia", "Ylöjärvi", "Kangasala", "Lempäälä", "Pirkkala",
        "Valkeakoski", "Sastamala", "Akaa", "Orivesi", "Ikaalinen", "Parkano",
        "Virrat", "Mänttä", "Vilppula", "Mänttä-Vilppula", "Ruovesi",
        "Hämeenkyrö", "Vesilahti", "Punkalaidun", "Juupajoki", "Urjala",
        "Kihniö", "Vammala", "Toijala", "Viiala", "Kuru",
    ],
    "Päijät-Häme": [
        "Lahti", "Heinola", "Hollola", "Orimattila", "Asikkala", "Nastola",
        "Padasjoki", "Sysmä", "Hartola", "Kärkölä", "Iitti",
    ],
    "Kymenlaakso": [
        "Kouvola", "Kotka", "Hamina", "Pyhtää", "Miehikkälä", "Virolahti",
        "Kuusankoski", "Anjalankoski", "Elimäki", "Valkeala", "Jaala",
        "Karhula",
    ],
    "Etelä-Karjala": [
        "Lappeenranta", "Imatra", "Joutseno", "Lemi", "Luumäki", "Parikkala",
        "Rautjärvi", "Ruokolahti", "Savitaipale", "Taipalsaari", "Lappee",
    ],
    "Etelä-Savo": [
        "Mikkeli", "Savonlinna", "Pieksämäki", "Juva", "Mäntyharju",
        "Kangasniemi", "Puumala", "Rantasalmi", "Sulkava", "Hirvensalmi",
        "Joroinen", "Pertunmaa", "Enonkoski", "Savonranta", "Punkaharju",
    ],
    "Pohjois-Savo": [
        "Kuopio", "Iisalmi", "Varkaus", "Siilinjärvi", "Suonenjoki",
        "Lapinlahti", "Kiuruvesi", "Leppävirta", "Nilsiä", "Pielavesi",
        "Rautalampi", "Sonkajärvi", "Vieremä", "Kaavi", "Tuusniemi",
        "Juankoski", "Keitele", "Tervo", "Vesanto", "Rautavaara", "Maaninka",
    ],
    "Pohjois-Karjala": [
        "Joensuu", "Lieksa", "Nurmes", "Kitee", "Outokumpu", "Kontiolahti",
        "Liperi", "Ilomantsi", "Juuka", "Polvijärvi", "Rääkkylä",
        "Tohmajärvi", "Valtimo", "Heinävesi", "Kesälahti", "Eno", "Pyhäselkä",
    ],
    "Keski-Suomi": [
        "Jyväskylä", "Jämsä", "Äänekoski", "Keuruu", "Saarijärvi",
        "Viitasaari", "Laukaa", "Muurame", "Hankasalmi", "Konnevesi",
        "Karstula", "Pihtipudas", "Petäjävesi", "Uurainen", "Toivakka",
        "Joutsa", "Luhanka", "Kannonkoski", "Kinnula", "Kivijärvi",
        "Kyyjärvi", "Multia", "Jämsänkoski", "Korpilahti", "Suolahti",
    ],
    "Etelä-Pohjanmaa": [
        "Seinäjoki", "Lapua", "Kauhava", "Kauhajoki", "Kurikka", "Alavus",
        "Ähtäri", "Ilmajoki", "Jalasjärvi", "Nurmo", "Alajärvi", "Evijärvi",
        "Isojoki", "Karijoki", "Teuva", "Soini", "Vimpeli", "Lappajärvi",
        "Kuortane", "Ylihärmä", "Alahärmä", "Peräseinäjoki", "Ylistaro",
    ],
    "Pohjanmaa": [
        "Vaasa", "Pietarsaari", "Uusikaarlepyy", "Kristiinankaupunki",
        "Närpiö", "Mustasaari", "Vöyri", "Maalahti", "Korsnäs", "Kaskinen",
        "Laihia", "Isokyrö", "Pedersöre", "Luoto", "Kruunupyy", "Vähäkyrö",
        "Oravainen",
    ],
    "Keski-Pohjanmaa": [
        "Kokkola", "Kannus", "Toholampi", "Kaustinen", "Veteli", "Halsua",
        "Lestijärvi", "Perho",
    ],
    "Pohjois-Pohjanmaa": [
        "Oulu", "Raahe", "Ylivieska", "Kempele", "Kuusamo", "Nivala",
        "Haapajärvi", "Haapavesi", "Oulainen", "Kalajoki", "Pudasjärvi", "Ii",
        "Liminka", "Muhos", "Tyrnävä", "Siikajoki", "Pyhäjärvi", "Sievi",
        "Taivalkoski", "Utajärvi", "Vaala", "Kiiminki", "Haukipudas",
        "Oulunsalo", "Yli-Ii", "Pyhäjoki", "Reisjärvi", "Kärsämäki",
        "Pyhäntä", "Merijärvi", "Alavieska", "Hailuoto", "Lumijoki",
        "Siikalatva", "Ruukki",
    ],
    "Kainuu": [
        "Kajaani", "Kuhmo", "Suomussalmi", "Sotkamo", "Paltamo", "Puolanka",
        "Ristijärvi", "Hyrynsalmi",
    ],
    "Lappi": [
        "Rovaniemi", "Kemi", "Tornio", "Kemijärvi", "Sodankylä", "Inari",
        "Ivalo", "Kittilä", "Kolari", "Muonio", "Enontekiö", "Utsjoki",
        "Salla", "Pelkosenniemi", "Savukoski", "Posio", "Ranua", "Simo",
        "Keminmaa", "Tervola", "Ylitornio", "Pello", "Sirkka",
    ],
    "Ahvenanmaa": ["Maarianhamina", "Jomala", "Finström", "Lemland"],
}

# Suuralueet eli Tilastokeskuksen NUTS 2 -jako. Pelissä keltainen ruutu
# tarkoittaa samaa suuraluetta, ei samaa maakuntaa.
#
# Maakunta oli ensin, mutta se ei tuota keltaista: mitattuna 246
# artistista 142 on Uusimaalta ja heistä lähes kaikki Helsingistä, joten
# "sama maakunta mutta eri kunta" on harvinaista. Keltaisia tuli 5 %
# ruuduista. Suuralueella niitä on 10 %, ja sarakkeesta tulee toiseksi
# vahvin heti debyyttivuoden jälkeen.
#
# Virallinen jako eikä itse keksitty: karkea "etelä, länsi, itä,
# pohjoinen" antaisi enemmän keltaista (19 %) mutta rajat olisivat oma
# mielipide, ja silloin pelaaja voisi olla perustellusti eri mieltä
# siitä onko Jyväskylä idässä vai lännessä.
SUURALUEET = {
    "Uusimaa": "Helsinki-Uusimaa",
    "Kanta-Häme": "Etelä-Suomi",
    "Päijät-Häme": "Etelä-Suomi",
    "Kymenlaakso": "Etelä-Suomi",
    "Etelä-Karjala": "Etelä-Suomi",
    "Varsinais-Suomi": "Länsi-Suomi",
    "Satakunta": "Länsi-Suomi",
    "Pirkanmaa": "Länsi-Suomi",
    "Keski-Suomi": "Länsi-Suomi",
    "Etelä-Pohjanmaa": "Länsi-Suomi",
    "Pohjanmaa": "Länsi-Suomi",
    "Keski-Pohjanmaa": "Pohjois- ja Itä-Suomi",
    "Pohjois-Pohjanmaa": "Pohjois- ja Itä-Suomi",
    "Kainuu": "Pohjois- ja Itä-Suomi",
    "Lappi": "Pohjois- ja Itä-Suomi",
    "Etelä-Savo": "Pohjois- ja Itä-Suomi",
    "Pohjois-Savo": "Pohjois- ja Itä-Suomi",
    "Pohjois-Karjala": "Pohjois- ja Itä-Suomi",
    "Ahvenanmaa": "Ahvenanmaa",
    ULKOMAAT: ULKOMAAT,
}

# Käänteinen taulukko, jota muut skriptit käyttävät.
KUNNAT = {kunta: maakunta
          for maakunta, kunnat in MAAKUNNAT.items()
          for kunta in kunnat}


def maakunta(kunta: str):
    """Kunnan maakunta, tai None jos kuntaa ei tunneta.

    Palauttaa None eikä arvaa: kutsuja päättää mitä tuntemattomalle
    tehdään, ja kaikki nykyiset kutsujat pysähtyvät siihen.
    """
    kunta = (kunta or "").strip()
    if kunta == ULKOMAAT:
        return ULKOMAAT
    return KUNNAT.get(kunta)


def suuralue(kunta: str):
    """Kunnan suuralue, tai None jos kuntaa ei tunneta."""
    mk = maakunta(kunta)
    return SUURALUEET.get(mk) if mk else None


if __name__ == "__main__":
    # Kaksi kuntaa kahdessa maakunnassa olisi kirjoitusvirhe, ja se
    # katoaisi käänteistaulukkoon hiljaa: jälkimmäinen voittaisi.
    nahty = {}
    virheita = 0
    for mk, kunnat in MAAKUNNAT.items():
        for k in kunnat:
            if k in nahty:
                print(f"KAHDESTI: {k} ({nahty[k]} ja {mk})")
                virheita += 1
            nahty[k] = mk
    print(f"{len(KUNNAT)} kuntaa, {len(MAAKUNNAT)} maakuntaa, "
          f"{virheita} virhettä")
