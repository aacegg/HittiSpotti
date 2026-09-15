-- Päivän sarjojen koosteet. Aja kerran olemassa olevaan tietokantaan:
--   npx wrangler d1 execute hittispotti --remote --file=palvelin/migraatio-paiva.sql
--
-- Yksi rivi päivää kohti, ei rivi pelaajaa kohti. Samasta syystä kuin
-- biisi-taulussa: kun tapahtumarivejä ei ole, ei ole mitään mikä voisi
-- yhdistää pelaajan suorituksia toisiinsa, eikä taulu kasva pelaajamäärän
-- mukana. 365 riviä vuodessa.
--
-- Päivä on PELAAJAN oma päivä eikä palvelimen, koska pelin pakka johdetaan
-- selaimen päivämäärästä. Eri aikavyöhykkeellä on eri pakka, joten se on
-- oikeasti eri päivä eikä sama päivä väärässä ajassa.
CREATE TABLE IF NOT EXISTS paiva (
  paiva  TEXT PRIMARY KEY,           -- "2026-09-16"
  n      INTEGER NOT NULL DEFAULT 0, -- montako sarjaa pelattu loppuun
  summa  INTEGER NOT NULL DEFAULT 0, -- pisteiden summa, keskiarvoa varten

  -- Jakauma 500 pisteen koreissa, 0..6000 eli 13 koria. Pelkkä keskiarvo
  -- valehtelisi: kesken jättäneiden nollat painavat sitä alas, jolloin
  -- "keskiarvo 612" ei kerro mitään siitä miten sarjan loppuun pelanneet
  -- pärjäsivät. Jakaumasta saa myös mediaanin ja sen mikä on pelaajalle
  -- kiinnostavin luku: monenko prosentin ohi menit.
  --
  -- Korit erillisinä sarakkeina eikä JSONina, jotta kasvatus on atominen
  -- SQL-lause eikä lue-muokkaa-kirjoita. Sama tapa kuin biisi-taulun
  -- a0..a4 ja arvio1..arvio5.
  k0  INTEGER NOT NULL DEFAULT 0,    --    0-499
  k1  INTEGER NOT NULL DEFAULT 0,    --  500-999
  k2  INTEGER NOT NULL DEFAULT 0,    -- 1000-1499
  k3  INTEGER NOT NULL DEFAULT 0,
  k4  INTEGER NOT NULL DEFAULT 0,
  k5  INTEGER NOT NULL DEFAULT 0,
  k6  INTEGER NOT NULL DEFAULT 0,
  k7  INTEGER NOT NULL DEFAULT 0,
  k8  INTEGER NOT NULL DEFAULT 0,
  k9  INTEGER NOT NULL DEFAULT 0,
  k10 INTEGER NOT NULL DEFAULT 0,
  k11 INTEGER NOT NULL DEFAULT 0,    -- 5500-5999
  k12 INTEGER NOT NULL DEFAULT 0     -- 6000, eli kaikki viisi 0,1 sekunnista
);
