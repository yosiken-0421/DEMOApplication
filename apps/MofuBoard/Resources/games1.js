"use strict";
/* ===== 2人で遊ぶ定番ボードゲーム：リバーシ・五目ならべ・四目ならべ・マンカラ・ドット＆ボックス ===== */

/* 2人用ゲームの共通結果 */
function result2(s, scores, note) {
  const w = s.winner;
  if (w == null || w < 0) return [0, 1].map((seat) => ({ seat, rank: 0, score: scores ? scores[seat] : "", note: note || "ひきわけ" }));
  return [w, 1 - w].map((seat, k) => ({ seat, rank: k, score: scores ? scores[seat] : "" }));
}
function players2(s, T, extra) {
  T.players((i) => Object.assign({ turn: !s.over && s.turn === i, color: SEAT_COLORS[i] }, extra ? extra(i) : {}));
}

/* ---------- リバーシ ---------- */
const DIR8 = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const RV_W = [
  120, -20, 20, 5, 5, 20, -20, 120,
  -20, -40, -5, -5, -5, -5, -40, -20,
  20, -5, 15, 3, 3, 15, -5, 20,
  5, -5, 3, 3, 3, 3, -5, 5,
  5, -5, 3, 3, 3, 3, -5, 5,
  20, -5, 15, 3, 3, 15, -5, 20,
  -20, -40, -5, -5, -5, -5, -40, -20,
  120, -20, 20, 5, 5, 20, -20, 120];
