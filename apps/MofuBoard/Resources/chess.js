"use strict";
/* ===== チェス（キャスリング・アンパッサン・昇格あり） =====
   b[64]（r*8+c, r=0 が上＝黒の陣地）。値 = 持ち主*8 + 種類（1ポーン 2ナイト 3ビショップ 4ルーク 5クイーン 6キング） */
const CH = (() => {
  const P = 1, N = 2, B = 3, R = 4, Q = 5, K = 6;
  const VAL = [0, 100, 320, 330, 500, 900, 0];
  const SYM = { 1: "♟", 2: "♞", 3: "♝", 4: "♜", 5: "♛", 6: "♚" };
  const NAME = { 2: "ナイト", 3: "ビショップ", 4: "ルーク", 5: "クイーン" };
  const own = (v) => v >> 3, typ = (v) => v & 7;
  const KN = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
  const KG = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
  const DG = [[-1, -1], [-1, 1], [1, -1], [1, 1]], OR = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  // 中央ほど良い（白から見た表。黒は上下反転）
  const PST = {
    1: [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
    2: [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
    3: [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20],
    4: [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0],
    5: [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
    6: [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20],
  };
  const init = () => {
    const b = Array(64).fill(0), back = [R, N, B, Q, K, B, N, R];
    for (let c = 0; c < 8; c++) { b[c] = 8 + back[c]; b[8 + c] = 8 + P; b[48 + c] = P; b[56 + c] = back[c]; }
    return b;
  };
  function attacks(b, sq, by) {
    const r = sq >> 3, c = sq & 7;
    // ポーン
    const pr = by === 0 ? r + 1 : r - 1;
    if (pr >= 0 && pr < 8) for (const dc of [-1, 1]) { const cc = c + dc; if (cc >= 0 && cc < 8 && b[pr * 8 + cc] === by * 8 + P) return true; }
    for (const [dr, dc] of KN) { const rr = r + dr, cc = c + dc; if (rr >= 0 && rr < 8 && cc >= 0 && cc < 8 && b[rr * 8 + cc] === by * 8 + N) return true; }
    for (const [dr, dc] of KG) { const rr = r + dr, cc = c + dc; if (rr >= 0 && rr < 8 && cc >= 0 && cc < 8 && b[rr * 8 + cc] === by * 8 + K) return true; }
    for (const [dirs, t1] of [[DG, B], [OR, R]]) for (const [dr, dc] of dirs) {
      let rr = r + dr, cc = c + dc;
      while (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) { const v = b[rr * 8 + cc]; if (v) { if (own(v) === by && (typ(v) === t1 || typ(v) === Q)) return true; break; } rr += dr; cc += dc; }
    }
    return false;
  }
  const kingOf = (b, o) => b.indexOf(o * 8 + K);
  function pseudo(st, o, capsOnly) {
    const b = st.b, out = [];
    const add = (f, to, extra) => { const c = b[to]; if (capsOnly && !c && !(extra && extra.ep)) return; out.push(Object.assign({ f, to, c }, extra || {})); };
    for (let i = 0; i < 64; i++) {
      const v = b[i]; if (!v || own(v) !== o) continue;
      const t = typ(v), r = i >> 3, c = i & 7;
      if (t === P) {
        const dr = o === 0 ? -1 : 1, last = o === 0 ? 0 : 7, start = o === 0 ? 6 : 1;
        const r1 = r + dr;
        if (r1 >= 0 && r1 < 8) {
          if (!b[r1 * 8 + c] && !capsOnly) {
            if (r1 === last) for (const pr of [Q, N, R, B]) add(i, r1 * 8 + c, { pr });
            else { add(i, r1 * 8 + c); if (r === start && !b[(r + 2 * dr) * 8 + c]) add(i, (r + 2 * dr) * 8 + c); }
          }
          for (const dc of [-1, 1]) {
            const cc = c + dc; if (cc < 0 || cc > 7) continue;
            const to = r1 * 8 + cc, x = b[to];
            if (x && own(x) !== o) { if (r1 === last) for (const pr of [Q, N, R, B]) add(i, to, { pr }); else add(i, to); }
            else if (to === st.ep) add(i, to, { ep: 1 });
          }
        }
        continue;
      }
      const jumps = t === N ? KN : t === K ? KG : null;
      if (jumps) for (const [dr, dc] of jumps) { const rr = r + dr, cc = c + dc; if (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) { const x = b[rr * 8 + cc]; if (!x || own(x) !== o) add(i, rr * 8 + cc); } }
      const dirs = t === B ? DG : t === R ? OR : t === Q ? DG.concat(OR) : null;
      if (dirs) for (const [dr, dc] of dirs) {
        let rr = r + dr, cc = c + dc;
        while (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) { const x = b[rr * 8 + cc]; if (x) { if (own(x) !== o) add(i, rr * 8 + cc); break; } add(i, rr * 8 + cc); rr += dr; cc += dc; }
      }
      // キャスリング
      if (t === K && !capsOnly) {
        const home = o === 0 ? 60 : 4, cr = st.cr || "";
        if (i === home && !attacks(b, i, 1 - o)) {
          const kS = o === 0 ? "K" : "k", qS = o === 0 ? "Q" : "q";
          if (cr.includes(kS) && !b[i + 1] && !b[i + 2] && b[i + 3] === o * 8 + R && !attacks(b, i + 1, 1 - o)) out.push({ f: i, to: i + 2, c: 0, castle: 1 });
          if (cr.includes(qS) && !b[i - 1] && !b[i - 2] && !b[i - 3] && b[i - 4] === o * 8 + R && !attacks(b, i - 1, 1 - o)) out.push({ f: i, to: i - 2, c: 0, castle: -1 });
        }
      }
    }
    return out;
  }
  function make(st, o, m) {
    const b = st.b.slice();
    let v = b[m.f]; b[m.f] = 0;
    let cap = b[m.to];
    if (m.ep) { const ci = m.to + (o === 0 ? 8 : -8); cap = b[ci]; b[ci] = 0; }
    if (m.pr) v = o * 8 + m.pr;
    b[m.to] = v;
    if (m.castle === 1) { b[m.f + 1] = b[m.f + 3]; b[m.f + 3] = 0; }
    if (m.castle === -1) { b[m.f - 1] = b[m.f - 4]; b[m.f - 4] = 0; }
    let cr = st.cr || "";
    const strip = (sq) => { if (sq === 60) cr = cr.replace(/[KQ]/g, ""); if (sq === 4) cr = cr.replace(/[kq]/g, ""); if (sq === 63) cr = cr.replace("K", ""); if (sq === 56) cr = cr.replace("Q", ""); if (sq === 7) cr = cr.replace("k", ""); if (sq === 0) cr = cr.replace("q", ""); };
    strip(m.f); strip(m.to);
    let ep = -1;
    if (typ(v) === P && Math.abs(m.to - m.f) === 16) ep = (m.to + m.f) >> 1;
    const half = typ(st.b[m.f]) === P || cap ? 0 : (st.half || 0) + 1;
    return { b, cr, ep, half, cap };
  }
  function inCheck(b, o) { const k = kingOf(b, o); return k >= 0 && attacks(b, k, 1 - o); }
  function legal(st, o) { return pseudo(st, o).filter((m) => !inCheck(make(st, o, m).b, o)); }
  function hash(st, turn) {
    let x = turn ? 7919 : 104729;
    for (let i = 0; i < 64; i++) x = Math.imul(x ^ (st.b[i] * 64 + i), 16777619);
    x = Math.imul(x ^ ((st.ep + 2) * 31 + (st.cr || "").length * 7 + (st.cr || "").charCodeAt(0) || 0), 16777619);
    return (x >>> 0).toString(36);
  }
  function evaluate(b, o) {
    let v = 0, mat = 0;
    for (let i = 0; i < 64; i++) { const x = b[i]; if (x) mat += VAL[typ(x)]; }
    const endgame = mat < 2600;
    for (let i = 0; i < 64; i++) {
      const x = b[i]; if (!x) continue;
      const t = typ(x), w = own(x);
      const idx = w === 0 ? i : (7 - (i >> 3)) * 8 + (i & 7);
      let s = VAL[t] + (t === K && endgame ? -Math.abs(3.5 - (idx >> 3)) * 10 - Math.abs(3.5 - (idx & 7)) * 10 : PST[t][idx]);
      v += w === o ? s : -s;
    }
    return v;
  }
  function insufficient(b) {
    const ps = b.filter((x) => x && typ(x) !== K);
    if (!ps.length) return true;
    if (ps.length === 1 && (typ(ps[0]) === N || typ(ps[0]) === B)) return true;
    return false;
  }
  return { P, N, B, R, Q, K, VAL, SYM, NAME, own, typ, init, attacks, kingOf, pseudo, make, inCheck, legal, hash, evaluate, insufficient };
})();

const Chess = {
  id: "chess", name: "チェス", icon: "♞", min: 2, max: 2, tag: "本格",
  desc: "世界でいちばん遊ばれているボードゲーム。キャスリングもアンパッサンもOK",
  rules: "・白（先手）と黒が交互に駒を動かし、相手のキングをチェックメイト（逃げ場なし）にしたら勝ち！\n\n・♚キング：まわり1マス\n・♛クイーン：たて・よこ・ななめにどこまでも\n・♜ルーク：たて・よこにどこまでも\n・♝ビショップ：ななめにどこまでも\n・♞ナイト：L字にジャンプ\n・♟ポーン：前に1マス（最初だけ2マス）。取るときはななめ前。奥まで行くと好きな駒に昇格。\n\n特別なルール\n・キャスリング：キングとルークが一度も動いていなければ、キングを2マス横に動かしてルークを反対側に置けます。\n・アンパッサン：となりのポーンが2マス進んだ直後に、ななめ後ろから取れます。\n\n引き分け：ステイルメイト（動けないけどチェックされていない）、同じ局面3回、50手ルール、駒不足。\n「投了」で負けを認められます。",
  opts: [],
  sound: "stone",
  setup(n) { return { n, b: CH.init(), cr: "KQkq", ep: -1, half: 0, turn: 0, over: false, events: [], last: null, ply: 0, rep: {} }; },
  actors(s) { return s.over ? [] : [s.turn]; },
  same(a, m) { return a.f === m.f && a.to === m.to && (a.pr || 0) === (m.pr || 0); },
  valid(s, seat, m) {
    if (seat !== s.turn || s.over) return false;
    if (m.t === "resign") return true;
    return m.t === "mv" && CH.legal(s, seat).some((x) => this.same(x, m));
  },
  apply(s, seat, m) {
    if (m.t === "resign") { s.over = true; s.winner = 1 - seat; s.why = "投了"; ev(s, -1, "toast", (s.names ? s.names[seat] : "") + " が投了しました"); ev(s, 1 - seat, "say", "win"); return; }
    const full = CH.legal(s, seat).find((x) => this.same(x, m));
    const r = CH.make(s, seat, full);
    s.b = r.b; s.cr = r.cr; s.ep = r.ep; s.half = r.half; s.ply++;
    s.last = { f: m.f, to: m.to };
    if (r.cap && CH.VAL[CH.typ(r.cap)] >= 500) { ev(s, seat, "say", "good"); ev(s, 1 - seat, "say", "bad"); }
    if (full.castle) ev(s, -1, "toast", "キャスリング！");
    if (full.pr) ev(s, -1, "toast", "ポーンが" + CH.NAME[full.pr] + "に昇格！");
    const nx = 1 - seat;
    const check = CH.inCheck(s.b, nx);
    if (!CH.legal(s, nx).length) {
      s.over = true;
      if (check) { s.winner = seat; s.why = "チェックメイト"; ev(s, -1, "big", "チェックメイト！"); ev(s, seat, "say", "win"); ev(s, nx, "say", "lose"); }
      else { s.winner = -1; s.why = "ステイルメイト"; ev(s, -1, "big", "ステイルメイト"); }
      return;
    }
    if (check) ev(s, -1, "big", "チェック！");
    const key = CH.hash(s, nx);
    s.rep[key] = (s.rep[key] || 0) + 1;
    const ks = Object.keys(s.rep); if (ks.length > 120) delete s.rep[ks[0]];
    if (s.rep[key] >= 3) { s.over = true; s.winner = -1; s.why = "同じ局面3回"; ev(s, -1, "toast", "同じ局面が3回で引き分け"); return; }
    if (s.half >= 100) { s.over = true; s.winner = -1; s.why = "50手ルール"; ev(s, -1, "toast", "50手ルールで引き分け"); return; }
    if (CH.insufficient(s.b)) { s.over = true; s.winner = -1; s.why = "駒不足"; ev(s, -1, "toast", "駒不足で引き分け"); return; }
    if (s.ply >= 400) { s.over = true; s.winner = -1; s.why = "手数制限"; return; }
    s.turn = nx;
  },
  order(ms) { return ms.sort((a, z) => ((z.c ? CH.VAL[CH.typ(z.c)] * 10 : 0) + (z.pr ? 800 : 0)) - ((a.c ? CH.VAL[CH.typ(a.c)] * 10 : 0) + (a.pr ? 800 : 0))); },
  qs(st, o, a, bt, d, chk) {
    chk();
    const stand = CH.evaluate(st.b, o);
    if (d === 0 || stand >= bt) return stand;
    let best = stand;
    if (stand > a) a = stand;
    for (const m of this.order(CH.pseudo(st, o, true))) {
      if (CH.typ(m.c) === CH.K) return 50000;
      const v = -this.qs(CH.make(st, o, m), 1 - o, -bt, -a, d - 1, chk);
      if (v > best) best = v;
      if (v >= bt) return v;
      if (v > a) a = v;
    }
    return best;
  },
  ab(st, o, d, a, bt, chk, q) {
    chk();
    if (d === 0) return q ? this.qs(st, o, a, bt, 4, chk) : CH.evaluate(st.b, o);
    const ms = this.order(CH.pseudo(st, o));
    let best = -1e6;
    for (const m of ms) {
      if (m.c && CH.typ(m.c) === CH.K) return 50000 + d;
      const v = -this.ab(CH.make(st, o, m), 1 - o, d - 1, -bt, -a, chk, q);
      if (v > best) best = v;
      if (best > a) a = best;
      if (a >= bt) break;
    }
    // 合法手がない（王が取られる手しかない）かどうかは、王を取られる手として上で評価される
    return best;
  },
  cpu(s, seat, level) {
    const ms = CH.legal(s, seat);
    if (!ms.length) return { t: "resign" };
    const chk = deadline([350, 1000, 2200][level]);
    const maxD = [1, 3, 5][level];
    let sc = null;
    const ordered = this.order(ms.slice());
    for (let d = 1; d <= maxD; d++) {
      try {
        const cur = [];
        for (const m of ordered) {
          const nst = CH.make(s, seat, m);
          let v;
          if (!CH.legal(Object.assign({}, s, nst), 1 - seat).length) v = CH.inCheck(nst.b, 1 - seat) ? 90000 : -50;
          else v = -this.ab(nst, 1 - seat, d - 1, -1e6, 1e6, chk, level >= 1);
          // 同じ局面のくり返しは、負けていないときは避ける
          const rk = CH.hash(Object.assign({}, s, nst), 1 - seat);
          if (s.rep[rk] && v > -200) v -= 250 * s.rep[rk];
          cur.push({ m, v: v + Math.random() * (level === 0 ? 180 : level === 1 ? 20 : 4) });
        }
        sc = cur;
        ordered.sort((x, y) => cur.find((c) => c.m === y).v - cur.find((c) => c.m === x).v);
      } catch (e) { if (!(e instanceof TimeUp)) throw e; break; }
    }
    if (!sc) sc = ms.map((m) => ({ m, v: Math.random() }));
    const m = pickByLevel(sc, level === 0 ? 1 : 2);
    return { t: "mv", f: m.f, to: m.to, pr: m.pr || 0 };
  },
  cpuDelay() { return 400 + rnd(400); },
  result(s) { return result2(s, null, s.why || "引き分け").map((r) => Object.assign(r, { note: r.rank === 0 && s.winner >= 0 ? s.why : r.note })); },
  render(s, T, ui) {
    T.players((i) => ({ turn: !s.over && s.turn === i, score: i === 0 ? "♔ 白" : "♚ 黒" }));
    const mid = T.mid();
    const mine = T.myTurn && s.turn === T.me;
    const check = !s.over && CH.inCheck(s.b, s.turn);
    const btns = mine ? [h("button", { class: "btn ghost small", onclick: () => confirmBox("投了しますか？", () => T.act({ t: "resign" })) }, "🏳 投了")] : [];
    T.bottom({ status: (check ? "チェック！ " : "") + T.turnText(s.turn, ui.sel != null ? "動かす先をタップ" : "駒をタップ"), hot: mine, buttons: btns });
    const flip = T.view === 1;
    const B = boardBox(mid, T, 8, 8.5, { cls: "ch-board", pad: 4 });
    const cs = B.cs;
    const legal = mine ? CH.legal(s, s.turn) : [];
    const dests = new Map();
    if (ui.sel != null) legal.forEach((m) => { if (m.f === ui.sel) { const l = dests.get(m.to) || []; l.push(m); dests.set(m.to, l); } });
    const kingSq = check ? CH.kingOf(s.b, s.turn) : -1;
    const files = "abcdefgh";
    for (let i = 0; i < 64; i++) {
      let r = i >> 3, c = i & 7; if (flip) { r = 7 - r; c = 7 - c; }
      const v = s.b[i];
      let cls = "ch-cell " + (((i >> 3) + (i & 7)) % 2 ? "dark" : "light");
      if (s.last && (i === s.last.to || i === s.last.f)) cls += " last";
      if (dests.has(i)) cls += v ? " cap" : " can";
      if (ui.sel === i) cls += " sel";
      if (i === kingSq) cls += " check";
      const cell = at(B.el, B.x(c), B.y(r + 0.25), cs, cs, cls, {
        onclick: !mine ? null : () => {
          if (dests.has(i)) {
            const opts = dests.get(i); ui.sel = null;
            if (opts.length > 1) {
              const own = s.turn;
              modal(h("div", null, h("h3", null, "何に昇格しますか？"), h("div", { class: "row wrap" }, [CH.Q, CH.R, CH.B, CH.N].map((pr) =>
                h("button", { class: "btn ghost", style: { fontSize: "30px" }, onclick: () => { closeModal(); T.act({ t: "mv", f: opts[0].f, to: i, pr }); } }, h("span", { class: "ch-sym " + (own ? "b" : "w") }, CH.SYM[pr]))))));
            } else T.act({ t: "mv", f: opts[0].f, to: opts[0].to, pr: opts[0].pr || 0 });
            T.redraw(); return;
          }
          if (v && CH.own(v) === s.turn && legal.some((m) => m.f === i)) { ui.sel = ui.sel === i ? null : i; Snd.tick(); T.redraw(); return; }
          if (ui.sel != null) { ui.sel = null; T.redraw(); }
        } });
      if (v) cell.append(h("div", { class: "ch-pc " + (CH.own(v) ? "b" : "w") + (s.last && i === s.last.to ? " pop" : "") }, CH.SYM[CH.typ(v)]));
      if (c === 0) cell.append(h("i", { class: "ch-rank" }, 8 - (i >> 3)));
      if (r === 7) cell.append(h("i", { class: "ch-file" }, files[i & 7]));
    }
  },
};
