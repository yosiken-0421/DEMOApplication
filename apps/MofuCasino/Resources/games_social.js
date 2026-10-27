"use strict";
/* ===== みんなで勝負：テキサスホールデム・チンチロ・ビンゴ ===== */

/* ---------------- 7枚から最強の5枚（ポーカーの役） ---------------- */
const HE_NAMES = ["ハイカード", "ワンペア", "ツーペア", "スリーカード", "ストレート", "フラッシュ", "フルハウス", "フォーカード", "ストレートフラッシュ"];
function straightTop(set) {
  // set: 2..14 のあるなし。A は 1 としても使える
  for (let t = 14; t >= 5; t--) {
    let ok = true;
    for (let k = 0; k < 5; k++) { const r = t - k; if (!(r === 1 ? set[14] : set[r])) { ok = false; break; } }
    if (ok) return t;
  }
  return 0;
}
function evalBest(cards) {
  const cnt = Array(15).fill(0), suitR = [[], [], [], []];
  for (const c of cards) { const r = rankOf(c) === 1 ? 14 : rankOf(c); cnt[r]++; suitR[suitOf(c)].push(r); }
  // フラッシュ系
  for (let su = 0; su < 4; su++) if (suitR[su].length >= 5) {
    const set = Array(15).fill(false); suitR[su].forEach((r) => (set[r] = true));
    const sf = straightTop(set);
    if (sf) return { cat: 8, score: [8, sf], name: HE_NAMES[8] };
  }
  const ranks = []; for (let r = 14; r >= 2; r--) if (cnt[r]) ranks.push(r);
  const quads = ranks.filter((r) => cnt[r] === 4), trips = ranks.filter((r) => cnt[r] === 3), pairs = ranks.filter((r) => cnt[r] === 2);
  const kick = (ex, n) => ranks.filter((r) => !ex.includes(r)).slice(0, n);
  if (quads.length) return { cat: 7, score: [7, quads[0]].concat(kick([quads[0]], 1)), name: HE_NAMES[7] };
  if (trips.length && (trips.length > 1 || pairs.length)) { const t = trips[0], p = Math.max(trips[1] || 0, pairs[0] || 0); return { cat: 6, score: [6, t, p], name: HE_NAMES[6] }; }
  for (let su = 0; su < 4; su++) if (suitR[su].length >= 5) { const f = suitR[su].slice().sort((a, b) => b - a).slice(0, 5); return { cat: 5, score: [5].concat(f), name: HE_NAMES[5] }; }
  const set = Array(15).fill(false); ranks.forEach((r) => (set[r] = true));
  const st = straightTop(set);
  if (st) return { cat: 4, score: [4, st], name: HE_NAMES[4] };
  if (trips.length) return { cat: 3, score: [3, trips[0]].concat(kick([trips[0]], 2)), name: HE_NAMES[3] };
  if (pairs.length >= 2) return { cat: 2, score: [2, pairs[0], pairs[1]].concat(kick([pairs[0], pairs[1]], 1)), name: HE_NAMES[2] };
  if (pairs.length) return { cat: 1, score: [1, pairs[0]].concat(kick([pairs[0]], 3)), name: HE_NAMES[1] };
  return { cat: 0, score: [0].concat(ranks.slice(0, 5)), name: HE_NAMES[0] };
}

