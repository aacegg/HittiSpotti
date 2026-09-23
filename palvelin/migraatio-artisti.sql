-- Päivän artisti -pelin koosteet. Aja kerran olemassa olevaan kantaan:
--   npx wrangler d1 execute hittispotti --remote --file=palvelin/migraatio-artisti.sql
--
-- OMA TAULU EIKÄ SARAKE paiva-TAULUUN
--
-- Vaihtoehtoja oli kaksi: lisätä paiva-tauluun sarake peli ja tehdä
-- avaimesta (paiva, peli), tai antaa artistipelille oma taulu. Oma taulu
-- valittiin kahdesta syystä.
--
-- 1. Avaimen muuttaminen vaatii SQLitessä taulun uudelleenluonnin: uusi
--    taulu, rivien kopiointi, vanhan poisto, uudelleennimeäminen. Se
--    tehtäisiin tuotantokantaan jossa on oikeaa dataa. Tämä tiedosto sen
--    sijaan vain luo uuden taulun eikä koske olemassa olevaan mitenkään.
--
-- 2. Datan muoto on eri. Biisipelissä tulos on 0-6000 pistettä ja jakauma
--    on 13 koria 500 pisteen välein. Artistipelissä tulos on se monellako
--    arvauksella artisti ratkesi, eli 1-6 tai ei lainkaan. Samaan tauluun
--    pakotettuna toisen pelin sarakkeet olisivat aina nollia.
--
-- Yksi rivi päivää kohti, ei rivi pelaajaa kohti. Sama periaate kuin
-- muualla: kun tapahtumarivejä ei ole, ei ole mitään mikä voisi yhdistää
-- pelaajan suorituksia toisiinsa, eikä taulu kasva pelaajamäärän mukana.
--
-- Päivä on PELAAJAN oma päivä eikä palvelimen, koska päivän artisti
-- johdetaan selaimen päivämäärästä. Eri aikavyöhykkeellä on eri artisti,
-- joten se on oikeasti eri päivä eikä sama päivä väärässä ajassa.
CREATE TABLE IF NOT EXISTS paiva_artisti (
  paiva TEXT PRIMARY KEY,           -- "2026-09-23"
  n     INTEGER NOT NULL DEFAULT 0, -- montako pelasi päivän loppuun

  -- Jakauma: monellako arvauksella artisti ratkesi. Erillisinä sarakkeina
  -- eikä JSONina, jotta kasvatus on atominen SQL-lause eikä
  -- lue-muokkaa-kirjoita. Sama tapa kuin paiva-taulun k0..k12.
  --
  -- Keskiarvoa varten ei tarvita omaa summa-saraketta: arvausten summa on
  -- 1*g1 + 2*g2 + ... + 6*g6, joten se lasketaan koreista. Biisipelissä
  -- summa tarvitaan, koska pisteet eivät ole johdettavissa koreista.
  g1  INTEGER NOT NULL DEFAULT 0,   -- ratkesi ensimmäisellä arvauksella
  g2  INTEGER NOT NULL DEFAULT 0,
  g3  INTEGER NOT NULL DEFAULT 0,
  g4  INTEGER NOT NULL DEFAULT 0,
  g5  INTEGER NOT NULL DEFAULT 0,
  g6  INTEGER NOT NULL DEFAULT 0,   -- ratkesi vasta viimeisellä
  epa INTEGER NOT NULL DEFAULT 0    -- ei ratkennut kuudella arvauksella
);
