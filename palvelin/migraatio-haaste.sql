-- Kaverihaasteen tulokset. Aja kerran olemassa olevaan kantaan (julkaisu
-- tekee sen automaattisesti, ks. .github/workflows/palvelin.yml):
--   cd palvelin
--   npx wrangler d1 execute hittispotti --remote --file=migraatio-haaste.sql
--
-- Yksi rivi pelaajaa kohti haastetta kohti. Toisin kuin muissa tauluissa
-- tässä on rivi per pelaaja, koska vertailun koko idea on näyttää kuka sai
-- mitäkin. Siksi tallennetaan vain se mitä vertailu tarvitsee:
--   pelaaja  satunnainen tunniste, jonka peli arpoo laitteelle. Ei yhdistä
--            mihinkään muuhun eikä sitä palauteta kenellekään.
--   nimi     pelaajan itse kirjoittama nimimerkki
--   pisteet  haasteen pisteet tähän asti
--   pelatut  montako kierrosta pelattu
--   aika     viimeisin päivitys, vanhojen rivien siivousta varten
--
-- Rivit poistetaan 60 päivän päästä viimeisestä päivityksestä.
CREATE TABLE IF NOT EXISTS haaste_tulos (
  koodi    TEXT NOT NULL,
  pelaaja  TEXT NOT NULL,
  nimi     TEXT NOT NULL,
  pisteet  INTEGER NOT NULL,
  pelatut  INTEGER NOT NULL,
  aika     INTEGER NOT NULL,
  PRIMARY KEY (koodi, pelaaja)
);