/* ---------------- テキサスホールデム ---------------- */
const Holdem = {
  id: "holdem", name: "テキサスホールデム", icon: "♠️", min: 2, max: 5, tag: "ポーカー",
  desc: "世界でいちばん人気のポーカー。手札2枚と場の5枚で役を作り、チップを奪い合う",
  rules: "プレイヤー同士でチップを奪い合うポーカーです。\n\n・手札は2枚。場に共通のカードが最大5枚出ます（フロップ3枚→ターン1枚→リバー1枚）。\n・手札2枚と場の5枚、合わせて7枚からいちばん強い5枚で役を作ります。\n・はじめに2人が強制的にチップを出します（スモールブラインド／ビッグブラインド）。\n・自分の番では：フォールド（降りる）／チェック（様子見）／コール（同じ額を出す）／レイズ（上乗せ）／オールイン（全部賭ける）\n・最後まで残った人で手札を見せ合い、いちばん強い役の人がポット（賭けられたチップ）をもらいます。全員が降りたら、残った1人の勝ち。\n\n役の強さ（弱→強）\nハイカード＜ワンペア＜ツーペア＜スリーカード＜ストレート＜フラッシュ＜フルハウス＜フォーカード＜ストレートフラッシュ\n\n決められたハンド数が終わるか、チップを持っているのが1人になったら終わり。チップが一番多い人の勝ち！（ブラインドは6ハンドごとに上がります）",
  opts: [
    { key: "chips", label: "はじめのチップ", choices: [[1000, "1,000"], [3000, "3,000"], [10000, "10,000"]], def: 1000 },
    { key: "hands", label: "ハンド数", choices: [[8, "8回"], [15, "15回"], [30, "30回"]], def: 15 },
  ],
  sound: "chip",
  setup(n, o) {
    const c = o.chips || 1000;
    const s = { n, chips: Array(n).fill(c), start: c, hand: 0, hands: o.hands || 15, button: rnd(n), bb0: Math.max(20, Math.round(c / 50 / 10) * 10), events: [], over: false };
    this.newHand(s);
    return s;
  },
  newHand(s) {
    s.hand++;
    s.bb = s.bb0 * Math.pow(2, Math.floor((s.hand - 1) / 6)); s.sb = s.bb / 2;
    s.deck = shuffle(makeDeck());
    s.inHand = s.chips.map((c) => c > 0);
    s.folded = Array(s.n).fill(false);
    s.total = Array(s.n).fill(0); s.bets = Array(s.n).fill(0); s.acted = Array(s.n).fill(false);
    s.hole = Array.from({ length: s.n }, (_, i) => (s.inHand[i] ? [s.deck.pop(), s.deck.pop()] : []));
    s.board = []; s.show = null; s.win = null; s.last = Array(s.n).fill(null); s.names2 = null;
    s.button = nextSeat(s, s.button, (i) => s.inHand[i]);
    const players = [...Array(s.n).keys()].filter((i) => s.inHand[i]);
    let sbI, bbI;
    if (players.length === 2) { sbI = s.button; bbI = nextSeat(s, sbI, (i) => s.inHand[i]); }
    else { sbI = nextSeat(s, s.button, (i) => s.inHand[i]); bbI = nextSeat(s, sbI, (i) => s.inHand[i]); }
    s.sbI = sbI; s.bbI = bbI;
    this.put(s, sbI, s.sb); this.put(s, bbI, s.bb);
    s.last[sbI] = "SB " + s.bets[sbI]; s.last[bbI] = "BB " + s.bets[bbI];
    s.street = "preflop"; s.phase = "bet";
    s.minRaise = s.bb;
    s.turn = -1;
    this.setTurn(s, bbI);
  },
  put(s, i, a) { a = Math.min(a, s.chips[i]); s.chips[i] -= a; s.bets[i] += a; s.total[i] += a; },
  live(s) { return [...Array(s.n).keys()].filter((i) => s.inHand[i] && !s.folded[i]); },
  canAct(s, i) { return s.inHand[i] && !s.folded[i] && s.chips[i] > 0; },
  maxBet(s) { return Math.max(...s.bets); },
  needs(s) {
    const mx = this.maxBet(s), can = this.live(s).filter((i) => this.canAct(s, i));
    return can.filter((i) => s.bets[i] < mx || (!s.acted[i] && can.length >= 2));
  },
  /* from の次から、行動が必要な人をさがす */
  setTurn(s, from) {
    const need = this.needs(s);
    if (!need.length) { s.turn = -1; return this.endStreet(s); }
    s.turn = nextSeat(s, from, (i) => need.includes(i));
  },
  toCall(s, i) { return Math.min(this.maxBet(s) - s.bets[i], s.chips[i]); },
  pot(s) { return s.total.reduce((a, b) => a + b, 0); },
  actors(s) { return s.over || s.wait || s.phase !== "bet" || s.turn < 0 ? [] : [s.turn]; },
  valid(s, seat, m) {
    if (s.over || s.wait || s.phase !== "bet" || seat !== s.turn) return false;
    const tc = this.toCall(s, seat), mx = this.maxBet(s), all = s.bets[seat] + s.chips[seat];
    if (m.t === "fold") return true;
    if (m.t === "check") return tc === 0;
    if (m.t === "call") return tc > 0;
    if (m.t === "allin") return s.chips[seat] > 0;
    if (m.t === "raise") return Number.isInteger(m.to) && s.chips[seat] > tc && m.to <= all && (m.to >= mx + s.minRaise || m.to === all) && m.to > mx;
    return false;
  },
  apply(s, seat, m) {
    const mx = this.maxBet(s);
    if (m.t === "fold") { s.folded[seat] = true; s.last[seat] = "フォールド"; }
    else if (m.t === "check") s.last[seat] = "チェック";
    else if (m.t === "call") { this.put(s, seat, this.toCall(s, seat)); s.last[seat] = s.chips[seat] === 0 ? "オールイン" : "コール"; }
    else {
      const to = m.t === "allin" ? s.bets[seat] + s.chips[seat] : m.to;
      this.put(s, seat, to - s.bets[seat]);
      if (s.bets[seat] > mx) {
        if (s.bets[seat] - mx >= s.minRaise) s.minRaise = s.bets[seat] - mx;
        s.acted = s.acted.map(() => false);
      }
      s.last[seat] = s.chips[seat] === 0 ? "オールイン" : mx ? "レイズ " + s.bets[seat] : "ベット " + s.bets[seat];
      if (s.chips[seat] === 0) ev(s, seat, "say", "good");
    }
    ev(s, seat, "toast", s.last[seat]);
    s.acted[seat] = true;
    const live = this.live(s);
    if (live.length === 1) return this.award(s, live[0]);
    this.setTurn(s, seat);
  },
  endStreet(s) {
    s.phase = "deal";
    s.wait = { ms: 650, then: "street" };
  },
  resolve(s, then) {
    if (then === "next") {
      const left = s.chips.filter((c) => c > 0).length;
      if (s.hand >= s.hands || left < 2) { s.over = true; s.phase = "end"; const b = Math.max(...s.chips); s.chips.forEach((c, i) => c === b && ev(s, i, "say", "win")); return; }
      return this.newHand(s);
    }
    if (then !== "street") return;
    // ベットをポットへ
    s.bets = Array(s.n).fill(0); s.acted = Array(s.n).fill(false); s.minRaise = s.bb;
    for (let i = 0; i < s.n; i++) if (s.last[i] && !s.folded[i] && s.chips[i] > 0) s.last[i] = null;
    if (s.street === "river") return this.showdown(s);
    if (s.street === "preflop") { s.board.push(s.deck.pop(), s.deck.pop(), s.deck.pop()); s.street = "flop"; }
    else if (s.street === "flop") { s.board.push(s.deck.pop()); s.street = "turn"; }
    else if (s.street === "turn") { s.board.push(s.deck.pop()); s.street = "river"; }
    ev(s, -1, "snd", "card");
    s.phase = "bet";
    const can = this.live(s).filter((i) => this.canAct(s, i));
    if (can.length < 2) { s.phase = "deal"; s.turn = -1; s.wait = { ms: 1100, then: "street" }; return; }
    this.setTurn(s, s.button);
  },
  showdown(s) {
    const live = this.live(s);
    while (s.board.length < 5) s.board.push(s.deck.pop());
    const evs = {}; live.forEach((i) => (evs[i] = evalBest(s.hole[i].concat(s.board))));
    s.show = live; s.names2 = {}; live.forEach((i) => (s.names2[i] = evs[i].name));
    const levels = [...new Set(s.total.filter((t) => t > 0))].sort((a, b) => a - b);
    let prev = 0; const gains = Array(s.n).fill(0);
    for (const lv of levels) {
      const amount = s.total.reduce((a, t) => a + Math.max(0, Math.min(t, lv) - prev), 0);
      const elig = live.filter((i) => s.total[i] >= lv);
      const pool = elig.length ? elig : live;
      let best = [pool[0]];
      for (const i of pool.slice(1)) { const c = cmpScore(evs[i].score, evs[best[0]].score); if (c > 0) best = [i]; else if (c === 0) best.push(i); }
      const share = Math.floor(amount / best.length);
      best.forEach((i, k) => (gains[i] += share + (k === 0 ? amount - share * best.length : 0)));
      prev = lv;
    }
    const top = gains.indexOf(Math.max(...gains));
    ev(s, -1, "big", T_name(s, top) + " " + evs[top].name);
    this.finish(s, gains);
  },
  award(s, w) {
    const gains = Array(s.n).fill(0); gains[w] = this.pot(s);
    s.show = null;
    this.finish(s, gains);
  },
  finish(s, gains) {
    for (let i = 0; i < s.n; i++) s.chips[i] += gains[i];
    s.win = gains.map((g, i) => g - s.total[i]);
    s.potWon = gains.reduce((a, b) => a + b, 0);
    const top = gains.indexOf(Math.max(...gains));
    ev(s, top, "say", "win"); ev(s, -1, "snd", "coin");
    s.phase = "result"; s.turn = -1;
    s.wait = { ms: s.show ? 4200 : 2600, then: "next" };
  },
  /* ---------- CPU ---------- */
  pre(hole) {
    const a = rankOf(hole[0]) === 1 ? 14 : rankOf(hole[0]), b = rankOf(hole[1]) === 1 ? 14 : rankOf(hole[1]);
    const hi = Math.max(a, b), lo = Math.min(a, b), suited = suitOf(hole[0]) === suitOf(hole[1]);
    let v = hi / 14 * 0.45 + lo / 14 * 0.2;
    if (a === b) v = 0.55 + a / 14 * 0.45;
    if (suited) v += 0.06;
    if (hi - lo === 1) v += 0.05; else if (hi - lo === 2) v += 0.025;
    return clamp(v, 0, 1);
  },
  equity(s, seat, sims) {
    const opp = this.live(s).filter((i) => i !== seat).length;
    if (!opp) return 1;
    const known = new Set(s.hole[seat].concat(s.board));
    const rest = []; for (let c = 0; c < 52; c++) if (!known.has(c)) rest.push(c);
    let win = 0;
    for (let k = 0; k < sims; k++) {
      // 部分シャッフル
      const need = 5 - s.board.length + opp * 2;
      for (let j = 0; j < need; j++) { const x = j + rnd(rest.length - j); const t = rest[j]; rest[j] = rest[x]; rest[x] = t; }
      const board = s.board.concat(rest.slice(0, 5 - s.board.length));
      const mine = evalBest(s.hole[seat].concat(board)).score;
      let p = 5 - s.board.length, res = 1;
      for (let o = 0; o < opp; o++) {
        const sc = evalBest([rest[p], rest[p + 1]].concat(board)).score; p += 2;
        const c = cmpScore(mine, sc);
        if (c < 0) { res = 0; break; } if (c === 0) res = Math.min(res, 0.5);
      }
      win += res;
    }
    return win / sims;
  },
  cpu(s, seat, lv) {
    const tc = this.toCall(s, seat), pot = this.pot(s), mx = this.maxBet(s), all = s.bets[seat] + s.chips[seat];
    const opp = this.live(s).length - 1;
    let e;
    if (s.board.length === 0) e = this.pre(s.hole[seat]) * (opp > 2 ? 0.85 : 1);
    else e = lv === 0 ? evalBest(s.hole[seat].concat(s.board)).cat * 0.18 + 0.15 : this.equity(s, seat, lv === 2 ? 260 : 140);
    if (lv === 0) e += (Math.random() - 0.5) * 0.35;
    const fair = 1 / (opp + 1);
    const raiseTo = (frac) => { let to = Math.round((mx + Math.max(s.minRaise, (pot + tc) * frac)) / 10) * 10; to = Math.max(to, mx + s.minRaise); return to >= all ? { t: "allin" } : { t: "raise", to }; };
    const strong = s.board.length === 0 ? e > 0.72 : e > Math.min(0.85, fair + 0.32);
    const good = s.board.length === 0 ? e > 0.5 : e > fair + 0.12;
    const bluff = lv === 2 && Math.random() < 0.07 && tc === 0;
    if ((strong || bluff) && s.chips[seat] > tc && Math.random() < 0.8) { const m = raiseTo(strong && Math.random() < 0.5 ? 0.9 : 0.55); if (this.valid(s, seat, m)) return m; }
    if (tc === 0) {
      if (good && Math.random() < (lv === 2 ? 0.45 : 0.3) && s.chips[seat] > 0) { const m = raiseTo(0.5); if (this.valid(s, seat, m)) return m; }
      return { t: "check" };
    }
    const odds = tc / (pot + tc);
    const need = lv === 0 ? odds * 0.7 : odds + (lv === 2 ? 0.04 : 0.08);
    const eq = s.board.length === 0 ? e * 0.9 + (tc <= s.bb ? 0.15 : 0) : e;
    if (eq >= need || (tc <= s.bb && Math.random() < 0.5 && lv < 2)) return { t: "call" };
    return { t: "fold" };
  },
  cpuDelay() { return 900 + rnd(900); },
  result(s) {
    const order = [...Array(s.n).keys()].sort((a, b) => s.chips[b] - s.chips[a]);
    return order.map((seat) => ({ seat, rank: order.findIndex((x) => s.chips[x] === s.chips[seat]), score: fmtN(s.chips[seat]), note: (s.chips[seat] >= s.start ? "+" : "") + fmtN(s.chips[seat] - s.start) }));
  },
  render(s, T) {
    T.players((i) => ({
      turn: s.turn === i && !s.wait, score: fmtN(s.chips[i]), dim: !s.inHand[i] || s.folded[i],
      badge: s.phase === "result" && s.win && s.win[i] > 0 ? "+" + fmtN(s.win[i]) : !s.inHand[i] ? "おやすみ" : s.last[i] || (s.bets[i] ? "BET " + s.bets[i] : null),
      gold: s.phase === "result" && s.win && s.win[i] > 0,
      color: i === s.button ? "#f2b632" : null, mark: i === s.button ? "D" : null,
    }));
    const mid = T.mid();
    const tb = h("div", { class: "felt he" });
    mid.append(tb);
    tb.append(h("div", { class: "he-info" }, h("span", null, "ハンド " + s.hand + "/" + s.hands), h("span", null, "ブラインド " + s.sb + "/" + s.bb)));
    const brd = s.board.slice(); while (brd.length < 5) brd.push(null);
    const row = h("div", { class: "crow he-board" }); setCardSize(row, 52);
    const seen = T.ui.seenB || 0;
    brd.forEach((c, k) => { if (c == null) row.append(h("div", { class: "card static ghostcard" })); else { const e = cardEl(c, { static: true }); if (k >= seen) e.classList.add("enter"); row.append(e); } });
    T.ui.seenB = s.board.length;
    tb.append(row);
    tb.append(h("div", { class: "he-pot" }, "🪙 ポット ", h("b", null, fmtN(s.phase === "result" ? s.potWon : this.pot(s)))));
    // ショーダウン
    if (s.show && s.phase === "result") {
      tb.append(h("div", { class: "he-show" }, s.show.map((i) => h("div", { class: "he-sh" + (s.win[i] > 0 ? " won" : "") },
        h("img", { src: CHARS[T.charOf(i)].img }), cardRow(T, "sh" + i, s.hole[i], { cw: 30, noAnim: true }), h("span", null, s.names2[i] + (s.win[i] > 0 ? " 🏆" : ""))))));
    }
    // 自分の手札
    const me = T.me;
    const extra = me >= 0 && s.hole[me] && s.hole[me].length ? h("div", { class: "he-me" },
      cardRow(T, "me", s.hole[me], { cw: 54, noAnim: true }),
      h("div", { class: "he-hand" }, s.board.length ? evalBest(s.hole[me].concat(s.board)).name : "手札", h("small", null, s.folded[me] ? "（降りた）" : ""))) : null;
    const my = T.myTurn && s.turn === me;
    let buttons = [], status;
    if (my) {
      const tc = this.toCall(s, me), mx = this.maxBet(s), all = s.bets[me] + s.chips[me];
      status = tc ? "コールに " + fmtN(tc) + " 必要" : "あなたの番";
      buttons.push(h("button", { class: "btn ghost small", onclick: () => T.act({ t: "fold" }) }, "フォールド"));
      buttons.push(tc ? h("button", { class: "btn mint small", onclick: () => T.act({ t: "call" }) }, "コール " + fmtN(tc)) : h("button", { class: "btn mint small", onclick: () => T.act({ t: "check" }) }, "チェック"));
      if (s.chips[me] > tc) {
        const minTo = mx + s.minRaise, potTo = Math.round((mx + this.pot(s) + tc) / 10) * 10;
        if (minTo < all) buttons.push(h("button", { class: "btn lemon small", onclick: () => T.act({ t: "raise", to: minTo }) }, (mx ? "レイズ " : "ベット ") + fmtN(minTo)));
        if (potTo > minTo && potTo < all) buttons.push(h("button", { class: "btn sky small", onclick: () => T.act({ t: "raise", to: potTo }) }, "ポット " + fmtN(potTo)));
      }
      buttons.push(h("button", { class: "btn pink small", onclick: () => T.act({ t: "allin" }) }, "オールイン"));
    } else if (s.phase === "result") status = me >= 0 && s.win && s.win[me] > 0 ? "🎉 +" + fmtN(s.win[me]) + " 勝ち！" : s.show ? "ショーダウン！" : "みんな降りました";
    else if (me >= 0 && !s.inHand[me]) status = "チップがありません（見学中）";
    else if (me >= 0 && s.folded[me]) status = "降りました。次のハンドを待とう";
    else status = s.turn >= 0 ? T.turnText(s.turn) : "カードを配っています…";
    T.bottom({ status, hot: my, extra, buttons });
  },
};
function T_name(s, i) { return (s.names && s.names[i]) || "?"; }

