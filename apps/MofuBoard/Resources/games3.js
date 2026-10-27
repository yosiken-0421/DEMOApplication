"use strict";
/* ===== さいころのゲーム：もふもふすごろく・ルド・ヨット ===== */

/* ---------- もふもふすごろく（オリジナル） ---------- */
const SG_COLS = 6, SG_ROWS = 7, SG_LEN = SG_COLS * SG_ROWS; // 0=スタート, 41=ゴール
const SUGO_SQ = {
  plain: { ic: "", nm: "" },
  star: { ic: "⭐", nm: "★+2" },
  star3: { ic: "🌟", nm: "★+4" },
  minus: { ic: "💧", nm: "★-2" },
  fwd: { ic: "⏩", nm: "3マス進む" },
  back: { ic: "⏪", nm: "3マス戻る" },
  rest: { ic: "💤", nm: "1回休み" },
  again: { ic: "🔁", nm: "もう1回" },
  warp: { ic: "🌀", nm: "ワープ" },
  gift: { ic: "🎁", nm: "みんなから★1" },
  lucky: { ic: "🍀", nm: "ラッキー" },
  dice2: { ic: "🎲", nm: "次はダイス2個" },
};
const SUGO_MAP = (() => {
  const L = ["start", "plain", "star", "plain", "fwd", "star", "minus", "plain", "lucky", "rest", "star", "plain", "again", "back", "star", "gift", "plain", "warp", "minus", "star",
    "dice2", "plain", "star3", "back", "rest", "plain", "star", "lucky", "minus", "fwd", "plain", "star", "gift", "back", "star3", "rest", "plain", "minus", "star", "back", "lucky", "goal"];
  return L;
})();
const SUGO_WARP = { 17: 27 };
const Sugoroku = {
  id: "sugoroku", name: "もふもふすごろく", icon: "🎲", min: 2, max: 5, tag: "2〜5人",
  desc: "さいころを振って★を集めながらゴールを目指す！運だめしパーティーゲーム",
  rules: "・順番にさいころを振って、出た目だけ進みます。\n・止まったマスのイベントが起こります。\n　⭐★+2　🌟★+4　💧★-2\n　⏩3マス進む　⏪3マス戻る\n　💤1回休み　🔁もう1回振れる\n　🌀ワープ（近道！）　🎁みんなから★を1つずつもらう\n　🍀ラッキー（何が起こるかお楽しみ）\n　🎲次はさいころ2個\n・ゴールした順にボーナス★（1着+10、2着+6、3着+3、4着+1）。\n・最後の1人がゴールする前に終了。★が一番多い人の勝ち！",
  opts: [],
  sound: "step",
  setup(n) {
    return { n, pos: Array(n).fill(0), star: Array(n).fill(5), skip: Array(n).fill(0), two: Array(n).fill(0), done: [], turn: 0, over: false, events: [], dice: [], phase: "roll", msg: "" };
  },
  actors(s) { return s.over || s.phase !== "roll" ? [] : [s.turn]; },
  valid(s, seat, m) { return seat === s.turn && s.phase === "roll" && m.t === "roll"; },
  apply(s, seat, m) {
    const k = s.two[seat] ? 2 : 1;
    s.two[seat] = 0;
    s.dice = Array.from({ length: k }, () => 1 + rnd(6));
    s.phase = "rolling"; s.msg = "";
    ev(s, -1, "snd", "dice");
    s.wait = { ms: 900, then: "move" };
  },
  resolve(s, then) {
    const seat = s.turn;
    if (then === "move") {
      const d = s.dice.reduce((a, b) => a + b, 0);
      s.from = s.pos[seat];
      s.pos[seat] = Math.min(SG_LEN - 1, s.pos[seat] + d);
      s.phase = "moving";
      s.wait = { ms: 300 + d * 110, then: "effect" };
      return;
    }
    if (then === "effect") {
      const p = s.pos[seat], t = SUGO_MAP[p];
      let again = false;
      const nm = s.names ? s.names[seat] : "";
      if (t === "goal") {
        s.done.push(seat);
        const bonus = [10, 6, 3, 1, 0][s.done.length - 1];
        s.star[seat] += bonus; s.msg = nm + " ゴール！ " + s.done.length + "着 ★+" + bonus;
        ev(s, seat, "say", "win");
        if (s.done.length >= s.n - 1) { s.over = true; ev(s, -1, "big", "ゲーム終了！"); return; }
      } else if (t === "star") { s.star[seat] += 2; s.msg = "★+2"; ev(s, seat, "say", "good"); }
      else if (t === "star3") { s.star[seat] += 4; s.msg = "★+4 やったね！"; ev(s, seat, "say", "good"); ev(s, -1, "snd", "ok"); }
      else if (t === "minus") { s.star[seat] = Math.max(0, s.star[seat] - 2); s.msg = "★-2 ざんねん…"; ev(s, seat, "say", "bad"); }
      else if (t === "fwd") { s.pos[seat] = Math.min(SG_LEN - 1, p + 3); s.msg = "3マス進む！"; this.bonusLand(s, seat); }
      else if (t === "back") { s.pos[seat] = Math.max(0, p - 3); s.msg = "3マス戻る…"; ev(s, seat, "say", "bad"); this.bonusLand(s, seat); }
      else if (t === "rest") { s.skip[seat] = 1; s.msg = "1回休み 💤"; ev(s, seat, "say", "bad"); }
      else if (t === "again") { again = true; s.msg = "もう1回振れる！"; ev(s, seat, "say", "good"); }
      else if (t === "warp") { s.pos[seat] = SUGO_WARP[p] || p; s.msg = "ワープ！近道だ！"; ev(s, -1, "snd", "big"); }
      else if (t === "gift") {
        let got = 0; for (let i = 0; i < s.n; i++) if (i !== seat && s.star[i] > 0 && !s.done.includes(i)) { s.star[i]--; got++; }
        s.star[seat] += got; s.msg = "みんなから★" + got + "つもらった！"; ev(s, seat, "say", "good");
      } else if (t === "lucky") {
        const r = rnd(4);
        if (r === 0) { s.star[seat] += 3; s.msg = "🍀 四つ葉を見つけた！★+3"; }
        else if (r === 1) { s.two[seat] = 1; s.msg = "🍀 次はさいころ2個！"; }
        else if (r === 2) {
          // いちばん★が多い人と入れかえ（自分が一番なら★+1）
          let top = seat; for (let i = 0; i < s.n; i++) if (s.star[i] > s.star[top] && !s.done.includes(i)) top = i;
          if (top !== seat) { [s.star[seat], s.star[top]] = [s.star[top], s.star[seat]]; s.msg = "🍀 " + (s.names ? s.names[top] : "") + " と★を入れかえ！"; }
          else { s.star[seat] += 1; s.msg = "🍀 ★+1"; }
        } else { s.pos[seat] = Math.min(SG_LEN - 2, p + 4); s.msg = "🍀 追い風！4マス進む"; }
        ev(s, seat, "say", "good");
      } else if (t === "dice2") { s.two[seat] = 1; s.msg = "次はさいころ2個！"; }
      s.phase = "roll";
      if (!again || s.done.includes(seat)) this.nextTurn(s);
    }
  },
  /* 進む・戻るで止まったマスが★系なら、それも少しもらえる */
  bonusLand(s, seat) {
    const t = SUGO_MAP[s.pos[seat]];
    if (t === "star" || t === "star3") { s.star[seat] += 1; s.msg += "（★+1）"; }
    if (t === "goal") { s.pos[seat] = SG_LEN - 2; }
  },
  nextTurn(s) {
    let t = s.turn;
    for (let k = 0; k < s.n * 2; k++) {
      t = (t + 1) % s.n;
      if (s.done.includes(t)) continue;
      if (s.skip[t]) { s.skip[t] = 0; ev(s, -1, "toast", (s.names ? s.names[t] : "") + " はお休み💤"); continue; }
      break;
    }
    s.turn = t;
  },
  cpu() { return { t: "roll" }; },
  cpuDelay() { return 700 + rnd(500); },
  result(s) {
    const order = [...Array(s.n).keys()].sort((a, b) => s.star[b] - s.star[a] || (s.done.indexOf(a) < 0 ? 9 : s.done.indexOf(a)) - (s.done.indexOf(b) < 0 ? 9 : s.done.indexOf(b)));
    return order.map((seat, k) => ({ seat, rank: order.findIndex((x) => s.star[x] === s.star[seat]), score: "★" + s.star[seat], note: s.done.includes(seat) ? s.done.indexOf(seat) + 1 + "着" : "" }));
  },
  cellXY(i) { const r = Math.floor(i / SG_COLS); let c = i % SG_COLS; if (r % 2 === 1) c = SG_COLS - 1 - c; return [c, SG_ROWS - 1 - r]; },
  render(s, T) {
    T.players((i) => ({ turn: !s.over && s.turn === i, score: "★" + s.star[i], badge: s.done.includes(i) ? s.done.indexOf(i) + 1 + "着" : s.skip[i] ? "💤" : null, gold: s.done.indexOf(i) === 0 }));
    const mid = T.mid();
    const mine = T.myTurn && s.turn === T.me && s.phase === "roll";
    const dice = h("div", { class: "dice-row" }, (s.dice.length ? s.dice : [1]).map((v) => dieEl(s.phase === "rolling" ? 1 + rnd(6) : v, { roll: s.phase === "rolling", size: 44 })));
    T.bottom({
      status: s.msg && s.phase === "roll" ? s.msg : s.phase === "rolling" ? "コロコロ…" : T.turnText(s.turn, "さいころを振ろう" + (s.two[s.turn] ? "（2個！）" : "")),
      hot: mine, extra: dice,
      buttons: mine ? [h("button", { class: "btn pink", onclick: () => T.act({ t: "roll" }) }, "🎲 さいころを振る")] : [],
    });
    const B = boardBox(mid, T, SG_COLS, SG_ROWS, { cls: "sr-board", pad: 6 });
    const cs = B.cs;
    // 道
    for (let i = 0; i < SG_LEN; i++) {
      const [c, r] = this.cellXY(i), t = SUGO_MAP[i];
      const e = at(B.el, B.x(c) + 2, B.y(r) + 2, cs - 4, cs - 4, "sr-sq " + t);
      if (t === "start") e.append(h("b", null, "START"));
      else if (t === "goal") e.append(h("b", null, "GOAL"));
      else { e.append(h("span", { class: "ic" }, SUGO_SQ[t].ic)); e.append(h("i", { class: "no" }, i)); }
    }
    // コマ
    const byPos = {};
    for (let i = 0; i < s.n; i++) (byPos[s.pos[i]] = byPos[s.pos[i]] || []).push(i);
    for (const p in byPos) {
      const list = byPos[p], [c, r] = this.cellXY(+p);
      list.forEach((seat, k) => {
        const sz = cs * (list.length > 2 ? 0.48 : 0.6);
        const ox = list.length === 1 ? (cs - sz) / 2 : (k % 2) * (cs - sz) * 0.9 + 2;
        const oy = list.length === 1 ? (cs - sz) / 2 - cs * 0.06 : Math.floor(k / 2) * (cs - sz) * 0.6 + 2;
        const tok = at(B.el, B.x(c) + ox, B.y(r) + oy, sz, sz, "sr-tok" + (s.turn === seat && !s.over ? " cur" : ""));
        tok.append(charToken(T.charOf(seat), SEAT_COLORS[seat]));
      });
    }
  },
};

