#!/usr/bin/env python3
"""Rakentaa itsenäisen arviointityökalun songs.json:in pohjalta.

    python3 scripts/tee_arviointi.py

Kirjoittaa arviointi.html, jonka voi avata suoraan selaimessa. Biisitiedot
upotetaan tiedostoon, joten se toimii ilman palvelinta eikä lista päädy
verkkoon. Pätkät ja kansikuvat haetaan Applelta niin kuin pelissäkin.

Tiedosto on .gitignoressa: se on työkalu, ei osa peliä.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SONGS = ROOT / "songs.json"
OUT = ROOT / "arviointi.html"

TIER_NAMES = {1: "Helppo", 2: "Keskitaso", 3: "Vaikea", 4: "Mestari", 5: "Mahdoton"}

TEMPLATE = """<!doctype html>
<html lang="fi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
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

.play { width: 34px; height: 34px; padding: 0; border-radius: 50%; display: grid; place-items: center; }
.play.is-on { background: var(--t1); border-color: var(--t1); color: #101010; }
img { width: 44px; height: 44px; border-radius: 3px; object-fit: cover; background: var(--soft); }
.name { font-weight: 600; letter-spacing: -.01em; }
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
const KEY = "hittispotti:arviot";

let saved = { arviot: {}, poista: [] };
try { saved = Object.assign(saved, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch {}
const rate = new Map(Object.entries(saved.arviot).map(([k, v]) => [Number(k), v]));
const gone = new Set(saved.poista);

const $ = (s) => document.querySelector(s);
const list = $("#list");
let shown = [];
let at = 0;

function save() {
  localStorage.setItem(KEY, JSON.stringify({
    arviot: Object.fromEntries(rate), poista: [...gone],
  }));
  progress();
}

function progress() {
  const done = new Set([...rate.keys(), ...gone]).size;
  $("#count").textContent = `${done} / ${SONGS.length} käyty · ${gone.size} poistettavaa`;
  $("#bar").style.width = (done / SONGS.length * 100) + "%";
}

/* Yksi soitin koko sivulle: uusi painallus katkaisee edellisen, eikä
   kahta pätkää voi soida päällekkäin. */
const audio = new Audio();
audio.preload = "none";
let timer = 0, playingId = null;

function play(song, btn) {
  clearTimeout(timer);
  document.querySelectorAll(".play.is-on").forEach((b) => b.classList.remove("is-on"));
  if (playingId === song.id) { audio.pause(); playingId = null; return; }
  audio.src = song.preview;
  audio.currentTime = 0;
  audio.play().catch(() => {});
  playingId = song.id;
  btn.classList.add("is-on");
  timer = setTimeout(() => { audio.pause(); btn.classList.remove("is-on"); playingId = null; }, 15000);
}

function decades() {
  const d = [...new Set(SONGS.map((s) => s.year && Math.floor(s.year / 10) * 10).filter(Boolean))].sort();
  $("#f-decade").insertAdjacentHTML("beforeend",
    d.map((x) => `<option value="${x}">${x}-luku</option>`).join(""));
}

function filtered() {
  const t = $("#f-tier").value, dec = $("#f-decade").value, done = $("#f-done").value;
  const q = $("#f-text").value.trim().toLowerCase();
  return SONGS.filter((s) => {
    if (t && String(s.tier) !== t) return false;
    if (dec && (!s.year || Math.floor(s.year / 10) * 10 !== +dec)) return false;
    const arvio = rate.get(s.id);
    if (done === "no" && (arvio || gone.has(s.id))) return false;
    if (done === "yes" && !arvio) return false;
    if (done === "changed" && (!arvio || arvio === s.tier)) return false;
    if (q && !(s.artist + " " + s.title).toLowerCase().includes(q)) return false;
    return true;
  });
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
      <button class="play" data-play="${s.id}" aria-label="Soita">&#9654;</button>
      <img src="${s.art || ""}" alt="" loading="lazy">
      <div>
        <div class="name">${esc(s.title)}</div>
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
  if (p) { play(SONGS.find((s) => s.id === +p.dataset.play), p); return; }
  const t = e.target.closest(".t");
  if (t) { setTier(+t.dataset.id, +t.dataset.t); return; }
  const d = e.target.closest("[data-del]");
  if (d) {
    const id = +d.dataset.del;
    gone.has(id) ? gone.delete(id) : gone.add(id);
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
    play(s, list.children[at].querySelector(".play"));
  } else if (e.key.toLowerCase() === "x") {
    e.preventDefault();
    list.children[at].querySelector("[data-del]").click();
    focusRow(at + 1);
  } else if (e.key === "ArrowDown") { e.preventDefault(); focusRow(at + 1); }
  else if (e.key === "ArrowUp") { e.preventDefault(); focusRow(at - 1); }
});

["f-tier", "f-decade", "f-done", "f-text"].forEach((id) =>
  $("#" + id).addEventListener("input", () => { at = 0; render(); }));

$("#export").addEventListener("click", () => {
  const muutetut = [...rate.entries()]
    .filter(([id, t]) => SONGS.find((s) => s.id === id)?.tier !== t)
    .map(([id, t]) => ({ id, taso: t }));
  $("#out").value = JSON.stringify({
    arviot: muutetut,
    poista: [...gone],
    kayty: new Set([...rate.keys(), ...gone]).size,
  }, null, 1);
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
    songs = json.loads(SONGS.read_text(encoding="utf-8"))
    slim = [{
        "id": s["id"], "artist": s["artist"], "title": s["title"],
        "year": s.get("year"), "tier": s["tier"],
        "preview": s["preview"], "art": s.get("art", ""),
    } for s in songs]
    data = json.dumps(slim, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    OUT.write_text(TEMPLATE.replace("__DATA__", data), encoding="utf-8")
    kb = OUT.stat().st_size / 1024
    print(f"{OUT.name}: {len(songs)} biisiä, {kb:.0f} kt")
    return 0


if __name__ == "__main__":
    sys.exit(main())