/* ---------------- チンチロ ---------------- */
function ccEval(d) {
  const a = d.slice().sort((x, y) => x - y);
  if (a[0] === 1 && a[1] === 1 && a[2] === 1) return { k: "pin", name: "ピンゾロ", mul: 5, rank: 100 };
  if (a[0] === a[1] && a[1] === a[2]) return { k: "zoro", name: a[0] + "のゾロ目", mul: 3, rank: 90 + a[0] };
  if (a[0] === 4 && a[1] === 5 && a[2] === 6) return { k: "shigoro", name: "シゴロ", mul: 2, rank: 80 };
  if (a[0] === 1 && a[1] === 2 && a[2] === 3) return { k: "hifumi", name: "ヒフミ", mul: -2, rank: -10 };
  if (a[0] === a[1]) return { k: "me", v: a[2], name: a[2] + "の目", mul: 1, rank: a[2] };
  if (a[1] === a[2]) return { k: "me", v: a[0], name: a[0] + "の目", mul: 1, rank: a[0] };
  return { k: "none", name: "目なし", mul: -1, rank: 0 };
}
const Chinchiro = {
  id: "chinchiro", name: "チンチロ", icon: "🥣", min: 2, max: 5, tag: "和風",
  desc: "どんぶりにサイコロ3つ！親と子にわかれて出目で勝負。ピンゾロは5倍",
  rules: "親（1人）と子（ほかの人）にわかれて、サイコロ3つの出目で勝負します。親は順番に交代します。\n\n1) 子がチップを賭けます。\n2) 親がサイコロを振ります（役が出るまで最大3回）。\n3) 親が「目」を出したら、子が順番に振って親と比べます。\n\n役（強い順）\n・ピンゾロ（1・1・1）：5倍\n・ゾロ目（3つ同じ）：3倍\n・シゴロ（4・5・6）：2倍\n・目（2つ同じ＋1つ）：残りの1つの数字が「目」。6が最強、1が最弱\n・目なし（3回振っても役がない）：負け（1倍払い）\n・ヒフミ（1・2・3）：負け（2倍払い）\n\n親がピンゾロ・ゾロ目・シゴロ・6の目なら、その場で親の総取り。\n親が1の目・目なし・ヒフミなら、その場で子の総取り（ヒフミは2倍）。\n子の目が親より大きければ子の勝ち、小さければ親の勝ち、同じなら引き分け。\n\nみんなが決められた回数だけ親をやったら終わり。チップが一番多い人の勝ち！",
  opts: [
    { key: "chips", label: "はじめのチップ", choices: [[1000, "1,000"], [3000, "3,000"], [10000, "10,000"]], def: 1000 },
    { key: "cycles", label: "親の回数（1人あたり）", choices: [[1, "1回"], [2, "2回"], [3, "3回"]], def: 2 },
  ],
  sound: "dice",
  setup(n, o) {
    const c = o.chips || 1000;
    const s = { n, chips: Array(n).fill(c), start: c, round: 1, rounds: n * (o.cycles || 2), banker: rnd(n), events: [], over: false, dice: [1, 2, 3] };
    this.newRound(s);
    return s;
  },
  unit(s) { return Math.max(10, Math.round(s.start / 20 / 10) * 10); },
  betChoices(s, i) { const u = this.unit(s); return [u, u * 2, u * 4, u * 10].filter((a) => a <= s.chips[i]); },
  newRound(s) {
    s.phase = "bet"; s.bet = Array(s.n).fill(0); s.betDone = Array(s.n).fill(false);
    s.hand = Array(s.n).fill(null); s.tries = 0; s.roller = -1; s.delta = Array(s.n).fill(0); s.res = Array(s.n).fill(null);
    s.bhand = null; s.rolling = false;
    for (let i = 0; i < s.n; i++) if (i === s.banker || s.chips[i] < 10) s.betDone[i] = true;
    if (s.betDone.every(Boolean)) this.startBanker(s);
  },
  actors(s) {
    if (s.over || s.wait) return [];
    if (s.phase === "bet") return [...Array(s.n).keys()].filter((i) => !s.betDone[i]);
    if (s.phase === "roll" && s.roller >= 0 && !s.rolling) return [s.roller];
    return [];
  },
  valid(s, seat, m) {
    if (s.phase === "bet") return m.t === "cbet" && !s.betDone[seat] && (m.amt === 0 || (this.betChoices(s, seat).includes(m.amt)));
    if (s.phase === "roll") return m.t === "roll" && seat === s.roller && !s.rolling;
    return false;
  },
  apply(s, seat, m) {
    if (m.t === "cbet") {
      s.bet[seat] = m.amt; s.betDone[seat] = true;
      ev(s, seat, "toast", m.amt ? fmtN(m.amt) + " 賭けた" : "見送り"); if (m.amt) ev(s, -1, "snd", "chip");
      if (s.betDone.every(Boolean)) this.startBanker(s);
      return;
    }
    s.dice = [1 + rnd(6), 1 + rnd(6), 1 + rnd(6)];
    s.tries++; s.rolling = true; ev(s, -1, "snd", "dice");
    s.wait = { ms: 1000, then: "rolled" };
  },
  startBanker(s) {
    if (!s.bet.some((b) => b > 0)) { // だれも賭けなかった
      s.phase = "result"; s.wait = { ms: 1200, then: "next" }; ev(s, -1, "toast", "だれも賭けませんでした"); return;
    }
    s.phase = "roll"; s.roller = s.banker; s.tries = 0;
  },
  /* 子 i と親の精算（mul>0 なら子が受け取る、<0 なら子が払う） */
  pay(s, i, mul) {
    const amt = Math.abs(mul) * s.bet[i];
    if (mul > 0) { const x = Math.min(amt, s.chips[s.banker]); s.chips[s.banker] -= x; s.chips[i] += x; s.delta[i] += x; s.delta[s.banker] -= x; }
    else if (mul < 0) { const x = Math.min(amt, s.chips[i]); s.chips[i] -= x; s.chips[s.banker] += x; s.delta[i] -= x; s.delta[s.banker] += x; }
  },
  children(s) { return [...Array(s.n).keys()].filter((i) => i !== s.banker && s.bet[i] > 0); },
  resolve(s, then) {
    if (then === "next") {
      s.round++;
      const left = s.chips.filter((c) => c >= 10).length;
      if (s.round > s.rounds || left < 2) { s.round = Math.min(s.round, s.rounds); s.over = true; s.phase = "end"; const b = Math.max(...s.chips); s.chips.forEach((c, i) => c === b && ev(s, i, "say", "win")); return; }
      s.banker = nextSeat(s, s.banker, (i) => s.chips[i] >= 10);
      ev(s, s.banker, "toast", "親になった！");
      return this.newRound(s);
    }
    if (then !== "rolled") return;
    s.rolling = false;
    const e = ccEval(s.dice), r = s.roller;
    if (e.k === "none" && s.tries < 3) { ev(s, r, "toast", "目なし…あと" + (3 - s.tries) + "回"); return; }
    s.hand[r] = e;
    ev(s, r, "toast", e.name + (e.mul >= 2 ? "！" : ""));
    if (e.k === "pin" || e.k === "zoro") ev(s, -1, "big", e.name + "！");
    if (r === s.banker) {
      s.bhand = e;
      const kids = this.children(s);
      let all = null;
      if (e.mul >= 2) all = -e.mul;                 // 親の役：子が払う
      else if (e.k === "me" && e.v === 6) all = -1;
      else if (e.k === "hifumi") all = 2;           // 親がヒフミ：子に2倍
      else if (e.k === "none") all = 1;
      else if (e.k === "me" && e.v === 1) all = 1;
      if (all != null) {
        kids.forEach((i) => { this.pay(s, i, all); s.res[i] = all > 0 ? "勝ち" : "負け"; });
        ev(s, r, "say", all < 0 ? "win" : "lose");
        return this.endRound(s);
      }
      s.roller = kids[0]; s.tries = 0;
      return;
    }
    // 子の結果
    const b = s.bhand;
    let mul;
    if (e.mul >= 2) mul = e.mul;
    else if (e.k === "hifumi") mul = -2;
    else if (e.k === "none") mul = -1;
    else mul = e.v > b.v ? 1 : e.v < b.v ? -1 : 0;
    this.pay(s, r, mul);
    s.res[r] = mul > 0 ? "勝ち" : mul < 0 ? "負け" : "引分";
    ev(s, r, "say", mul > 0 ? "good" : mul < 0 ? "bad" : "turn");
    const kids = this.children(s), k = kids.indexOf(r);
    if (k + 1 < kids.length && s.chips[s.banker] > 0) { s.roller = kids[k + 1]; s.tries = 0; return; }
    this.endRound(s);
  },
  endRound(s) { s.phase = "result"; s.roller = -1; ev(s, -1, "snd", "coin"); s.wait = { ms: 2800, then: "next" }; },
  cpu(s, seat, lv) {
    if (s.phase === "roll") return { t: "roll" };
    const ch = this.betChoices(s, seat);
    if (!ch.length) return { t: "cbet", amt: 0 };
    const k = lv === 0 ? rnd(ch.length) : lv === 1 ? Math.min(ch.length - 1, rnd(2)) : Math.min(ch.length - 1, s.chips[seat] < Math.max(...s.chips) && s.round >= s.rounds - 1 ? 3 : rnd(2));
    return { t: "cbet", amt: ch[k] };
  },
  cpuDelay(s) { return s.phase === "roll" ? 700 + rnd(500) : 500 + rnd(800); },
  result(s) {
    const order = [...Array(s.n).keys()].sort((a, b) => s.chips[b] - s.chips[a]);
    return order.map((seat) => ({ seat, rank: order.findIndex((x) => s.chips[x] === s.chips[seat]), score: fmtN(s.chips[seat]), note: (s.chips[seat] >= s.start ? "+" : "") + fmtN(s.chips[seat] - s.start) }));
  },
  render(s, T) {
    T.players((i) => ({
      turn: (s.phase === "bet" && !s.betDone[i]) || (s.phase === "roll" && s.roller === i),
      score: fmtN(s.chips[i]),
      color: i === s.banker ? "#e34b62" : null, mark: i === s.banker ? "親" : null,
      badge: s.phase === "result" && s.delta[i] ? (s.delta[i] > 0 ? "+" : "") + fmtN(s.delta[i]) : s.hand[i] ? s.hand[i].name : i !== s.banker && s.bet[i] ? "賭" + fmtN(s.bet[i]) : null,
      gold: s.phase === "result" && s.delta[i] > 0, dim: s.chips[i] < 10 && i !== s.banker,
    }));
    const mid = T.mid();
    const tb = h("div", { class: "felt cc" });
    mid.append(tb);
    tb.append(h("div", { class: "he-info" }, h("span", null, "親 " + s.round + "/" + s.rounds + "回目"), h("span", null, "親：" + T.name(s.banker))));
    const rolling = s.rolling;
    tb.append(h("div", { class: "donburi" + (rolling ? " shake" : "") }, h("div", { class: "dice-row" }, s.dice.map((v) => dieEl(rolling ? 1 + rnd(6) : v, { roll: rolling, size: 44 })))));
    const e = !rolling && s.roller >= 0 && s.tries ? ccEval(s.dice) : null;
    tb.append(h("div", { class: "cc-msg" }, rolling ? "コロコロ…" : s.roller >= 0 ? T.name(s.roller) + (s.roller === s.banker ? "（親）" : "") + (s.tries ? "：" + e.name + (e.k === "none" ? "（" + s.tries + "/3）" : "") : " が振る番") : s.bhand ? "親：" + s.bhand.name : "子がチップを賭けています"));
    // 子の一覧
    tb.append(h("div", { class: "cc-kids" }, [...Array(s.n).keys()].filter((i) => i !== s.banker).map((i) => h("div", { class: "cc-kid" + (s.roller === i ? " cur" : "") },
      h("img", { src: CHARS[T.charOf(i)].img }), h("span", null, T.name(i)), h("b", null, s.bet[i] ? "🪙" + fmtN(s.bet[i]) : s.betDone[i] ? "—" : "…"),
      s.hand[i] ? h("small", null, s.hand[i].name) : null, s.res[i] ? h("em", { class: s.res[i] === "勝ち" ? "w" : s.res[i] === "負け" ? "l" : "" }, s.res[i]) : null))));
    const me = T.me;
    if (s.phase === "bet" && me >= 0 && !s.betDone[me]) {
      const ch = this.betChoices(s, me);
      T.bottom({ status: "親は " + T.name(s.banker) + "。いくら賭ける？", hot: true, buttons: ch.map((a) => h("button", { class: "btn lemon small", onclick: () => T.act({ t: "cbet", amt: a }) }, "🪙" + fmtN(a))).concat([h("button", { class: "btn ghost small", onclick: () => T.act({ t: "cbet", amt: 0 }) }, "見送る")]) });
    } else if (s.phase === "roll" && T.myTurn && s.roller === me) {
      T.bottom({ status: (me === s.banker ? "親のあなたが振る番！" : "あなたが振る番！") + (s.tries ? "（あと" + (3 - s.tries) + "回）" : ""), hot: true, buttons: [h("button", { class: "btn pink", onclick: () => { Snd.init(); T.act({ t: "roll" }); } }, "🎲 サイコロを振る")] });
    } else {
      const st = s.phase === "result" && me >= 0 ? (s.delta[me] > 0 ? "🎉 +" + fmtN(s.delta[me]) : s.delta[me] < 0 ? "残念… " + fmtN(s.delta[me]) : "このラウンドは ±0") : s.phase === "bet" ? "みんなが賭けています…" : s.roller >= 0 ? T.name(s.roller) + " が振っています…" : "…";
      T.bottom({ status: st });
    }
  },
};

