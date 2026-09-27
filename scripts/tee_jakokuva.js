/* Piirtää linkin esikatselukuvan jakokuva.jpg (og:image, 1200 x 630).
 *
 *   NODE_PATH=/opt/node22/lib/node_modules node scripts/tee_jakokuva.js
 *
 * Aja aina kun katalogi muuttuu. Kuvassa lukee biisimäärä ja vuosihaarukka,
 * ja ne luetaan katalogi.jsonista eikä kirjoiteta tähän käsin.
 *
 * MIKSI SKRIPTI EIKÄ KUVA
 *
 * Kuva piirrettiin ennen kertaluontoisella skriptillä jota ei tallennettu,
 * ja luvut kirjoitettiin siihen käsin. Kun katalogi kasvoi 942:sta
 * 1 887:ään, kuvassa luki yhä 942, eikä kukaan huomannut: kuva näkyy vain
 * kun linkki jaetaan, ei koskaan pelissä itsessään. Käsin kirjoitettu
 * luku vanhenee ensimmäisessä katalogimuutoksessa, luettu ei koskaan.
 *
 * Samasta syystä vuosihaarukka luetaan eikä kirjoiteta: vanhin biisi
 * vaihtui 1953:sta 1949:ään kun Tapsan vuosi korjattiin, eikä se ollut
 * kenenkään mielessä kuvan kannalta.
 *
 * Ulkoasu on sama kuin aiemmassa kuvassa pikselilleen: sama hehku,
 * sanamerkki, otsikko ja pillerit. Muuttuvat vain luvut.
 *
 * Canvas eikä HTML-sivun kuvakaappaus, koska canvasissa jokaisen
 * elementin paikka on luku eikä asettelun tulos: kuva pysyy samana vaikka
 * selaimen oletustyylit tai fonttien metriikat muuttuisivat. Fontti
 * ladataan omista tiedostoista data-osoitteena, joten palvelinta ei
 * tarvita eikä järjestelmän fonttivalikoima vaikuta mihinkään. */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const JUURI = path.join(__dirname, "..");

function luvut() {
  const katalogi = JSON.parse(fs.readFileSync(path.join(JUURI, "katalogi.json"), "utf8"));
  // Sama ehto kuin pelissä: peli === false on täyte eikä arvattava biisi.
  const pelattavat = katalogi.filter((s) => s.peli !== false);
  const vuodet = pelattavat.map((s) => s.year).filter(Number.isInteger);
  return {
    maara: pelattavat.length,
    alku: Math.min(...vuodet),
    loppu: Math.max(...vuodet),
  };
}

// Tuhaterotin sitovana välilyöntinä, kuten pelin omissa teksteissä:
// "1 887" ei saa katketa kahdelle riville.
const tuhannet = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

function fonttiCss() {
  return ["bricolage-latin.woff2", "bricolage-latin-ext.woff2"].map((tiedosto) => {
    const data = fs.readFileSync(path.join(JUURI, "fonts", tiedosto)).toString("base64");
    return `@font-face { font-family: "Bricolage Grotesque"; font-weight: 400 800;
      src: url(data:font/woff2;base64,${data}) format("woff2"); }`;
  }).join("\n");
}

