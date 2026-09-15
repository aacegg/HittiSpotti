/* Testisivun service worker. Laajuus on /testi/, joten tämä ei koske
 * oikeaa peliä: service workerin laajuudessa tarkin voittaa.
 *
 * Tehtävä on yksi: tehdä testisivusta asennuskelpoinen. Chrome vaatii
 * manifestin JA service workerin jolla on fetch-käsittelijä ennen kuin se
 * laukaisee beforeinstallprompt-tapahtuman.
 *
 * Välimuistia ei käytetä kuin verkon kaatuessa, jottei testisivu voi jäädä
 * jumiin vanhaan versioon.
 *
 * Poistaminen: selaimen kehitystyökaluista Application -> Service Workers
 * -> Unregister, tai koko sivuston tiedot tyhjentämällä.
 */
const VERSIO = "hittispotti-testi-t6";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (e) => e.waitUntil((async () => {
  const nimet = await caches.keys();
  await Promise.all(nimet
    .filter((n) => n.startsWith("hittispotti-testi-") && n !== VERSIO)
    .map((n) => caches.delete(n)));
  await self.clients.claim();
})()));

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith((async () => {
    try {
      const vastaus = await fetch(e.request);
      if (vastaus.ok) {
        const c = await caches.open(VERSIO);
        c.put(e.request, vastaus.clone());
      }
      return vastaus;
    } catch (err) {
      const osuma = await caches.match(e.request);
      if (osuma) return osuma;
      throw err;
    }
  })());
});
