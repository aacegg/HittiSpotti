-- Yksi rivi biisiä kohti, ei tapahtumarivejä. Taulu ei siis kasva pelaajien
-- eikä ajan mukana: enintään yhtä monta riviä kuin katalogissa on biisejä.
--
-- osumia on aina a0..a4:n summa, joten kierroksia - osumia kertoo montako
-- kertaa biisi jäi tunnistamatta. Se on tallennettu erikseen, jotta kyselyt
-- pysyvät luettavina.
CREATE TABLE IF NOT EXISTS biisi (
  id         INTEGER PRIMARY KEY,   -- iTunesin kappaletunniste
  taso       INTEGER NOT NULL,      -- katalogin nykyinen vaikeustaso 1-5
  kierroksia INTEGER NOT NULL DEFAULT 0,
  osumia     INTEGER NOT NULL DEFAULT 0,
  a0         INTEGER NOT NULL DEFAULT 0,   -- tunnistettu 0,1 sekunnista
  a1         INTEGER NOT NULL DEFAULT 0,   -- 0,5 s
  a2         INTEGER NOT NULL DEFAULT 0,   -- 2 s
  a3         INTEGER NOT NULL DEFAULT 0,   -- 8 s
  a4         INTEGER NOT NULL DEFAULT 0,   -- 15 s
  -- Pelaajan oma arvio biisin vaikeudesta, "Miltä tämä tuntui?" -rivi.
  -- Eri asia kuin a0..a4: nuo kertovat mitä pelaaja teki, nämä mitä hän
  -- ajatteli. Yksi sarake kutakin vastausvaihtoehtoa kohti, jotta jakauma
  -- säilyy eikä pelkkä keskiarvo.
  arvio1     INTEGER NOT NULL DEFAULT 0,   -- Helppo
  arvio2     INTEGER NOT NULL DEFAULT 0,   -- Keskitaso
  arvio3     INTEGER NOT NULL DEFAULT 0,   -- Vaikea
  arvio4     INTEGER NOT NULL DEFAULT 0,   -- Mestari
  arvio5     INTEGER NOT NULL DEFAULT 0    -- Mahdoton
);

CREATE INDEX IF NOT EXISTS biisi_kierroksia ON biisi (kierroksia DESC);

-- Päivän sarjojen koosteet, yksi rivi päivää kohti. Sama periaate kuin
-- yllä: ei tapahtumarivejä, joten mikään ei yhdistä pelaajan suorituksia
-- toisiinsa eikä taulu kasva pelaajamäärän mukana, vaan 365 riviä vuodessa.
--
-- Määritelmä on kokonaisuudessaan tiedostossa migraatio-paiva.sql, joka
-- ajetaan olemassa olevaan tietokantaan. Tässä sama, jotta tyhjästä
-- luotu kanta saa kaiken yhdellä ajolla.
CREATE TABLE IF NOT EXISTS paiva (
  paiva  TEXT PRIMARY KEY,
  n      INTEGER NOT NULL DEFAULT 0,
  summa  INTEGER NOT NULL DEFAULT 0,
  k0  INTEGER NOT NULL DEFAULT 0,
  k1  INTEGER NOT NULL DEFAULT 0,
  k2  INTEGER NOT NULL DEFAULT 0,
  k3  INTEGER NOT NULL DEFAULT 0,
  k4  INTEGER NOT NULL DEFAULT 0,
  k5  INTEGER NOT NULL DEFAULT 0,
  k6  INTEGER NOT NULL DEFAULT 0,
  k7  INTEGER NOT NULL DEFAULT 0,
  k8  INTEGER NOT NULL DEFAULT 0,
  k9  INTEGER NOT NULL DEFAULT 0,
  k10 INTEGER NOT NULL DEFAULT 0,
  k11 INTEGER NOT NULL DEFAULT 0,
  k12 INTEGER NOT NULL DEFAULT 0
);