const Reversi = {
  id: "reversi", name: "リバーシ", icon: "⚫", min: 2, max: 2, tag: "定番",
  desc: "はさんでひっくり返す！最後に多いほうが勝ち。シンプルだけど奥が深い",
  rules: "・8×8のマスに、黒（先手）と白（後手）が交互に石を置きます。\n・相手の石を自分の石ではさめる場所にしか置けません。\n・はさんだ石はすべて自分の色にひっくり返ります（たて・よこ・ななめ）。\n・置ける場所がないときは自動でパスになります。\n・両方とも置けなくなったら終了。石が多いほうの勝ち！\n\n光っているマスが置ける場所です。角を取ると有利！",
  opts: [],
  setup(n) {
    const b = Array(64).fill(0);
    b[27] = 2; b[28] = 1; b[35] = 1; b[36] = 2;
    return { n, b, turn: 0, last: -1, flips: [], over: false, events: [] };
  },
  flipsFor(b, i, me) {
    if (b[i]) return [];
    const r = i >> 3, c = i & 7, op = 3 - me, out = [];
    for (const [dr, dc] of DIR8) {
      const line = []; let rr = r + dr, cc = c + dc;
      while (rr >= 0 && rr < 8 && cc >= 0 && cc < 8 && b[rr * 8 + cc] === op) { line.push(rr * 8 + cc); rr += dr; cc += dc; }
      if (line.length && rr >= 0 && rr < 8 && cc >= 0 && cc < 8 && b[rr * 8 + cc] === me) out.push(...line);
    }
    return out;
  },
  moves(b, me) { const out = []; for (let i = 0; i < 64; i++) if (!b[i] && this.flipsFor(b, i, me).length) out.push(i); return out; },
  count(b) { let x = 0, y = 0; for (const v of b) { if (v === 1) x++; else if (v === 2) y++; } return [x, y]; },
  actors(s) { return s.over ? [] : [s.turn]; },
  valid(s, seat, m) { return seat === s.turn && m.t === "put" && m.i >= 0 && m.i < 64 && this.flipsFor(s.b, m.i, seat + 1).length > 0; },
  apply(s, seat, m) {
    const f = this.flipsFor(s.b, m.i, seat + 1);
    s.b[m.i] = seat + 1; f.forEach((k) => (s.b[k] = seat + 1));
    s.last = m.i; s.flips = f;
    if (f.length >= 6) ev(s, seat, "say", "good");
    if ([0, 7, 56, 63].includes(m.i)) ev(s, 1 - seat, "say", "bad");
    const nx = 1 - seat;
    if (this.moves(s.b, nx + 1).length) s.turn = nx;
    else if (this.moves(s.b, seat + 1).length) { ev(s, -1, "toast", (s.names ? s.names[nx] : "") + " は置けないのでパス"); s.turn = seat; }
    else this.finish(s);
  },
  finish(s) {
    const [a, b] = this.count(s.b);
    s.over = true; s.winner = a === b ? -1 : a > b ? 0 : 1;
    if (s.winner >= 0) { ev(s, s.winner, "say", "win"); ev(s, 1 - s.winner, "say", "lose"); }
  },
  evalB(b, me) {
    const op = 3 - me; let v = 0, mine = 0, his = 0;
    for (let i = 0; i < 64; i++) { if (b[i] === me) { v += RV_W[i]; mine++; } else if (b[i] === op) { v -= RV_W[i]; his++; } }
    // 角を取ったあとは隣も悪くない
    for (const [cn, adj] of [[0, [1, 8, 9]], [7, [6, 14, 15]], [56, [48, 49, 57]], [63, [54, 55, 62]]]) {
      if (b[cn]) for (const a of adj) { if (b[a] === me) v += 25; else if (b[a] === op) v -= 25; }
    }
    const mm = this.moves(b, me).length, om = this.moves(b, op).length;
    v += (mm - om) * 6;
    if (mine + his > 54) v += (mine - his) * 10;
    return v;
  },
  search(b, me, depth, a, bt, chk) {
    chk();
    const ms = this.moves(b, me);
    if (depth === 0) return this.evalB(b, me);
    if (!ms.length) {
      if (!this.moves(b, 3 - me).length) { const [x, y] = this.count(b); const d = me === 1 ? x - y : y - x; return d * 1000; }
      return -this.search(b, 3 - me, depth - 1, -bt, -a, chk);
    }
    let best = -1e9;
    for (const i of ms) {
      const nb = b.slice(); nb[i] = me; this.flipsFor(b, i, me).forEach((k) => (nb[k] = me));
      const v = -this.search(nb, 3 - me, depth - 1, -bt, -a, chk);
      if (v > best) best = v;
      if (best > a) a = best;
      if (a >= bt) break;
    }
    return best;
  },
  cpu(s, seat, level) {
    const me = seat + 1, ms = this.moves(s.b, me);
    if (!ms.length) return null;
    if (level === 0) {
      const sc = ms.map((i) => ({ m: { t: "put", i }, v: this.flipsFor(s.b, i, me).length + RV_W[i] / 40 + Math.random() * 3 }));
      return pickByLevel(sc, 0);
    }
    const empty = s.b.filter((x) => !x).length;
    const chk = deadline(level === 2 ? 1200 : 500);
    let best = null;
    const maxD = level === 1 ? 2 : empty <= 12 ? 12 : 6;
    for (let d = 1; d <= maxD; d++) {
      try {
        const sc = ms.map((i) => {
          const nb = s.b.slice(); nb[i] = me; this.flipsFor(s.b, i, me).forEach((k) => (nb[k] = me));
          return { m: { t: "put", i }, v: -this.search(nb, 3 - me, d - 1, -1e9, 1e9, chk) + Math.random() * 0.5 };
        });
        best = pickByLevel(sc, 2);
      } catch (e) { if (!(e instanceof TimeUp)) throw e; break; }
    }
    return best || { t: "put", i: ms[0] };
  },
  cpuDelay() { return 600 + rnd(400); },
  result(s) { const c = this.count(s.b); return result2(s, c.map((x) => x + "個")); },
  render(s, T) {
    const cnt = this.count(s.b);
    T.players((i) => ({ turn: !s.over && s.turn === i, score: (i === 0 ? "⚫" : "⚪") + cnt[i] }));
    const mid = T.mid();
    const mine = T.myTurn && s.turn === T.me;
    T.bottom({ status: T.turnText(s.turn, "光るマスに置こう"), hot: mine });
    const B = boardBox(mid, T, 8, 8, { cls: "rv-board" });
    const legal = mine ? new Set(this.moves(s.b, s.turn + 1)) : new Set();
    const flips = new Set(s.flips || []);
    for (let i = 0; i < 64; i++) {
      const r = i >> 3, c = i & 7;
      const cell = at(B.el, B.x(c), B.y(r), B.cs, B.cs, "rv-cell" + (legal.has(i) ? " can" : ""), { onclick: legal.has(i) ? () => T.act({ t: "put", i }) : null });
      if (s.b[i]) cell.append(h("div", { class: "disc " + (s.b[i] === 1 ? "black" : "white") + (i === s.last ? " last pop" : "") + (flips.has(i) ? " flip" : "") }));
    }
    for (const [r, c] of [[2, 2], [2, 6], [6, 2], [6, 6]]) at(B.el, B.x(c) - 3, B.y(r) - 3, 6, 6, "rv-dot");
  },
};

