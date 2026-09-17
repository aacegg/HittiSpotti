#!/usr/bin/env python3
"""Rakentaa itsenäisen arviointityökalun songs.json:in pohjalta.

    python3 scripts/tee_arviointi.py            # rakentaa työkalun
    python3 scripts/tee_arviointi.py --kuitattu  # merkitsee uudet käsitellyiksi

Kirjoittaa arviointi.html, joka toimii sekä paikallisesti avattuna että
sivustolta. Biisitiedot upotetaan tiedostoon, joten se ei tarvitse palvelinta.
Pätkät ja kansikuvat haetaan Applelta niin kuin pelissäkin.

Sivu julkaistaan sivustolle, mutta siihen ei ole linkkiä mistään eikä
hakukoneita päästetä indeksoimaan sitä. Se ei näytä mitään, mitä julkinen
songs.json ei jo kertoisi.
"""
import json
import math
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SONGS = ROOT / "songs.json"
OUT = ROOT / "arviointi.html"
# Muistaa mitkä biisit olivat mukana viime generoinnilla, jotta uudet
# erottuvat työkalussa eikä niitä tarvitse etsiä käsin.
TILA = ROOT / ".arviointi-tunnetut.json"
# Mitatut äänitasot, ks. scripts/mittaa_aanet.py. Vapaaehtoinen: ilman
# sitä työkalu toimii ennallaan, vain desibelimerkinnät puuttuvat.
AANET = ROOT / ".aanitasot.json"

TIER_NAMES = {1: "Helppo", 2: "Keskitaso", 3: "Vaikea", 4: "Mestari", 5: "Mahdoton"}

