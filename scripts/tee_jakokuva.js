/* Piirtää linkkien esikatselukuvat (og:image, 1200 x 630):
 *
 *   jakokuva.jpg    etusivu, index.html
 *   haastekuva.jpg  kaverihaasteen kutsu, haaste/index.html
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
 * Ulkoasu seuraa pelin ilmettä: tumma pohja, Zilla Slab -otsikot,
 * Nunito Sans -teksti, tason värinen soitin ja sarjan viisi ruutua
 * tasopalkkeineen.
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
  const tiedostot = [
    ["Zilla Slab", "700", "zilla-slab-700-latin.woff2"],
    ["Zilla Slab", "700", "zilla-slab-700-latin-ext.woff2"],
    ["Nunito Sans", "400 800", "nunito-sans-latin.woff2"],
    ["Nunito Sans", "400 800", "nunito-sans-latin-ext.woff2"],
  ];
  return tiedostot.map(([nimi, paino, tiedosto]) => {
    const data = fs.readFileSync(path.join(JUURI, "fonts", tiedosto)).toString("base64");
    return `@font-face { font-family: "${nimi}"; font-weight: ${paino};
      src: url(data:font/woff2;base64,${data}) format("woff2"); }`;
  }).join("\n");
}

/* Yhteiset piirtoapurit sivun sisällä. Merkkijonona, koska evaluate ajaa
 * ne selaimessa. */
const APURIT = `
  const S = '"Zilla Slab", serif', T = '"Nunito Sans", sans-serif';
  const TV = ["#5ecf9a", "#bcd14a", "#f5b32e", "#ff8a4c", "#ff5f6d"];
  async function lataaFontit() {
    await document.fonts.load("700 40px " + S);
    for (const p of [400, 700, 800]) await document.fonts.load(p + " 40px " + T);
    await document.fonts.ready;
    return document.fonts.check("700 40px " + S) && document.fonts.check("800 40px " + T);
  }
  // Tasomittari: viisi nousevaa palkkia, tason verran täysiä.
  function mittari(g, x, y, korkeus, taso, vari) {
    const lev = korkeus * .2, vali = korkeus * .14;
    for (let i = 0; i < 5; i++) {
      const h = korkeus * (.36 + i * .16);
      g.globalAlpha = i < taso ? 1 : .28;
      g.fillStyle = vari;
      g.beginPath(); g.roundRect(x + i * (lev + vali), y + korkeus - h, lev, h, lev * .3); g.fill();
    }
    g.globalAlpha = 1;
    return 5 * lev + 4 * vali;
  }
  function sanamerkki(g, x, y, koko, keskelle) {
    g.font = "700 " + koko + "px " + S;
    const tw = g.measureText("HittiSpotti").width, mk = koko * .62, vali = koko * .3;
    const mw = mk * (5 * .2 + 4 * .14);
    if (keskelle) x -= (mw + vali + tw) / 2;
    // Merkissä jokainen palkki omalla tasovärillään.
    for (let i = 0; i < 5; i++) {
      const lev = mk * .2, v = mk * .14, h = mk * (.36 + i * .16);
      g.fillStyle = TV[i]; g.beginPath(); g.roundRect(x + i * (lev + v), y - h, lev, h, lev * .3); g.fill();
    }
    g.fillStyle = "#f2f0f7"; g.textAlign = "left";
    g.fillText("HittiSpotti", x + mw + vali, y);
  }
`;