/* ---------- 五目ならべ ---------- */
const GOMOKU_N = 15;
const Gomoku = {
  id: "gomoku", name: "五目ならべ", icon: "⚪", min: 2, max: 2, tag: "定番",
  desc: "たて・よこ・ななめに5つ並べたら勝ち！先に並べるのはどっち？",
  rules: "・15×15の交点に、黒（先手）と白（後手）が交互に石を置きます。\n・たて・よこ・ななめのどれかに、自分の石を5つ以上並べたら勝ち！\n・置ける場所がなくなったら引き分けです。\n\nこのアプリでは禁じ手なしのルールです。相手の「4」や「3」をふさぐのがコツ。",
  opts: [],
  setup(n) { return { n, b: Array(GOMOKU_N * GOMOKU_N).fill(0), turn: 0, last: -1, over: false, events: [], line: null }; },
  actors(s) { return s.over ? [] : [s.turn]; },
  valid(s, seat, m) { return seat === s.turn && m.t === "put" && m.i >= 0 && m.i < s.b.length && !s.b[m.i]; },
  lineAt(b, i, me) {
    const N = GOMOKU_N, r = Math.floor(i / N), c = i % N;
    for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
      const cells = [i];
      for (const sg of [1, -1]) { let rr = r + dr * sg, cc = c + dc * sg; while (rr >= 0 && rr < N && cc >= 0 && cc < N && b[rr * N + cc] === me) { cells.push(rr * N + cc); rr += dr * sg; cc += dc * sg; } }
      if (cells.length >= 5) return cells;
    }
    return null;
  },
  apply(s, seat, m) {
    s.b[m.i] = seat + 1; s.last = m.i;
    const line = this.lineAt(s.b, m.i, seat + 1);
    if (line) { s.over = true; s.winner = seat; s.line = line; ev(s, seat, "say", "win"); ev(s, 1 - seat, "say", "lose"); return; }
    if (!s.b.includes(0)) { s.over = true; s.winner = -1; return; }
    s.turn = 1 - seat;
  },
  /* 1方向のつながりの評価 */
  dirScore(b, r, c, dr, dc, me) {
    const N = GOMOKU_N; let cnt = 1, open = 0;
    for (const sg of [1, -1]) {
      let rr = r + dr * sg, cc = c + dc * sg;
      while (rr >= 0 && rr < N && cc >= 0 && cc < N && b[rr * N + cc] === me) { cnt++; rr += dr * sg; cc += dc * sg; }
      if (rr >= 0 && rr < N && cc >= 0 && cc < N && b[rr * N + cc] === 0) open++;
    }
    if (cnt >= 5) return 1e7;
    if (cnt === 4) return open === 2 ? 1e6 : open === 1 ? 1e5 : 0;
    if (cnt === 3) return open === 2 ? 5e4 : open === 1 ? 2000 : 0;
    if (cnt === 2) return open === 2 ? 1000 : open === 1 ? 100 : 0;
    return open === 2 ? 20 : open ? 4 : 0;
  },
  cellScore(b, i, me) {
    const N = GOMOKU_N, r = Math.floor(i / N), c = i % N; let v = 0, big = 0;
    for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) { const x = this.dirScore(b, r, c, dr, dc, me); v += x; if (x >= 5e4) big++; }
    if (big >= 2) v += 4e5; // 4-3や3-3の両狙い
    return v;
  },
  cands(b) {
    const N = GOMOKU_N, out = [];
    let any = false;
    for (let i = 0; i < b.length; i++) {
      if (b[i]) { any = true; continue; }
      const r = Math.floor(i / N), c = i % N;
      let near = false;
      for (let dr = -2; dr <= 2 && !near; dr++) for (let dc = -2; dc <= 2; dc++) {
        const rr = r + dr, cc = c + dc;
        if (rr >= 0 && rr < N && cc >= 0 && cc < N && b[rr * N + cc]) { near = true; break; }
      }
      if (near) out.push(i);
    }
    if (!any) out.push(Math.floor(b.length / 2));
    return out;
  },
  cpu(s, seat, level) {
    const me = seat + 1, op = 2 - seat, b = s.b;
    const att = level === 0 ? 0.7 : 1.1, def = level === 0 ? 0.6 : 1.0;
    let sc = this.cands(b).map((i) => ({ m: { t: "put", i }, v: this.cellScore(b, i, me) * att + this.cellScore(b, i, op) * def + Math.random() * (level === 0 ? 400 : 10) }));
    // 先読み（つよい）：上位の手に対して相手の最善応手を引く
    if (level === 2) {
      sc.sort((a, c) => c.v - a.v);
      const top = sc.slice(0, 8);
      for (const x of top) {
        if (x.v >= 1e7 * 1.1) continue;
        const nb = b.slice(); nb[x.m.i] = me;
        let worst = 0;
        for (const j of this.cands(nb)) { const v = this.cellScore(nb, j, op) * 1.1 + this.cellScore(nb, j, me) * 0.5; if (v > worst) worst = v; }
        x.v = x.v - worst * 0.6;
      }
      sc = top;
    }
    return pickByLevel(sc, level === 0 ? 0 : 2);
  },
  cpuDelay() { return 500 + rnd(500); },
  result(s) { return result2(s); },
  render(s, T) {
    players2(s, T, (i) => ({ score: i === 0 ? "⚫ 先手" : "⚪ 後手" }));
    const mid = T.mid();
    const mine = T.myTurn && s.turn === T.me;
    T.bottom({ status: T.turnText(s.turn, "交点をタップ"), hot: mine });
    const N = GOMOKU_N;
    const B = boardBox(mid, T, N, N, { cls: "go-board", pad: 6 });
    const line = new Set(s.line || []);
    const cs = B.cs;
    // 線
    for (let k = 0; k < N; k++) {
      at(B.el, B.x(0) + cs / 2, B.y(k) + cs / 2 - 0.5, cs * (N - 1), 1, "go-line");
      at(B.el, B.x(k) + cs / 2 - 0.5, B.y(0) + cs / 2, 1, cs * (N - 1), "go-line");
    }
    for (const [r, c] of [[3, 3], [3, 11], [7, 7], [11, 3], [11, 11]]) at(B.el, B.x(c) + cs / 2 - 3, B.y(r) + cs / 2 - 3, 6, 6, "go-star");
    const pend = T.ui.pend;
    for (let i = 0; i < N * N; i++) {
      const r = Math.floor(i / N), c = i % N;
      const cell = at(B.el, B.x(c), B.y(r), cs, cs, "go-cell", {
        onclick: mine && !s.b[i] ? () => {
          // 誤タップ防止：1回目で仮置き、もう一度タップで決定
          if (T.ui.pend === i) { T.ui.pend = null; T.act({ t: "put", i }); } else { T.ui.pend = i; T.redraw(); }
        } : null });
      if (s.b[i]) cell.append(h("div", { class: "stone " + (s.b[i] === 1 ? "black" : "white") + (i === s.last ? " last pop" : "") + (line.has(i) ? " win" : "") }));
      else if (mine && pend === i) cell.append(h("div", { class: "stone ghost " + (s.turn === 0 ? "black" : "white") }));
    }
    if (mine && pend != null) T.area.querySelector(".status-line").textContent = "もう一度タップで決定";
  },
};