/* ---------- ルド（すごろく陣取り・2〜4人） ---------- */
const LUDO = (() => {
  const path = [];
  const seg = (list) => list.forEach((x) => path.push(x));
  seg([1, 2, 3, 4, 5].map((c) => [6, c]));
  seg([5, 4, 3, 2, 1, 0].map((r) => [r, 6]));
  seg([[0, 7]]);
  seg([0, 1, 2, 3, 4, 5].map((r) => [r, 8]));
  seg([9, 10, 11, 12, 13, 14].map((c) => [6, c]));
  seg([[7, 14]]);
  seg([14, 13, 12, 11, 10, 9].map((c) => [8, c]));
  seg([9, 10, 11, 12, 13, 14].map((r) => [r, 8]));
  seg([[14, 7]]);
  seg([14, 13, 12, 11, 10, 9].map((r) => [r, 6]));
  seg([5, 4, 3, 2, 1, 0].map((c) => [8, c]));
  seg([[7, 0]]);
  seg([[6, 0]]);
  // ゴール列（色ごと）
  const homes = [
    [1, 2, 3, 4, 5].map((c) => [7, c]),
    [1, 2, 3, 4, 5].map((r) => [r, 7]),
    [13, 12, 11, 10, 9].map((c) => [7, c]),
    [13, 12, 11, 10, 9].map((r) => [r, 7]),
  ];
  const bases = [[1.5, 1.5], [1.5, 10.5], [10.5, 10.5], [10.5, 1.5]]; // 左上・右上・右下・左下（各3×3の中心付近）
  const safe = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
  return { path, homes, bases, safe };
})();
const Ludo = {
  id: "ludo", name: "ルド", icon: "🏁", min: 2, max: 4, tag: "2〜4人",
  desc: "世界中で人気のすごろく陣取り！4つのコマを全部ゴールさせよう",
  rules: "・自分のコマ4つを、ぐるっと一周させて真ん中のゴールに全部入れたら勝ち！\n・6が出たらコマを1つスタートに出せます。\n・さいころの目だけコマを進めます（どのコマを動かすか選べます）。\n・6が出たらもう1回振れます（3回続けて6だとそこで終わり）。\n・相手のコマがいるマスにぴったり止まると、そのコマをふり出しに戻せます！\n・★のマスとスタートのマスは安全地帯（戻されません）。\n・ゴールの列に入ったら、ちょうどの目でゴールします。",
  opts: [],
  sound: "step",
  slots(n) { return n === 2 ? [0, 2] : n === 3 ? [0, 1, 2] : [0, 1, 2, 3]; },
  setup(n) {
    // p[seat][k] : -1=ベース, 0..50 = 自分のスタートからの距離, 51..55=ゴール列, 56=ゴール
    return { n, slot: this.slots(n), p: Array.from({ length: n }, () => [-1, -1, -1, -1]), turn: 0, die: 0, phase: "roll", sixes: 0, over: false, events: [], done: [], last: null };
  },
  abs(s, seat, rel) { return rel < 0 || rel > 50 ? -1 : (rel + s.slot[seat] * 13) % 52; },
  movable(s, seat, d) {
    const out = [];
    s.p[seat].forEach((rel, k) => {
      if (rel === 56) return;
      if (rel < 0) { if (d === 6) out.push(k); return; }
      if (rel + d <= 56) out.push(k);
    });
    return out;
  },
  actors(s) { return s.over || s.wait ? [] : [s.turn]; },
  valid(s, seat, m) {
    if (seat !== s.turn) return false;
    if (m.t === "roll") return s.phase === "roll";
    if (m.t === "move") return s.phase === "move" && this.movable(s, seat, s.die).includes(m.k);
    return false;
  },
  apply(s, seat, m) {
    if (m.t === "roll") {
      s.die = 1 + rnd(6); s.phase = "rolling"; ev(s, -1, "snd", "dice");
      s.wait = { ms: 800, then: "rolled" };
      return;
    }
    const rel = s.p[seat][m.k];
    const nr = rel < 0 ? 0 : rel + s.die;
    s.p[seat][m.k] = nr;
    s.last = { seat, k: m.k };
    let extra = s.die === 6;
    // 相手を戻す
    const a = this.abs(s, seat, nr);
    if (a >= 0 && !LUDO.safe.has(a)) {
      for (let o = 0; o < s.n; o++) {
        if (o === seat) continue;
        s.p[o].forEach((r2, k2) => { if (this.abs(s, o, r2) === a) { s.p[o][k2] = -1; ev(s, seat, "say", "good"); ev(s, o, "say", "bad"); ev(s, -1, "toast", (s.names ? s.names[o] : "") + " のコマをふり出しへ！"); extra = true; } });
      }
    }
    if (nr === 56) { ev(s, -1, "toast", "ゴール！"); extra = true; }
    if (s.p[seat].every((x) => x === 56)) {
      s.done.push(seat); ev(s, seat, "say", "win");
      if (s.done.length >= s.n - 1) { s.over = true; return; }
      extra = false;
    }
    if (extra && !s.done.includes(seat)) { s.phase = "roll"; if (s.die !== 6) s.sixes = 0; }
    else this.next(s);
  },
  resolve(s, then) {
    const seat = s.turn;
    if (then === "rolled") {
      if (s.die === 6) { s.sixes++; if (s.sixes >= 3) { ev(s, -1, "toast", "6が3回続いたので交代"); this.next(s); return; } }
      const mv = this.movable(s, seat, s.die);
      if (!mv.length) { s.phase = "pass"; s.wait = { ms: 700, then: "pass" }; return; }
      s.phase = "move";
      return;
    }
    if (then === "pass") { if (s.die === 6) s.phase = "roll"; else this.next(s); }
  },
  next(s) {
    s.sixes = 0; s.phase = "roll";
    let t = s.turn;
    for (let k = 0; k < s.n; k++) { t = (t + 1) % s.n; if (!s.done.includes(t)) break; }
    s.turn = t;
  },
  cpu(s, seat, level) {
    if (s.phase === "roll") return { t: "roll" };
    const mv = this.movable(s, seat, s.die);
    const threat = (abs) => {
      // その地点を後ろから狙える相手コマ
      if (abs < 0 || LUDO.safe.has(abs)) return 0;
      let n = 0;
      for (let o = 0; o < s.n; o++) if (o !== seat) s.p[o].forEach((r2) => { const a2 = this.abs(s, o, r2); if (a2 >= 0) { const d = (abs - a2 + 52) % 52; if (d >= 1 && d <= 6) n++; } });
      return n;
    };
    const sc = mv.map((k) => {
      const rel = s.p[seat][k], nr = rel < 0 ? 0 : rel + s.die, a = this.abs(s, seat, nr);
      let v = nr * 0.5;
      if (rel < 0) v += 30;
      if (nr === 56) v += 40;
      if (nr > 50 && rel <= 50) v += 25;
      if (a >= 0 && !LUDO.safe.has(a)) for (let o = 0; o < s.n; o++) if (o !== seat) s.p[o].forEach((r2) => { if (this.abs(s, o, r2) === a) v += 50 + r2; });
      if (a >= 0 && LUDO.safe.has(a)) v += 10;
      if (level >= 1) { v -= threat(a) * 18; v += threat(this.abs(s, seat, rel)) * 12; }
      return { m: { t: "move", k }, v: v + Math.random() * (level === 0 ? 40 : 2) };
    });
    return pickByLevel(sc, level === 0 ? 1 : 2);
  },
  cpuDelay(s) { return s.phase === "roll" ? 600 : 700 + rnd(300); },
  result(s) {
    const prog = (seat) => s.p[seat].reduce((a, x) => a + (x < 0 ? 0 : x), 0);
    const order = s.done.slice();
    [...Array(s.n).keys()].filter((x) => !order.includes(x)).sort((a, b) => prog(b) - prog(a)).forEach((x) => order.push(x));
    return order.map((seat, k) => ({ seat, rank: k, score: "ゴール" + s.p[seat].filter((x) => x === 56).length + "/4" }));
  },
  cellOf(s, seat, rel, k) {
    const sl = s.slot[seat];
    if (rel < 0) { const [br, bc] = LUDO.bases[sl]; return [br + (k >> 1) * 2, bc + (k & 1) * 2]; }
    if (rel <= 50) return LUDO.path[(rel + sl * 13) % 52];
    if (rel <= 55) return LUDO.homes[sl][rel - 51];
    return [7, 7];
  },
  render(s, T) {
    T.players((i) => ({ turn: !s.over && s.turn === i, color: SEAT_COLORS[s.slot[i]], score: "🏠" + s.p[i].filter((x) => x === 56).length + "/4", badge: s.done.includes(i) ? s.done.indexOf(i) + 1 + "位" : null, gold: s.done[0] === i }));
    const mid = T.mid();
    const myT = T.myTurn && s.turn === T.me;
    const mv = myT && s.phase === "move" ? this.movable(s, s.turn, s.die) : [];
    const dice = h("div", { class: "dice-row" }, dieEl(s.phase === "rolling" ? 1 + rnd(6) : s.die || 1, { roll: s.phase === "rolling", size: 44 }));
    let st = T.turnText(s.turn, s.phase === "move" ? "動かすコマをタップ" : "さいころを振ろう");
    if (s.phase === "pass") st = "動かせるコマがない…";
    if (s.phase === "rolling") st = "コロコロ…";
    T.bottom({ status: st, hot: myT, extra: dice, buttons: myT && s.phase === "roll" ? [h("button", { class: "btn pink", onclick: () => T.act({ t: "roll" }) }, "🎲 さいころを振る")] : [] });
    // 自分の色を左下に回す
    const vs = s.slot[T.hotseat ? 0 : Math.max(0, T.me)] || 0;
    const rotK = (3 - vs + 4) % 4; // 左上(0)を左下(3)へ
    const rot = ([r, c]) => { let rr = r, cc = c; for (let k = 0; k < rotK; k++) { const t = rr; rr = cc; cc = 14 - t; } return [rr, cc]; };
    const B = boardBox(mid, T, 15, 15, { cls: "ld-board", pad: 4 });
    const cs = B.cs;
    const used = new Set(s.slot);
    // ベース
    for (let sl = 0; sl < 4; sl++) {
      const [r0, c0] = [[0, 0], [0, 9], [9, 9], [9, 0]][sl];
      const corners = [[r0, c0], [r0 + 5, c0 + 5]].map(rot);
      const rr = Math.min(corners[0][0], corners[1][0]), cc = Math.min(corners[0][1], corners[1][1]);
      const e = at(B.el, B.x(cc) + 2, B.y(rr) + 2, cs * 6 - 4, cs * 6 - 4, "ld-base" + (used.has(sl) ? "" : " off"));
      e.style.setProperty("--pc", SEAT_COLORS[sl]);
    }
    // 道
    LUDO.path.forEach((p, i) => {
      const [r, c] = rot(p);
      const startOf = [0, 13, 26, 39].indexOf(i);
      const e = at(B.el, B.x(c), B.y(r), cs, cs, "ld-sq" + (LUDO.safe.has(i) ? " safe" : ""));
      if (startOf >= 0) { e.style.background = SEAT_COLORS[startOf] + "aa"; }
      else if (LUDO.safe.has(i)) e.textContent = "★";
    });
    LUDO.homes.forEach((list, sl) => list.forEach((p) => { const [r, c] = rot(p); const e = at(B.el, B.x(c), B.y(r), cs, cs, "ld-sq home"); e.style.background = SEAT_COLORS[sl] + "88"; }));
    const g = at(B.el, B.x(6), B.y(6), cs * 3, cs * 3, "ld-goal"); g.textContent = "🏠";
    // コマ
    const stack = {};
    for (let seat = 0; seat < s.n; seat++) s.p[seat].forEach((rel, k) => {
      const [r, c] = rot(this.cellOf(s, seat, rel, k));
      const key = r + "," + c; const idx = (stack[key] = (stack[key] || 0) + 1) - 1;
      const can = mv.includes(k) && seat === s.turn;
      const sz = cs * (rel === 56 ? 0.7 : 0.92);
      const off = rel === 56 ? [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]][(seat * 4 + k) % 4].map((x) => x * cs * 0.55) : [idx * 4, -idx * 4];
      const t = at(B.el, B.x(c) + (cs - sz) / 2 + off[0], B.y(r) + (cs - sz) / 2 + off[1], sz, sz, "ld-tok" + (can ? " can" : "") + (s.last && s.last.seat === seat && s.last.k === k ? " pop" : ""), { onclick: can ? () => T.act({ t: "move", k }) : null });
      t.append(charToken(T.charOf(seat), SEAT_COLORS[s.slot[seat]]));
    });
  },
};

