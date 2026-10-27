"use strict";
/* ===== チェッカー・ダイヤモンドゲーム ===== */

/* ---------- チェッカー（8×8・取るのは強制） ---------- */
const Checkers = {
  id: "checkers", name: "チェッカー", icon: "🔵", min: 2, max: 2, tag: "世界の定番",
  desc: "ななめに進んで、飛びこえて取る！相手のコマを全部取ったら勝ち",
  rules: "・黒いマスだけを使い、コマはななめ前に1マス進みます。\n・ななめとなりに相手のコマがあり、その先が空いていれば飛びこえて取れます。続けて取れるときは連続で取ります。\n・取れるときは必ず取らなければいけません。\n・いちばん奥までたどり着いたコマは「キング👑」になり、ななめ後ろにも進めます。\n・相手のコマを全部取るか、相手が動けなくなったら勝ち！\n・40手続けてどちらもコマを取らなかったら引き分けです。",
  opts: [],
  setup(n) {
    // b[i] : 0=空, 1=先手, 2=後手, 3=先手キング, 4=後手キング（先手は下から上へ）
    const b = Array(64).fill(0);
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if ((r + c) % 2 === 1) { if (r < 3) b[r * 8 + c] = 2; else if (r > 4) b[r * 8 + c] = 1; }
    return { n, b, turn: 0, over: false, events: [], quiet: 0, last: null };
  },
  owner(v) { return v ? (v === 1 || v === 3 ? 0 : 1) : -1; },
  isKing(v) { return v >= 3; },
  dirs(v) { if (this.isKing(v)) return [[-1, -1], [-1, 1], [1, -1], [1, 1]]; return this.owner(v) === 0 ? [[-1, -1], [-1, 1]] : [[1, -1], [1, 1]]; },
  /* i からの連続ジャンプ（全部の経路） */
  jumps(b, i, v, path, out, taken) {
    const r = i >> 3, c = i & 7; let ext = false;
    for (const [dr, dc] of this.dirs(v)) {
      const mr = r + dr, mc = c + dc, tr = r + dr * 2, tc = c + dc * 2;
      if (tr < 0 || tr > 7 || tc < 0 || tc > 7) continue;
      const mi = mr * 8 + mc, ti = tr * 8 + tc;
      if (taken.includes(mi) || b[ti] || this.owner(b[mi]) !== 1 - this.owner(v)) continue;
      ext = true;
      const promote = !this.isKing(v) && ((this.owner(v) === 0 && tr === 0) || (this.owner(v) === 1 && tr === 7));
      const nb = b.slice(); nb[i] = 0; nb[ti] = v;
      if (promote) out.push(path.concat(ti));       // 成ったらそこで終わり
      else this.jumps(nb, ti, v, path.concat(ti), out, taken.concat(mi));
    }
    if (!ext && path.length > 1) out.push(path);
  },
  allMoves(b, seat) {
    const caps = [], steps = [];
    for (let i = 0; i < 64; i++) {
      const v = b[i]; if (this.owner(v) !== seat) continue;
      const before = caps.length;
      this.jumps(b, i, v, [i], caps, []);
      if (caps.length === before) {
        const r = i >> 3, c = i & 7;
        for (const [dr, dc] of this.dirs(v)) { const tr = r + dr, tc = c + dc; if (tr >= 0 && tr < 8 && tc >= 0 && tc < 8 && !b[tr * 8 + tc]) steps.push([i, tr * 8 + tc]); }
      }
    }
    return caps.length ? caps : steps;
  },
  play(b, path) {
    const nb = b.slice(); let v = nb[path[0]]; nb[path[0]] = 0; let cap = 0;
    for (let k = 1; k < path.length; k++) {
      const a = path[k - 1], z = path[k];
      if (Math.abs((z >> 3) - (a >> 3)) === 2) { nb[(a + z) >> 1] = 0; cap++; }
    }
    const tr = path[path.length - 1] >> 3;
    if (v === 1 && tr === 0) v = 3; if (v === 2 && tr === 7) v = 4;
    nb[path[path.length - 1]] = v;
    return { b: nb, cap, promo: v !== b[path[0]] };
  },
  same(a, b) { return a.length === b.length && a.every((x, k) => x === b[k]); },
  actors(s) { return s.over ? [] : [s.turn]; },
  valid(s, seat, m) { return seat === s.turn && m.t === "mv" && Array.isArray(m.path) && this.allMoves(s.b, seat).some((p) => this.same(p, m.path)); },
  apply(s, seat, m) {
    const r = this.play(s.b, m.path);
    s.b = r.b; s.last = m.path;
    s.quiet = r.cap ? 0 : s.quiet + 1;
    if (r.cap >= 2) ev(s, seat, "say", "good");
    if (r.promo) ev(s, -1, "toast", "キング👑になった！");
    const nx = 1 - seat;
    if (!this.allMoves(s.b, nx).length) { s.over = true; s.winner = seat; ev(s, seat, "say", "win"); ev(s, nx, "say", "lose"); return; }
    if (s.quiet >= 40) { s.over = true; s.winner = -1; ev(s, -1, "toast", "40手とらなかったので引き分け"); return; }
    s.turn = nx;
  },
  evalB(b, seat) {
    let v = 0;
    for (let i = 0; i < 64; i++) {
      const x = b[i]; if (!x) continue;
      const o = this.owner(x), r = i >> 3, c = i & 7;
      let w = this.isKing(x) ? 175 : 100 + (o === 0 ? 7 - r : r) * 4;
      if (c === 0 || c === 7) w += 4;
      if (!this.isKing(x) && ((o === 0 && r === 7) || (o === 1 && r === 0))) w += 8; // 奥の守り
      v += o === seat ? w : -w;
    }
    return v;
  },
  search(b, seat, d, a, bt, chk) {
    chk();
    const ms = this.allMoves(b, seat);
    if (!ms.length) return -100000 - d;
    if (d === 0) return this.evalB(b, seat);
    let best = -1e9;
    for (const p of ms) {
      const v = -this.search(this.play(b, p).b, 1 - seat, d - 1, -bt, -a, chk);
      if (v > best) best = v; if (best > a) a = best; if (a >= bt) break;
    }
    return best;
  },
  cpu(s, seat, level) {
    const ms = this.allMoves(s.b, seat);
    if (!ms.length) return null;
    const maxD = [1, 4, 9][level];
    const chk = deadline(level === 2 ? 1100 : 400);
    let sc = null;
    for (let d = 1; d <= maxD; d++) {
      try { sc = ms.map((p) => ({ m: { t: "mv", path: p }, v: -this.search(this.play(s.b, p).b, 1 - seat, d - 1, -1e9, 1e9, chk) + Math.random() * (level === 0 ? 60 : 1) })); }
      catch (e) { if (!(e instanceof TimeUp)) throw e; break; }
    }
    return pickByLevel(sc || ms.map((p) => ({ m: { t: "mv", path: p }, v: 0 })), level === 0 ? 1 : 2);
  },
  cpuDelay() { return 600 + rnd(400); },
  result(s) {
    const cnt = [0, 0]; s.b.forEach((x) => { if (x) cnt[this.owner(x)]++; });
    return result2(s, cnt.map((x) => "のこり" + x));
  },
  render(s, T, ui) {
    const cnt = [0, 0]; s.b.forEach((x) => { if (x) cnt[this.owner(x)]++; });
    T.players((i) => ({ turn: !s.over && s.turn === i, color: SEAT_COLORS[i], score: "のこり " + cnt[i] }));
    const mid = T.mid();
    const mine = T.myTurn && s.turn === T.me;
    const all = mine ? this.allMoves(s.b, s.turn) : [];
    const mustJump = all.length && all[0].length > 2 || (all.length && Math.abs((all[0][1] >> 3) - (all[0][0] >> 3)) === 2);
    T.bottom({ status: T.turnText(s.turn, ui.path ? "行き先をタップ" : mustJump ? "取れるコマがある！（必ず取る）" : "動かすコマをタップ"), hot: mine });
    const flip = T.view === 1;
    const B = boardBox(mid, T, 8, 8, { cls: "ck-board" });
    const pos = (i) => { let r = i >> 3, c = i & 7; if (flip) { r = 7 - r; c = 7 - c; } return [B.x(c), B.y(r)]; };
    const path = ui.path || null;
    // 今の経路に続く候補
    const conts = path ? all.filter((p) => p.length > path.length && path.every((x, k) => p[k] === x)) : [];
    const nextSq = new Set(conts.map((p) => p[path.length]));
    const starts = new Set(all.map((p) => p[0]));
    const lastSet = new Set(s.last || []);
    for (let i = 0; i < 64; i++) {
      const [x, y] = pos(i);
      const dark = ((i >> 3) + (i & 7)) % 2 === 1;
      let cls = "ck-cell " + (dark ? "dark" : "light");
      if (lastSet.has(i)) cls += " last";
      if (nextSq.has(i)) cls += " can";
      if (path && path[path.length - 1] === i) cls += " sel";
      const cell = at(B.el, x, y, B.cs, B.cs, cls, {
        onclick: !mine ? null : () => {
          if (nextSq.has(i)) {
            const np = path.concat(i);
            const done = all.find((p) => this.same(p, np));
            const more = all.some((p) => p.length > np.length && np.every((q, k) => p[k] === q));
            if (done && !more) { ui.path = null; T.act({ t: "mv", path: np }); return; }
            ui.path = np; T.redraw(); return;
          }
          if (starts.has(i)) { ui.path = [i]; Snd.tick(); T.redraw(); return; }
          if (ui.path) { ui.path = null; T.redraw(); }
        } });
      const v = path && path.length > 1 && i === path[0] ? 0 : s.b[i];
      let pv = v;
      if (path && path.length > 1 && i === path[path.length - 1]) pv = s.b[path[0]];
      if (pv) {
        const o = this.owner(pv);
        const p = h("div", { class: "ck-piece" + (this.isKing(pv) ? " king" : "") + (mine && starts.has(i) && !path ? " movable" : "") + (s.last && i === s.last[s.last.length - 1] ? " pop" : ""), style: { "--pc": SEAT_COLORS[o] } },
          h("img", { src: CHARS[T.charOf(o)].img, alt: "" }));
        cell.append(p);
      }
    }
  },
};

