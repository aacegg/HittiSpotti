/* HittiSpotin tilastopalvelin.
 *
 * Yksi tehtävä: kerätä kaikilta pelaajilta tieto siitä, monenko sekunnin
 * pätkästä kukin biisi tunnistetaan. Se on ainoa luotettava tapa tarkentaa
 * vaikeustasoja, koska askel on käyttäytymistä eikä mielipidettä.
 *
 * Tallennus on koosteita, ei tapahtumarivejä. Kaksi syytä:
 *   1. Yksityisyys. Kun rivejä ei ole, ei ole myöskään mitään mikä voisi
 *      yhdistää saman pelaajan kierroksia toisiinsa. Palvelin ei tallenna
 *      IP-osoitetta, aikaleimaa kierrostasolla eikä tunnistetta.
 *   2. Koko. Taulussa on enintään yksi rivi biisiä kohti, eli alle tuhat
 *      riviä ikuisesti. Tapahtumarivit kasvaisivat rajatta.
 *
 * Vastineeksi menetetään aikasarja: emme näe muuttuiko biisin vaikeus
 * vuoden aikana. Se ei ole tämän datan käyttötarkoitus.
 */

const SALLITUT = ["https://hittispotti.fi", "https://www.hittispotti.fi"];

/* Kelpuutetaan vain se mitä peli oikeasti lähettää. Osoite on julkinen,
 * joten kuka tahansa voi lähettää sinne mitä tahansa; tiukka tarkistus on
 * ainoa asia joka pitää taulun järkevänä. */
function kelpaa(k) {
  return k
    && Number.isInteger(k.id) && k.id > 0 && k.id < 1e13
    && Number.isInteger(k.taso) && k.taso >= 1 && k.taso <= 5
    && Number.isInteger(k.askel) && k.askel >= 0 && k.askel <= 4
    && typeof k.osui === "boolean"
    && (k.tila === "daily" || k.tila === "free");
}

/* Arvio on pelaajan oma mielipide biisin vaikeudesta, 1-5. Se on eri asia
 * kuin askel: askel mittaa mitä ihminen teki, arvio mitä hän ajatteli.
 * Molemmat tallennetaan, jotta niitä voi verrata keskenään. */
function arvioKelpaa(k) {
  return k
    && Number.isInteger(k.id) && k.id > 0 && k.id < 1e13
    && Number.isInteger(k.taso) && k.taso >= 1 && k.taso <= 5
    && Number.isInteger(k.arvio) && k.arvio >= 1 && k.arvio <= 5;
}

/* Päivän sarjan tulos. Viisi biisiä ja paras askel on 1200 pistettä, joten
 * 6000 on maksimi eikä bonuksia ole. Osoite on julkinen, joten yläraja on
 * ainoa este sille ettei joku syötä miljoonaa ja pilaa keskiarvoa.
 *
 * Päivä on pelaajan oma, koska pakka johdetaan selaimen päivämäärästä.
 * Kelpuutetaan kahden vuorokauden haarukka palvelimen päivästä: se kattaa
 * kaikki aikavyöhykkeet mutta estää rivien kylvämisen mielivaltaisille
 * päiville. */
const MAKSIMI = 6000;
const KORI = 500;

function paivaKelpaa(k) {
  if (!k || !Number.isInteger(k.pisteet) || k.pisteet < 0 || k.pisteet > MAKSIMI) return false;
  if (typeof k.paiva !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(k.paiva)) return false;
  const ero = Math.abs(Date.parse(k.paiva + "T00:00:00Z") - Date.now());
  return Number.isFinite(ero) && ero < 2 * 86400 * 1000;
}

