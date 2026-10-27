"use strict";
/* ===== 将棋（本将棋・持ち駒あり） =====
   盤 b[81]（r*9+c, r=0 が上）。値 = 持ち主*16 + 種類。持ち主0=先手（下から上へ） */
const SG = (() => {
  const FU = 1, KY = 2, KE = 3, GI = 4, KI = 5, KA = 6, HI = 7, OU = 8, TO = 9, NY = 10, NK = 11, NG = 12, UM = 13, RY = 14;
  const PROMO = { 1: 9, 2: 10, 3: 11, 4: 12, 6: 13, 7: 14 };
  const UNPRO = { 9: 1, 10: 2, 11: 3, 12: 4, 13: 6, 14: 7 };
  const KANJI = { 1: "歩", 2: "香", 3: "桂", 4: "銀", 5: "金", 6: "角", 7: "飛", 8: "玉", 9: "と", 10: "杏", 11: "圭", 12: "全", 13: "馬", 14: "龍" };
  const VAL = { 1: 100, 2: 300, 3: 330, 4: 500, 5: 560, 6: 800, 7: 950, 8: 0, 9: 560, 10: 520, 11: 520, 12: 540, 13: 1100, 14: 1300 };
  const GOLD = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, 0]];
  const KING = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
  const STEP = { 1: [[-1, 0]], 3: [[-2, -1], [-2, 1]], 4: [[-1, -1], [-1, 0], [-1, 1], [1, -1], [1, 1]], 5: GOLD, 8: KING, 9: GOLD, 10: GOLD, 11: GOLD, 12: GOLD, 13: [[-1, 0], [1, 0], [0, -1], [0, 1]], 14: [[-1, -1], [-1, 1], [1, -1], [1, 1]] };
  const SLIDE = { 2: [[-1, 0]], 6: [[-1, -1], [-1, 1], [1, -1], [1, 1]], 7: [[-1, 0], [1, 0], [0, -1], [0, 1]], 13: [[-1, -1], [-1, 1], [1, -1], [1, 1]], 14: [[-1, 0], [1, 0], [0, -1], [0, 1]] };
  const own = (v) => v >> 4, typ = (v) => v & 15;
  const init = () => {
    const b = Array(81).fill(0);
    const back = [KY, KE, GI, KI, OU, KI, GI, KE, KY];
    for (let c = 0; c < 9; c++) { b[0 * 9 + c] = 16 + back[c]; b[8 * 9 + c] = back[c]; b[2 * 9 + c] = 16 + FU; b[6 * 9 + c] = FU; }
    b[1 * 9 + 1] = 16 + HI; b[1 * 9 + 7] = 16 + KA; b[7 * 9 + 1] = KA; b[7 * 9 + 7] = HI;
    return b;
  };
  const inZone = (o, r) => (o === 0 ? r <= 2 : r >= 6);
  const mustPromote = (o, t, r) => { const rr = o === 0 ? r : 8 - r; return ((t === FU || t === KY) && rr === 0) || (t === KE && rr <= 1); };
  /* ある駒が利いているマス */
  function attacks(b, i, out) {
    const v = b[i], o = own(v), t = typ(v), r = (i / 9) | 0, c = i % 9, sg = o === 0 ? 1 : -1;
    const st = STEP[t];
    if (st) for (const [dr, dc] of st) { const rr = r + dr * sg, cc = c + dc; if (rr >= 0 && rr < 9 && cc >= 0 && cc < 9) out.push(rr * 9 + cc); }
    const sl = SLIDE[t];
    if (sl) for (const [dr, dc] of sl) { let rr = r + dr * sg, cc = c + dc; while (rr >= 0 && rr < 9 && cc >= 0 && cc < 9) { out.push(rr * 9 + cc); if (b[rr * 9 + cc]) break; rr += dr * sg; cc += dc; } }
    return out;
  }
  function attacked(b, sq, by) {
    const tmp = [];
    for (let i = 0; i < 81; i++) { const v = b[i]; if (!v || own(v) !== by) continue; tmp.length = 0; attacks(b, i, tmp); if (tmp.includes(sq)) return true; }
    return false;
  }
  const kingOf = (b, o) => b.findIndex((v) => v && own(v) === o && typ(v) === OU);
  /* 疑似合法手（王手放置は含む） */
  function pseudo(b, hands, o, capsOnly) {
    const out = [], tmp = [];
    for (let i = 0; i < 81; i++) {
      const v = b[i]; if (!v || own(v) !== o) continue;
      const t = typ(v), r = (i / 9) | 0;
      tmp.length = 0; attacks(b, i, tmp);
      for (const to of tmp) {
        const x = b[to]; if (x && own(x) === o) continue;
        if (capsOnly && !x) continue;
        const tr = (to / 9) | 0;
        const canP = PROMO[t] && (inZone(o, r) || inZone(o, tr));
        if (canP) out.push({ f: i, to, p: 1, c: x });
        if (!canP || !mustPromote(o, t, tr)) out.push({ f: i, to, p: 0, c: x });
      }
    }
    if (capsOnly) return out;
    const hd = hands[o];
    for (const t of [7, 6, 5, 4, 3, 2, 1]) {
      if (!hd[t]) continue;
      let fuCols = null;
      if (t === FU) { fuCols = new Set(); for (let i = 0; i < 81; i++) if (b[i] === o * 16 + FU) fuCols.add(i % 9); }
      for (let to = 0; to < 81; to++) {
        if (b[to]) continue;
        const tr = (to / 9) | 0;
        if (mustPromote(o, t, tr)) continue;
        if (fuCols && fuCols.has(to % 9)) continue;
        out.push({ f: -1, to, d: t, p: 0, c: 0 });
      }
    }
    return out;
  }
  function make(b, hands, o, m) {
    const nb = b.slice(), nh = [Object.assign({}, hands[0]), Object.assign({}, hands[1])];
    if (m.f < 0) { nb[m.to] = o * 16 + m.d; nh[o][m.d]--; }
    else {
      let v = nb[m.f]; nb[m.f] = 0;
      const cap = nb[m.to];
      if (cap) { const ct = UNPRO[typ(cap)] || typ(cap); if (ct !== OU) nh[o][ct] = (nh[o][ct] || 0) + 1; }
      if (m.p) v = o * 16 + PROMO[typ(v)];
      nb[m.to] = v;
    }
    return { b: nb, hands: nh };
  }
  function inCheck(b, o) { const k = kingOf(b, o); return k >= 0 && attacked(b, k, 1 - o); }
  function legal(b, hands, o) {
    const out = [];
    for (const m of pseudo(b, hands, o)) {
      const r = make(b, hands, o, m);
      if (inCheck(r.b, o)) continue;
      // 打ち歩詰め
      if (m.f < 0 && m.d === FU) {
        const sg = o === 0 ? -1 : 1, k = kingOf(r.b, 1 - o);
        if (k === m.to + sg * 9 && !legalExists(r.b, r.hands, 1 - o)) continue;
      }
      out.push(m);
    }
    return out;
  }
  function legalExists(b, hands, o) {
    for (const m of pseudo(b, hands, o)) { const r = make(b, hands, o, m); if (!inCheck(r.b, o)) return true; }
    return false;
  }
  function hash(b, hands, turn) {
    let x = turn ? 2166136261 : 16777619;
    for (let i = 0; i < 81; i++) x = Math.imul(x ^ (b[i] + i * 37), 16777619);
    for (const o of [0, 1]) for (let t = 1; t <= 7; t++) x = Math.imul(x ^ ((hands[o][t] || 0) * 131 + t + o * 17), 16777619);
    return (x >>> 0).toString(36);
  }
  /* 評価（o から見た点数） */
  function evaluate(b, hands, o) {
    let v = 0;
    for (let i = 0; i < 81; i++) {
      const x = b[i]; if (!x) continue;
      const t = typ(x), w = own(x), r = (i / 9) | 0;
      let s = VAL[t];
      const adv = w === 0 ? 8 - r : r; // 進んだ段
      if (t === FU) s += adv * 4;
      else if (t === GI || t === KI) s += Math.min(adv, 4) * 3;
      else if (t === OU) s += (adv <= 1 ? 30 : -adv * 15);
      v += w === o ? s : -s;
    }
    for (const w of [0, 1]) for (let t = 1; t <= 7; t++) { const n = hands[w][t] || 0; if (n) v += (w === o ? 1 : -1) * n * VAL[t] * 1.12; }
    return v;
  }
  return { FU, KY, KE, GI, KI, KA, HI, OU, PROMO, UNPRO, KANJI, VAL, own, typ, init, attacks, attacked, kingOf, pseudo, make, inCheck, legal, legalExists, hash, evaluate, inZone, mustPromote };
})();

