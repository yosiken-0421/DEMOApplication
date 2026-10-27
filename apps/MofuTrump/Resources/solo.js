"use strict";
/* ===== ひとり用（ソリティア系） =====
   状態: s.p = { 山の名前: [{k:固有番号, c:カード, up:表か}] }
   どのカードも必ずどこかの山にある（消えたカードは非表示の山へ移す） */

const E = (k, c, up) => ({ k, c, up: !!up });
const pileTop = (pile) => pile[pile.length - 1];
const altColor = (a, b) => isRed(a) !== isRed(b);

/* 横並びの列の x 座標 */
function cols(n, W, cw) { const g = (W - n * cw) / (n + 1); return Array.from({ length: n }, (_, i) => g + i * (cw + g)); }

/* ---------- クロンダイク ---------- */
const Klondike = {
  id: "klondike", name: "クロンダイク", icon: "🂡", tag: "定番",
  desc: "いちばん有名なソリティア。赤黒交互に並べてA→Kを4組そろえよう",
  rules: "目的：4つの組札（右上）にスートごとに A→K の順で全部のカードを集めます。\n\n・場札は「赤と黒を交互に」「数字を1つずつ小さく」重ねられます。\n・表になっているカードはまとめて動かせます。\n・空いた列にはKだけ置けます。\n・左上の山札をタップするとめくれます。山札がなくなったらタップでもう一度。\n\nカードをタップすると、置ける場所へ自動で動きます。ドラッグで好きな場所にも置けます。",
  opts: [{ key: "draw", label: "めくる枚数", choices: [[1, "1枚"], [3, "3枚"]], def: 1 }],
  deal(o) {
    const d = shuffle(makeDeck()), p = {};
    let k = 0;
    for (let i = 0; i < 7; i++) { p["t" + i] = []; for (let j = 0; j <= i; j++) p["t" + i].push(E(k, d[k++], j === i)); }
    p.s = []; while (k < 52) p.s.push(E(k, d[k++], false));
    p.w = []; for (let i = 0; i < 4; i++) p["f" + i] = [];
    return { p, draw: o.draw || 1 };
  },
  layout(s, W, H) {
    const cw = Math.min((W - 8 * 4) / 7, 70), ch = cw * 1.4, xs = cols(7, W, cw), y0 = 30, ty = y0 + ch + 14;
    const L = { cw, piles: {} };
    L.piles.s = { x: xs[0], y: y0, slot: "↻" };
    L.piles.w = { x: xs[1], y: y0, fanX: s.draw === 3 ? cw * 0.32 : 0, fanLast: 3 };
    for (let i = 0; i < 4; i++) L.piles["f" + i] = { x: xs[3 + i], y: y0, slot: "A" };
    for (let i = 0; i < 7; i++) L.piles["t" + i] = { x: xs[i], y: ty, dy: ch * 0.3, dyDown: ch * 0.13, maxH: H - ty - 6, slot: "" };
    return L;
  },
  pickable(s, pid, i) {
    const pile = s.p[pid];
    if (!pile[i] || !pile[i].up) return false;
    if (pid === "w" || pid[0] === "f") return i === pile.length - 1;
    return pid[0] === "t";
  },
  canDrop(s, pid, i, dst) {
    if (dst === pid) return false;
    const mv = s.p[pid].slice(i), c = mv[0].c, t = pileTop(s.p[dst]);
    if (dst[0] === "f") return mv.length === 1 && (t ? suitOf(t.c) === suitOf(c) && rankOf(t.c) + 1 === rankOf(c) : rankOf(c) === 1);
    if (dst[0] === "t") return t ? t.up && altColor(t.c, c) && rankOf(t.c) === rankOf(c) + 1 : rankOf(c) === 13;
    return false;
  },
  drop(s, pid, i, dst) { return this.canDrop(s, pid, i, dst) ? { t: "mv", from: pid, i, to: dst } : null; },
  tap(s, pid, i) {
    if (pid === "s") return s.p.s.length || s.p.w.length ? { move: { t: "draw" } } : null;
    if (!this.pickable(s, pid, i)) return null;
    const order = [];
    if (i === s.p[pid].length - 1) for (let f = 0; f < 4; f++) order.push("f" + f);
    const ts = []; for (let t = 0; t < 7; t++) ts.push("t" + t);
    ts.filter((t) => s.p[t].length).forEach((t) => order.push(t));
    if (!(pid[0] === "t" && i === 0)) ts.filter((t) => !s.p[t].length).forEach((t) => order.push(t));
    for (const d of order) if (this.canDrop(s, pid, i, d)) return { move: { t: "mv", from: pid, i, to: d } };
    return null;
  },
  apply(s, m) {
    if (m.t === "draw") {
      if (s.p.s.length) { for (let n = 0; n < s.draw && s.p.s.length; n++) { const e = s.p.s.pop(); e.up = true; s.p.w.push(e); } }
      else { s.p.s = s.p.w.reverse().map((e) => ((e.up = false), e)); s.p.w = []; s.recycles = (s.recycles || 0) + 1; }
      return;
    }
    const mv = s.p[m.from].splice(m.i);
    s.p[m.to].push(...mv);
    const t = pileTop(s.p[m.from]); if (t && m.from[0] === "t") t.up = true;
  },
  safeAuto(s) { return autoFoundation(s, 7, (c, f) => this.canDrop(s, f.pid, f.i, f.to)); },
  auto(s) { return this.safeAuto(s); },
  won(s) { return [0, 1, 2, 3].every((f) => s.p["f" + f].length === 13); },
  canFinish(s) { return !s.p.s.length && !s.p.w.length && [0, 1, 2, 3, 4, 5, 6].every((t) => s.p["t" + t].every((e) => e.up)); },
  finishStep(s) {
    let best = null;
    for (const pid of ["w", "t0", "t1", "t2", "t3", "t4", "t5", "t6"]) {
      const pile = s.p[pid]; if (!pile.length) continue;
      for (let f = 0; f < 4; f++) if (this.canDrop(s, pid, pile.length - 1, "f" + f)) { const r = rankOf(pileTop(pile).c); if (!best || r < best.r) best = { r, m: { t: "mv", from: pid, i: pile.length - 1, to: "f" + f } }; }
    }
    return best && best.m;
  },
  hint(s) {
    const moves = [];
    const srcs = ["w", "t0", "t1", "t2", "t3", "t4", "t5", "t6"];
    for (const pid of srcs) {
      const pile = s.p[pid];
      for (let i = 0; i < pile.length; i++) {
        if (!this.pickable(s, pid, i)) continue;
        for (const d of ["f0", "f1", "f2", "f3", "t0", "t1", "t2", "t3", "t4", "t5", "t6"]) {
          if (!this.canDrop(s, pid, i, d)) continue;
          let sc = 0;
          if (d[0] === "f") sc = 5;
          if (pid[0] === "t" && i > 0 && !pile[i - 1].up) sc += 10;
          if (pid[0] === "t" && i === 0 && d[0] === "t" && !s.p[d].length) continue;
          if (pid[0] === "t" && i > 0 && pile[i - 1].up && d[0] === "t") continue; // 意味のない入れ替え
          if (pid === "w") sc += 3;
          if (pid[0] === "t" && i === 0 && d[0] === "t") sc += 4;
          moves.push({ sc, pid, i, to: d });
        }
      }
    }
    moves.sort((a, b) => b.sc - a.sc);
    if (moves.length) return moves[0];
    if (s.p.s.length || s.p.w.length) return { pid: "s", i: s.p.s.length - 1 };
    return null;
  },
};