/* ---------- 四目ならべ ---------- */
const C4R = 6, C4C = 7;
const Connect4 = {
  id: "connect4", name: "四目ならべ", icon: "🔴", min: 2, max: 2, tag: "かんたん",
  desc: "コマを上から落として、4つ並べたら勝ち！重力つきの頭脳戦",
  rules: "・7列×6段のわくに、交互にコマを落とします（列をタップ）。\n・コマは下までストンと落ちます。\n・たて・よこ・ななめに自分のコマを4つ並べたら勝ち！\n・全部うまったら引き分けです。",
  opts: [],
  setup(n) { return { n, b: Array(C4R * C4C).fill(0), turn: 0, last: -1, over: false, events: [], line: null }; },
  actors(s) { return s.over ? [] : [s.turn]; },
  drop(b, c) { for (let r = C4R - 1; r >= 0; r--) if (!b[r * C4C + c]) return r * C4C + c; return -1; },
  valid(s, seat, m) { return seat === s.turn && m.t === "drop" && m.c >= 0 && m.c < C4C && this.drop(s.b, m.c) >= 0; },
  win(b, i, me) {
    const r = Math.floor(i / C4C), c = i % C4C;
    for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
      const cells = [i];
      for (const sg of [1, -1]) { let rr = r + dr * sg, cc = c + dc * sg; while (rr >= 0 && rr < C4R && cc >= 0 && cc < C4C && b[rr * C4C + cc] === me) { cells.push(rr * C4C + cc); rr += dr * sg; cc += dc * sg; } }
      if (cells.length >= 4) return cells;
    }
    return null;
  },
  apply(s, seat, m) {
    const i = this.drop(s.b, m.c);
    s.b[i] = seat + 1; s.last = i;
    const w = this.win(s.b, i, seat + 1);
    if (w) { s.over = true; s.winner = seat; s.line = w; ev(s, seat, "say", "win"); ev(s, 1 - seat, "say", "lose"); return; }
    if (!s.b.includes(0)) { s.over = true; s.winner = -1; return; }
    s.turn = 1 - seat;
  },
  evalB(b, me) {
    const op = 3 - me; let v = 0;
    const win4 = (cells) => {
      let a = 0, o = 0; for (const k of cells) { if (b[k] === me) a++; else if (b[k] === op) o++; }
      if (a && o) return 0;
      if (a === 3) return 50; if (a === 2) return 8; if (o === 3) return -55; if (o === 2) return -8; return 0;
    };
    for (let r = 0; r < C4R; r++) for (let c = 0; c < C4C; c++) {
      for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
        const er = r + dr * 3, ec = c + dc * 3;
        if (er < 0 || er >= C4R || ec < 0 || ec >= C4C) continue;
        v += win4([0, 1, 2, 3].map((k) => (r + dr * k) * C4C + c + dc * k));
      }
    }
    for (let r = 0; r < C4R; r++) { if (b[r * C4C + 3] === me) v += 6; else if (b[r * C4C + 3] === op) v -= 6; }
    return v;
  },
  search(b, me, depth, a, bt, chk) {
    chk();
    if (depth === 0) return this.evalB(b, me);
    let best = -1e9, any = false;
    for (const c of [3, 2, 4, 1, 5, 0, 6]) {
      const i = this.drop(b, c); if (i < 0) continue;
      any = true;
      b[i] = me;
      let v;
      if (this.win(b, i, me)) v = 10000 + depth;
      else v = -this.search(b, 3 - me, depth - 1, -bt, -a, chk);
      b[i] = 0;
      if (v > best) best = v;
      if (best > a) a = best;
      if (a >= bt) break;
    }
    return any ? best : 0;
  },
  cpu(s, seat, level) {
    const me = seat + 1, cols = [...Array(C4C).keys()].filter((c) => this.drop(s.b, c) >= 0);
    const depthMax = [2, 4, 9][level];
    const chk = deadline(level === 2 ? 1000 : 400);
    let res = null;
    for (let d = 1; d <= depthMax; d++) {
      try {
        const sc = cols.map((c) => {
          const b = s.b.slice(), i = this.drop(b, c); b[i] = me;
          const v = this.win(b, i, me) ? 1e5 : -this.search(b, 3 - me, d - 1, -1e9, 1e9, chk);
          return { m: { t: "drop", c }, v: v + Math.random() * (level === 0 ? 30 : 0.5) };
        });
        res = sc;
      } catch (e) { if (!(e instanceof TimeUp)) throw e; break; }
    }
    return pickByLevel(res || cols.map((c) => ({ m: { t: "drop", c }, v: 0 })), level === 0 ? 1 : 2);
  },
  cpuDelay() { return 500 + rnd(400); },
  result(s) { return result2(s); },
  render(s, T) {
    players2(s, T, (i) => ({ mark: "" }));
    const mid = T.mid();
    const mine = T.myTurn && s.turn === T.me;
    T.bottom({ status: T.turnText(s.turn, "列をタップして落とそう"), hot: mine });
    const B = boardBox(mid, T, C4C, C4R + 0.7, { cls: "c4-board" });
    const cs = B.cs, line = new Set(s.line || []);
    const top = cs * 0.7;
    for (let c = 0; c < C4C; c++) {
      const can = mine && this.drop(s.b, c) >= 0;
      at(B.el, B.x(c), B.y(0), cs, top + cs * C4R, "c4-col" + (can ? " can" : ""), { onclick: can ? () => T.act({ t: "drop", c }) : null });
      if (can) at(B.el, B.x(c) + cs * 0.2, B.y(0) + top * 0.1, cs * 0.6, top * 0.7, "c4-arrow", null, "▼");
    }
    const frame = at(B.el, B.x(0), B.y(0) + top, cs * C4C, cs * C4R, "c4-frame");
    frame.style.pointerEvents = "none";
    for (let i = 0; i < C4R * C4C; i++) {
      const r = Math.floor(i / C4C), c = i % C4C;
      const hole = at(B.el, B.x(c) + cs * 0.08, B.y(r) + top + cs * 0.08, cs * 0.84, cs * 0.84, "c4-hole");
      hole.style.pointerEvents = "none";
      if (s.b[i]) {
        const p = h("div", { class: "c4-piece" + (i === s.last ? " drop" : "") + (line.has(i) ? " win" : ""), style: { background: SEAT_COLORS[s.b[i] - 1] } });
        if (i === s.last) p.style.setProperty("--fall", -(r + 1) * cs - top + "px");
        hole.append(p);
      }
    }
  },
};