TEMPLATE = """<!doctype html>
<html lang="fi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="color-scheme" content="dark">
<title>HittiSpotti – vaikeustasojen arviointi</title>
<style>
:root {
  --bg: #0a0908; --lift: #14120f; --line: #2a2521; --soft: #1b1815;
  --text: #f2ebdf; --muted: #8a8073; --dim: #5f584e;
  --t1: #5ecf9a; --t2: #bcd14a; --t3: #f5b32e; --t4: #ff8a4c; --t5: #ff5f6d;
  --sans: system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font-family: var(--sans); font-size: 15px; }

/* Yläpalkki pysyy näkyvissä, koska sieltä katsoo edistymisen ja suodattimet. */
header {
  position: sticky; top: 0; z-index: 5;
  background: var(--bg); border-bottom: 1px solid var(--line);
  padding: 12px 16px 10px;
}
h1 { margin: 0 0 8px; font-size: 17px; letter-spacing: -.02em; }
h1 small { font-weight: 400; color: var(--muted); font-size: 13px; margin-left: 8px; }

.bar { display: flex; flex-wrap: wrap; gap: 7px; align-items: center; }
select, input[type=search], button {
  font: inherit; color: inherit;
  background: var(--lift); border: 1px solid var(--line); border-radius: 4px;
  padding: 6px 9px; cursor: pointer;
}
input[type=search] { min-width: 190px; cursor: text; }
button:hover { border-color: var(--muted); }
.spacer { flex: 1; }

.progress { height: 3px; background: var(--soft); margin: 10px -16px -10px; }
.progress i { display: block; height: 100%; background: var(--t1); width: 0; transition: width .2s; }

.hint { padding: 10px 16px; color: var(--dim); font-size: 12.5px; border-bottom: 1px solid var(--soft); }
kbd {
  background: var(--lift); border: 1px solid var(--line); border-bottom-width: 2px;
  border-radius: 3px; padding: 1px 5px; font: inherit; font-size: 11px; color: var(--text);
}

ol { list-style: none; margin: 0; padding: 0 0 40vh; }
li {
  display: grid;
  grid-template-columns: 40px 44px 1fr auto;
  gap: 12px; align-items: center;
  padding: 8px 16px; border-bottom: 1px solid var(--soft);
  scroll-margin-top: 130px;
}
li.is-at { background: var(--lift); box-shadow: inset 3px 0 0 var(--text); }
li.is-gone { opacity: .35; }
li.is-gone .name { text-decoration: line-through; }

.soittimet { display: flex; flex-direction: column; gap: 4px; }
.play { width: 34px; height: 34px; padding: 0; border-radius: 50%; display: grid; place-items: center; }
.play.is-on { background: var(--t1); border-color: var(--t1); color: #101010; }
/* Lataus erottuu soitosta. Ilman tätä 0,1 sekunnin pätkällä ei näe eroa
   siihen että pätkä jo soi ja meni ohi: hitaalla yhteydellä nappi olisi
   vain hetken päällä eikä kuuluisi mitään. */
.play.on-lataa { background: var(--soft); border-color: var(--line); color: var(--muted); animation: syke 1s ease-in-out infinite; }
@keyframes syke { 50% { opacity: .45; } }
/* Lyhyt pätkä on se mitä pelaaja oikeasti kuulee ensin, joten se on oma
   nappinsa eikä piilotettu asetus. Pienempi kuin 15 s nappi, koska se on
   tarkistus eikä se jolla biisi tunnistetaan. */
.play.lyhyt { height: 26px; font-size: 11px; font-weight: 700; letter-spacing: -.02em; }

/* Mitattu äänitaso. Vain poikkeamat näytetään, jottei rivi täyty luvuista
   joilla ei tee mitään. */
.aani {
  margin-left: 8px; padding: 1px 6px; border-radius: 999px;
  background: var(--soft); color: var(--muted);
  font-size: 10px; font-weight: 700; letter-spacing: .04em;
  vertical-align: 1px; white-space: nowrap;
}
.aani.on-varo { background: #3a2f10; color: #f5b32e; }
.aani.on-vaara { background: #3a1416; color: #ff5f6d; }
img { width: 44px; height: 44px; border-radius: 3px; object-fit: cover; background: var(--soft); }
.name { font-weight: 600; letter-spacing: -.01em; }
.uusi {
  margin-left: 8px; padding: 1px 6px; border-radius: 999px;
  background: var(--t1); color: #101010;
  font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase;
  vertical-align: 1px;
}
.sub { color: var(--muted); font-size: 12.5px; }
.sub b { color: var(--dim); font-weight: 600; }

.tiers { display: flex; gap: 4px; }
.t {
  min-width: 30px; padding: 5px 0; text-align: center;
  font-size: 12px; font-weight: 600; font-variant-numeric: tabular-nums;
  border-radius: 999px; background: transparent; color: var(--dim);
}
.t[data-t="1"].on { background: var(--t1); border-color: var(--t1); color: #101010; }
.t[data-t="2"].on { background: var(--t2); border-color: var(--t2); color: #101010; }
.t[data-t="3"].on { background: var(--t3); border-color: var(--t3); color: #101010; }
.t[data-t="4"].on { background: var(--t4); border-color: var(--t4); color: #101010; }
.t[data-t="5"].on { background: var(--t5); border-color: var(--t5); color: #101010; }
/* Alkuperäinen taso näkyy reunuksena, oma arvio täyttönä: näet mitä muutit. */
.t.was { border-color: currentColor; color: var(--muted); }
.t.on.was { color: #101010; }
.del { color: var(--dim); padding: 5px 9px; }
.del:hover { color: var(--t5); border-color: var(--t5); }

dialog {
  background: var(--lift); color: var(--text); border: 1px solid var(--line);
  border-radius: 6px; padding: 18px; width: min(680px, 92vw);
}
dialog::backdrop { background: rgba(0,0,0,.7); }
textarea {
  width: 100%; height: 46vh; margin-top: 10px;
  background: var(--bg); color: var(--text);
  border: 1px solid var(--line); border-radius: 4px; padding: 10px;
  font-family: ui-monospace, Menlo, monospace; font-size: 12px;
}
.empty { padding: 40px 16px; color: var(--dim); text-align: center; }

/* ---------- Puhelin ----------
   Työtila on tehty näppäimistölle, mutta kosketuksella rivi ei mahdu yhdelle
   riville: nimi ja viisi tasonappia vaativat molemmat leveyttä. Rivi jaetaan
   kahteen kerrokseen ja napeista tehdään sormenkokoisia. */
@media (max-width: 720px) {
  body { font-size: 16px; }
  header { padding: 10px 12px 8px; }
  /* Edistymispalkin negatiivinen marginaali on sidottu yläpalkin sisennykseen;
     kapeammassa sisennyksessä se työntyisi ruudun ulkopuolelle. */
  .progress { margin: 8px -12px -8px; }
  h1 { font-size: 15px; }
  h1 small { display: block; margin: 2px 0 0; font-size: 12px; }
  .bar { gap: 6px; }
  select, input[type=search] { flex: 1 1 46%; min-width: 0; padding: 9px 8px; }
  #export { flex: 1 1 100%; padding: 10px; }
  .spacer { display: none; }
  .hint { display: none; }   /* näppäinohjeet eivät koske kosketusta */

  li {
    grid-template-columns: 44px 1fr;
    grid-template-areas: "play teksti" "tasot tasot";
    gap: 10px 12px;
    padding: 12px;
    scroll-margin-top: 150px;
  }
  li > .soittimet { grid-area: play; }
  li > .soittimet .play { width: 44px; height: 44px; }
  li > .soittimet .play.lyhyt { height: 32px; font-size: 12px; }
  li > img { display: none; }        /* kansi vie tilaa jota nimi tarvitsee */
  li > div:not(.bar) { grid-area: teksti; min-width: 0; }
  li > .bar { grid-area: tasot; gap: 6px; }
  .name { font-size: 15px; }
  .tiers { flex: 1; gap: 5px; }
  .t { flex: 1; min-width: 0; padding: 13px 0; font-size: 14px; }
  .del { padding: 13px 14px; font-size: 13px; }
  dialog { padding: 14px; }
  textarea { height: 40vh; }
}
</style>
</head>
<body>

<header>
  <h1>Vaikeustasojen arviointi <small id="count"></small></h1>
  <div class="bar">
    <select id="f-tier">
      <option value="">kaikki tasot</option>
      <option value="1">Helppo</option><option value="2">Keskitaso</option>
      <option value="3">Vaikea</option><option value="4">Mestari</option>
      <option value="5">Mahdoton</option>
    </select>
    <select id="f-decade"><option value="">kaikki vuosikymmenet</option></select>
    <select id="f-done">
      <option value="">arvioidut ja arvioimattomat</option>
      <option value="no">vain arvioimattomat</option>
      <option value="yes">vain arvioidut</option>
      <option value="changed">vain muutetut</option>
      <option value="new">vain uudet biisit</option>
      <option value="filler">vain täytebiisit</option>
      <option value="hiljaiset">vain hiljaiset (alle -10 dB)</option>
    </select>
    <input type="search" id="f-text" placeholder="artisti tai biisi" spellcheck="false">
    <span class="spacer"></span>
    <button id="export">Vie arviot</button>
  </div>
  <div class="progress"><i id="bar"></i></div>
</header>

<p class="hint">
  <kbd>1</kbd>–<kbd>5</kbd> antaa tason ja siirtyy seuraavaan &nbsp;·&nbsp;
  <kbd>välilyönti</kbd> soittaa 15 s &nbsp;·&nbsp;
  <kbd>enter</kbd> soittaa saman 0,1 s pätkän jonka pelaaja saa ensin &nbsp;·&nbsp;
  <kbd>X</kbd> merkitsee poistettavaksi &nbsp;·&nbsp;
  <kbd>↑</kbd><kbd>↓</kbd> liikkuu &nbsp;·&nbsp;
  <kbd>0</kbd> poistaa oman arvion.
  Arviot tallentuvat selaimeen automaattisesti.
</p>

<ol id="list"></ol>

<dialog id="dlg">
  <strong>Kopioi tämä ja liitä chattiin</strong>
  <textarea id="out" readonly></textarea>
  <div class="bar" style="margin-top:10px">
    <button id="copy">Kopioi leikepöydälle</button>
    <span class="spacer"></span>
    <button id="close">Sulje</button>
  </div>
</dialog>

<script>
const SONGS = __DATA__;
const NAMES = {1:"Helppo",2:"Keskitaso",3:"Vaikea",4:"Mestari",5:"Mahdoton"};
/* Oma avain, joka ei ala "hittispotti:" – peli tallentaa samalle sivustolle ja
   sen tilastojen nollaus pyyhkii kaikki sillä alkavat avaimet. */
const KEY = "hittispotti-arviointi:tila2";
/* Avain vaihtui, koska vanha tallennus oli virheellinen ja sen perintö on
   vaarallista. Vanha versio kirjoitti muistiin koko "gone"-joukon, johon
   kuuluivat myös katalogin täytebiisit. Kun täyte myöhemmin nostettiin
   peliin, se jäi silti muistiin poistettuna, ja seuraava vienti ilmoitti
   sen taas poistettavaksi. Mitattu seuraus: 76 biisiä, jotka oli juuri
   nostettu peliin, putosivat takaisin täytteiksi ilman että kukaan painoi
   mitään. Vanhasta avaimesta luetaan siksi vain arviot. */
const VANHA_KEY = "hittispotti-arviointi:tila";

let saved = { arviot: {}, poista: [], palauta: [] };
try {
  const uusi = JSON.parse(localStorage.getItem(KEY) || "null");
  if (uusi) saved = Object.assign(saved, uusi);
  else {
    const vanha = JSON.parse(localStorage.getItem(VANHA_KEY) || "{}");
    if (vanha.arviot) saved.arviot = vanha.arviot;   // poista jätetään lukematta
  }
} catch {}
const rate = new Map(Object.entries(saved.arviot).map(([k, v]) => [Number(k), v]));

/* Kolme joukkoa, ei yhtä. Katalogin täytteet ovat tosiasia, omat merkinnät
   ovat mielipide, ja ne on pidettävä erillään: muuten tosiasia tallentuu
   mielipiteenä ja jää elämään senkin jälkeen kun se ei enää pidä paikkaansa. */
const TAYTTEET = new Set(SONGS.filter((s) => s.peli === false).map((s) => s.id));
const omatPois = new Set(saved.poista);        // itse merkityt poistettavaksi
const omatTakaisin = new Set(saved.palauta);   // itse palautetut täytteet

// Näyttöä varten johdettu joukko. Kaikki lukijat käyttävät tätä.
const gone = new Set(
  [...TAYTTEET, ...omatPois].filter((id) => !omatTakaisin.has(id)));

const $ = (s) => document.querySelector(s);
const list = $("#list");
let shown = [];
let at = 0;

function save() {
  // Vain omat merkinnät talteen. Katalogin täytteet luetaan joka kerta
  // uudelleen SONGS:sta, joten ne eivät voi vanhentua muistiin.
  localStorage.setItem(KEY, JSON.stringify({
    arviot: Object.fromEntries(rate),
    poista: [...omatPois], palauta: [...omatTakaisin],
  }));
  progress();
}

function progress() {
  const done = new Set([...rate.keys(), ...gone]).size;
  $("#count").textContent = `${done} / ${SONGS.length} käyty · ${gone.size} poistettavaa`;
  $("#bar").style.width = (done / SONGS.length * 100) + "%";
}

/* Soitin, joka aloittaa samasta kohdasta kuin peli.
 *
 * Tämä oli ennen pelkkä <audio>, joka aloitti sekunnista 0 ja soitti 15 s.
 * Peli hyppää hiljaisuuden yli ja soittaa ensin 0,1 sekuntia, joten arvioija
 * kuuli eri asian kuin pelaaja. Mitattu seuraus: Finlandia Op.26:ssa on
 * 6,06 sekuntia tasan nollia ja sen jälkeen hidas nousu. 15 sekunnin pätkänä
 * se kuulosti tavalliselta biisiltä ja sai tason 2, mutta pelin 0,1 sekunnin
 * pätkä siitä on käytännössä äänetön.
 *
 * Aloituskohta lasketaan tismalleen samalla koodilla kuin app.js:ssä. Jos
 * pelin findAudioStart muuttuu, tämä on muutettava myös.
 *
 * Purkuun tarvitaan Web Audio, koska <audio> ei kerro näytteitä. Jos selain
 * ei pysty purkamaan AAC:tä, palataan <audio>-elementtiin ja aloituskohta
 * asetetaan currentTimellä: karkeampi mutta parempi kuin ei mitään. Sama
 * varareitti on pelissä. */
let ctx = null;
const puskurit = new Map();
const alut = new Map();

function findAudioStart(buffer) {
  const data = buffer.getChannelData(0);
  const sr = buffer.sampleRate;
  let peak = 0;
  for (let i = 0; i < data.length; i++) {
    const v = Math.abs(data[i]);
    if (v > peak) peak = v;
  }
  if (peak < 0.005) return 0;
  const threshold = Math.max(peak * 0.02, 0.004);
  const win = Math.max(1, Math.round(sr * 0.01));
  for (let i = 0; i + win <= data.length; i += win) {
    let sum = 0;
    for (let j = i; j < i + win; j++) sum += data[j] * data[j];
    if (Math.sqrt(sum / win) >= threshold) return Math.max(0, i / sr - 0.03);
  }
  return 0;
}

async function puskuri(song) {
  if (puskurit.has(song.id)) return puskurit.get(song.id);
  const res = await fetch(song.preview);
  const buf = await ctx.decodeAudioData(await res.arrayBuffer());
  puskurit.set(song.id, buf);
  alut.set(song.id, findAudioStart(buf));
  return buf;
}

/* Aloituskohta: mieluiten selaimessa puretusta äänestä, muuten etukäteen
   mitattu. Molemmat on laskettu samalla säännöllä (app.js:n findAudioStart),
   joten ne eivät voi olla eri mieltä kuin pyöristyksen verran. */
const aloitus = (song) => alut.has(song.id) ? alut.get(song.id) : (song.alku || 0);

const vara = new Audio();
vara.preload = "none";
let lahde = null, timer = 0, playingId = null;

function seis() {
  clearTimeout(timer);
  if (lahde) { try { lahde.stop(); } catch {} lahde = null; }
  vara.pause();
  document.querySelectorAll(".play.is-on").forEach((b) => b.classList.remove("is-on", "on-lataa"));
  playingId = null;
}

async function play(song, btn, sekunnit) {
  const sama = playingId === song.id + ":" + sekunnit;
  seis();
  if (sama) return;
  playingId = song.id + ":" + sekunnit;
  if (btn) { btn.classList.add("is-on"); btn.classList.add("on-lataa"); }
  ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === "suspended") ctx.resume();
  try {
    const buf = await puskuri(song);
    if (playingId !== song.id + ":" + sekunnit) return;   // ehdittiin painaa muuta
    if (btn) btn.classList.remove("on-lataa");
    const alku = aloitus(song);
    /* Lyhyeen pätkään tarvitaan häivytys, muuten katkaisu naksahtaa.
       Sama 8 ms kuin pelissä, ja 0,1 sekunnissa se on jo kuultava osa
       pätkää - juuri siksi tämä on se mitä pelaaja oikeasti saa. */
    const fade = Math.min(0.008, sekunnit / 4);
    const g = ctx.createGain();
    const nyt = ctx.currentTime + 0.02;
    g.gain.setValueAtTime(0, nyt);
    g.gain.linearRampToValueAtTime(1, nyt + fade);
    g.gain.setValueAtTime(1, nyt + sekunnit - fade);
    g.gain.linearRampToValueAtTime(0, nyt + sekunnit);
    g.connect(ctx.destination);
    lahde = ctx.createBufferSource();
    lahde.buffer = buf;
    lahde.connect(g);
    lahde.start(nyt, alku);
    lahde.stop(nyt + sekunnit + 0.05);
  } catch (e) {
    /* Purku ei onnistunut: <audio>-varareitti.
     *
     * Aloituskohta otetaan silloin mittausdatasta eikä nollasta. Se on koko
     * muutoksen ydin: jos varareitti aloittaisi alusta, työkalu palaisi juuri
     * siihen harhaan josta tässä yritetään eroon, ja hiljaisella biisillä
     * kuulisi taas pelkkää tyhjää. Pelissä sama varareitti aloittaa nollasta,
     * koska siellä ei ole mitattua lukua käytettävissä.
     *
     * currentTime ennen kuin metadata on ladattu ei aina pure, joten se
     * asetetaan myös loadedmetadata-tapahtumassa. */
    if (btn) btn.classList.remove("on-lataa");
    const alku = aloitus(song);
    vara.src = song.preview;
    const aseta = () => { try { vara.currentTime = alku; } catch {} };
    vara.addEventListener("loadedmetadata", aseta, { once: true });
    aseta();
    vara.play().catch(() => {});
  }
  timer = setTimeout(seis, sekunnit * 1000 + 120);
}

function decades() {
  const d = [...new Set(SONGS.map((s) => s.year && Math.floor(s.year / 10) * 10).filter(Boolean))].sort();
  $("#f-decade").insertAdjacentHTML("beforeend",
    d.map((x) => `<option value="${x}">${x}-luku</option>`).join(""));
}

function filtered() {
  const t = $("#f-tier").value, dec = $("#f-decade").value, done = $("#f-done").value;
  const q = $("#f-text").value.trim().toLowerCase();
  const ulos = SONGS.filter((s) => {
    if (t && String(s.tier) !== t) return false;
    if (dec && (!s.year || Math.floor(s.year / 10) * 10 !== +dec)) return false;
    const arvio = rate.get(s.id);
    if (done === "no" && (arvio || gone.has(s.id))) return false;
    if (done === "yes" && !arvio) return false;
    if (done === "changed" && (!arvio || arvio === s.tier)) return false;
    if (done === "new" && !s.uusi) return false;
    if (done === "filler" && s.peli !== false) return false;
    if (done === "hiljaiset" && !(s.db !== null && s.db !== undefined && s.db <= -10)) return false;
    if (q && !(s.artist + " " + s.title).toLowerCase().includes(q)) return false;
    return true;
  });
  // Hiljaisimmat ensin: ne ovat ne joille pitää tehdä jotain.
  if (done === "hiljaiset") ulos.sort((a, b) => a.db - b.db);
  /* Täytteitä on satoja, eikä niitä jaksa käydä läpi tiedostojärjestyksessä.
     Vahvin merkki siitä että täyte kuuluisi peliin on se, että artistilla on
     jo paljon pelattavia biisejä: hänet on jo todettu pelin arvoiseksi, ja
     täytteet haettiin aikanaan artistin suosituimmista puuttuvista. Siksi
     tässä näkymässä kärjessä ovat ne, joiden artistilla on eniten pelattavaa,
     ja saman artistin sisällä alkuperäinen hakujärjestys säilyy. */
  if (done === "filler") ulos.sort((a, b) => (b.paino - a.paino) || 0);
  return ulos;
}

function render() {
  shown = filtered();
  at = Math.min(at, Math.max(0, shown.length - 1));
  if (!shown.length) { list.innerHTML = '<li class="empty">Ei osumia näillä suodattimilla.</li>'; return; }
  list.innerHTML = shown.map((s, i) => {
    const arvio = rate.get(s.id);
    const tiers = [1, 2, 3, 4, 5].map((t) => {
      const cls = (arvio === t ? " on" : "") + (s.tier === t ? " was" : "");
      return `<button class="t${cls}" data-t="${t}" data-id="${s.id}" title="${NAMES[t]}">${t}</button>`;
    }).join("");
    return `<li data-id="${s.id}" class="${i === at ? "is-at" : ""}${gone.has(s.id) ? " is-gone" : ""}">
      <div class="soittimet">
        <button class="play lyhyt" data-play="${s.id}" data-sek="0.1" title="Sama 0,1 s pätkä jonka pelaaja saa ensin">0,1</button>
        <button class="play" data-play="${s.id}" data-sek="15" aria-label="Soita 15 s">&#9654;</button>
      </div>
      <img src="${s.art || ""}" alt="" loading="lazy">
      <div>
        <div class="name">${esc(s.title)}${s.uusi ? '<span class="uusi">uusi</span>' : ""}${aaniMerkki(s)}</div>
        <div class="sub">${esc(s.artist)} · ${s.year || "?"} · nyt <b>${NAMES[s.tier]}</b>${
          arvio && arvio !== s.tier ? ` → <b style="color:var(--t${arvio})">${NAMES[arvio]}</b>` : ""}</div>
      </div>
      <div class="bar">
        <div class="tiers">${tiers}</div>
        <button class="del" data-del="${s.id}">${gone.has(s.id) ? "palauta" : "poista"}</button>
      </div>
    </li>`;
  }).join("");
  progress();
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* Äänitaso 0,1 sekunnin pätkästä, desibeleinä katalogin mediaaniin.
 *
 * Mitattu etukäteen scripts/mittaa_aanet.py:llä, koska 2280 esikuuntelun
 * lataaminen puhelimella olisi kaksi gigatavua. Luku on rivillä siksi, että
 * ongelman näkee listaa selatessa eikä vasta kuuntelemalla jokaisen.
 *
 * Rajat: alle -20 dB on käytännössä äänetön pelin lyhimmällä pätkällä,
 * -10 dB kuuluu mutta jää selvästi muita hiljaisemmaksi. Alle -6 dB ei ole
 * merkintää, koska normaalikin vaihtelu on sen luokkaa. */
function aaniMerkki(s) {
  if (s.db === null || s.db === undefined) return "";
  const luku = Math.round(s.db);
  let cls = "";
  if (luku <= -20) cls = " on-vaara";
  else if (luku <= -10) cls = " on-varo";
  else if (luku > -6) return s.hiljaisuus >= 1 ? hiljaisuusMerkki(s) : "";
  return `<span class="aani${cls}" title="0,1 s pätkä ${luku} dB katalogin mediaanista">${luku} dB</span>`
       + (s.hiljaisuus >= 1 ? hiljaisuusMerkki(s) : "");
}

function hiljaisuusMerkki(s) {
  return `<span class="aani on-varo" title="Esikuuntelun alussa tasan hiljaisuutta; peli hyppää sen yli">`
       + `${s.hiljaisuus.toFixed(1)} s tyhjää</span>`;
}

function focusRow(i, scroll = true) {
  if (!shown.length) return;
  at = Math.max(0, Math.min(shown.length - 1, i));
  list.querySelectorAll("li").forEach((li, k) => li.classList.toggle("is-at", k === at));
  if (scroll) list.children[at]?.scrollIntoView({ block: "nearest" });
}

function setTier(id, t) {
  if (t === 0) rate.delete(id); else rate.set(id, t);
  save();
  const li = list.querySelector(`li[data-id="${id}"]`);
  if (li) {
    li.querySelectorAll(".t").forEach((b) => b.classList.toggle("on", +b.dataset.t === t));
    const s = SONGS.find((x) => x.id === id);
    const sub = li.querySelector(".sub");
    sub.innerHTML = `${esc(s.artist)} · ${s.year || "?"} · nyt <b>${NAMES[s.tier]}</b>` +
      (t && t !== s.tier ? ` → <b style="color:var(--t${t})">${NAMES[t]}</b>` : "");
  }
}

list.addEventListener("click", (e) => {
  const li = e.target.closest("li[data-id]");
  if (li) focusRow([...list.children].indexOf(li), false);
  const p = e.target.closest("[data-play]");
  if (p) { play(SONGS.find((s) => s.id === +p.dataset.play), p, +p.dataset.sek); return; }
  const t = e.target.closest(".t");
  if (t) { setTier(+t.dataset.id, +t.dataset.t); return; }
  const d = e.target.closest("[data-del]");
  if (d) {
    const id = +d.dataset.del;
    if (gone.has(id)) {
      gone.delete(id);
      omatPois.delete(id);
      if (TAYTTEET.has(id)) omatTakaisin.add(id);
    } else {
      gone.add(id);
      omatTakaisin.delete(id);
      if (!TAYTTEET.has(id)) omatPois.add(id);
    }
    d.textContent = gone.has(id) ? "palauta" : "poista";
    d.closest("li").classList.toggle("is-gone", gone.has(id));
    save();
  }
});

document.addEventListener("keydown", (e) => {
  if (e.target.matches("input, textarea, select") || e.metaKey || e.ctrlKey) return;
  const s = shown[at];
  if (!s) return;
  if (e.key >= "0" && e.key <= "5") {
    e.preventDefault();
    setTier(s.id, +e.key);
    if (e.key !== "0") focusRow(at + 1);
  } else if (e.key === " ") {
    e.preventDefault();
    play(s, list.children[at].querySelector('[data-sek="15"]'), 15);
  } else if (e.key === "Enter") {
    e.preventDefault();
    play(s, list.children[at].querySelector('[data-sek="0.1"]'), 0.1);
  } else if (e.key.toLowerCase() === "x") {
    e.preventDefault();
    list.children[at].querySelector("[data-del]").click();
    focusRow(at + 1);
  } else if (e.key === "ArrowDown") { e.preventDefault(); focusRow(at + 1); }
  else if (e.key === "ArrowUp") { e.preventDefault(); focusRow(at - 1); }
});

["f-tier", "f-decade", "f-done", "f-text"].forEach((id) =>
  $("#" + id).addEventListener("input", () => { at = 0; render(); }));

/* Vienti antaa vain sen, mikä poikkeaa katalogin nykytilasta: jo sovelletut
   arviot ja poistot jäävät pois, jotta liitettävä pala pysyy pienenä ja
   kertoo yhdellä silmäyksellä mitä on tehty viime kerran jälkeen.

   Samaan päätyneistä lähtee silti pelkkä tunnistelista. Ilman sitä kuunneltu
   biisi, jonka taso sattui olemaan jo oikein, näytti ulospäin täsmälleen
   samalta kuin kuuntelematon: 71 arvioidusta biisistä vietiin 44, ja loput 27
   luettiin virheellisesti käymättömiksi. Tunniste on lyhyt, joten lista
   pysyy pienenä vaikka se kertookin mitä on kuunneltu. */
$("#export").addEventListener("click", () => {
  const out = { arviot: [], samat: [], poista: [], palauta: [] };
  for (const [id, t] of rate) {
    const s = SONGS.find((x) => x.id === id);
    if (!s) continue;
    if (s.tier !== t) out.arviot.push({ id, taso: t, nimi: `${s.artist} – ${s.title}` });
    else out.samat.push(id);
  }
  // Vietävä on ero katalogiin, ja se lasketaan omista merkinnöistä eikä
  // johdetusta gone-joukosta. Muuten katalogin oma tila päätyisi viennissä
  // muutokseksi, jota kukaan ei ole pyytänyt.
  for (const id of omatPois) {
    const s = SONGS.find((x) => x.id === id);
    if (s && s.peli !== false) out.poista.push(id);
  }
  for (const id of omatTakaisin) {
    const s = SONGS.find((x) => x.id === id);
    if (s && s.peli === false) out.palauta.push(id);
  }
  for (const k of ["arviot", "samat", "poista", "palauta"]) if (!out[k].length) delete out[k];

  $("#out").value = Object.keys(out).length
    ? JSON.stringify(out, null, 1)
    : "Ei muutoksia katalogin nykytilaan.";
  $("#dlg").showModal();
});
$("#copy").addEventListener("click", async () => {
  $("#out").select();
  try { await navigator.clipboard.writeText($("#out").value); $("#copy").textContent = "Kopioitu!"; }
  catch { document.execCommand("copy"); $("#copy").textContent = "Kopioitu!"; }
  setTimeout(() => { $("#copy").textContent = "Kopioi leikepöydälle"; }, 1500);
});
$("#close").addEventListener("click", () => $("#dlg").close());

decades();
render();
focusRow(0, false);
</script>
</body>
</html>
"""