/* 組札へ「安全に」自動で送る（相手色の組札が追いついているとき） */
function autoFoundation(s, ncols, can) {
  const found = [0, 1, 2, 3].map((f) => s.p["f" + f]);
  const lv = (red) => { const fs = found.filter((f) => f.length && isRed(f[0].c) === red); return fs.length < 2 ? 0 : Math.min(...fs.map((f) => f.length)); };
  const srcs = ["w"]; for (let t = 0; t < ncols; t++) srcs.push("t" + t);
  for (let c = 0; c < 4; c++) srcs.push("c" + c);
  for (const pid of srcs) {
    const pile = s.p[pid]; if (!pile || !pile.length) continue;
    const e = pileTop(pile); if (!e.up) continue;
    const r = rankOf(e.c);
    const safe = r <= 2 || lv(!isRed(e.c)) >= r - 1;
    if (!safe) continue;
    for (let f = 0; f < 4; f++) if (can(e.c, { pid, i: pile.length - 1, to: "f" + f })) return { t: "mv", from: pid, i: pile.length - 1, to: "f" + f };
  }
  return null;
}

/* ---------- フリーセル ---------- */
const FreeCell = {
  id: "freecell", name: "フリーセル", icon: "🗃️", tag: "頭脳派",
  desc: "全部のカードが見えている作戦型。4つの空きマスを使って解こう",
  rules: "目的：右上の組札にスートごとに A→K を集めます。\n\n・場札は「赤黒交互」「数字を1つずつ小さく」重ねられます。\n・左上の4マス（フリーセル）にはカードを1枚ずつ自由に置けます。\n・空いた列にはどのカードでも置けます。\n・まとめて動かせる枚数は、空きマスと空き列の数で決まります。\n\nほぼ全部の配りが解ける、考えるほど楽しいソリティアです。",
  opts: [],
  deal() {
    const d = shuffle(makeDeck()), p = {};
    for (let i = 0; i < 8; i++) p["t" + i] = [];
    d.forEach((c, k) => p["t" + (k % 8)].push(E(k, c, true)));
    for (let i = 0; i < 4; i++) { p["c" + i] = []; p["f" + i] = []; }
    return { p };
  },
  layout(s, W, H) {
    const cw = Math.min((W - 9 * 3) / 8, 66), ch = cw * 1.4, xs = cols(8, W, cw), y0 = 30, ty = y0 + ch + 14;
    const L = { cw, piles: {} };
    for (let i = 0; i < 4; i++) { L.piles["c" + i] = { x: xs[i], y: y0, slot: "" }; L.piles["f" + i] = { x: xs[4 + i], y: y0, slot: "A" }; }
    for (let i = 0; i < 8; i++) L.piles["t" + i] = { x: xs[i], y: ty, dy: ch * 0.3, maxH: H - ty - 6, slot: "" };
    return L;
  },
  isSeq(cards) { for (let j = 1; j < cards.length; j++) if (!(altColor(cards[j - 1].c, cards[j].c) && rankOf(cards[j - 1].c) === rankOf(cards[j].c) + 1)) return false; return true; },
  maxMove(s, dst) {
    let cells = 0, empty = 0;
    for (let i = 0; i < 4; i++) if (!s.p["c" + i].length) cells++;
    for (let i = 0; i < 8; i++) if (!s.p["t" + i].length && "t" + i !== dst) empty++;
    return (cells + 1) * Math.pow(2, empty);
  },
  pickable(s, pid, i) {
    const pile = s.p[pid]; if (!pile[i]) return false;
    if (pid[0] === "c" || pid[0] === "f") return i === pile.length - 1;
    return this.isSeq(pile.slice(i));
  },
  canDrop(s, pid, i, dst) {
    if (dst === pid) return false;
    const mv = s.p[pid].slice(i), c = mv[0].c, t = pileTop(s.p[dst]);
    if (dst[0] === "f") return mv.length === 1 && (t ? suitOf(t.c) === suitOf(c) && rankOf(t.c) + 1 === rankOf(c) : rankOf(c) === 1);
    if (dst[0] === "c") return mv.length === 1 && !t;
    if (dst[0] === "t") {
      if (mv.length > this.maxMove(s, dst)) return false;
      return t ? altColor(t.c, c) && rankOf(t.c) === rankOf(c) + 1 : true;
    }
    return false;
  },
  drop(s, pid, i, dst) { return this.canDrop(s, pid, i, dst) ? { t: "mv", from: pid, i, to: dst } : null; },
  tap(s, pid, i) {
    if (!this.pickable(s, pid, i)) return null;
    const order = [];
    for (let f = 0; f < 4; f++) order.push("f" + f);
    for (let t = 0; t < 8; t++) if (s.p["t" + t].length) order.push("t" + t);
    if (!(pid[0] === "t" && i === 0)) for (let t = 0; t < 8; t++) if (!s.p["t" + t].length) order.push("t" + t);
    if (pid[0] !== "c") for (let c = 0; c < 4; c++) order.push("c" + c);
    for (const d of order) if (this.canDrop(s, pid, i, d)) return { move: { t: "mv", from: pid, i, to: d } };
    return null;
  },
  apply(s, m) { const mv = s.p[m.from].splice(m.i); s.p[m.to].push(...mv); },
  auto(s) { return autoFoundation(s, 8, (c, f) => this.canDrop(s, f.pid, f.i, f.to)); },
  won(s) { return [0, 1, 2, 3].every((f) => s.p["f" + f].length === 13); },
  hint(s) {
    const moves = [];
    const srcs = ["c0", "c1", "c2", "c3", "t0", "t1", "t2", "t3", "t4", "t5", "t6", "t7"];
    for (const pid of srcs) {
      const pile = s.p[pid];
      for (let i = 0; i < pile.length; i++) {
        if (!this.pickable(s, pid, i)) continue;
        for (const d of ["f0", "f1", "f2", "f3", "t0", "t1", "t2", "t3", "t4", "t5", "t6", "t7"]) {
          if (!this.canDrop(s, pid, i, d)) continue;
          if (d[0] === "t" && !s.p[d].length && pid[0] === "t" && i === 0) continue;
          if (pid[0] === "t" && i > 0 && d[0] === "t" && s.p[d].length && this.isSeq(pile.slice(i - 1))) continue;
          let sc = d[0] === "f" ? 8 : s.p[d].length ? 5 : 1;
          if (pid[0] === "c") sc += 3;
          moves.push({ sc, pid, i, to: d });
        }
      }
    }
    moves.sort((a, b) => b.sc - a.sc);
    if (moves.length) return moves[0];
    // 何もなければ、フリーセルへ逃がす
    const cell = ["c0", "c1", "c2", "c3"].find((c) => !s.p[c].length);
    if (cell) for (let t = 0; t < 8; t++) { const pile = s.p["t" + t]; if (pile.length > 1) return { pid: "t" + t, i: pile.length - 1, to: cell }; }
    return null;
  },
};

