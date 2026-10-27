"use strict";
/* ===== 共通の道具 ===== */
function ev(s, seat, kind, text) {
  s.ev = (s.ev || 0) + 1;
  s.events = (s.events || []).concat([{ id: s.ev, seat, kind, text }]).slice(-12);
}
function nextSeat(s, from, ok) { for (let k = 1; k <= s.n; k++) { const i = (from + k) % s.n; if (!ok || ok(i)) return i; } return -1; }
const LV_NAME = ["やさしい", "ふつう", "つよい"];
/* 席ごとの色（コマの色） */
const SEAT_COLORS = ["#ff7fa6", "#5aa2ff", "#4cc79a", "#ffc23d", "#a98bff"];
const SEAT_MARKS = ["♥", "♠", "♣", "★", "♦"];

/* 盤のわく：mid の中に、cols×rows のマスが正方形になるように置く */
function boardBox(mid, T, cols, rows, o) {
  o = o || {};
  const pad = o.pad != null ? o.pad : 8;
  const r = mid.getBoundingClientRect();
  const maxW = Math.max(120, r.width - 8), maxH = Math.max(120, r.height - 8);
  const cs = Math.floor(Math.min((maxW - pad * 2) / cols, (maxH - pad * 2) / rows));
  const w = cs * cols + pad * 2, hh = cs * rows + pad * 2;
  const el = h("div", { class: "bbox " + (o.cls || ""), style: { width: w + "px", height: hh + "px", "--cs": cs + "px" } });
  mid.append(el);
  return { el, cs, pad, x: (c) => pad + c * cs, y: (r2) => pad + r2 * cs, w, h: hh };
}
/* 絶対配置の要素 */
function at(parent, x, y, w, hh, cls, attrs, ...kids) {
  const e = h("div", Object.assign({ class: cls }, attrs || {}), ...kids);
  e.style.left = x + "px"; e.style.top = y + "px"; e.style.width = w + "px"; e.style.height = hh + "px";
  parent.append(e);
  return e;
}
/* キャラの顔つきコマ（キャラ画像はそのまま縮小して表示するだけ） */
function charToken(cid, color) {
  return h("div", { class: "ctok", style: { "--pc": color } }, h("img", { src: CHARS[cid].img, alt: "", draggable: "false" }));
}
/* 時間制限つきの探索用 */
class TimeUp extends Error {}
function deadline(ms) { const t = Date.now() + (window.__FAST ? Math.min(ms, 40) : ms); return () => { if (Date.now() > t) throw new TimeUp(); }; }
/* 上位のうち、少しランダムに選ぶ（やさしい用） */
function pickByLevel(scored, level) {
  // scored: [{m, v}] v大きいほど良い
  if (!scored.length) return null;
  scored.sort((a, b) => b.v - a.v);
  if (level >= 2) { const best = scored[0].v; const top = scored.filter((x) => x.v >= best - 1e-9); return pick(top).m; }
  if (level === 1) { const k = Math.min(scored.length, 2); return rnd(10) < 8 ? scored[0].m : scored[rnd(k)].m; }
  const k = Math.max(1, Math.ceil(scored.length * 0.5));
  return scored[rnd(k)].m;
}
/* さいころの目 */
const DICE = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
function dieEl(v, o) {
  o = o || {};
  const pips = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] }[v] || [];
  const d = h("div", { class: "die" + (o.cls ? " " + o.cls : "") + (o.held ? " held" : "") + (o.roll ? " rolling" : ""), onclick: o.onclick || null });
  for (let i = 0; i < 9; i++) d.append(h("i", { class: pips.includes(i) ? "on" : "" }));
  if (o.size) d.style.setProperty("--ds", o.size + "px");
  return d;
}