def main() -> int:
    kuitattu = "--kuitattu" in sys.argv
    songs = json.loads(SONGS.read_text(encoding="utf-8"))
    tunnetut = set(json.loads(TILA.read_text(encoding="utf-8"))) if TILA.exists() else {s["id"] for s in songs}
    uusia = sum(1 for s in songs if s["id"] not in tunnetut)
    # Montako pelattavaa biisiä artistilla jo on. Täytenäkymä järjestää tämän
    # mukaan: paljon pelattavia = artisti on jo todettu pelin arvoiseksi.
    pelattavia = Counter(s["artist"] for s in songs if s.get("peli") is not False)

    # Mitatut äänitasot, jos scripts/mittaa_aanet.py on ajettu. Vertailukohta
    # on pelattavien biisien mediaani: "hiljainen" tarkoittaa hiljaista
    # suhteessa siihen mitä pelaaja muuten kuulee, ei absoluuttista arvoa.
    tasot = {}
    if AANET.exists():
        tasot = {int(k): v for k, v in json.loads(AANET.read_text(encoding="utf-8")).items()
                 if "virhe" not in v}
    arvot = sorted(tasot[s["id"]]["p01"] for s in songs
                   if s.get("peli") is not False and s["id"] in tasot and tasot[s["id"]]["p01"] > 0)
    mediaani = arvot[len(arvot) // 2] if arvot else 0

    def desibelit(sid):
        m = tasot.get(sid)
        if not m or not mediaani or not m["p01"]:
            return None
        return round(20 * math.log10(m["p01"] / mediaani), 1)

    slim = [{
        "id": s["id"], "artist": s["artist"], "title": s["title"],
        "year": s.get("year"), "tier": s["tier"],
        "preview": s["preview"], "art": s.get("art", ""),
        "peli": s.get("peli", True),
        "uusi": s["id"] not in tunnetut,
        "paino": pelattavia.get(s["artist"], 0),
        "db": desibelit(s["id"]),
        "alku": (tasot.get(s["id"]) or {}).get("alku", 0),
        "hiljaisuus": (tasot.get(s["id"]) or {}).get("hiljaisuus", 0),
    } for s in songs]
    data = json.dumps(slim, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    OUT.write_text(TEMPLATE.replace("__DATA__", data), encoding="utf-8")
    if not TILA.exists() or kuitattu:
        TILA.write_text(json.dumps(sorted(s["id"] for s in songs)), encoding="utf-8")
    kb = OUT.stat().st_size / 1024
    print(f"{OUT.name}: {len(songs)} biisiä, {kb:.0f} kt, joista uusia {uusia}")
    if uusia and not kuitattu:
        print("  (kun uudet on käyty läpi: python3 scripts/tee_arviointi.py --kuitattu)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