/* ---------- スパイダー ---------- */
const Spider = {
  id: "spider", name: "スパイダー", icon: "🕷️", tag: "人気",
  desc: "同じスートでK→Aを作ると消える。8組消せばクリア！",
  rules: "目的：場札の中で、同じスートの K→A の並びを8組つくって消します。\n\n・カードは数字が1つ大きいカードの上に置けます（スートは何でもOK）。\n・まとめて動かせるのは「同じスートで数字が続いている」並びだけ。\n・空いた列にはどのカードでも置けます。\n・右上の山札をタップすると、全部の列に1枚ずつ配られます（空いた列があると配れません）。\n\n難しさ：1スート（やさしい）／2スート／4スート（むずかしい）",
  opts: [{ key: "suits", label: "スートの数", choices: [[1, "1スート"], [2, "2スート"], [4, "4スート"]], def: 1 }],
  deal(o) {
    const ns = o.suits || 1, suitSet = ns === 1 ? [0] : ns === 2 ? [0, 1] : [0, 1, 2, 3];
    const cards = [];
    for (let k = 0; k < 104; k++) { const s = suitSet[Math.floor(k / 13) % suitSet.length]; cards.push(mkCard(s, (k % 13) + 1)); }
    shuffle(cards);
    const p = {}; let k = 0;
    for (let i = 0; i < 10; i++) { p["t" + i] = []; const n = i < 4 ? 6 : 5; for (let j = 0; j < n; j++) p["t" + i].push(E(k, cards[k++], j === n - 1)); }
    p.s = []; while (k < 104) p.s.push(E(k, cards[k++], false));
    p.done = [];
    return { p, ns };
  },
  layout(s, W, H) {
    const cw = Math.min((W - 11 * 3) / 10, 60), ch = cw * 1.4, xs = cols(10, W, cw), y0 = 30, ty = y0 + ch + 12;
    const L = { cw, piles: {} };
    L.piles.s = { x: xs[9], y: y0, stackX: -cw * 0.18, group: 10, slot: "" };
    L.piles.done = { x: xs[0], y: y0, stackX: cw * 0.35, group: 13 };
    for (let i = 0; i < 10; i++) L.piles["t" + i] = { x: xs[i], y: ty, dy: ch * 0.27, dyDown: ch * 0.1, maxH: H - ty - 6, slot: "" };
    return L;
  },
  isRun(cards) { for (let j = 1; j < cards.length; j++) if (!(suitOf(cards[j - 1].c) === suitOf(cards[j].c) && rankOf(cards[j - 1].c) === rankOf(cards[j].c) + 1)) return false; return true; },
  pickable(s, pid, i) { const pile = s.p[pid]; return pid[0] === "t" && pile[i] && pile[i].up && this.isRun(pile.slice(i)); },
  canDrop(s, pid, i, dst) {
    if (dst === pid || dst[0] !== "t") return false;
    const c = s.p[pid][i].c, t = pileTop(s.p[dst]);
    return !t || rankOf(t.c) === rankOf(c) + 1;
  },
  drop(s, pid, i, dst) { return this.canDrop(s, pid, i, dst) ? { t: "mv", from: pid, i, to: dst } : null; },
  tap(s, pid, i) {
    if (pid === "s") {
      if (!s.p.s.length) return null;
      if ([...Array(10).keys()].some((t) => !s.p["t" + t].length)) { toast("空いている列にカードを置いてから配れます"); return null; }
      return { move: { t: "deal" } };
    }
    if (!this.pickable(s, pid, i)) return null;
    const c = s.p[pid][i].c, cands = [];
    for (let t = 0; t < 10; t++) {
      const d = "t" + t; if (!this.canDrop(s, pid, i, d)) continue;
      const tp = pileTop(s.p[d]);
      let sc = !tp ? (i === 0 ? -1 : 1) : suitOf(tp.c) === suitOf(c) ? 10 : 5;
      cands.push({ sc, d });
    }
    cands.sort((a, b) => b.sc - a.sc);
    if (!cands.length || cands[0].sc < 0) return null;
    return { move: { t: "mv", from: pid, i, to: cands[0].d } };
  },
  apply(s, m) {
    if (m.t === "deal") { for (let t = 0; t < 10 && s.p.s.length; t++) { const e = s.p.s.pop(); e.up = true; s.p["t" + t].push(e); } }
    else { const mv = s.p[m.from].splice(m.i); s.p[m.to].push(...mv); const tp = pileTop(s.p[m.from]); if (tp) tp.up = true; }
  },
  auto(s) {
    for (let t = 0; t < 10; t++) {
      const pile = s.p["t" + t];
      if (pile.length >= 13) {
        const run = pile.slice(-13);
        if (run[0].up && rankOf(run[0].c) === 13 && this.isRun(run)) return { t: "complete", col: "t" + t };
      }
    }
    return null;
  },
  applyAuto(s, m) {
    if (m.t !== "complete") return false;
    const run = s.p[m.col].splice(-13);
    s.p.done.push(...run);
    const tp = pileTop(s.p[m.col]); if (tp) tp.up = true;
    Snd.ok(); return true;
  },
  won(s) { return s.p.done.length === 104; },
  hint(s) {
    const moves = [];
    for (let t = 0; t < 10; t++) {
      const pid = "t" + t, pile = s.p[pid];
      for (let i = 0; i < pile.length; i++) {
        if (!this.pickable(s, pid, i)) continue;
        for (let d = 0; d < 10; d++) {
          const dst = "t" + d; if (!this.canDrop(s, pid, i, dst)) continue;
          const tp = pileTop(s.p[dst]);
          if (!tp && i === 0) continue;
          let sc = 1;
          if (tp && suitOf(tp.c) === suitOf(pile[i].c)) sc += 6;
          if (i > 0 && !pile[i - 1].up) sc += 5;
          if (i > 0 && pile[i - 1].up && rankOf(pile[i - 1].c) === rankOf(pile[i].c) + 1 && (!tp || suitOf(tp.c) !== suitOf(pile[i].c))) continue;
          if (!tp) sc -= 1;
          moves.push({ sc, pid, i, to: dst });
        }
      }
    }
    moves.sort((a, b) => b.sc - a.sc);
    if (moves.length) return moves[0];
    if (s.p.s.length) return { pid: "s", i: s.p.s.length - 1 };
    return null;
  },
};

