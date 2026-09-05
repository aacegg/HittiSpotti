-- Lisää arviosarakkeet olemassa olevaan tauluun.
--
-- Aja tämä D1-konsolissa kerran, ENNEN kuin julkaiset uuden workerin.
-- Uusi worker lukee näitä sarakkeita, joten ilman tätä /tilastot kaatuisi.
--
-- Jos taulu on luotu vasta äskettäin schema.sql:llä, sarakkeet ovat jo
-- paikallaan ja nämä rivit antavat virheen "duplicate column name". Se on
-- silloin oikea vastaus eikä vaadi toimenpiteitä.
ALTER TABLE biisi ADD COLUMN arvio1 INTEGER NOT NULL DEFAULT 0;
ALTER TABLE biisi ADD COLUMN arvio2 INTEGER NOT NULL DEFAULT 0;
ALTER TABLE biisi ADD COLUMN arvio3 INTEGER NOT NULL DEFAULT 0;
ALTER TABLE biisi ADD COLUMN arvio4 INTEGER NOT NULL DEFAULT 0;
ALTER TABLE biisi ADD COLUMN arvio5 INTEGER NOT NULL DEFAULT 0;
