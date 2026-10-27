"use strict";
/* ===== トランプの基本 =====
   カード番号: 0〜51 = スート*13 + (数字-1)   スート 0:♠ 1:♥ 2:♦ 3:♣ / 52,53: ジョーカー */
const SUITS = ["♠", "♥", "♦", "♣"];
const SUIT_NAMES = ["スペード", "ハート", "ダイヤ", "クラブ"];
const suitOf = (c) => (c >= 52 ? 4 : Math.floor(c / 13));
const rankOf = (c) => (c >= 52 ? 0 : (c % 13) + 1);
const isJoker = (c) => c >= 52;
const isRed = (c) => { const s = suitOf(c); return s === 1 || s === 2; };
const rankLabel = (r) => ({ 1: "A", 11: "J", 12: "Q", 13: "K" }[r] || String(r));
const cardName = (c) => (isJoker(c) ? "ジョーカー" : SUITS[suitOf(c)] + rankLabel(rankOf(c)));
const mkCard = (s, r) => s * 13 + r - 1;
function makeDeck(jokers) { const d = []; for (let i = 0; i < 52; i++) d.push(i); for (let j = 0; j < (jokers || 0); j++) d.push(52 + j); return d; }
const FACE_ART = { 11: "🎩", 12: "🌸", 13: "👑" };

/* カードのDOM（表/裏） */
function paintCard(el, c, down, back2) {
  const key = down ? "down" + (back2 ? 2 : 1) : "c" + c;
  if (el._key === key) return el;
  el._key = key;
  el.innerHTML = "";
  el.classList.remove("back", "b2", "red", "blk", "joker");
  if (down || c == null || c < 0) { el.classList.add("back"); if (back2) el.classList.add("b2"); return el; }
  if (isJoker(c)) {
    el.classList.add("joker");
    el.append(h("div", { class: "jk" }, "JOKER"), h("img", { src: CHARS.kuronya.img, draggable: "false" }));
    return el;
  }
  const r = rankOf(c), s = suitOf(c);
  el.classList.add(isRed(c) ? "red" : "blk");
  el.append(h("div", { class: "rk" }, rankLabel(r)), h("div", { class: "st" }, SUITS[s]));
  if (r >= 11) el.append(h("div", { class: "face-art", style: { background: isRed(c) ? "#ffe4ea" : "#ebe8f5" } }, FACE_ART[r]));
  else el.append(h("div", { class: "big" }, SUITS[s]));
  return el;
}
function cardEl(c, opts) {
  opts = opts || {};
  const el = h("div", { class: "card" + (opts.static ? " static" : "") + (opts.cls ? " " + opts.cls : "") });
  paintCard(el, c, !!opts.down, opts.back2);
  if (opts.onclick) el.addEventListener("click", opts.onclick);
  return el;
}
/* 要素にカードサイズを設定 */
function setCardSize(el, w) {
  w = Math.round(w);
  el.style.setProperty("--cw", w + "px");
  el.style.setProperty("--ch", Math.round(w * 1.4) + "px");
  return { w, h: Math.round(w * 1.4) };
}

/* ===== 手札表示（下段） =====
   cards: 表示するカード, opts: {selected:Set, playable:Set|fn, onTap(c), maxW, cw} */
function renderHand(container, cards, opts) {
  opts = opts || {};
  const W = opts.maxW || container.clientWidth || 360;
  const n = cards.length;
  const cw = opts.cw || clamp(W / 6.2, 44, 64);
  const size = setCardSize(container, cw);
  const step = n <= 1 ? 0 : Math.min(cw * 0.92, (W - cw - 4) / (n - 1));
  const total = n <= 1 ? cw : cw + step * (n - 1);
  container.style.width = total + "px";
  container.style.height = size.h + 18 + "px";
  container.innerHTML = "";
  cards.forEach((c, i) => {
    const el = cardEl(c, { down: opts.down });
    el.style.left = i * step + "px";
    el.style.zIndex = i + 1;
    if (opts.selected && opts.selected.has(c)) el.classList.add("sel");
    const can = typeof opts.playable === "function" ? opts.playable(c) : opts.playable ? opts.playable.has(c) : null;
    if (can === true && opts.glow !== false) el.classList.add("can");
    if (can === false && opts.dimOthers) el.classList.add("dim");
    if (opts.enter && opts.enter.has && opts.enter.has(c)) el.classList.add("enter");
    if (opts.onTap) el.addEventListener("click", (e) => { e.stopPropagation(); opts.onTap(c, el); });
    container.append(el);
  });
}

/* 並べ替え用の比較（スート→数字） */
const bySuitRank = (a, b) => (suitOf(a) - suitOf(b)) || (rankOf(a) - rankOf(b));
const byRankSuit = (a, b) => (rankOf(a) - rankOf(b)) || (suitOf(a) - suitOf(b));