/* ---------- 山型レイアウト（ピラミッド／トライピークス）共通 ---------- */
/* slots: [{x(カード幅単位), row}] → 上の行のカードは、すぐ下の行で x の差が 0.5 以下のカードに覆われる */
function peakCovered(s, slots, i) {
  const a = slots[i];
  for (let j = 0; j < slots.length; j++) {
    const b = slots[j];
    if (b.row === a.row + 1 && Math.abs(b.x - a.x) <= 0.51 && s.p["k" + j].length) return true;
  }
  return false;
}

/* ---------- ピラミッド ---------- */
const PYR_SLOTS = (() => { const a = []; for (let r = 0; r < 7; r++) for (let i = 0; i <= r; i++) a.push({ row: r, x: (6 - r) / 2 + i }); return a; })();
const Pyramid = {
  id: "pyramid", name: "ピラミッド", icon: "🔺", tag: "かんたん",
  desc: "足して13になる2枚を消していく。Kは1枚で消せる",
  rules: "目的：ピラミッドのカードを全部消します。\n\n・上に何も重なっていないカード2枚で、合計13になる組み合わせをタップすると消えます（A=1、J=11、Q=12、K=13）。\n・Kは1枚だけで消せます。\n・下の山札をタップするとめくれます。めくったカードも使えます。\n・山札は3周まで使えます。",
  opts: [],
  deal() {
    const d = shuffle(makeDeck()), p = {}; let k = 0;
    PYR_SLOTS.forEach((_, i) => { p["k" + i] = [E(k, d[k++], true)]; });
    p.s = []; while (k < 52) p.s.push(E(k, d[k++], false));
    p.w = []; p.x = [];
    return { p, pass: 1, maxPass: 3 };
  },
  layout(s, W, H) {
    const cw = Math.min(W / 7.6, (H - 40) / (1.4 * 5.2), 64), ch = cw * 1.4, g = cw * 0.08;
    const L = { cw, piles: {} }, x0 = (W - (7 * cw + 6 * g)) / 2;
    PYR_SLOTS.forEach((sl, i) => { L.piles["k" + i] = { x: x0 + sl.x * (cw + g), y: 34 + sl.row * ch * 0.5 }; });
    const by = 34 + 6 * ch * 0.5 + ch + 24;
    L.piles.s = { x: W / 2 - cw - 12, y: by, slot: "↻" };
    L.piles.w = { x: W / 2 + 12, y: by, slot: "" };
    L.piles.x = { x: W - cw - 10, y: by, hidden: true };
    return L;
  },
  free(s, pid) {
    if (pid === "w") return s.p.w.length > 0;
    if (pid[0] !== "k" || !s.p[pid].length) return false;
    return !peakCovered(s, PYR_SLOTS, +pid.slice(1));
  },
  cardClass(s, pid, i) { return pid[0] === "k" && !this.free(s, pid) ? "dim" : ""; },
  pickable() { return false },
  tap(s, pid, i, sel) {
    if (pid === "s") {
      if (s.p.s.length) return { move: { t: "draw" } };
      if (s.pass < s.maxPass && s.p.w.length) return { move: { t: "recycle" } };
      toast("山札はもう使えません"); return null;
    }
    if (!this.free(s, pid)) return null;
    const e = pileTop(s.p[pid]);
    if (rankOf(e.c) === 13) return { move: { t: "rm", a: pid } };
    if (sel && sel !== pid && this.free(s, sel) && rankOf(pileTop(s.p[sel]).c) + rankOf(e.c) === 13) return { move: { t: "rm", a: sel, b: pid } };
    if (sel === pid) return { sel: null };
    return { sel: pid };
  },
  apply(s, m) {
    if (m.t === "draw") { const e = s.p.s.pop(); e.up = true; s.p.w.push(e); }
    else if (m.t === "recycle") { s.p.s = s.p.w.reverse().map((e) => ((e.up = false), e)); s.p.w = []; s.pass++; }
    else { for (const pid of [m.a, m.b]) if (pid) s.p.x.push(s.p[pid].pop()); }
  },
  won(s) { return PYR_SLOTS.every((_, i) => !s.p["k" + i].length); },
  pairs(s) {
    const fr = PYR_SLOTS.map((_, i) => "k" + i).filter((p) => this.free(s, p));
    if (s.p.w.length) fr.push("w");
    for (const a of fr) { if (rankOf(pileTop(s.p[a]).c) === 13) return [a]; for (const b of fr) if (a !== b && rankOf(pileTop(s.p[a]).c) + rankOf(pileTop(s.p[b]).c) === 13) return [a, b]; }
    return null;
  },
  stuck(s) { return !this.pairs(s) && !s.p.s.length && !(s.pass < s.maxPass && s.p.w.length); },
  hint(s) { const p = this.pairs(s); if (p) return { pid: p[0], i: 0, pid2: p[1] }; if (s.p.s.length || s.p.w.length) return { pid: "s", i: 0 }; return null; },
  score(s) { return PYR_SLOTS.filter((_, i) => s.p["k" + i].length).length; },
};