/* ---------- マンカラ（カラハ） ---------- */
const Mancala = {
  id: "mancala", name: "マンカラ", icon: "🫘", min: 2, max: 2, tag: "世界の定番",
  desc: "種をまいて自分のゴールに集めよう。数千年前からある世界最古級のゲーム",
  rules: "・自分の側に6つの穴、右はしに自分のゴールがあります。各穴に種が4つずつ。\n・自分の穴を1つ選ぶと、中の種を全部とって、反時計回りに1つずつまいていきます（自分のゴールにも入れる。相手のゴールはとばす）。\n・最後の1つが自分のゴールに入ったら、もう1回！\n・最後の1つが自分の側の空っぽの穴に入り、向かいの相手の穴に種があれば、両方まとめて自分のゴールへ（よこどり）。\n・どちらかの側が全部空になったら終了。残りの種はその側の人のものになります。\n・ゴールの種が多いほうが勝ち！",
  opts: [{ key: "seeds", label: "最初の種の数", def: 4, choices: [[3, "3こ"], [4, "4こ"], [5, "5こ"], [6, "6こ"]] }],
  setup(n, o) {
    const k = (o && o.seeds) || 4;
    // 0-5: 先手の穴, 6: 先手ゴール, 7-12: 後手の穴, 13: 後手ゴール
    const p = Array(14).fill(k); p[6] = 0; p[13] = 0;
    return { n, p, turn: 0, last: -1, over: false, events: [], sown: [] };
  },
  actors(s) { return s.over ? [] : [s.turn]; },
  pits(seat) { return seat === 0 ? [0, 1, 2, 3, 4, 5] : [7, 8, 9, 10, 11, 12]; },
  valid(s, seat, m) { return seat === s.turn && m.t === "sow" && this.pits(seat).includes(m.i) && s.p[m.i] > 0; },
  sow(p, seat, i) {
    let k = p[i]; p[i] = 0; let j = i; const sown = [];
    const skip = seat === 0 ? 13 : 6, goal = seat === 0 ? 6 : 13;
    while (k > 0) { j = (j + 1) % 14; if (j === skip) continue; p[j]++; k--; sown.push(j); }
    let again = j === goal, cap = 0;
    if (!again && this.pits(seat).includes(j) && p[j] === 1) {
      const opp = 12 - j;
      if (p[opp] > 0) { cap = p[opp] + 1; p[goal] += cap; p[opp] = 0; p[j] = 0; }
    }
    return { again, cap, last: j, sown };
  },
  endCheck(p) {
    const a = [0, 1, 2, 3, 4, 5].every((i) => !p[i]), b = [7, 8, 9, 10, 11, 12].every((i) => !p[i]);
    if (!a && !b) return false;
    for (let i = 0; i < 6; i++) { p[6] += p[i]; p[i] = 0; p[13] += p[i + 7]; p[i + 7] = 0; }
    return true;
  },
  apply(s, seat, m) {
    const r = this.sow(s.p, seat, m.i);
    s.last = r.last; s.sown = r.sown; s.from = m.i;
    if (r.cap) { ev(s, -1, "toast", "よこどり！ +" + r.cap); ev(s, seat, "say", "good"); }
    if (this.endCheck(s.p)) {
      s.over = true; s.winner = s.p[6] === s.p[13] ? -1 : s.p[6] > s.p[13] ? 0 : 1;
      if (s.winner >= 0) { ev(s, s.winner, "say", "win"); ev(s, 1 - s.winner, "say", "lose"); }
      return;
    }
    if (r.again) ev(s, -1, "toast", "ゴールにぴったり！もう1回");
    else s.turn = 1 - seat;
  },
  search(p, seat, depth, a, bt, chk) {
    chk();
    if (depth === 0) return (p[seat === 0 ? 6 : 13] - p[seat === 0 ? 13 : 6]) * 10 + (this.pits(seat).reduce((x, i) => x + p[i], 0) - this.pits(1 - seat).reduce((x, i) => x + p[i], 0));
    let best = -1e9, any = false;
    for (const i of this.pits(seat)) {
      if (!p[i]) continue;
      any = true;
      const q = p.slice(); const r = this.sow(q, seat, i);
      let v;
      if (this.endCheck(q)) v = (q[seat === 0 ? 6 : 13] - q[seat === 0 ? 13 : 6]) * 1000;
      else if (r.again) v = this.search(q, seat, depth - 1, a, bt, chk);
      else v = -this.search(q, 1 - seat, depth - 1, -bt, -a, chk);
      if (v > best) best = v;
      if (best > a) a = best;
      if (a >= bt) break;
    }
    return any ? best : 0;
  },
  cpu(s, seat, level) {
    const opts = this.pits(seat).filter((i) => s.p[i]);
    const depth = [1, 4, 10][level];
    const chk = deadline(level === 2 ? 1000 : 300);
    let sc = null;
    for (let d = 1; d <= depth; d++) {
      try {
        sc = opts.map((i) => {
          const q = s.p.slice(), r = this.sow(q, seat, i);
          let v;
          if (this.endCheck(q)) v = (q[seat === 0 ? 6 : 13] - q[seat === 0 ? 13 : 6]) * 1000;
          else if (r.again) v = this.search(q, seat, d - 1, -1e9, 1e9, chk);
          else v = -this.search(q, 1 - seat, d - 1, -1e9, 1e9, chk);
          return { m: { t: "sow", i }, v: v + Math.random() * (level === 0 ? 25 : 0.3) };
        });
      } catch (e) { if (!(e instanceof TimeUp)) throw e; break; }
    }
    return pickByLevel(sc || opts.map((i) => ({ m: { t: "sow", i }, v: 0 })), level === 0 ? 1 : 2);
  },
  cpuDelay() { return 700 + rnd(400); },
  result(s) { return result2(s, [s.p[6] + "こ", s.p[13] + "こ"]); },
  render(s, T) {
    players2(s, T, (i) => ({ score: "ゴール " + s.p[i === 0 ? 6 : 13] }));
    const mid = T.mid();
    const mine = T.myTurn && s.turn === T.me;
    T.bottom({ status: T.turnText(s.turn, "自分の側の穴をタップ"), hot: mine });
    // 手前が自分（view）
    const v = T.view;
    const B = boardBox(mid, T, 8, 3.2, { cls: "mc-board" });
    const cs = B.cs;
    const sown = new Set(s.sown || []);
    const seeds = (n2, box, hl) => {
      box.append(h("b", { class: "mc-n" + (hl ? " hl" : "") }, n2));
      const wrap = h("div", { class: "mc-seeds" });
      for (let k = 0; k < Math.min(n2, 24); k++) wrap.append(h("i", { style: { background: ["#ff9fbd", "#8fc6ff", "#9de0c0", "#ffd66b", "#c3aaff"][k % 5], left: 15 + ((k * 37) % 70) + "%", top: 15 + ((k * 53) % 65) + "%" } }));
      box.append(wrap);
    };
    const near = this.pits(v), far = this.pits(1 - v);
    const myGoal = v === 0 ? 6 : 13, opGoal = v === 0 ? 13 : 6;
    // 左：相手ゴール、右：自分のゴール
    const gl = at(B.el, B.x(0) + 4, B.y(0.2), cs - 8, cs * 2.8, "mc-goal"); seeds(s.p[opGoal], gl, sown.has(opGoal));
    const gr = at(B.el, B.x(7) + 4, B.y(0.2), cs - 8, cs * 2.8, "mc-goal mine"); seeds(s.p[myGoal], gr, sown.has(myGoal));
    // 上：相手の穴（右→左）、下：自分の穴（左→右）
    far.forEach((i, k) => { const b = at(B.el, B.x(6 - k) + 3, B.y(0.25), cs - 6, cs - 6, "mc-pit" + (i === s.last ? " last" : "")); seeds(s.p[i], b, sown.has(i)); });
    near.forEach((i, k) => {
      const can = mine && s.turn === v && s.p[i] > 0;
      const b = at(B.el, B.x(1 + k) + 3, B.y(1.95), cs - 6, cs - 6, "mc-pit near" + (can ? " can" : "") + (i === s.last ? " last" : ""), { onclick: can ? () => T.act({ t: "sow", i }) : null });
      seeds(s.p[i], b, sown.has(i));
    });
    if (T.hotseat || T.me < 0) {
      at(B.el, B.x(1), B.y(1.25), cs * 6, cs * 0.6, "mc-label", null, "↑ " + T.name(1 - v) + "　/　" + T.name(v) + " ↓");
    }
    // 1台で遊ぶとき、後手の番は後手側の穴もタップできるように
    if (T.hotseat && mine && s.turn !== v) {
      far.forEach((i, k) => {
        if (s.p[i] > 0) at(B.el, B.x(6 - k) + 3, B.y(0.25), cs - 6, cs - 6, "mc-pit tap can", { onclick: () => T.act({ t: "sow", i }) });
      });
    }
  },
};