/* ---------------- ビンゴ ---------------- */
function bingoCard() {
  const cols = [];
  for (let c = 0; c < 5; c++) { const nums = shuffle([...Array(15).keys()].map((k) => c * 15 + k + 1)).slice(0, 5); cols.push(nums); }
  const card = [];
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) card.push(r === 2 && c === 2 ? 0 : cols[c][r]);
  return card;
}
const BINGO_LINES = (() => { const L = []; for (let r = 0; r < 5; r++) L.push([0, 1, 2, 3, 4].map((c) => r * 5 + c)); for (let c = 0; c < 5; c++) L.push([0, 1, 2, 3, 4].map((r) => r * 5 + c)); L.push([0, 6, 12, 18, 24], [4, 8, 12, 16, 20]); return L; })();
/* has(idx) … そのマスに穴があいているか */
function bingoLines(has) {
  let lines = 0, best = 0;
  for (const ln of BINGO_LINES) { const k = ln.filter(has).length; if (k === 5) lines++; best = Math.max(best, k); }
  return { lines, bingo: lines > 0, reach: lines === 0 && best === 4 };
}
/* 何個目の玉でビンゴしたかで倍率が決まる（早いほど高い） */
const BINGO_MULT = [[15, 10], [20, 5], [25, 4], [30, 3], [40, 2], [75, 1]];
const bingoMult = (n) => { for (const [k, m] of BINGO_MULT) if (n <= k) return m; return 1; };
const BINGO_COLS = { B: "#5aa2ff", I: "#ff7fa6", N: "#9a7bff", G: "#3fbf8c", O: "#f2b632" };
const Bingo = {
  id: "bingo", name: "ビンゴ", icon: "🎱", min: 1, max: 5, tag: "パーティー",
  desc: "ビンゴマシンから出る玉でカードに穴をあけよう！早くビンゴするほど倍率アップで総取り",
  rules: "ビンゴカード（1〜3枚）を買って参加します。カードは1枚につき決まった枚数のチップがかかります。\n\n・ビンゴマシンから1〜75の玉が1つずつ出てきます（真ん中はFREE）。\n・タテ・ヨコ・ナナメのどれか1列そろったら「ビンゴ！」\n\n【自動／手動】\n・自動：出た番号に自動で穴があきます。\n・手動：自分でカードの数字をタップして穴をあけます。見のがすとビンゴになりません！（まちがえて押したら、もう一度押すと戻せます）\n・画面下のボタンでいつでも切りかえられます。\n\n【配当：総取り×倍率】\n一番早くビンゴした人が、みんなの参加費（ポット）を総取り！さらに、何個目の玉でビンゴしたかで倍率がかかります。\n・15個目まで：×10\n・20個目まで：×5\n・25個目まで：×4\n・30個目まで：×3\n・40個目まで：×2\n・それ以降：×1\n・2列以上同時にそろう「ダブルビンゴ」はさらに×2！\n同時にビンゴした人がいたら山分けです。だれもビンゴしなかったら参加費は戻ってきます。\n\n決められた回数が終わったとき、チップが一番多い人の勝ち！",
  opts: [
    { key: "chips", label: "はじめのチップ", choices: [[1000, "1,000"], [3000, "3,000"], [10000, "10,000"]], def: 1000 },
    { key: "rounds", label: "回数", choices: [[3, "3回"], [5, "5回"], [10, "10回"]], def: 5 },
  ],
  sound: "tick",
  liveActs: true,   // 玉が出ている間も操作（穴あけ）できる
  setup(n, o) {
    const c = o.chips || 1000;
    const s = { n, chips: Array(n).fill(c), start: c, round: 1, rounds: o.rounds || 5, events: [], over: false, price: Math.max(10, Math.round(c / 10 / 10) * 10), manual: Array(n).fill(false) };
    this.newRound(s);
    return s;
  },
  newRound(s) {
    s.phase = "buy"; s.buy = s.chips.map((c) => (c < s.price ? 0 : null));
    s.cards = Array.from({ length: s.n }, () => []); s.marks = Array.from({ length: s.n }, () => []);
    s.drawn = []; s.pool = shuffle([...Array(75).keys()].map((k) => k + 1));
    s.pot = 0; s.winners = []; s.delta = Array(s.n).fill(0); s.spin = false; s.mult = 0; s.reach = Array(s.n).fill(false);
    if (s.buy.every((b) => b === 0)) { s.phase = "result"; s.wait = { ms: 600, then: "next" }; }
  },
  actors(s) { return s.over || s.wait || s.phase !== "buy" ? [] : [...Array(s.n).keys()].filter((i) => s.buy[i] == null); },
  has(s, i, k) {
    const card = s.cards[i][k];
    if (s.manual[i]) { const mk = s.marks[i][k]; return (x) => card[x] === 0 || !!mk[x]; }
    const set = s.drawnSet || {};
    return (x) => card[x] === 0 || !!set[card[x]];
  },
  seatLines(s, i) { let lines = 0, reach = false; for (let k = 0; k < s.cards[i].length; k++) { const r = bingoLines(this.has(s, i, k)); lines = Math.max(lines, r.lines); reach = reach || r.reach; } return { lines, reach }; },
  valid(s, seat, m) {
    if (s.over) return false;
    if (m.t === "mode") return typeof m.manual === "boolean" && (s.phase === "buy" || s.phase === "draw");
    if (m.t === "mark") {
      if (s.phase !== "draw" || !s.manual[seat] || !Number.isInteger(m.c) || !Number.isInteger(m.i) || m.i < 0 || m.i > 24) return false;
      const card = s.cards[seat][m.c];
      return !!card && card[m.i] !== 0 && !!(s.drawnSet || {})[card[m.i]];
    }
    if (s.wait) return false;
    return m.t === "buy" && s.phase === "buy" && s.buy[seat] == null && Number.isInteger(m.k) && m.k >= 0 && m.k <= 3 && m.k * s.price <= s.chips[seat];
  },
  apply(s, seat, m) {
    if (m.t === "mode") {
      if (m.manual && !s.manual[seat]) s.marks[seat] = s.cards[seat].map((c) => c.map((n) => (n === 0 || (s.drawnSet || {})[n] ? 1 : 0)));
      s.manual[seat] = m.manual;
      ev(s, seat, "toast", m.manual ? "手動でチェック" : "自動でチェック");
      if (s.phase === "draw" && !m.manual) this.check(s, [seat]);
      return;
    }
    if (m.t === "mark") {
      const mk = s.marks[seat][m.c];
      mk[m.i] = mk[m.i] ? 0 : 1;
      if (mk[m.i]) ev(s, -1, "snd", "stone");
      this.check(s, [seat]);
      return;
    }
    s.buy[seat] = m.k;
    if (m.k) {
      s.chips[seat] -= m.k * s.price; s.pot += m.k * s.price; s.delta[seat] -= m.k * s.price;
      for (let k = 0; k < m.k; k++) { const c = bingoCard(); s.cards[seat].push(c); s.marks[seat].push(c.map((n) => (n === 0 ? 1 : 0))); }
      ev(s, seat, "toast", m.k + "枚購入"); ev(s, -1, "snd", "chip");
    } else ev(s, seat, "toast", "見送り");
    if (s.buy.every((b) => b != null)) {
      if (!s.pot) { s.phase = "result"; s.wait = { ms: 1200, then: "next" }; return; }
      s.phase = "draw"; s.drawnSet = {}; s.wait = { ms: 900, then: "draw" };
    }
  },
  /* ビンゴしたか調べる（seats の人だけ） */
  check(s, seats) {
    if (s.phase !== "draw") return;
    const win = []; let lines = 0;
    for (const i of seats) { if (!s.cards[i].length) continue; const r = this.seatLines(s, i); if (r.bingo || r.lines) { win.push(i); lines = Math.max(lines, r.lines); } }
    if (win.length) return this.finish(s, win, lines);
    for (const i of seats) {
      if (!s.cards[i].length) continue;
      const now = this.seatLines(s, i).reach;
      if (now && !s.reach[i]) ev(s, i, "toast", "リーチ！");
      s.reach[i] = now;
    }
  },
  finish(s, win, lines) {
    const n = s.drawn.length;
    s.mult = win.length ? bingoMult(n) * (lines >= 2 ? 2 : 1) : 0;
    s.lines = lines;
    s.winners = win;
    if (win.length) {
      const prize = s.pot * s.mult, share = Math.floor(prize / win.length);
      win.forEach((i) => { s.chips[i] += share; s.delta[i] += share; ev(s, i, "say", "win"); });
      ev(s, -1, "big", (lines >= 2 ? "ダブルビンゴ！" : "ビンゴ！") + "×" + s.mult);
      ev(s, -1, "snd", s.mult >= 5 ? "jackpot" : "coin");
    } else {
      for (let i = 0; i < s.n; i++) { const back = s.buy[i] * s.price; s.chips[i] += back; s.delta[i] += back; }
      ev(s, -1, "toast", "だれもビンゴしませんでした（参加費は戻します）");
    }
    s.spin = false;
    s.phase = "result"; s.wait = { ms: 4200, then: "next" };
  },
  resolve(s, then) {
    if (then === "next") {
      s.round++;
      if (s.round > s.rounds || s.chips.every((c) => c < s.price)) { s.round = Math.min(s.round, s.rounds); s.over = true; s.phase = "end"; const b = Math.max(...s.chips); s.chips.forEach((c, i) => c === b && ev(s, i, "say", "win")); return; }
      return this.newRound(s);
    }
    if (s.phase !== "draw") return;
    if (then === "draw") {
      if (!s.pool.length) return this.finish(s, [], 0);
      s.spin = true;               // マシンがまわる
      s.wait = { ms: 1300, then: "pop" };
      return;
    }
    if (then === "pop") {
      const b = s.pool.pop();
      s.drawn.push(b); s.drawnSet[b] = 1; s.spin = false;
      ev(s, -1, "snd", "ok");
      // 自動の人だけここでチェック（手動の人は自分で穴をあけたときにチェック）
      this.check(s, [...Array(s.n).keys()].filter((i) => !s.manual[i]));
      if (s.phase !== "draw") return;
      const anyManual = s.manual.some((x, i) => x && s.cards[i].length);
      s.wait = { ms: anyManual ? 3400 : 1700, then: "draw" };
    }
  },
  cpu(s, seat, lv) {
    const max = Math.min(3, Math.floor(s.chips[seat] / s.price));
    if (!max) return { t: "buy", k: 0 };
    return { t: "buy", k: lv === 0 ? 1 + rnd(max) : Math.min(max, lv === 2 ? 2 : 1 + rnd(2)) };
  },
  cpuDelay() { return 500 + rnd(800); },
  result(s) {
    const order = [...Array(s.n).keys()].sort((a, b) => s.chips[b] - s.chips[a]);
    return order.map((seat) => ({ seat, rank: order.findIndex((x) => s.chips[x] === s.chips[seat]), score: fmtN(s.chips[seat]), note: (s.chips[seat] >= s.start ? "+" : "") + fmtN(s.chips[seat] - s.start) }));
  },
  letter(n) { return "BINGO"[Math.floor((n - 1) / 15)]; },
  /* 玉の読み上げ（「ビー の じゅうに」） */
  speak(n) {
    if (!Save.data.snd || window.__FAST) return;
    try {
      const u = new SpeechSynthesisUtterance(this.letter(n) + "、" + n);
      u.lang = "ja-JP"; u.rate = 1.05; u.pitch = 1.2;
      speechSynthesis.cancel(); speechSynthesis.speak(u);
    } catch (e) {}
  },
  ballEl(n, cls) {
    const L = this.letter(n);
    return h("div", { class: "bball " + (cls || ""), style: { "--bc": BINGO_COLS[L] } }, h("span", null, h("small", null, L), n));
  },
  /* ビンゴマシン */
  machine(s, T) {
    const t = Date.now();
    const dome = h("div", { class: "bm-dome" + (s.spin ? " spin" : "") });
    const left = 75 - s.drawn.length;
    const cnt = Math.min(18, Math.max(3, Math.round(left / 4)));
    for (let k = 0; k < cnt; k++) {
      const n = ((k * 37 + 11) % 75) + 1;
      const dur = 1.4 + (k % 5) * 0.23;
      dome.append(h("i", { class: "dball a" + (k % 4), style: { "--bc": BINGO_COLS[this.letter(n)], left: 12 + ((k * 23) % 66) + "%", top: 18 + ((k * 41) % 52) + "%", animationDuration: (s.spin ? dur / 3 : dur) + "s", animationDelay: -((t / 1000) % dur) + "s" } }));
    }
    const last = s.drawn[s.drawn.length - 1];
    const isNew = last != null && T.ui.bgLast !== s.drawn.length;
    if (isNew) { T.ui.bgLast = s.drawn.length; this.speak(last); }
    const out = h("div", { class: "bm-out" },
      last != null && !s.spin ? this.ballEl(last, "big" + (isNew ? " roll" : "")) : h("div", { class: "bball big empty" }, h("span", null, s.spin ? "…" : "?")),
      h("div", { class: "bm-call" + (isNew ? " pop" : "") }, s.spin ? "ガラガラ…" : last != null ? this.letter(last) + " の " + last + "！" : "スタート！"));
    return h("div", { class: "bm" },
      h("div", { class: "bm-machine" }, dome, h("div", { class: "bm-neck" }), h("div", { class: "bm-base" }, h("b", null, "BINGO")), h("div", { class: "bm-chute" + (isNew ? " go" : "") })),
      out);
  },
  drawnModal(s) {
    const set = s.drawnSet || {};
    const grid = h("div", { class: "bg-all" });
    "BINGO".split("").forEach((L, c) => {
      grid.append(h("b", { style: { background: BINGO_COLS[L] } }, L));
      for (let k = 1; k <= 15; k++) { const n = c * 15 + k; grid.append(h("i", { class: set[n] ? "on" : "", style: { "--bc": BINGO_COLS[L] } }, n)); }
    });
    modal(h("div", null, h("h3", null, "出た番号（" + s.drawn.length + "個）"), grid, h("button", { class: "btn pink wide", onclick: closeModal }, "とじる")));
  },
  render(s, T) {
    const set = s.drawnSet || {};
    T.players((i) => {
      const st = s.cards[i].length && s.phase !== "buy" ? this.seatLines(s, i) : { lines: 0, reach: false };
      return {
        turn: s.phase === "buy" && s.buy[i] == null, score: fmtN(s.chips[i]),
        badge: s.phase === "result" && s.delta[i] > 0 ? "+" + fmtN(s.delta[i]) : s.winners.includes(i) ? "BINGO" : st.reach ? "リーチ" : s.buy[i] ? s.buy[i] + "枚" + (s.manual[i] ? "・手" : "") : s.buy[i] === 0 ? "見送り" : null,
        gold: s.winners.includes(i),
      };
    });
    const mid = T.mid();
    const tb = h("div", { class: "felt bg" });
    mid.append(tb);
    const n = s.drawn.length;
    const curMult = s.phase === "result" ? s.mult : bingoMult(Math.max(1, n + (s.phase === "draw" && s.spin ? 1 : 0)));
    tb.append(h("div", { class: "he-info" }, h("span", null, "ビンゴ " + s.round + "/" + s.rounds + "回目"), h("span", null, "ポット 🪙" + fmtN(s.pot))));
    if (s.phase !== "buy") tb.append(this.machine(s, T));
    // 倍率と出た番号
    if (s.phase !== "buy") {
      tb.append(h("div", { class: "bg-bar" },
        h("div", { class: "bg-mult" + (s.phase === "result" && s.winners.length ? " won" : "") }, h("small", null, s.phase === "result" ? (s.winners.length ? "配当" : "ビンゴなし") : "いまビンゴなら"), h("b", null, "×" + (curMult || 0)), h("small", null, n + "個目")),
        h("div", { class: "bg-recent" }, s.drawn.slice(-7, -1).reverse().map((x) => this.ballEl(x, "sm"))),
        h("button", { class: "btn ghost small bg-allbtn", onclick: () => this.drawnModal(s) }, "出た番号")));
    } else {
      tb.append(h("div", { class: "bg-multtable" }, h("b", null, "配当 = ポット総取り × 倍率"), h("div", null, BINGO_MULT.map(([k, m], j) => h("span", null, (j ? (BINGO_MULT[j - 1][0] + 1) + "〜" : "〜") + (k === 75 ? "" : k) + "個目 ×" + m))), h("small", null, "ダブルビンゴならさらに×2")));
    }
    // 見るカード：自分（1台のときはローカルの人全員）
    let view = T.me >= 0 && !T.hotseat ? [T.me] : [];
    if (T.hotseat) { if (s.phase === "buy" && T.me >= 0) view = []; else for (let i = 0; i < s.n; i++) if (T.seat(i) && T.seat(i).kind === "local" && s.cards[i].length) view.push(i); }
    if (s.phase === "buy" && T.me >= 0) view = [];
    const last = s.drawn[n - 1];
    const wrap = h("div", { class: "bg-cards n" + view.reduce((a, i) => a + s.cards[i].length, 0) });
    view.forEach((i) => s.cards[i].forEach((c, k) => {
      const has = this.has(s, i, k);
      const st = bingoLines(has);
      const manual = s.manual[i];
      const g = h("div", { class: "bg-card" + (st.bingo ? " won" : st.reach ? " reach" : "") + (manual ? " manual" : "") },
        view.length > 1 ? h("div", { class: "bg-own" }, h("img", { src: CHARS[T.charOf(i)].img }), T.name(i)) : null,
        h("div", { class: "bg-head" }, ..."BINGO".split("").map((x) => h("b", { style: { color: BINGO_COLS[x] } }, x))));
      const grid = h("div", { class: "bg-grid" });
      c.forEach((num, x) => {
        const on = has(x);
        const canTap = manual && s.phase === "draw" && num !== 0;
        grid.append(h("i", {
          class: (num === 0 ? "free on" : on ? "on" : "") + (on && num === last && !manual ? " new" : "") + (canTap ? " tap" : ""),
          onclick: canTap ? () => {
            if (!set[num]) { toast(num + " はまだ出ていません"); Snd.bad(); Native.haptic("soft"); return; }
            Native.haptic("light");
            T.act(Object.assign({ t: "mark", c: k, i: x }, T.hotseat ? { as: i } : {}));
          } : null,
        }, num === 0 ? "★" : num));
      });
      g.append(grid); wrap.append(g);
    }));
    if (s.phase === "buy" && T.me >= 0 && s.buy[T.me] == null) wrap.append(h("div", { class: "bg-sample" }, h("img", { src: CHARS[T.charOf(T.me)].img }), h("p", null, "カードは1枚 🪙" + fmtN(s.price) + "。何枚買う？")));
    tb.append(wrap);
    // 自動／手動の切りかえ
    const mySeats = T.hotseat ? [...Array(s.n).keys()].filter((i) => T.seat(i) && T.seat(i).kind === "local") : T.me >= 0 ? [T.me] : [];
    const curManual = mySeats.length ? s.manual[mySeats[0]] : false;
    const setMode = (mn) => {
      Save.data.opts.bingoManual = mn; Save.write(); Snd.init(); Snd.tick();
      mySeats.forEach((i) => { if (s.manual[i] !== mn) T.act(Object.assign({ t: "mode", manual: mn }, T.hotseat ? { as: i } : {})); });
    };
    const modeSeg = mySeats.length && (s.phase === "buy" || s.phase === "draw") ? h("div", { class: "seg bg-mode" },
      h("button", { class: !curManual ? "on" : "", onclick: () => setMode(false) }, "🤖 自動チェック"),
      h("button", { class: curManual ? "on" : "", onclick: () => setMode(true) }, "👆 手動チェック")) : null;
    const me = T.me;
    if (s.phase === "buy" && me >= 0 && s.buy[me] == null) {
      // はじめての人は保存している好みに合わせる
      const pref = !!Save.data.opts.bingoManual;
      if (s.manual[me] !== pref && !T.ui.bgModeSet) { T.ui.bgModeSet = 1; setTimeout(() => setMode(pref), 0); }
      const btn = [1, 2, 3].filter((k) => k * s.price <= s.chips[me]).map((k) => h("button", { class: "btn lemon small", onclick: () => T.act({ t: "buy", k }) }, k + "枚（" + fmtN(k * s.price) + "）"));
      T.bottom({ status: "ビンゴカードを買おう", hot: true, extra: modeSeg, buttons: btn.concat([h("button", { class: "btn ghost small", onclick: () => T.act({ t: "buy", k: 0 }) }, "見送る")]) });
      return;
    }
    const myWin = mySeats.find((i) => s.winners.includes(i));
    const st = s.phase === "buy" ? "みんながカードを選んでいます…"
      : s.phase === "draw" ? (curManual && mySeats.some((i) => s.cards[i].length) ? "出た番号をタップして穴をあけよう！" : s.spin ? "ビンゴマシンが回っています…" : last ? this.letter(last) + " の " + last + "！" : "まもなくスタート")
      : myWin != null ? "🎉 ビンゴ！×" + s.mult + "　+" + fmtN(s.delta[myWin])
      : s.winners.length ? s.winners.map((i) => T.name(i)).join("・") + " がビンゴ！×" + s.mult : "…";
    T.bottom({ status: st, hot: s.phase === "draw" && curManual, extra: modeSeg });
  },
};