/* ---------- トライピークス ---------- */
const TRI_SLOTS = (() => {
  const a = [];
  [1.5, 4.5, 7.5].forEach((x) => a.push({ row: 0, x }));
  [1, 2, 4, 5, 7, 8].forEach((x) => a.push({ row: 1, x }));
  for (let i = 0; i < 9; i++) a.push({ row: 2, x: 0.5 + i });
  for (let i = 0; i < 10; i++) a.push({ row: 3, x: i });
  return a;
})();
const TriPeaks = {
  id: "tripeaks", name: "トライピークス", icon: "⛰️", tag: "連鎖",
  desc: "台札と数字が1つ違うカードを次々と取る。連続コンボが気持ちいい！",
  rules: "目的：3つの山のカードを全部取ります。\n\n・下の台札と「数字が1つ上か下」の表向きのカードをタップすると取れます（KとAもつながります）。\n・取れるカードがないときは、山札をタップして台札をめくります。\n・続けて取るほどコンボでスコアアップ！",
  opts: [],
  deal() {
    const d = shuffle(makeDeck()), p = {}; let k = 0;
    TRI_SLOTS.forEach((_, i) => { p["k" + i] = [E(k, d[k++], false)]; });
    p.s = []; while (k < 51) p.s.push(E(k, d[k++], false));
    p.w = [E(k, d[k], true)];
    const s = { p, combo: 0, score: 0 }; this.flipFree(s); return s;
  },
  flipFree(s) { TRI_SLOTS.forEach((_, i) => { const pl = s.p["k" + i]; if (pl.length && !peakCovered(s, TRI_SLOTS, i)) pl[0].up = true; }); },
  layout(s, W, H) {
    const cw = Math.min(W / 10.4, 52), ch = cw * 1.4, g = cw * 0.04, L = { cw, piles: {} }, x0 = (W - (10 * cw + 9 * g)) / 2;
    TRI_SLOTS.forEach((sl, i) => { L.piles["k" + i] = { x: x0 + sl.x * (cw + g), y: 40 + sl.row * ch * 0.5 }; });
    const by = 40 + 3 * ch * 0.5 + ch + 40;
    L.piles.s = { x: W / 2 - cw * 2.6, y: by, stackX: cw * 0.06, group: 1, slot: "" };
    L.piles.w = { x: W / 2 + cw * 0.6, y: by, slot: "" };
    return L;
  },
  near(a, b) { const d = Math.abs(rankOf(a) - rankOf(b)); return d === 1 || d === 12; },
  free(s, pid) { return pid[0] === "k" && s.p[pid].length && s.p[pid][0].up; },
  cardClass(s, pid) { return pid[0] === "k" && s.p[pid].length && s.p[pid][0].up && !this.near(s.p[pid][0].c, pileTop(s.p.w).c) ? "" : ""; },
  pickable() { return false; },
  tap(s, pid) {
    if (pid === "s") return s.p.s.length ? { move: { t: "draw" } } : null;
    if (!this.free(s, pid)) return null;
    if (!this.near(s.p[pid][0].c, pileTop(s.p.w).c)) return null;
    return { move: { t: "take", a: pid } };
  },
  apply(s, m) {
    if (m.t === "draw") { const e = s.p.s.pop(); e.up = true; s.p.w.push(e); s.combo = 0; }
    else { s.p.w.push(s.p[m.a].pop()); s.combo++; s.score += 100 * s.combo; this.flipFree(s); if (this.won(s)) s.score += 1000 + s.p.s.length * 200; }
  },
  won(s) { return TRI_SLOTS.every((_, i) => !s.p["k" + i].length); },
  movable(s) { return TRI_SLOTS.map((_, i) => "k" + i).filter((p) => this.free(s, p) && this.near(s.p[p][0].c, pileTop(s.p.w).c)); },
  stuck(s) { return !s.p.s.length && !this.movable(s).length; },
  hint(s) { const m = this.movable(s); if (m.length) return { pid: m[0], i: 0 }; if (s.p.s.length) return { pid: "s", i: s.p.s.length - 1 }; return null; },
  hud(s) { return "スコア " + s.score + (s.combo > 1 ? "　" + s.combo + "コンボ！" : ""); },
};