function vastaus(body, status, origin, tyyppi = "application/json") {
  const h = { "content-type": tyyppi + "; charset=utf-8" };
  if (origin) {
    h["access-control-allow-origin"] = origin;
    h["vary"] = "Origin";
  }
  return new Response(body, { status, headers: h });
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const origin = SALLITUT.includes(req.headers.get("origin")) ? req.headers.get("origin") : null;

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: origin ? {
        "access-control-allow-origin": origin,
        "access-control-allow-methods": "GET, POST, OPTIONS",
        "access-control-allow-headers": "content-type",
        "access-control-max-age": "86400",
      } : {} });
    }

    /* ---- Koosteen julkinen luku ----
     *
     * Peli näyttää paljastuksessa miten muut pärjäsivät samalla biisillä.
     * Luvut ovat samat jotka on jo kerätty: montako kierrosta, montako
     * osumaa ja miten osumat jakautuivat pätkän pituuden mukaan.
     *
     * Tämä ei paljasta pelaajista mitään. Taulussa ei ole tapahtumarivejä
     * eikä tunnisteita, joten koosteesta ei voi päätellä ketään yksittäistä.
     *
     * Vastaus ei sisällä kynnystä pienelle otokselle: palvelin kertoo mitä
     * tietää, ja peli päättää milloin luku on tarpeeksi suuri näytettäväksi.
     * Näin kynnystä voi muuttaa julkaisematta Workeria uudelleen.
     */
    if (req.method === "GET" && url.pathname === "/koonti") {
      const idt = [...new Set((url.searchParams.get("id") || "").split(",")
        .map((s) => parseInt(s, 10))
        .filter((n) => Number.isInteger(n) && n > 0 && n < 1e13))];
      if (!idt.length || idt.length > 10) {
        return vastaus('{"virhe":"väärä määrä"}', 400, origin);
      }

      /* Järjestetty tunnistelista tekee avaimesta vakaan: päivän sarja on
       * kaikille sama, joten kaikkien pelaajien pyyntö on sama pyyntö ja
       * osuu reunavälimuistiin. D1:tä kosketaan kerran viidessä minuutissa
       * eikä kerran pelaajaa kohti.
       *
       * Origin on osa avainta eikä pelkkä Vary-otsake. Vastauksen CORS-otsake
       * riippuu pyytäjästä, ja vastaus() jättää Varyn pois silloin kun origin
       * ei ole sallittu. Jos ensimmäinen pyyntö tulisi ilman originia, ilman
       * Varya tallentunut vastaus tarjoiltaisiin myös pelille, jolloin siitä
       * puuttuisi CORS-otsake ja selain estäisi sen. Avaimessa ne pysyvät
       * erillään ilman että Varyn varaan tarvitsee luottaa. */
      idt.sort((a, b) => a - b);
      const avain = new Request(url.origin + "/koonti?id=" + idt.join(",")
        + "&o=" + encodeURIComponent(origin || "-"));
      const valimuisti = caches.default;
      const osuma = await valimuisti.match(avain);
      if (osuma) return osuma;

      const paikat = idt.map((_, i) => "?" + (i + 1)).join(",");
      const { results } = await env.DB.prepare(
        `SELECT id, kierroksia, osumia, a0, a1, a2, a3, a4
         FROM biisi WHERE id IN (${paikat})`
      ).bind(...idt).all();

      /* Lyhyet nimet: vastaus lähtee jokaiselle pelaajalle, joten turha
       * tavu maksaa moninkertaisesti. n on kierrosten määrä, o osumat ja
       * a niiden jakauma pätkän pituuden mukaan. */
      const ulos = results.map((r) => ({
        id: r.id, n: r.kierroksia, o: r.osumia,
        a: [r.a0, r.a1, r.a2, r.a3, r.a4],
      }));

      const vast = vastaus(JSON.stringify(ulos), 200, origin);
      /* Viisi minuuttia riittää: luvut muuttuvat hitaasti eikä kukaan
       * huomaa jos osuusprosentti on minuutin vanha. Vary: Origin on jo
       * vastaus()-apurin asettama, joten sallitut originit eivät sekoitu. */
      vast.headers.set("cache-control", "public, max-age=300");
      ctx.waitUntil(valimuisti.put(avain, vast.clone()));
      return vast;
    }

    // ---- Kierrosten vastaanotto ----
    if (req.method === "POST" && url.pathname === "/kierros") {
      // Peli lähettää sendBeaconilla tyyppinä text/plain, jolloin selain ei
      // tee esikyselyä lainkaan. Sisältö on silti JSONia.
      const teksti = await req.text();
      if (teksti.length > 4000) return vastaus('{"virhe":"liian iso"}', 413, origin);

      let data;
      try { data = JSON.parse(teksti); } catch { return vastaus('{"virhe":"ei JSONia"}', 400, origin); }

      const erä = Array.isArray(data) ? data : [data];
      if (!erä.length || erä.length > 10) return vastaus('{"virhe":"väärä määrä"}', 400, origin);
      if (!erä.every(kelpaa)) return vastaus('{"virhe":"kelpaamaton kierros"}', 400, origin);

      /* Yksi upsert kierrosta kohti. osumia on aina a0..a4:n summa, joten
       * kierroksia - osumia kertoo montako kertaa biisi jäi tunnistamatta. */
      const lauseet = erä.map((k) => {
        const a = [0, 0, 0, 0, 0];
        if (k.osui) a[k.askel] = 1;
        return env.DB.prepare(`
          INSERT INTO biisi (id, taso, kierroksia, osumia, a0, a1, a2, a3, a4)
          VALUES (?1, ?2, 1, ?3, ?4, ?5, ?6, ?7, ?8)
          ON CONFLICT(id) DO UPDATE SET
            taso = excluded.taso,
            kierroksia = biisi.kierroksia + 1,
            osumia = biisi.osumia + excluded.osumia,
            a0 = biisi.a0 + excluded.a0,
            a1 = biisi.a1 + excluded.a1,
            a2 = biisi.a2 + excluded.a2,
            a3 = biisi.a3 + excluded.a3,
            a4 = biisi.a4 + excluded.a4
        `).bind(k.id, k.taso, k.osui ? 1 : 0, a[0], a[1], a[2], a[3], a[4]);
      });
      await env.DB.batch(lauseet);
      return vastaus('{"ok":true}', 200, origin);
    }

    /* ---- Päivän sarjan tuloksen vastaanotto ----
     *
     * Lähetetään vain kun päivän sarja on pelattu loppuun. Kesken jääneet
     * eivät kuulu vertailulukuun: "muut saivat keskimäärin 612" tarkoittaa
     * niitä jotka pelasivat saman sarjan alusta loppuun. */
    if (req.method === "POST" && url.pathname === "/paiva") {
      const teksti = await req.text();
      if (teksti.length > 200) return vastaus('{"virhe":"liian iso"}', 413, origin);
      let k;
      try { k = JSON.parse(teksti); } catch { return vastaus('{"virhe":"ei JSONia"}', 400, origin); }
      if (!paivaKelpaa(k)) return vastaus('{"virhe":"kelpaamaton tulos"}', 400, origin);

      /* Korin nimi rakennetaan vasta tarkistuksen jälkeen ja vain luvusta
       * joka on todistetusti 0..6000, joten SQL:ään ei pääse mitään
       * pelaajan syöttämää. Math.min kattaa tasan 6000:n, joka jakautuisi
       * muuten koriin 12 vasta pyöristyksen armosta. */
      const kori = "k" + Math.min(Math.floor(k.pisteet / KORI), MAKSIMI / KORI);
      /* RETURNING antaa luvut samasta kirjoituksesta, joten järjestysluku on
       * tarkka. Erillinen luku ei kelpaisi: /paiva on välimuistissa minuutin,
       * ja "olit päivän 7. pelaaja" on väite joka ei saa olla vanha.
       *
       * Palautetaan koko kooste, jolloin tulossivu ei tarvitse toista
       * pyyntöä lainkaan. Luvut ovat kasvatuksen JÄLKEISET eli sisältävät
       * pelaajan oman tuloksen; peli vähentää sen itse, jotta sana "muut"
       * pitää kirjaimellisesti paikkansa. */
      const UPSERT = `
        INSERT INTO paiva (paiva, n, summa, ${kori}) VALUES (?1, 1, ?2, 1)
        ON CONFLICT(paiva) DO UPDATE SET
          n = paiva.n + 1,
          summa = paiva.summa + excluded.summa,
          ${kori} = paiva.${kori} + 1`;
      const SARAKKEET = "n, summa, k0,k1,k2,k3,k4,k5,k6,k7,k8,k9,k10,k11,k12";

      /* Varapolku. RETURNING on SQLiten ominaisuus eikä sitä ole voitu
       * kokeilla oikeaa D1:tä vastaan, ja jos se ei toimisi, koko tuloksen
       * tallennus kaatuisi. Siksi kirjoitus ja luku erikseen jos yhdistetty
       * lause ei mene läpi.
       *
       * Erillisessä luvussa on teoriassa kilpa-ajo: toinen pelaaja voi ehtiä
       * väliin ja järjestysluku kasvaa yhdellä liikaa. Millisekunnin ikkuna
       * ja noin yksi pelaaja minuutissa tekee siitä äärimmäisen harvinaisen,
       * ja väärä väite "olit 8." kahdeksannen sijaan on vaaraton. */
      let rivi;
      try {
        rivi = await env.DB.prepare(UPSERT + `\n RETURNING ${SARAKKEET}`)
          .bind(k.paiva, k.pisteet).first();
      } catch {
        rivi = null;
      }
      if (!rivi) {
        await env.DB.prepare(UPSERT).bind(k.paiva, k.pisteet).run();
        rivi = await env.DB.prepare(
          `SELECT ${SARAKKEET} FROM paiva WHERE paiva = ?1`).bind(k.paiva).first();
      }
      if (!rivi) return vastaus('{"ok":true}', 200, origin);

      return vastaus(JSON.stringify({
        ok: true,
        sija: rivi.n,
        n: rivi.n,
        summa: rivi.summa,
        k: Array.from({ length: 13 }, (_, i) => rivi["k" + i]),
      }), 200, origin);
    }

    /* ---- Päivän koosteen luku ----
     *
     * Palauttaa raa'at luvut ja peli laskee niistä keskiarvon, mediaanin ja
     * persentiilin. Sama periaate kuin /koonti-reitillä: kun palvelin ei
     * päätä esitystapaa, sitä voi muuttaa julkaisematta Workeria.
     */
    if (req.method === "GET" && url.pathname === "/paiva") {
      const p = url.searchParams.get("p") || "";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(p)) {
        return vastaus('{"virhe":"kelpaamaton päivä"}', 400, origin);
      }

      const avain = new Request(url.origin + "/paiva?p=" + p
        + "&o=" + encodeURIComponent(origin || "-"));
      const valimuisti = caches.default;
      const osuma = await valimuisti.match(avain);
      if (osuma) return osuma;

      const rivi = await env.DB.prepare(
        `SELECT n, summa, k0,k1,k2,k3,k4,k5,k6,k7,k8,k9,k10,k11,k12
         FROM paiva WHERE paiva = ?1`
      ).bind(p).first();

      const ulos = rivi
        ? { n: rivi.n, summa: rivi.summa,
            k: Array.from({ length: 13 }, (_, i) => rivi["k" + i]) }
        : { n: 0, summa: 0, k: Array(13).fill(0) };

      const vast = vastaus(JSON.stringify(ulos), 200, origin);
      /* Lyhyempi kuin biisikoosteen viisi minuuttia, koska kuluvan päivän
       * luku kasvaa koko ajan. Minuutin viive on silti tarkoituksellinen:
       * pelaajan oma tulos ei ehdi mukaan omaan vertailuunsa, mikä on juuri
       * se mitä sana "muut" lupaa. */
      vast.headers.set("cache-control", "public, max-age=60");
      ctx.waitUntil(valimuisti.put(avain, vast.clone()));
      return vast;
    }

    // ---- Arvioiden vastaanotto ----
    if (req.method === "POST" && url.pathname === "/arvio") {
      const teksti = await req.text();
      if (teksti.length > 1000) return vastaus('{"virhe":"liian iso"}', 413, origin);
      let k;
      try { k = JSON.parse(teksti); } catch { return vastaus('{"virhe":"ei JSONia"}', 400, origin); }
      if (!arvioKelpaa(k)) return vastaus('{"virhe":"kelpaamaton arvio"}', 400, origin);

      /* Sarake valitaan arvion mukaan. Nimi rakennetaan vasta tarkistuksen
       * jälkeen ja vain sallituista arvoista, joten SQL:ään ei pääse mitään
       * pelaajan syöttämää. */
      const sarake = "arvio" + k.arvio;
      await env.DB.prepare(`
        INSERT INTO biisi (id, taso, ${sarake}) VALUES (?1, ?2, 1)
        ON CONFLICT(id) DO UPDATE SET
          taso = excluded.taso,
          ${sarake} = biisi.${sarake} + 1
      `).bind(k.id, k.taso).run();
      return vastaus('{"ok":true}', 200, origin);
    }

    // ---- Koosteen luku ----
    if (req.method === "GET" && url.pathname === "/tilastot") {
      if (!env.AVAIN || url.searchParams.get("avain") !== env.AVAIN) {
        return vastaus('{"virhe":"väärä avain"}', 403, null);
      }
      const { results } = await env.DB.prepare(
        "SELECT id, taso, kierroksia, osumia, a0, a1, a2, a3, a4, " +
        "arvio1, arvio2, arvio3, arvio4, arvio5 FROM biisi ORDER BY kierroksia DESC"
      ).all();

      if (url.searchParams.get("muoto") === "json") {
        return vastaus(JSON.stringify(results), 200, null);
      }
      const sarakkeet = ["id", "taso", "kierroksia", "osumia", "a0", "a1", "a2", "a3", "a4",
        "arvio1", "arvio2", "arvio3", "arvio4", "arvio5"];
      const rivit = [sarakkeet.join(",")];
      for (const r of results) rivit.push(sarakkeet.map((c) => r[c]).join(","));
      return vastaus(rivit.join("\n"), 200, null, "text/csv");
    }

    return vastaus('{"virhe":"ei löydy"}', 404, origin);
  },
};