const Shogi = {
  id: "shogi", name: "将棋", icon: "☗", min: 2, max: 2, tag: "本格",
  desc: "日本の定番！持ち駒も使える本将棋。CPUは3段階の強さ",
  rules: "・先手（☗）と後手（☖）が交互に駒を1つ動かします。相手の玉を詰ませたら勝ち！\n・駒をタップすると動ける場所が光ります。\n・取った相手の駒は「持ち駒」になり、自分の番に好きな空きマスへ打てます（盤の下のコマをタップ）。\n・相手の陣地（奥の3段）に入る・出るときは「成る」ことができます。\n\n反則（このアプリでは選べないようになっています）\n・二歩（同じ列に自分の歩を2枚）\n・打ち歩詰め（歩を打って詰ませる）\n・王手をほうっておく\n・動けないところへの駒（行き所のない駒）\n\n・同じ局面が4回くり返すと千日手で引き分け。\n・「投了」ボタンで負けを認められます。",
  opts: [],
  sound: "stone",
  setup(n) { return { n, b: SG.init(), hands: [{}, {}], turn: 0, over: false, events: [], last: null, ply: 0, rep: {} }; },
  actors(s) { return s.over ? [] : [s.turn]; },
  same(a, m) { return a.f === m.f && a.to === m.to && !!a.p === !!m.p && (a.f >= 0 || a.d === m.d); },
  valid(s, seat, m) {
    if (seat !== s.turn || s.over) return false;
    if (m.t === "resign") return true;
    return m.t === "mv" && SG.legal(s.b, s.hands, seat).some((x) => this.same(x, m));
  },
  apply(s, seat, m) {
    if (m.t === "resign") { s.over = true; s.winner = 1 - seat; s.why = "投了"; ev(s, -1, "toast", (s.names ? s.names[seat] : "") + " が投了しました"); ev(s, 1 - seat, "say", "win"); return; }
    const cap = m.f >= 0 ? s.b[m.to] : 0;
    const r = SG.make(s.b, s.hands, seat, m);
    s.b = r.b; s.hands = r.hands; s.ply++;
    s.last = { f: m.f, to: m.to };
    if (cap && SG.VAL[SG.typ(cap)] >= 800) { ev(s, seat, "say", "good"); ev(s, 1 - seat, "say", "bad"); }
    const nx = 1 - seat;
    const check = SG.inCheck(s.b, nx);
    if (!SG.legalExists(s.b, s.hands, nx)) {
      s.over = true; s.winner = seat; s.why = "詰み";
      ev(s, -1, "big", "詰み！"); ev(s, seat, "say", "win"); ev(s, nx, "say", "lose");
      return;
    }
    if (check) ev(s, -1, "big", "王手！");
    const key = SG.hash(s.b, s.hands, nx);
    s.rep[key] = (s.rep[key] || 0) + 1;
    if (s.rep[key] >= 4) { s.over = true; s.winner = -1; s.why = "千日手"; ev(s, -1, "big", "千日手"); return; }
    if (s.ply >= 300) { s.over = true; s.winner = -1; s.why = "手数制限"; return; }
    // 局面記録が大きくなりすぎないように
    const ks = Object.keys(s.rep); if (ks.length > 160) delete s.rep[ks[0]];
    s.turn = nx;
  },
  /* ---- CPU ---- */
  order(ms) {
    return ms.sort((a, z) => (z.c ? SG.VAL[SG.typ(z.c)] * 10 : 0) + (z.p ? 300 : 0) - ((a.c ? SG.VAL[SG.typ(a.c)] * 10 : 0) + (a.p ? 300 : 0)));
  },
  qs(b, hd, o, a, bt, d, chk) {
    chk();
    const stand = SG.evaluate(b, hd, o);
    if (d === 0 || stand >= bt) return stand;
    let best = stand;
    if (stand > a) a = stand;
    for (const m of this.order(SG.pseudo(b, hd, o, true))) {
      if (SG.typ(m.c) === SG.OU) return 50000;
      const r = SG.make(b, hd, o, m);
      const v = -this.qs(r.b, r.hands, 1 - o, -bt, -a, d - 1, chk);
      if (v > best) best = v;
      if (v >= bt) return v;
      if (v > a) a = v;
    }
    return best;
  },
  ab(b, hd, o, d, a, bt, chk, q) {
    chk();
    if (d === 0) return q ? this.qs(b, hd, o, a, bt, 3, chk) : SG.evaluate(b, hd, o);
    const ms = this.order(SG.pseudo(b, hd, o));
    let best = -1e6;
    for (const m of ms) {
      if (m.c && SG.typ(m.c) === SG.OU) return 50000 + d;
      const r = SG.make(b, hd, o, m);
      const v = -this.ab(r.b, r.hands, 1 - o, d - 1, -bt, -a, chk, q);
      if (v > best) best = v;
      if (best > a) a = best;
      if (a >= bt) break;
    }
    return best;
  },
  cpu(s, seat, level) {
    const ms = SG.legal(s.b, s.hands, seat);
    if (!ms.length) return { t: "resign" };
    const chk = deadline([350, 1000, 2200][level]);
    let sc = null;
    const maxD = [1, 2, 4][level];
    // 詰ませる手があれば指す
    for (const m of ms) { const r = SG.make(s.b, s.hands, seat, m); if (SG.inCheck(r.b, 1 - seat) && !SG.legalExists(r.b, r.hands, 1 - seat)) return Object.assign({ t: "mv" }, m); }
    const ordered = this.order(ms.slice());
    for (let d = 1; d <= maxD; d++) {
      try {
        const cur = [];
        let a = -1e6;
        for (const m of ordered) {
          const r = SG.make(s.b, s.hands, seat, m);
          // つよい：2手目以降は「今の最善より良いか」だけを調べる（速くなる）。良くない手は上限値しか分からないので候補から外す
          const raw = -this.ab(r.b, r.hands, 1 - seat, d - 1, -1e6, level === 2 ? -a + 1 : 1e6, chk, level >= 1);
          let v = raw + Math.random() * (level === 0 ? 220 : level === 1 ? 25 : 6);
          if (level === 2 && cur.length && raw <= a - 1) v -= 5000;
          const rk = SG.hash(r.b, r.hands, 1 - seat);
          if (s.rep[rk] && raw > -200) v -= 250 * s.rep[rk];
          cur.push({ m, v }); if (raw > a) a = raw;
        }
        sc = cur;
        ordered.sort((x, y) => (cur.find((c) => c.m === y).v - cur.find((c) => c.m === x).v));
      } catch (e) { if (!(e instanceof TimeUp)) throw e; break; }
    }
    if (!sc) sc = ms.map((m) => ({ m, v: Math.random() }));
    const m = pickByLevel(sc, level === 0 ? 1 : 2);
    return Object.assign({ t: "mv" }, { f: m.f, to: m.to, p: m.p, d: m.d });
  },
  cpuDelay(s, seat, lv) { return 400 + rnd(400); },
  result(s) { return result2(s, null, s.why === "千日手" ? "千日手" : "引き分け").map((r) => Object.assign(r, { note: r.rank === 0 && s.winner >= 0 ? s.why : r.note })); },
  render(s, T, ui) {
    T.players((i) => ({ turn: !s.over && s.turn === i, score: i === 0 ? "☗先手" : "☖後手" }));
    const mid = T.mid();
    const mine = T.myTurn && s.turn === T.me;
    const check = !s.over && SG.inCheck(s.b, s.turn);
    const btns = [];
    if (mine) btns.push(h("button", { class: "btn ghost small", onclick: () => confirmBox("投了しますか？", () => T.act({ t: "resign" })) }, "🏳 投了"));
    T.bottom({ status: (check ? "王手！ " : "") + T.turnText(s.turn, ui.sel ? "動かす先をタップ" : "駒をタップ"), hot: mine, buttons: btns });
    const view = T.view;
    const flip = view === 1;
    const B = boardBox(mid, T, 9, 9 + 2.1, { cls: "sg-board", pad: 4 });
    const cs = B.cs, top = cs * 1.05;
    const legal = mine ? SG.legal(s.b, s.hands, s.turn) : [];
    const sel = ui.sel;
    const dests = new Map();
    if (sel) legal.forEach((m) => { if ((sel.f >= 0 && m.f === sel.f) || (sel.f < 0 && m.f < 0 && m.d === sel.d)) { const l = dests.get(m.to) || []; l.push(m); dests.set(m.to, l); } });
    const kingSq = check ? SG.kingOf(s.b, s.turn) : -1;
    // 盤
    const grid = at(B.el, B.pad, B.pad + top, cs * 9, cs * 9, "sg-grid");
    for (let i = 0; i < 81; i++) {
      let r = (i / 9) | 0, c = i % 9; if (flip) { r = 8 - r; c = 8 - c; }
      const v = s.b[i];
      let cls = "sg-cell";
      if (s.last && (i === s.last.to || i === s.last.f)) cls += " last";
      if (dests.has(i)) cls += " can";
      if (sel && sel.f === i) cls += " sel";
      if (i === kingSq) cls += " check";
      const cell = at(grid, c * cs, r * cs, cs, cs, cls, {
        onclick: !mine ? null : () => {
          if (dests.has(i)) {
            const opts = dests.get(i); ui.sel = null;
            if (opts.length > 1) {
              modal(h("div", null, h("h3", null, "成りますか？"), h("div", { class: "row" },
                h("button", { class: "btn ghost", onclick: () => { closeModal(); T.act(Object.assign({ t: "mv" }, opts.find((x) => !x.p))); } }, "成らない"),
                h("button", { class: "btn pink", onclick: () => { closeModal(); T.act(Object.assign({ t: "mv" }, opts.find((x) => x.p))); } }, "成る"))));
            } else T.act(Object.assign({ t: "mv" }, { f: opts[0].f, to: opts[0].to, p: opts[0].p, d: opts[0].d }));
            T.redraw(); return;
          }
          if (v && SG.own(v) === s.turn && legal.some((m) => m.f === i)) { ui.sel = sel && sel.f === i ? null : { f: i }; Snd.tick(); T.redraw(); return; }
          if (ui.sel) { ui.sel = null; T.redraw(); }
        } });
      if (v) cell.append(this.piece(v, flip, i === (s.last && s.last.to)));
    }
    for (const [r, c] of [[3, 3], [3, 6], [6, 3], [6, 6]]) at(grid, c * cs - 3, r * cs - 3, 6, 6, "sg-star");
    // 持ち駒：上が相手、下が自分（視点）
    const handRow = (o, y) => {
      const row = at(B.el, B.pad, y, cs * 9, cs * 0.98, "sg-hand" + (o === view ? " mine" : ""));
      row.append(h("span", { class: "sg-hl" }, o === 0 ? "☗" : "☖"));
      const hd = s.hands[o];
      for (const t of [7, 6, 5, 4, 3, 2, 1]) {
        const n = hd[t] || 0; if (!n) continue;
        const canDrop = mine && s.turn === o && legal.some((m) => m.f < 0 && m.d === t);
        const p = h("div", { class: "sg-hp" + (sel && sel.f < 0 && sel.d === t ? " sel" : "") + (canDrop ? " can" : ""), onclick: canDrop ? () => { ui.sel = sel && sel.f < 0 && sel.d === t ? null : { f: -1, d: t }; Snd.tick(); T.redraw(); } : null },
          this.piece(o * 16 + t, flip, false), n > 1 ? h("b", null, "×" + n) : null);
        p.style.width = cs * 0.95 + "px"; p.style.height = cs * 0.95 + "px";
        row.append(p);
      }
    };
    handRow(1 - view, B.pad);
    handRow(view, B.pad + top + cs * 9 + cs * 0.06);
  },
  piece(v, flip, pop) {
    const o = SG.own(v), t = SG.typ(v);
    const up = (o === 0) !== flip;
    let k = SG.KANJI[t]; if (t === SG.OU && o === 1) k = "王";
    return h("div", { class: "sg-pc" + (up ? "" : " down") + (t >= 9 ? " pro" : "") + (pop ? " pop" : "") }, h("span", null, k));
  },
};
/* はい／いいえの確認 */
function confirmBox(msg, fn) {
  modal(h("div", null, h("h3", null, msg), h("div", { class: "row" }, h("button", { class: "btn ghost", onclick: closeModal }, "やめる"), h("button", { class: "btn pink", onclick: () => { closeModal(); fn(); } }, "OK"))));
}