/* ---------- ゴルフ ---------- */
const Golf = {
  id: "golf", name: "ゴルフ", icon: "⛳", tag: "サクッと",
  desc: "台札と数字が1つ違うカードを取っていく。残り枚数が少ないほど高得点",
  rules: "目的：7列のカードをできるだけたくさん取ります（ゴルフのように、残った枚数が少ないほど良いスコア）。\n\n・各列のいちばん手前のカードが、下の台札と「数字が1つ上か下」なら取れます。\n・Kの上にはQだけ置けます（KとAはつながりません）。\n・取れないときは山札をタップして台札をめくります。\n・全部取れたら完全クリア！",
  opts: [],
  deal() {
    const d = shuffle(makeDeck()), p = {}; let k = 0;
    for (let i = 0; i < 7; i++) { p["t" + i] = []; for (let j = 0; j < 5; j++) p["t" + i].push(E(k, d[k++], true)); }
    p.s = []; while (k < 51) p.s.push(E(k, d[k++], false));
    p.w = [E(k, d[k], true)];
    return { p };
  },
  layout(s, W, H) {
    const cw = Math.min((W - 8 * 4) / 7, 62), ch = cw * 1.4, xs = cols(7, W, cw), L = { cw, piles: {} };
    for (let i = 0; i < 7; i++) L.piles["t" + i] = { x: xs[i], y: 34, dy: ch * 0.32, slot: "" };
    const by = 34 + 4 * ch * 0.32 + ch + 36;
    L.piles.s = { x: W / 2 - cw * 2.4, y: by, stackX: cw * 0.06, group: 1, slot: "" };
    L.piles.w = { x: W / 2 + cw * 0.6, y: by };
    return L;
  },
  near(a, b) { return Math.abs(rankOf(a) - rankOf(b)) === 1; },
  pickable() { return false; },
  tap(s, pid, i) {
    if (pid === "s") return s.p.s.length ? { move: { t: "draw" } } : null;
    if (pid[0] !== "t") return null;
    const pile = s.p[pid]; if (!pile.length || i !== pile.length - 1) return null;
    if (!this.near(pileTop(pile).c, pileTop(s.p.w).c)) return null;
    return { move: { t: "take", a: pid } };
  },
  apply(s, m) {
    if (m.t === "draw") { const e = s.p.s.pop(); e.up = true; s.p.w.push(e); }
    else s.p.w.push(s.p[m.a].pop());
  },
  won(s) { return [0, 1, 2, 3, 4, 5, 6].every((i) => !s.p["t" + i].length); },
  movable(s) { return [0, 1, 2, 3, 4, 5, 6].map((i) => "t" + i).filter((p) => s.p[p].length && this.near(pileTop(s.p[p]).c, pileTop(s.p.w).c)); },
  stuck(s) { return !s.p.s.length && !this.movable(s).length; },
  hint(s) { const m = this.movable(s); if (m.length) return { pid: m[0], i: s.p[m[0]].length - 1 }; if (s.p.s.length) return { pid: "s", i: s.p.s.length - 1 }; return null; },
  score(s) { return [0, 1, 2, 3, 4, 5, 6].reduce((a, i) => a + s.p["t" + i].length, 0); },
  hud(s) { return "残り " + this.score(s) + "枚"; },
};

const SOLO_GAMES = [Klondike, Spider, FreeCell, Pyramid, TriPeaks, Golf];

