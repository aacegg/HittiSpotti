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

function vastaus(body, status, origin, tyyppi = "application/json") {
  const h = { "content-type": tyyppi + "; charset=utf-8" };
  if (origin) {
    h["access-control-allow-origin"] = origin;
    h["vary"] = "Origin";
  }
  return new Response(body, { status, headers: h });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const origin = SALLITUT.includes(req.headers.get("origin")) ? req.headers.get("origin") : null;

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: origin ? {
        "access-control-allow-origin": origin,
        "access-control-allow-methods": "POST, OPTIONS",
        "access-control-allow-headers": "content-type",
        "access-control-max-age": "86400",
      } : {} });
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