/* ---------- ヨット（ダイス役づくり・1〜5人） ---------- */
const YACHT_CATS = [
  { k: "1", nm: "エース", d: "1の目の合計" }, { k: "2", nm: "デュース", d: "2の目の合計" }, { k: "3", nm: "トレイ", d: "3の目の合計" },
  { k: "4", nm: "フォー", d: "4の目の合計" }, { k: "5", nm: "ファイブ", d: "5の目の合計" }, { k: "6", nm: "シックス", d: "6の目の合計" },
  { k: "ch", nm: "チョイス", d: "5個の合計" }, { k: "4k", nm: "フォーダイス", d: "同じ目4個以上で合計" }, { k: "fh", nm: "フルハウス", d: "3個＋2個で合計" },
  { k: "ss", nm: "Sストレート", d: "4つ連番で15点" }, { k: "bs", nm: "Bストレート", d: "5つ連番で30点" }, { k: "y", nm: "ヨット", d: "5個ぜんぶ同じで50点" },
];
const Yacht = {
  id: "yacht", name: "ヨット", icon: "🎯", min: 1, max: 5, tag: "1〜5人",
  desc: "5つのさいころで役を作って点数をかせぐ！ひとりでハイスコア挑戦もOK",
  rules: "・自分の番は、さいころ5個を最大3回まで振れます。\n・残したいさいころをタップすると「キープ」。キープしていないものだけ振り直せます。\n・振り終わったら（途中でもOK）、点数表の空いている役を1つ選んで記入します。条件に合わない役を選ぶと0点。\n・12ラウンドで全部の役が埋まったら終了。合計点が一番多い人の勝ち！\n\n役\n・エース〜シックス：その目の合計\n・ボーナス：上の6つの合計が63点以上で+35点\n・チョイス：5個の合計\n・フォーダイス：同じ目が4個以上→5個の合計\n・フルハウス：3個＋2個→5個の合計\n・Sストレート：4つ連続→15点\n・Bストレート：5つ連続→30点\n・ヨット：5個ぜんぶ同じ→50点",
  opts: [],
  sound: "dice",
  setup(n) { return { n, sc: Array.from({ length: n }, () => ({})), dice: [1, 1, 1, 1, 1], held: [0, 0, 0, 0, 0], rolls: 0, turn: 0, round: 1, over: false, events: [], phase: "roll" }; },
  score(dice, k) {
    const cnt = Array(7).fill(0); dice.forEach((d) => cnt[d]++);
    const sum = dice.reduce((a, b) => a + b, 0);
    if ("123456".includes(k)) return cnt[+k] * +k;
    if (k === "ch") return sum;
    if (k === "4k") return cnt.some((c) => c >= 4) ? sum : 0;
    if (k === "fh") return (cnt.includes(3) && cnt.includes(2)) || cnt.includes(5) ? sum : 0;
    const has = (a) => a.every((v) => cnt[v] > 0);
    if (k === "ss") return has([1, 2, 3, 4]) || has([2, 3, 4, 5]) || has([3, 4, 5, 6]) ? 15 : 0;
    if (k === "bs") return has([1, 2, 3, 4, 5]) || has([2, 3, 4, 5, 6]) ? 30 : 0;
    if (k === "y") return cnt.includes(5) ? 50 : 0;
    return 0;
  },
  upper(sc) { return ["1", "2", "3", "4", "5", "6"].reduce((a, k) => a + (sc[k] || 0), 0); },
  total(sc) { const u = this.upper(sc); return Object.values(sc).reduce((a, b) => a + b, 0) + (u >= 63 ? 35 : 0); },
  actors(s) { return s.over || s.wait ? [] : [s.turn]; },
  valid(s, seat, m) {
    if (seat !== s.turn || s.phase !== "roll") return false;
    if (m.t === "roll") return s.rolls < 3 && s.held.some((x) => !x);
    if (m.t === "hold") return s.rolls > 0 && s.rolls < 3 && m.i >= 0 && m.i < 5;
    if (m.t === "score") return s.rolls > 0 && YACHT_CATS.some((c) => c.k === m.k) && s.sc[seat][m.k] == null;
    return false;
  },
  apply(s, seat, m) {
    if (m.t === "hold") { s.held[m.i] = s.held[m.i] ? 0 : 1; return; }
    if (m.t === "roll") {
      s.dice = s.dice.map((d, i) => (s.held[i] ? d : 1 + rnd(6)));
      s.rolls++; s.phase = "rolling"; ev(s, -1, "snd", "dice");
      s.wait = { ms: 650, then: "rolled" };
      return;
    }
    const v = this.score(s.dice, m.k);
    s.sc[seat][m.k] = v;
    s.lastCat = { seat, k: m.k, v };
    if (m.k === "y" && v) { ev(s, -1, "big", "ヨット！"); ev(s, seat, "say", "win"); }
    else if (v >= 25) ev(s, seat, "say", "good");
    else if (!v) ev(s, seat, "say", "bad");
    const was = this.upper(s.sc[seat]) - v;
    if ("123456".includes(m.k) && was < 63 && this.upper(s.sc[seat]) >= 63) ev(s, -1, "toast", "ボーナス +35！");
    // 次の人
    s.dice = [1, 1, 1, 1, 1]; s.held = [0, 0, 0, 0, 0]; s.rolls = 0;
    if (seat === s.n - 1) {
      if (s.round >= 12) { s.over = true; const best = Math.max(...s.sc.map((x) => this.total(x))); s.sc.forEach((x, i) => { if (this.total(x) === best) ev(s, i, "say", "win"); }); return; }
      s.round++;
    }
    s.turn = (seat + 1) % s.n;
  },
  resolve(s, then) { if (then === "rolled") s.phase = "roll"; },
  /* CPU：期待値ざっくり方式 */
  cpu(s, seat, level) {
    const sc = s.sc[seat], open = YACHT_CATS.filter((c) => sc[c.k] == null).map((c) => c.k);
    const cnt = Array(7).fill(0); s.dice.forEach((d) => cnt[d]++);
    // 記入するときの価値（上段はボーナスを意識）
    const worth = (k, dice) => {
      const v = this.score(dice, k);
      if ("123456".includes(k)) { const par = +k * 3; return v + (v >= par ? 6 : (v - par) * 1.2); }
      if (k === "ch") return v - 22 + (s.round > 9 ? 6 : 0);
      if (k === "y") return v ? 60 : -6 - (12 - s.round);
      if (k === "bs") return v ? 34 : -4;
      if (k === "ss") return v ? 18 : -2;
      if (k === "4k") return v ? v + 6 : -3;
      if (k === "fh") return v ? v + 4 : -3;
      return v;
    };
    const bestScore = () => open.map((k) => ({ m: { t: "score", k }, v: worth(k, s.dice) + Math.random() * (level === 0 ? 8 : 0.3) }));
    if (s.rolls === 0) return { t: "roll" };
    // もう振らない判断
    const now = bestScore().sort((a, b) => b.v - a.v);
    if (s.rolls >= 3) return pickByLevel(now, level === 0 ? 1 : 2);
    const great = now[0].v >= 30 || (s.dice.every((d) => d === s.dice[0]) && open.includes("y"));
    if (great && level > 0) return now[0].m;
    // キープするさいころを決める
    const want = this.keepPlan(s.dice, open, level);
    const diff = want.findIndex((w, i) => !!w !== !!s.held[i]);
    if (diff >= 0) return { t: "hold", i: diff };
    if (want.every((w) => w)) return now[0].m;
    return { t: "roll" };
  },
  keepPlan(dice, open, level) {
    const cnt = Array(7).fill(0); dice.forEach((d) => cnt[d]++);
    const plans = [];
    // 同じ目を集める
    for (let v = 1; v <= 6; v++) {
      if (!cnt[v]) continue;
      let val = cnt[v] * 4 + v * 0.6;
      if (open.includes("y")) val += cnt[v] >= 3 ? 10 : 2;
      if (open.includes("4k") && cnt[v] >= 2) val += 4;
      if (open.includes(String(v))) val += cnt[v] * v * 0.5;
      plans.push({ keep: dice.map((d) => (d === v ? 1 : 0)), val });
    }
    // ストレート
    if (open.includes("bs") || open.includes("ss")) {
      for (const run of [[1, 2, 3, 4, 5], [2, 3, 4, 5, 6], [2, 3, 4, 5], [3, 4, 5, 6], [1, 2, 3, 4]]) {
        const have = run.filter((v) => cnt[v]).length;
        if (have < 3) continue;
        const used = new Set();
        const keep = dice.map((d) => (run.includes(d) && !used.has(d) ? (used.add(d), 1) : 0));
        plans.push({ keep, val: have * 4.5 + (run.length === 5 && open.includes("bs") ? 6 : 0) + (open.includes("ss") ? 2 : 0) });
      }
    }
    // フルハウス
    if (open.includes("fh")) {
      const pairs = [1, 2, 3, 4, 5, 6].filter((v) => cnt[v] >= 2);
      if (pairs.length >= 2 || (pairs.length === 1 && cnt[pairs[0]] === 3 && [1, 2, 3, 4, 5, 6].some((v) => cnt[v] === 2))) plans.push({ keep: dice.map((d) => (cnt[d] >= 2 ? 1 : 0)), val: 15 });
    }
    // チョイス：大きい目だけ
    if (open.includes("ch")) plans.push({ keep: dice.map((d) => (d >= 5 ? 1 : 0)), val: 6 + dice.filter((d) => d >= 5).length });
    if (!plans.length) return [0, 0, 0, 0, 0];
    plans.sort((a, b) => b.val - a.val);
    return (level === 0 && plans.length > 1 && rnd(3) === 0 ? plans[1] : plans[0]).keep;
  },
  cpuDelay(s) { return s.rolls === 0 ? 600 : 450 + rnd(300); },
  result(s) {
    const t = s.sc.map((x) => this.total(x));
    const order = [...Array(s.n).keys()].sort((a, b) => t[b] - t[a]);
    return order.map((seat) => ({ seat, rank: order.findIndex((x) => t[x] === t[seat]), score: t[seat] + "点" }));
  },
  render(s, T) {
    T.players((i) => ({ turn: !s.over && s.turn === i, score: this.total(s.sc[i]) + "点" }));
    const mid = T.mid();
    const mine = T.myTurn && s.turn === T.me;
    const rolling = s.phase === "rolling";
    const dice = h("div", { class: "dice-row y" }, s.dice.map((v, i) => dieEl(rolling && !s.held[i] ? 1 + rnd(6) : v, {
      held: s.held[i], roll: rolling && !s.held[i], size: 50,
      onclick: mine && s.rolls > 0 && s.rolls < 3 && !rolling ? () => T.act({ t: "hold", i }) : null })));
    const left = 3 - s.rolls;
    const st = rolling ? "コロコロ…" : mine ? (s.rolls === 0 ? "さいころを振ろう" : s.rolls < 3 ? "残すさいころをタップ／役をえらぶ（あと" + left + "回）" : "点数表から役をえらぼう") : T.turnText(s.turn);
    T.bottom({
      status: "ラウンド " + s.round + "/12　" + st, hot: mine, extra: dice,
      buttons: mine && s.rolls < 3 ? [h("button", { class: "btn pink", disabled: rolling || s.held.every((x) => x), onclick: () => T.act({ t: "roll" }) }, s.rolls === 0 ? "🎲 振る" : "🎲 振りなおす（あと" + left + "回）")] : [],
    });
    // 点数表（全員）
    const tb = h("table", { class: "yt" });
    const cur = s.turn;
    tb.append(h("tr", null, h("th", null, "役"), ...[...Array(s.n).keys()].map((i) => h("th", { class: i === cur ? "cur" : "" }, h("img", { src: CHARS[T.charOf(i)].img, alt: "" })))));
    const row = (c) => {
      const tr = h("tr", null, h("td", { class: "nm" }, h("b", null, c.nm), h("small", null, c.d)));
      for (let i = 0; i < s.n; i++) {
        const v = s.sc[i][c.k];
        const can = mine && i === cur && v == null && s.rolls > 0 && !rolling;
        const prev = i === cur && v == null && s.rolls > 0 ? this.score(s.dice, c.k) : null;
        const td = h("td", { class: (v != null ? "done" : "") + (can ? " can" : "") + (s.lastCat && s.lastCat.seat === i && s.lastCat.k === c.k ? " pop" : ""), onclick: can ? () => { if (prev === 0) confirmBox(c.nm + " に 0点 で記入しますか？", () => T.act({ t: "score", k: c.k })); else T.act({ t: "score", k: c.k }); } : null },
          v != null ? String(v) : prev != null ? h("span", { class: "pv" }, prev) : "");
        tr.append(td);
      }
      return tr;
    };
    YACHT_CATS.slice(0, 6).forEach((c) => tb.append(row(c)));
    tb.append(h("tr", { class: "sub" }, h("td", { class: "nm" }, h("b", null, "ボーナス"), h("small", null, "上の合計63以上で+35")), ...[...Array(s.n).keys()].map((i) => { const u = this.upper(s.sc[i]); return h("td", null, u >= 63 ? "35" : u + "/63"); })));
    YACHT_CATS.slice(6).forEach((c) => tb.append(row(c)));
    tb.append(h("tr", { class: "tot" }, h("td", { class: "nm" }, h("b", null, "合計")), ...[...Array(s.n).keys()].map((i) => h("td", null, this.total(s.sc[i])))));
    mid.append(h("div", { class: "yt-wrap" }, tb));
  },
};