/* ===== ソリティアの進行（表示・操作・アンドゥ） ===== */
class SoloRunner {
  constructor(game, opt, area) {
    this.g = game; this.opt = opt; this.area = area;
    this.els = {}; this.slots = {};
  }
  start() {
    this.s = this.g.deal(this.opt);
    this.hist = []; this.moves = 0; this.t0 = Date.now(); this.sel = null; this.busy = false; this.done = false; this.counted = false;
    this.mount(); this.render(); this.runAuto();
  }
  mount() {
    const a = this.area; a.innerHTML = "";
    clearInterval(this._iv);
    this.board = h("div", { class: "board" });
    this.hudL = h("span", { class: "pill" }); this.hudR = h("span", { class: "pill" });
    a.append(this.board, h("div", { class: "hud" }, this.hudL, this.hudR));
    this.tools = h("div", { class: "tools" },
      h("button", { class: "btn ghost", onclick: () => this.undo() }, "↩︎ もどす"),
      h("button", { class: "btn ghost", onclick: () => this.hint() }, "💡 ヒント"),
      this.finishBtn = h("button", { class: "btn lemon", style: { display: "none" }, onclick: () => this.finish() }, "✨ 自動で完成"),
      h("button", { class: "btn ghost", onclick: () => this.confirmNew() }, "🔄 新しく"));
    a.append(this.tools);
    this.els = {}; this.slots = {};
    this.bindInput();
    this._iv = setInterval(() => this.updHud(), 1000);
    this._ro = () => this.render();
    window.addEventListener("resize", this._ro);
  }
  destroy() { clearInterval(this._iv); window.removeEventListener("resize", this._ro); this.done = true; }
  dims() { return { W: this.area.clientWidth, H: this.area.clientHeight - 58 }; }
  updHud() {
    const t = (Date.now() - this.t0) / 1000;
    this.hudL.textContent = "⏱ " + fmtTime(this.done ? this.tEnd || t : t);
    this.hudR.textContent = this.g.hud ? this.g.hud(this.s) : "手数 " + this.moves;
  }
  /* 各カードの座標を求めて描画（同じカードは同じ要素を使い回すので、移動がなめらかにアニメーションする） */
  render() {
    const { W, H } = this.dims();
    const L = (this.L = this.g.layout(this.s, W, H));
    const cw = L.cw, ch = cw * 1.4;
    setCardSize(this.board, cw);
    this.pos = {};
    const seen = new Set();
    let z = 1;
    for (const pid in L.piles) {
      const P = L.piles[pid], pile = this.s.p[pid] || [];
      if (P.slot !== undefined) {
        let sl = this.slots[pid];
        if (!sl) { sl = this.slots[pid] = h("div", { class: "slot", "data-pid": pid }); this.board.prepend(sl); }
        sl.textContent = P.slot; sl.style.left = P.x + "px"; sl.style.top = P.y + "px";
      }
      // 列が長いときは間隔を詰める
      let dy = P.dy || 0, dyD = P.dyDown != null ? P.dyDown : dy;
      if (P.maxH && pile.length > 1) {
        let need = 0; for (let i = 0; i < pile.length - 1; i++) need += pile[i].up ? dy : dyD;
        const room = P.maxH - ch;
        if (need > room && need > 0) { const f = Math.max(room, 0) / need; dy *= f; dyD *= f; }
      }
      let x = P.x, y = P.y;
      const n = pile.length;
      pile.forEach((e, i) => {
        let ex = x, ey = y;
        if (P.fanX) { const k = Math.max(0, i - (n - P.fanLast)); ex = P.x + k * P.fanX; }
        if (P.stackX) { ex = P.x + Math.floor(i / P.group) * P.stackX; }
        let el = this.els[e.k];
        if (!el) { el = this.els[e.k] = h("div", { class: "card" }); this.board.append(el); }
        paintCard(el, e.c, !e.up);
        el.style.left = ex + "px"; el.style.top = ey + "px"; el.style.zIndex = z++;
        el.style.opacity = P.hidden ? "0" : "1";
        el.style.pointerEvents = P.hidden ? "none" : "";
        el.dataset.pid = pid; el.dataset.i = i;
        const cc = this.g.cardClass ? this.g.cardClass(this.s, pid, i) : "";
        el.classList.toggle("dim", cc === "dim");
        el.classList.toggle("sel", this.sel === pid && i === n - 1);
        el.classList.remove("hint");
        this.pos[e.k] = { x: ex, y: ey };
        seen.add(e.k);
        if (P.dy || P.dyDown) y += e.up ? dy : dyD;
      });
    }
    for (const k in this.els) if (!seen.has(+k)) { this.els[k].remove(); delete this.els[k]; }
    this.updHud();
    if (this.finishBtn) this.finishBtn.style.display = this.g.canFinish && !this.done && this.g.canFinish(this.s) ? "" : "none";
  }
  bindInput() {
    const b = this.board;
    let drag = null;
    const pt = (e) => ({ x: e.clientX, y: e.clientY });
    b.addEventListener("pointerdown", (e) => {
      if (this.busy || this.done) return;
      Snd.init();
      const el = e.target.closest(".card,.slot"); if (!el) return;
      const pid = el.dataset.pid, i = el.classList.contains("slot") ? -1 : +el.dataset.i;
      drag = { pid, i, el, start: pt(e), moved: false, els: [] };
      if (i >= 0 && this.g.pickable(this.s, pid, i)) {
        const pile = this.s.p[pid];
        drag.els = pile.slice(i).map((x) => this.els[x.k]);
        drag.org = drag.els.map((x) => ({ x: parseFloat(x.style.left), y: parseFloat(x.style.top) }));
      }
      b.setPointerCapture && b.setPointerCapture(e.pointerId);
    });
    b.addEventListener("pointermove", (e) => {
      if (!drag || !drag.els.length) return;
      const p = pt(e), dx = p.x - drag.start.x, dy = p.y - drag.start.y;
      if (!drag.moved && Math.hypot(dx, dy) < 7) return;
      drag.moved = true;
      drag.els.forEach((x, j) => { x.classList.add("dragging"); x.style.left = drag.org[j].x + dx + "px"; x.style.top = drag.org[j].y + dy + "px"; x.style.zIndex = 900 + j; });
    });
    const end = (e) => {
      if (!drag) return;
      const d = drag; drag = null;
      d.els.forEach((x) => x.classList.remove("dragging"));
      if (d.moved) {
        const r = d.els[0].getBoundingClientRect(), br = this.board.getBoundingClientRect();
        const cx = r.left - br.left + r.width / 2, cy = r.top - br.top + r.height / 2;
        let best = null, bd = 1e9;
        for (const pid in this.L.piles) {
          if (pid === d.pid || this.L.piles[pid].hidden) continue;
          const P = this.L.piles[pid], pile = this.s.p[pid] || [];
          const last = pile.length ? this.pos[pile[pile.length - 1].k] : { x: P.x, y: P.y };
          const tx = last.x + this.L.cw / 2, ty = last.y + this.L.cw * 0.7;
          const dist = Math.hypot(tx - cx, ty - cy);
          if (dist < bd && dist < this.L.cw * 1.4) {
            if (this.g.drop && this.g.drop(this.s, d.pid, d.i, pid)) { bd = dist; best = pid; }
          }
        }
        if (best) this.doMove(this.g.drop(this.s, d.pid, d.i, best));
        else { this.render(); }
        return;
      }
      // タップ
      const r = this.g.tap(this.s, d.pid, d.i, this.sel);
      if (!r) { if (d.el.classList.contains("card")) { d.el.classList.remove("shake"); void d.el.offsetWidth; d.el.classList.add("shake"); } if (this.sel) { this.sel = null; this.render(); } return; }
      if ("sel" in r && !r.move) { this.sel = r.sel; Snd.tick(); this.render(); return; }
      this.sel = null;
      this.doMove(r.move);
    };
    b.addEventListener("pointerup", end);
    b.addEventListener("pointercancel", () => { drag = null; this.render(); });
  }
  async doMove(m) {
    if (!m) return;
    if (!this.counted) { this.counted = true; Save.stat(this.g.id).plays++; Save.write(); }
    this.hist.push(JSON.stringify({ s: this.s, moves: this.moves }));
    if (this.hist.length > 400) this.hist.shift();
    this.g.apply(this.s, m);
    this.moves++;
    if (m.t === "draw" || m.t === "deal") Snd.card(); else Snd.place();
    Native.haptic("soft");
    this.render();
    await this.runAuto();
    this.check();
  }
  async runAuto() {
    if (!this.g.auto) return;
    this.busy = true;
    for (let n = 0; n < 60; n++) {
      const m = this.g.auto(this.s); if (!m) break;
      await sleep(130);
      if (this.done && !this.s) break;
      if (!(this.g.applyAuto && this.g.applyAuto(this.s, m))) this.g.apply(this.s, m);
      Snd.place(); this.render();
    }
    this.busy = false;
  }
  async finish() {
    this.busy = true;
    for (let n = 0; n < 60; n++) { const m = this.g.finishStep(this.s); if (!m) break; this.g.apply(this.s, m); this.moves++; Snd.place(); this.render(); await sleep(90); }
    this.busy = false; this.check();
  }
  undo() {
    if (this.busy || this.done || !this.hist.length) return;
    const o = JSON.parse(this.hist.pop()); this.s = o.s; this.moves = o.moves; this.sel = null; Snd.tick(); this.render();
  }
  hint() {
    if (this.busy || this.done) return;
    const m = this.g.hint && this.g.hint(this.s);
    if (!m) { toast("動かせるカードがないみたい…"); return; }
    const mark = (pid, i) => { const pile = this.s.p[pid]; if (!pile || !pile.length) { const sl = this.slots[pid]; if (sl) { sl.classList.remove("hint"); void sl.offsetWidth; } return; } const e = pile[Math.max(0, Math.min(i, pile.length - 1))]; const el = this.els[e.k]; if (el) { el.classList.remove("hint"); void el.offsetWidth; el.classList.add("hint"); } };
    mark(m.pid, m.i); if (m.pid2) mark(m.pid2, 0);
    if (m.to) { const pile = this.s.p[m.to]; if (pile.length) mark(m.to, pile.length - 1); }
    if (m.pid === "s") toast("山札をめくってみよう");
  }
  check() {
    if (this.done) return;
    if (this.g.won(this.s)) return this.win();
    if (this.g.stuck && this.g.stuck(this.s)) this.lose();
  }
  win() {
    this.done = true; this.tEnd = (Date.now() - this.t0) / 1000;
    const st = Save.stat(this.g.id); st.wins++;
    const t = Math.round(this.tEnd);
    let best = false;
    if (!st.best || t < st.best) { st.best = t; best = true; }
    if (this.g.id === "tripeaks" && (!st.hi || this.s.score > st.hi)) st.hi = this.s.score;
    Save.write();
    Snd.win(); confetti(80); Native.haptic("success");
    const cid = Save.data.me.char;
    setTimeout(() => App.runner === this && modal(h("div", null,
      h("img", { class: "chr", src: CHARS[cid].img }),
      h("h3", null, "クリア！🎉"),
      h("p", null, "「" + charLine(cid, "win") + "」"),
      h("p", null, "タイム " + fmtTime(t) + "　手数 " + this.moves + (this.g.id === "tripeaks" ? "　スコア " + this.s.score : "")),
      best ? h("p", { style: { color: "var(--pink)", fontWeight: 800 } }, "⭐ ベストタイム更新！") : null,
      h("div", { class: "row" }, h("button", { class: "btn ghost", onclick: () => { closeModal(); App.backFromGame(); } }, "やめる"), h("button", { class: "btn pink", onclick: () => { closeModal(); this.start(); } }, "もう一回"))), { lock: true }), 700);
  }
  lose() {
    const sc = this.g.score ? this.g.score(this.s) : null;
    if (this.g.id === "golf") { const st = Save.stat("golf"); if (st.low == null || sc < st.low) st.low = sc; Save.write(); }
    if (this.g.id === "tripeaks") { const st = Save.stat("tripeaks"); if (!st.hi || this.s.score > st.hi) st.hi = this.s.score; Save.write(); }
    const cid = Save.data.me.char;
    setTimeout(() => App.runner === this && !this.done && modal(h("div", null,
      h("img", { class: "chr", src: CHARS[cid].img }),
      h("h3", null, "もう動かせないよ"),
      h("p", null, this.g.id === "golf" ? "残り " + sc + " 枚でした" : this.g.id === "tripeaks" ? "スコア " + this.s.score : sc != null ? "残り " + sc + " 枚でした" : ""),
      h("p", null, "「" + charLine(cid, "lose") + "」"),
      h("div", { class: "row" }, h("button", { class: "btn ghost", onclick: () => { closeModal(); this.undo(); } }, "もどす"), h("button", { class: "btn pink", onclick: () => { closeModal(); this.start(); } }, "新しく配る")))), 500);
  }
  confirmNew() {
    if (this.busy) return;
    if (!this.moves || this.done) return this.start();
    modal(h("div", null, h("h3", null, "新しく配りますか？"), h("p", null, "いまのゲームはおしまいになります"),
      h("div", { class: "row" }, h("button", { class: "btn ghost", onclick: closeModal }, "つづける"), h("button", { class: "btn pink", onclick: () => { closeModal(); this.start(); } }, "配る"))));
  }
}