async function piirra(alateksti) {
  const selain = await chromium.launch();
  const sivu = await selain.newPage({ viewport: { width: 1200, height: 630 } });
  await sivu.setContent(`<!doctype html><meta charset="utf-8"><style>${fonttiCss()}</style>`);
  const kuva = await sivu.evaluate(async (alateksti) => {
    const N = '"Bricolage Grotesque", sans-serif';
    // Jokainen paksuus ladataan erikseen: canvas ei odota fonttia itse, ja
    // lataamaton paksuus piirtyisi hiljaa varafontilla.
    for (const paksuus of [400, 600, 800]) await document.fonts.load(`${paksuus} 40px ${N}`);
    await document.fonts.ready;

    const W = 1200, H = 630, R = 88;
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const g = c.getContext("2d");
    g.fillStyle = "#0a0908"; g.fillRect(0, 0, W, H);

    // Sama hehku kuin sivulla, soivan biisin värissä.
    const hehku = g.createRadialGradient(W * .5, H * .34, 0, W * .5, H * .34, W * .5);
    hehku.addColorStop(0, "rgba(245,179,46,0.13)");
    hehku.addColorStop(1, "rgba(245,179,46,0)");
    g.fillStyle = hehku; g.fillRect(0, 0, W, H);
    g.textBaseline = "alphabetic";

    // Sanamerkki: sama viiden palkin aaltomuoto kuin favicon.svg:ssä.
    const TV = ["#5ecf9a", "#bcd14a", "#f5b32e", "#ff8a4c", "#ff5f6d"];
    const MH = [19.6, 34.8, 46, 28.4, 39.6];
    const mk = 26 / 46;
    g.lineCap = "round"; g.lineWidth = 8 * mk;
    MH.forEach((h, i) => {
      const kx = R + (i * 11 + 4) * mk;
      g.strokeStyle = TV[i];
      g.beginPath();
      g.moveTo(kx, 165 - 4 * mk);
      g.lineTo(kx, 165 - (h - 4) * mk);
      g.stroke();
    });
    const MX = R + 52 * mk + 14;
    g.font = `800 40px ${N}`; g.fillStyle = "#f2ebdf";
    g.fillText("Hitti", MX, 165);
    const lev = g.measureText("Hitti").width;
    g.font = `400 40px ${N}`; g.fillText("Spotti", MX + lev, 165);

    // Otsikko
    g.font = `800 78px ${N}`;
    g.fillStyle = "#f2ebdf"; g.fillText("Tunnistatko biisin ", R, 288);
    const w1 = g.measureText("Tunnistatko biisin ").width;
    g.fillStyle = "#f5b32e"; g.fillText("0,1", R + w1, 288);
    g.fillText("sekunnista?", R, 372);

    // Alaotsikko ja luvut
    g.font = `400 30px ${N}`; g.fillStyle = "#8a8073";
    g.fillText("Musiikkivisa suomalaisilla biiseillä.", R, 448);
    g.fillText("Uudet viisi joka päivä.", R, 488);
    g.font = `400 22px ${N}`; g.fillStyle = "#5b544a";
    g.fillText(alateksti, R, 552);

    // Pillerit oikeaan alanurkkaan
    const pillerit = [["Helppo", "#5ecf9a", true], ["Vaikea", "#8a8073", false],
                      ["Mahdoton", "#ff5f6d", false]];
    g.font = `600 22px ${N}`;
    let x = W - R;
    for (const [teksti, vari, tayte] of pillerit.slice().reverse()) {
      const tw = g.measureText(teksti).width, pw = tw + 48, y = 512, ph = 46;
      x -= pw;
      g.beginPath();
      g.roundRect(x, y, pw, ph, 999);
      if (tayte) { g.fillStyle = vari; g.fill(); g.fillStyle = "#17120a"; }
      else { g.strokeStyle = vari; g.lineWidth = 2; g.stroke(); g.fillStyle = vari; }
      g.fillText(teksti, x + 24, y + 31);
      x -= 16;
    }

    // Tarkistus: jos fontti ei latautunut, "Hitti" mitataan varafontilla ja
    // leveys poikkeaa. Parempi kaatua kuin julkaista väärällä fontilla.
    g.font = `800 40px ${N}`;
    const varmistus = document.fonts.check(`800 40px ${N}`);
    return { data: c.toDataURL("image/jpeg", 0.88), fontti: varmistus };
  }, alateksti);
  await selain.close();
  if (!kuva.fontti) throw new Error("Bricolage Grotesque ei latautunut, kuvaa ei tallennettu");
  return Buffer.from(kuva.data.split(",")[1], "base64");
}

(async () => {
  const { maara, alku, loppu } = luvut();
  const alateksti = `${tuhannet(maara)} suomibiisiä · ${alku}–${loppu}`;
  const kohde = path.join(JUURI, "jakokuva.jpg");
  fs.writeFileSync(kohde, await piirra(alateksti));
  console.log(`jakokuva.jpg: "${alateksti}", ${Math.round(fs.statSync(kohde).size / 1024)} kt`);
})();