/* ---------- ドット＆ボックス ---------- */
const Dots = {
  id: "dots", name: "ドット＆ボックス", icon: "🔲", min: 2, max: 4, tag: "2〜4人",
  desc: "線を1本ずつ引いて、四角を閉じたら自分のもの！みんなでワイワイ",
  rules: "・点と点のあいだに、順番に線を1本ずつ引きます。\n・4つ目の線を引いて四角を閉じたら、その四角は自分のもの！もう1回引けます。\n・全部の線を引いたら終了。四角を一番多く取った人の勝ち！\n\n3本目を引くと相手に取られちゃうので注意。",
  opts: [{ key: "size", label: "ばんの大きさ", def: 4, choices: [[3, "3×3"], [4, "4×4"], [5, "5×5"], [6, "6×6"]] }],
  setup(n, o) {
    const k = (o && o.size) || 4;
    // 横線 (k+1)×k、縦線 k×(k+1)
    return { n, k, H: Array((k + 1) * k).fill(-1), V: Array(k * (k + 1)).fill(-1), box: Array(k * k).fill(-1), turn: 0, over: false, events: [], last: null };
  },
  actors(s) { return s.over ? [] : [s.turn]; },
  edges(s) { const out = []; s.H.forEach((x, i) => { if (x < 0) out.push({ t: "line", d: "h", i }); }); s.V.forEach((x, i) => { if (x < 0) out.push({ t: "line", d: "v", i }); }); return out; },
  valid(s, seat, m) { return seat === s.turn && m.t === "line" && (m.d === "h" ? s.H : s.V)[m.i] === -1; },
  /* 箱 r,c の4辺 */
  sides(k, r, c) { return [["h", r * k + c], ["h", (r + 1) * k + c], ["v", r * (k + 1) + c], ["v", r * (k + 1) + c + 1]]; },
  boxesOf(k, d, i) {
    const out = [];
    if (d === "h") { const r = Math.floor(i / k), c = i % k; if (r > 0) out.push([r - 1, c]); if (r < k) out.push([r, c]); }
    else { const r = Math.floor(i / (k + 1)), c = i % (k + 1); if (c > 0) out.push([r, c - 1]); if (c < k) out.push([r, c]); }
    return out;
  },
  cnt(s, r, c) { return this.sides(s.k, r, c).filter(([d, i]) => (d === "h" ? s.H : s.V)[i] >= 0).length; },
  put(s, seat, d, i) {
    (d === "h" ? s.H : s.V)[i] = seat;
    let got = 0;
    for (const [r, c] of this.boxesOf(s.k, d, i)) if (this.cnt(s, r, c) === 4 && s.box[r * s.k + c] < 0) { s.box[r * s.k + c] = seat; got++; }
    return got;
  },
  apply(s, seat, m) {
    const got = this.put(s, seat, m.d, m.i);
    s.last = { d: m.d, i: m.i };
    if (got) { ev(s, seat, "say", got >= 2 ? "good" : "turn"); }
    if (!s.box.includes(-1)) {
      s.over = true;
      const sc = this.scores(s), best = Math.max(...sc);
      s.winners = sc.map((x, i) => (x === best ? i : -1)).filter((i) => i >= 0);
      s.winners.forEach((w) => ev(s, w, "say", "win"));
      return;
    }
    if (!got) s.turn = (seat + 1) % s.n;
  },
  scores(s) { const sc = Array(s.n).fill(0); s.box.forEach((x) => { if (x >= 0) sc[x]++; }); return sc; },
  /* その線を引くと、すぐ取れる箱の数／相手に3本目を渡すか */
  info(s, m) {
    let gain = 0, give = 0;
    for (const [r, c] of this.boxesOf(s.k, m.d, m.i)) { const n2 = this.cnt(s, r, c); if (n2 === 3) gain++; else if (n2 === 2) give++; }
    return { gain, give };
  },
  /* 線を引いたあと、相手が連続で取れる箱の数（簡易シミュレーション） */
  chainAfter(s, m) {
    const t = { k: s.k, H: s.H.slice(), V: s.V.slice(), box: s.box.slice() };
    this.put(t, 9, m.d, m.i);
    let taken = 0;
    for (;;) {
      let found = null;
      for (const e of this.edges(t)) { if (this.info(t, e).gain) { found = e; break; } }
      if (!found) break;
      taken += this.put(t, 9, found.d, found.i);
    }
    return taken;
  },
  cpu(s, seat, level) {
    const all = this.edges(s);
    const sc = all.map((m) => {
      const f = this.info(s, m);
      let v = f.gain * 100 - f.give * 60 + Math.random() * 5;
      return { m, v, f };
    });
    if (level === 0) return pickByLevel(sc.map((x) => ({ m: x.m, v: x.f.gain * 100 - (rnd(2) ? x.f.give * 50 : 0) + Math.random() * 20 })), 1);
    const takes = sc.filter((x) => x.f.gain > 0);
    const safe = sc.filter((x) => x.f.give === 0 && x.f.gain === 0);
    if (takes.length) {
      // つよい：最後の2箱を相手に渡して主導権を握る（ダブルクロス）は簡略化し、基本は全部取る
      return takes.sort((a, b) => b.f.gain - a.f.gain)[0].m;
    }
    if (safe.length) return pick(safe).m;
    // どれを引いても渡してしまう：渡す数が一番少ない線
    const sac = sc.map((x) => ({ m: x.m, v: -(level === 2 ? this.chainAfter(s, x.m) : x.f.give) + Math.random() * 0.1 }));
    return pickByLevel(sac, 2);
  },
  cpuDelay() { return 450 + rnd(350); },
  result(s) {
    const sc = this.scores(s);
    const order = [...Array(s.n).keys()].sort((a, b) => sc[b] - sc[a]);
    return order.map((seat) => ({ seat, rank: order.findIndex((x) => sc[x] === sc[seat]), score: sc[seat] + "こ" }));
  },
  render(s, T) {
    const sc = this.scores(s);
    T.players((i) => ({ turn: !s.over && s.turn === i, color: SEAT_COLORS[i], score: "□ " + sc[i] }));
    const mid = T.mid();
    const mine = T.myTurn && s.turn === T.me;
    T.bottom({ status: T.turnText(s.turn, "点と点のあいだをタップ"), hot: mine });
    const k = s.k;
    const B = boardBox(mid, T, k, k, { cls: "db-board", pad: 22 });
    const cs = B.cs, th = Math.max(6, cs * 0.13);
    const lastKey = s.last ? s.last.d + s.last.i : "";
    s.box.forEach((x, i) => {
      if (x < 0) return;
      const r = Math.floor(i / k), c = i % k;
      const b = at(B.el, B.x(c) + th / 2, B.y(r) + th / 2, cs - th, cs - th, "db-box", null);
      b.style.background = SEAT_COLORS[x] + "55";
      b.append(h("img", { src: CHARS[T.charOf(x)].img, alt: "" }));
    });
    const line = (d, i, x, y, w, hh) => {
      const own = (d === "h" ? s.H : s.V)[i];
      const can = mine && own < 0;
      const e = at(B.el, x, y, w, hh, "db-line " + d + (own >= 0 ? " on" : "") + (can ? " can" : "") + (d + i === lastKey ? " last" : ""), { onclick: can ? () => T.act({ t: "line", d, i }) : null });
      if (own >= 0) e.style.setProperty("--lc", SEAT_COLORS[own]);
    };
    // 押しやすいように線の当たり判定を太く
    const hit = Math.max(th, cs * 0.34);
    for (let r = 0; r <= k; r++) for (let c = 0; c < k; c++) line("h", r * k + c, B.x(c) + th, B.y(r) - hit / 2, cs - th, hit);
    for (let r = 0; r < k; r++) for (let c = 0; c <= k; c++) line("v", r * (k + 1) + c, B.x(c) - hit / 2, B.y(r) + th, hit, cs - th);
    for (let r = 0; r <= k; r++) for (let c = 0; c <= k; c++) at(B.el, B.x(c) - th * 0.8, B.y(r) - th * 0.8, th * 1.6, th * 1.6, "db-dot");
  },
};