async function piirra(alateksti) {
  const selain = await chromium.launch();
  const sivu = await selain.newPage({ viewport: { width: 1200, height: 630 } });
  await sivu.setContent(`<!doctype html><meta charset="utf-8"><style>${fonttiCss()}</style>`);
  await sivu.addScriptTag({ content: APURIT });
  const kuva = await sivu.evaluate(async (alateksti) => {
    const fontti = await lataaFontit();
    const W = 1200, H = 630, R = 88;
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const g = c.getContext("2d");
    g.fillStyle = "#121016"; g.fillRect(0, 0, W, H);
    g.textBaseline = "alphabetic";

    sanamerkki(g, R, 132, 40, false);

    // Otsikko slabilla, 0,1 tason vihreällä.
    g.font = `700 72px ${S}`;
    g.fillStyle = "#f2f0f7"; g.fillText("Tunnistatko biisin", R, 258);
    g.font = `800 72px ${T}`; g.fillStyle = "#5ecf9a"; g.fillText("0,1", R, 338);
    const w1 = g.measureText("0,1 ").width;
    g.font = `700 72px ${S}`; g.fillStyle = "#f2f0f7"; g.fillText("sekunnista?", R + w1, 338);

    g.font = `400 30px ${T}`; g.fillStyle = "#ada7bd";
    g.fillText("Musiikkivisa suomalaisilla biiseillä.", R, 414);
    g.fillText("Viisi uutta biisiä joka päivä.", R, 454);
    g.font = `700 24px ${T}`; g.fillStyle = "#9c96ad";
    g.fillText(alateksti, R, 552);

    // Soitin oikealla: tason värinen nappi ja sen tummempi reuna.
    const KX = 935, KY = 268, KR = 142;
    g.fillStyle = "#3a8a66"; g.beginPath(); g.arc(KX, KY + 14, KR, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#5ecf9a"; g.beginPath(); g.arc(KX, KY, KR, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#15121a"; g.beginPath();
    g.moveTo(KX - 34, KY - 56); g.lineTo(KX + 60, KY); g.lineTo(KX - 34, KY + 56); g.closePath(); g.fill();

    // Sarjan viisi ruutua tasopalkkeineen soittimen alla.
    const rw = 62, rh = 50, rv = 10, rx0 = KX - (5 * rw + 4 * rv) / 2, ry = 476;
    for (let i = 0; i < 5; i++) {
      const x = rx0 + i * (rw + rv);
      g.beginPath(); g.roundRect(x, ry, rw, rh, 10);
      if (i === 0) { g.fillStyle = TV[0]; g.fill(); }
      else { g.strokeStyle = TV[i]; g.lineWidth = 3; g.stroke(); }
      const mw = 5 * 4.8 + 4 * 3.4;
      mittari(g, x + (rw - mw) / 2, ry + 13, 24, i + 1, i === 0 ? "#15121a" : TV[i]);
    }
    return { data: c.toDataURL("image/jpeg", 0.9), fontti };
  }, alateksti);
  await selain.close();
  if (!kuva.fontti) throw new Error("Kirjasimet eivät latautuneet, kuvaa ei tallennettu");
  return Buffer.from(kuva.data.split(",")[1], "base64");
}

/* Kaverihaasteen kutsukuva.
 *
 * Haastelinkki näytti ennen samaa esikatselua kuin etusivu, eikä
 * vastaanottaja voinut tietää että häntä haastetaan: chatissa näkyi vain
 * "tunnistatko suomibiisin 0,1 sekunnista?". Tämä kertoo sen ensimmäisenä.
 *
 * Kaikki on keskitetty eikä vasemmassa reunassa kuten jakokuvassa, koska
 * osa sovelluksista (esimerkiksi Snapchat) näyttää esikatselusta vain
 * keskeltä leikatun neliön. Otsikko mahtuu siksi 600 pikselin leveyteen:
 * sen ulkopuolelle jäävä teksti on lisätietoa, jota ilmankin kutsu
 * ymmärretään. */
async function piirraHaaste() {
  const selain = await chromium.launch();
  const sivu = await selain.newPage({ viewport: { width: 1200, height: 630 } });
  await sivu.setContent(`<!doctype html><meta charset="utf-8"><style>${fonttiCss()}</style>`);
  await sivu.addScriptTag({ content: APURIT });
  const kuva = await sivu.evaluate(async () => {
    const fontti = await lataaFontit();
    const W = 1200, H = 630, KX = W / 2, NELIO = 600;
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const g = c.getContext("2d");
    g.fillStyle = "#121016"; g.fillRect(0, 0, W, H);
    g.textBaseline = "alphabetic";

    sanamerkki(g, KX, 112, 36, true);

    // Merkki kaverihaasteen magentalla, kuten pelin valikossa.
    g.textAlign = "center";
    g.font = `800 24px ${T}`;
    const pTeksti = "Kaverihaaste";
    const pw = g.measureText(pTeksti).width + 44, ph = 44, py = 152;
    g.beginPath(); g.roundRect(KX - pw / 2, py, pw, ph, 10);
    g.fillStyle = "#c23b8f"; g.fill();
    g.fillStyle = "#ffffff"; g.fillText(pTeksti, KX, py + 30);

    // Otsikko: pienennetään kunnes pisin rivi mahtuu keskineliöön.
    let koko = 112;
    const rivit = [["Sinut on", "#f2f0f7"], ["haastettu!", "#e0559f"]];
    for (;;) {
      g.font = `700 ${koko}px ${S}`;
      const levein = Math.max(...rivit.map(([t]) => g.measureText(t).width));
      if (levein <= NELIO - 40 || koko <= 60) break;
      koko -= 2;
    }
    g.fillStyle = rivit[0][1]; g.fillText(rivit[0][0], KX, 318);
    g.fillStyle = rivit[1][1]; g.fillText(rivit[1][0], KX, 318 + koko * 0.95);

    g.font = `400 28px ${T}`; g.fillStyle = "#ada7bd";
    g.fillText("Samat biisit sinulle ja kaverille. Kumpi tunnistaa nopeammin?", KX, 518);
    g.font = `700 26px ${S}`; g.fillStyle = "#f2f0f7";
    g.fillText("hittispotti.fi", KX, 572);
    return { data: c.toDataURL("image/jpeg", 0.9), fontti };
  });
  await selain.close();
  if (!kuva.fontti) throw new Error("Kirjasimet eivät latautuneet, kuvaa ei tallennettu");
  return Buffer.from(kuva.data.split(",")[1], "base64");
}

(async () => {
  const { maara, alku, loppu } = luvut();
  const alateksti = `${tuhannet(maara)} suomibiisiä vuosilta ${alku}–${loppu}`;
  const kohde = path.join(JUURI, "jakokuva.jpg");
  fs.writeFileSync(kohde, await piirra(alateksti));
  console.log(`jakokuva.jpg: "${alateksti}", ${Math.round(fs.statSync(kohde).size / 1024)} kt`);

  const haaste = path.join(JUURI, "haastekuva.jpg");
  fs.writeFileSync(haaste, await piirraHaaste());
  console.log(`haastekuva.jpg: ${Math.round(fs.statSync(haaste).size / 1024)} kt`);
})();