/* ---------- ダイヤモンドゲーム（星形の盤・2〜3人） ---------- */
const CC = (() => {
  const holes = [];
  for (let q = -8; q <= 8; q++) for (let r = -8; r <= 8; r++) {
    const s = -q - r; if (s < -8 || s > 8) continue;
    const A = q <= 4 && r <= 4 && s <= 4, B = q >= -4 && r >= -4 && s >= -4;
    if (A || B) holes.push([q, r, s]);
  }
  const idx = new Map(holes.map((h2, i) => [h2[0] + "," + h2[1], i]));
  const at2 = (q, r) => { const k = idx.get(q + "," + r); return k == null ? -1 : k; };
  // 6つの角（陣地）：0=q<-4, 1=r>4, 2=s<-4, 3=q>4, 4=r<-4, 5=s>4 （となり合う順・向かいは +3）
  const tri = [(h2) => h2[0] < -4, (h2) => h2[1] > 4, (h2) => h2[2] < -4, (h2) => h2[0] > 4, (h2) => h2[1] < -4, (h2) => h2[2] > 4];
  const camps = tri.map((f) => holes.map((h2, i) => (f(h2) ? i : -1)).filter((i) => i >= 0));
  const tips = [[-8, 4, 4], [-4, 8, -4], [4, 4, -8], [8, -4, -4], [4, -8, 4], [-4, -4, 8]];
  const nb = holes.map(([q, r]) => [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]].map(([dq, dr]) => [at2(q + dq, r + dr), at2(q + dq * 2, r + dr * 2)]));
  const dist = (a, t) => Math.max(Math.abs(a[0] - t[0]), Math.abs(a[1] - t[1]), Math.abs(a[2] - t[2]));
  return { holes, camps, tips, nb, dist };
})();
const Diamond = {
  id: "diamond", name: "ダイヤモンドゲーム", icon: "✡️", min: 2, max: 3, tag: "2〜3人",
  desc: "星形の盤で、自分のコマを全部向かいの陣地へ。ぴょんぴょん連続ジャンプが気持ちいい",
  rules: "・星形の盤のとがったところが陣地です。自分のコマ10個を、向かい側の陣地へ全部運んだら勝ち！\n・コマは、となりの空いている穴へ1つ動くか、となりのコマ（だれのでもOK）を飛びこえて向こうの空いている穴へジャンプできます。\n・ジャンプは何回でも続けられます。\n・コマを取ることはありません。\n・向かいの陣地がうまっていて、その中に自分のコマが1つでもあれば勝ちになります（ふさがれ対策）。\n・3人のときは、最初にゴールした人が1位。残りはゴールまでの近さで順位が決まります。\n\nコマをタップすると、行ける場所が光ります。",
  opts: [],
  campsFor(n) { return n === 2 ? [0, 3] : [0, 2, 4]; },
  setup(n) {
    const b = Array(CC.holes.length).fill(-1);
    const camps = this.campsFor(n);
    camps.forEach((cp, seat) => CC.camps[cp].forEach((i) => (b[i] = seat)));
    return { n, b, camps, turn: 0, over: false, events: [], last: null, plies: 0, done: [] };
  },
  target(s, seat) { return (s.camps[seat] + 3) % 6; },
  reach(b, i) {
    // 行き先 -> 経路
    const res = new Map();
    for (const [a] of CC.nb[i]) if (a >= 0 && b[a] < 0) res.set(a, [i, a]);
    const seen = new Set([i]); const q = [[i, [i]]];
    while (q.length) {
      const [x, path] = q.shift();
      for (const [a, j] of CC.nb[x]) {
        if (a < 0 || j < 0 || b[a] < 0 || b[j] >= 0 || seen.has(j) || j === i) continue;
        seen.add(j); const np = path.concat(j);
        if (!res.has(j)) res.set(j, np);
        q.push([j, np]);
      }
    }
    return res;
  },
  allMoves(s, seat) {
    const out = [];
    s.b.forEach((o, i) => { if (o === seat) for (const [to, path] of this.reach(s.b, i)) out.push({ from: i, to, path }); });
    return out;
  },
  actors(s) { return s.over ? [] : [s.turn]; },
  valid(s, seat, m) { return seat === s.turn && m.t === "mv" && s.b[m.from] === seat && this.reach(s.b, m.from).has(m.to); },
  isDone(s, seat) {
    const tgt = CC.camps[this.target(s, seat)];
    const mineIn = tgt.filter((i) => s.b[i] === seat).length;
    return mineIn === 10 || (mineIn > 0 && tgt.every((i) => s.b[i] >= 0));
  },
  progress(s, seat) { const tip = CC.tips[this.target(s, seat)]; let d = 0; s.b.forEach((o, i) => { if (o === seat) d += CC.dist(CC.holes[i], tip); }); return d; },
  apply(s, seat, m) {
    const path = this.reach(s.b, m.from).get(m.to);
    s.b[m.to] = seat; s.b[m.from] = -1; s.last = path; s.plies++;
    if (path.length >= 4) ev(s, seat, "say", "good");
    if (this.isDone(s, seat)) {
      s.over = true; s.winner = seat; ev(s, seat, "say", "win");
      return;
    }
    if (s.plies >= 400) { s.over = true; s.winner = -2; ev(s, -1, "toast", "手数の上限。ゴールに近い人の勝ち"); return; }
    // 動けない人はとばす
    let nx = seat;
    for (let k = 0; k < s.n; k++) { nx = (nx + 1) % s.n; if (this.allMoves(s, nx).length) break; }
    s.turn = nx;
  },
  cpu(s, seat, level) {
    const tip = CC.tips[this.target(s, seat)];
    const tgtSet = new Set(CC.camps[this.target(s, seat)]);
    const home = new Set(CC.camps[s.camps[seat]]);
    const ms = this.allMoves(s, seat);
    // 遅れているコマ（いちばん遠いコマ）を優先する補正
    const far = Math.max(...s.b.map((o, i) => (o === seat ? CC.dist(CC.holes[i], tip) : 0)));
    const sc = ms.map((m) => {
      const d0 = CC.dist(CC.holes[m.from], tip), d1 = CC.dist(CC.holes[m.to], tip);
      let v = (d0 - d1) * 10;
      if (d0 === far) v += 3;
      if (tgtSet.has(m.from) && !tgtSet.has(m.to)) v -= 30;
      if (tgtSet.has(m.to)) v += 4 + (8 - d1);
      if (home.has(m.from) && !home.has(m.to)) v += 2;
      // 横ずれを少し嫌う（中央の線に寄せる）
      v -= Math.abs(CC.dist(CC.holes[m.to], [0, 0, 0]) - d1 + 8) * 0.2;
      if (level === 2) {
        // 次の自分の手の伸びも少し見る
        const b2 = s.b.slice(); b2[m.to] = seat; b2[m.from] = -1;
        let best2 = 0;
        b2.forEach((o, i) => { if (o === seat) for (const [to] of this.reach(b2, i)) { const g = CC.dist(CC.holes[i], tip) - CC.dist(CC.holes[to], tip); if (g > best2) best2 = g; } });
        v += best2 * 3;
      }
      return { m: { t: "mv", from: m.from, to: m.to }, v: v + Math.random() * (level === 0 ? 12 : 0.5) };
    });
    return pickByLevel(sc, level === 0 ? 1 : 2);
  },
  cpuDelay() { return 500 + rnd(400); },
  result(s) {
    const order = [...Array(s.n).keys()].sort((a, b) => (a === s.winner ? -1 : b === s.winner ? 1 : this.progress(s, a) - this.progress(s, b)));
    return order.map((seat, k) => ({ seat, rank: k, score: seat === s.winner ? "ゴール！" : "あと" + this.progress(s, seat) }));
  },
  render(s, T, ui) {
    T.players((i) => ({ turn: !s.over && s.turn === i, color: SEAT_COLORS[i], score: "あと " + this.progress(s, i) }));
    const mid = T.mid();
    const mine = T.myTurn && s.turn === T.me;
    T.bottom({ status: T.turnText(s.turn, ui.sel != null ? "行き先をタップ" : "動かすコマをタップ"), hot: mine });
    const view = T.hotseat ? 0 : Math.max(0, T.me);
    // 自分の陣地が下にくるように回転
    const homeTip = CC.tips[s.camps[view]];
    const px = (h2) => [(h2[0] + h2[1] / 2) * 1, h2[1] * 0.8660254];
    const [hx, hy] = px(homeTip);
    const ang = Math.atan2(hx, hy); // (hx,hy) を真下 (0,1) に
    const rot = (h2) => { const [x, y] = px(h2); const c = Math.cos(ang), sn = Math.sin(ang); return [x * c - y * sn, x * sn + y * c]; };
    const B = boardBox(mid, T, 1, 1.0, { cls: "cc-board", pad: 4 });
    const S = B.cs, R = S / 17.2, cx = B.pad + S / 2, cy = B.pad + S / 2;
    const reach = ui.sel != null && mine ? this.reach(s.b, ui.sel) : null;
    const lastSet = new Set(s.last || []);
    // 陣地の色
    const campOwner = Array(6).fill(-1); s.camps.forEach((cp, seat) => (campOwner[cp] = seat));
    const campOf = new Map(); CC.camps.forEach((list, cp) => list.forEach((i) => campOf.set(i, cp)));
    CC.holes.forEach((h2, i) => {
      const [x, y] = rot(h2);
      const X = cx + x * R, Y = cy + y * R;
      const cp = campOf.get(i);
      let tint = "";
      if (cp != null) { const ow = campOwner[cp] >= 0 ? campOwner[cp] : campOwner[(cp + 3) % 6]; if (ow >= 0) tint = SEAT_COLORS[ow]; }
      const can = reach && reach.has(i);
      const own = s.b[i];
      const el = at(B.el, X - R * 0.46, Y - R * 0.46, R * 0.92, R * 0.92, "cc-hole" + (can ? " can" : "") + (lastSet.has(i) ? " last" : "") + (ui.sel === i ? " sel" : ""), {
        onclick: !mine ? null : () => {
          if (can) { const from = ui.sel; ui.sel = null; T.act({ t: "mv", from, to: i }); return; }
          if (own === s.turn) { ui.sel = ui.sel === i ? null : i; Snd.tick(); T.redraw(); return; }
          if (ui.sel != null) { ui.sel = null; T.redraw(); }
        } });
      if (tint) el.style.setProperty("--tint", tint + "40");
      if (own >= 0) el.append(h("div", { class: "cc-peg" + (s.last && i === s.last[s.last.length - 1] ? " pop" : ""), style: { "--pc": SEAT_COLORS[own] } }));
    });
  },
};
