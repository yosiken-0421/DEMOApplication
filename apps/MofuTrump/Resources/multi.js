"use strict";
/* ===== 複数人ゲームのルールとCPU =====
   各ゲームは状態 s を受け取る純粋なルール集。表示は render(s, T)。
   T: 卓（table.js）が渡すヘルパー。T.me=自分の席, T.act(move)=操作を送る */

function ev(s, seat, kind, text) {
  s.ev = (s.ev || 0) + 1;
  s.events = (s.events || []).concat([{ id: s.ev, seat, kind, text }]).slice(-12);
}
function nextSeat(s, from, ok) { for (let k = 1; k <= s.n; k++) { const i = (from + k) % s.n; if (ok(i)) return i; } return -1; }
function deal(deck, n, start) { const hands = Array.from({ length: n }, () => []); deck.forEach((c, k) => hands[(k + (start || 0)) % n].push(c)); return hands; }
const LV_NAME = ["やさしい", "ふつう", "つよい"];

/* ---------- ババ抜き / ジジ抜き ---------- */
function makeOldMaid(jiji) {
  return {
    id: jiji ? "jijinuki" : "babanuki", name: jiji ? "ジジ抜き" : "ババ抜き", icon: jiji ? "🎭" : "🃏", min: 2, max: 5,
    tag: jiji ? "ドキドキ" : "定番",
    desc: jiji ? "どれがジジ（ハズレ）かわからない！ババ抜きの上級版" : "ジョーカーを最後まで持っていた人が負け。みんな大好き定番ゲーム",
    rules: jiji
      ? "ババ抜きとほぼ同じですが、ジョーカーは使いません。\n\n・始める前に1枚だけ、だれにも見えないように抜いておきます。\n・そのカードとペアになる1枚（ジジ）が最後まで残り、持っていた人が負けです。\n・どれがジジかは最後までわかりません！\n\n・同じ数字が2枚そろったら捨てます。\n・順番に、となりの人の手札から1枚引きます。\n・手札がなくなったら上がり！"
      : "・ジョーカー1枚を入れて全部のカードを配ります。\n・同じ数字が2枚そろったら捨てます。\n・順番に、となりの人の手札から1枚引きます（相手の裏向きのカードをタップ）。\n・ペアができたら捨てられます。\n・手札がなくなったら上がり！\n・最後にジョーカーを持っていた人が負けです。\n\n「シャッフル」で自分の手札の並びを変えられます。",
    opts: [],
    setup(n) {
      let deck = makeDeck(jiji ? 0 : 1);
      shuffle(deck);
      const s = { n, out: [], events: [] };
      if (jiji) s.hidden = deck.pop();
      s.hands = deal(deck, n, rnd(n));
      s.hands.forEach((hd, i) => { s.hands[i] = this.discardPairs(hd); shuffle(s.hands[i]); });
      s.turn = rnd(n);
      this.checkOut(s);
      if (!s.over && !s.hands[s.turn].length) s.turn = nextSeat(s, s.turn, (i) => s.hands[i].length > 0);
      return s;
    },
    discardPairs(hd) {
      const by = {};
      hd.forEach((c) => { const r = isJoker(c) ? "J" : rankOf(c); (by[r] = by[r] || []).push(c); });
      const keep = [];
      for (const r in by) { const a = by[r]; if (a.length % 2) keep.push(a[a.length - 1]); }
      return keep;
    },
    active(s) { return [...Array(s.n).keys()].filter((i) => s.hands[i].length > 0); },
    target(s) { return nextSeat(s, s.turn, (i) => s.hands[i].length > 0); },
    checkOut(s) {
      for (let i = 0; i < s.n; i++) if (!s.hands[i].length && !s.out.includes(i)) { s.out.push(i); ev(s, i, "say", "win"); ev(s, i, "toast", "上がり！" + s.out.length + "位"); }
      const act = this.active(s);
      if (act.length <= 1) { if (act.length === 1) s.out.push(act[0]); s.over = true; if (act.length === 1) ev(s, act[0], "say", "lose"); }
    },
    actors(s) { return s.over ? [] : [s.turn]; },
    valid(s, seat, m) {
      if (s.over) return false;
      if (m.t === "shuffle") return s.hands[seat].length > 1;
      return m.t === "draw" && seat === s.turn && m.i >= 0 && m.i < s.hands[this.target(s)].length;
    },
    apply(s, seat, m) {
      if (m.t === "shuffle") { shuffle(s.hands[seat]); s.shuf = (s.shuf || 0) + 1; return; }
      const tg = this.target(s), c = s.hands[tg].splice(m.i, 1)[0];
      const hd = s.hands[seat];
      const r = isJoker(c) ? -1 : rankOf(c);
      const j = r < 0 ? -1 : hd.findIndex((x) => !isJoker(x) && rankOf(x) === r);
      s.last = { from: tg, to: seat, c, pair: j >= 0, id: (s.last ? s.last.id : 0) + 1 };
      if (j >= 0) { hd.splice(j, 1); ev(s, seat, "say", "good"); }
      else { hd.splice(rnd(hd.length + 1), 0, c); if (isJoker(c) && !jiji) ev(s, seat, "say", "bad"); }
      if (isJoker(c) && !jiji) shuffle(hd);
      this.checkOut(s);
      if (!s.over) s.turn = nextSeat(s, seat, (i) => s.hands[i].length > 0);
    },
    cpu(s, seat) { const tg = this.target(s); return { t: "draw", i: rnd(s.hands[tg].length) }; },
    cpuDelay() { return 900 + rnd(600); },
    result(s) { return s.out.map((seat, k) => ({ seat, rank: k, note: k === s.out.length - 1 ? (jiji ? "ジジ…" : "ババ…") : "" })); },
    render(s, T) {
      const me = T.me, tg = this.target(s);
      T.opps((i) => ({ count: s.hands[i].length, turn: !s.over && s.turn === i, badge: s.out.includes(i) && !s.over ? s.out.indexOf(i) + 1 + "位" : null, gold: s.out.indexOf(i) === 0 }));
      const mid = T.mid(0.22, 0.6);
      if (s.last) {
        const L = s.last, info = h("div", { class: "status", style: { position: "static" } },
          h("span", null, T.name(L.to) + " が " + T.name(L.from) + " から引いた" + (L.pair ? "→ペア！" : "")));
        mid.append(info);
        if (L.to === me) { const ce = cardEl(L.c, { static: true, cls: "enter" }); setCardSize(ce, 54); mid.append(ce); }
      }
      if (!s.over && s.turn === me) {
        mid.append(h("div", { class: "status", style: { position: "static" } }, h("span", null, T.name(tg) + " のカードを1枚えらんで引こう！")));
        const box = h("div", { class: "hand" }); mid.append(box);
        renderHand(box, s.hands[tg], { down: true, maxW: T.W - 40, cw: clamp((T.W - 40) / 5, 46, 70), onTap: (c, el) => { const i = [...box.children].indexOf(el); T.act({ t: "draw", i }); } });
        [...box.children].forEach((e) => (e.style.cursor = "pointer"));
      } else if (!s.over) {
        mid.append(h("div", { class: "status", style: { position: "static" } }, h("span", null, T.name(s.turn) + " が " + T.name(tg) + " から引く番")));
      }
      const mine = s.hands[me] || [];
      T.myArea(mine.length ? mine : [], {
        info: T.meInfo(mine.length + "枚", !s.over && s.turn === me),
        buttons: mine.length > 1 && !s.over ? [h("button", { class: "btn ghost", onclick: () => T.act({ t: "shuffle" }) }, "🔀 シャッフル")] : [],
        enter: s.last && s.last.to === me && !s.last.pair ? new Set([s.last.c]) : null,
        keepOrder: true,
      });
    },
  };
}
const BabaNuki = makeOldMaid(false);
const JijiNuki = makeOldMaid(true);

/* ---------- 七並べ ---------- */
const Sevens = {
  id: "sevens", name: "七並べ", icon: "7️⃣", min: 2, max: 5, tag: "かけひき",
  desc: "7を中心に、となりの数字をつなげていく。パスは3回まで！",
  rules: "・最初に、全員の7が場に並びます。\n・順番に、場のカードのとなりの数字（同じスート）を1枚出します。例：♥7があれば♥6か♥8。\n・出せないとき、出したくないときはパスできます（3回まで）。\n・4回目のパスでドボン（負け）。手札は場に並べられます。\n・手札が早くなくなった人から上がり！\n\nわざと止めて相手を困らせるのがコツ。",
  opts: [{ key: "passes", label: "パスの回数", choices: [[3, "3回"], [5, "5回"]], def: 3 }],
  setup(n, o) {
    const deck = shuffle(makeDeck());
    const s = { n, out: [], burst: [], events: [], maxPass: o.passes || 3 };
    s.hands = deal(deck, n, rnd(n));
    s.board = [[7, 7], [7, 7], [7, 7], [7, 7]];
    s.turn = Math.max(0, s.hands.findIndex((hd) => hd.includes(mkCard(2, 7)))); // ♦7を持っていた人から
    s.hands = s.hands.map((hd) => hd.filter((c) => rankOf(c) !== 7).sort(bySuitRank));
    s.passes = Array(n).fill(0);
    s.lastPlay = null;
    return s;
  },
  can(s, c) { const [lo, hi] = s.board[suitOf(c)]; const r = rankOf(c); return r === lo - 1 || r === hi + 1; },
  playable(s, seat) { return s.hands[seat].filter((c) => this.can(s, c)); },
  alive(s, i) { return s.hands[i].length > 0 && !s.burst.includes(i); },
  actors(s) { return s.over ? [] : [s.turn]; },
  valid(s, seat, m) {
    if (s.over || seat !== s.turn) return false;
    if (m.t === "pass") return true;
    return m.t === "play" && s.hands[seat].includes(m.c) && this.can(s, m.c);
  },
  place(s, c) { const b = s.board[suitOf(c)], r = rankOf(c); if (r < b[0]) b[0] = r; if (r > b[1]) b[1] = r; },
  apply(s, seat, m) {
    if (m.t === "play") {
      s.hands[seat].splice(s.hands[seat].indexOf(m.c), 1);
      this.place(s, m.c); s.lastPlay = m.c;
      if (!s.hands[seat].length) { s.out.push(seat); ev(s, seat, "say", "win"); ev(s, seat, "toast", T_name(s, seat) + " 上がり！"); }
    } else {
      s.passes[seat]++;
      if (s.passes[seat] > s.maxPass) {
        s.burst.push(seat); ev(s, seat, "say", "lose"); ev(s, seat, "big", "ドボン！");
        // ドボンした人の手札は、置ける順に場へ
        let left = s.hands[seat].slice();
        s.hands[seat] = [];
        s.dumped = (s.dumped || []).concat(left);
        this.flushDumped(s);
      } else ev(s, seat, "toast", "パス（" + s.passes[seat] + "/" + s.maxPass + "）");
    }
    this.flushDumped(s);
    const alive = [...Array(s.n).keys()].filter((i) => this.alive(s, i));
    if (alive.length <= 1) { if (alive.length) { s.out.push(alive[0]); ev(s, alive[0], "say", "lose"); } s.over = true; return; }
    s.turn = nextSeat(s, seat, (i) => this.alive(s, i));
  },
  /* ドボンの人のカードは、場につながったら自動で並べる */
  flushDumped(s) {
    if (!s.dumped || !s.dumped.length) return;
    let moved = true;
    while (moved) { moved = false; for (let k = 0; k < s.dumped.length; k++) if (this.can(s, s.dumped[k])) { this.place(s, s.dumped[k]); s.dumped.splice(k, 1); moved = true; break; } }
  },
  cpu(s, seat, lv) {
    const hd = s.hands[seat], pl = this.playable(s, seat);
    const left = s.maxPass - s.passes[seat];
    if (!pl.length) return { t: "pass" };
    if (lv === 0) return { t: "play", c: pick(pl) };
    let best = null, bs = -1e9;
    for (const c of pl) {
      const su = suitOf(c), r = rankOf(c), dir = r < 7 ? -1 : 1;
      let own = 0, far = 0;
      for (const x of hd) if (suitOf(x) === su && (dir < 0 ? rankOf(x) < r : rankOf(x) > r)) { own++; far = Math.max(far, Math.abs(rankOf(x) - r)); }
      const beyond = dir < 0 ? r - 1 : 13 - r; // この先にあるカード枚数
      const others = beyond - own;            // 相手が持っている先のカード
      let sc = own * 3 - others * (lv === 2 ? 1.6 : 0.8) + (own ? 2 : 0) - far * 0.3;
      if (beyond === 0) sc += 4; // AやKは出し得
      if (sc > bs) { bs = sc; best = c; }
    }
    // つよい：手が悪いときは戦略的にパス
    if (lv === 2 && left >= 2 && bs < -4 && pl.length <= 2 && rnd(3) > 0) return { t: "pass" };
    return { t: "play", c: best };
  },
  cpuDelay() { return 700 + rnd(500); },
  result(s) {
    const order = s.out.slice();
    for (let i = s.burst.length - 1; i >= 0; i--) order.push(s.burst[i]);
    return order.map((seat, k) => ({ seat, rank: k, note: s.burst.includes(seat) ? "ドボン" : "" }));
  },
  render(s, T) {
    const me = T.me;
    T.opps((i) => ({ count: s.hands[i].length, turn: !s.over && s.turn === i, badge: s.burst.includes(i) ? "ドボン" : s.out.includes(i) ? s.out.indexOf(i) + 1 + "位" : "パス" + s.passes[i], gold: s.out.indexOf(i) === 0 }));
    // 場（4スート×13）
    const mid = T.mid(0.2, 0.62);
    const cw = Math.min((T.W - 24) / 13.4, 34);
    const grid = h("div", { style: { display: "grid", gridTemplateColumns: `repeat(13, ${cw}px)`, gap: "2px", justifyContent: "center" } });
    setCardSize(grid, cw);
    for (let su = 0; su < 4; su++) for (let r = 1; r <= 13; r++) {
      const [lo, hi] = s.board[su], c = mkCard(su, r);
      if (r >= lo && r <= hi) { const e = cardEl(c, { static: true, cls: s.lastPlay === c ? "enter can" : "" }); grid.append(e); }
      else grid.append(h("div", { class: "slot", style: { position: "relative", fontSize: cw * 0.34 + "px", opacity: 0.55 } }, ""));
    }
    mid.append(grid);
    const myTurn = !s.over && s.turn === me;
    const pl = me >= 0 ? new Set(this.playable(s, me)) : new Set();
    mid.append(h("div", { class: "status", style: { position: "static" } }, h("span", null, s.over ? "おしまい" : myTurn ? (pl.size ? "光っているカードを出せるよ" : "出せるカードがない…パスしよう") : T.name(s.turn) + " の番")));
    if (me < 0) return;
    T.myArea(s.hands[me], {
      info: T.meInfo("のこりパス " + Math.max(0, s.maxPass - s.passes[me]) + "回", myTurn),
      playable: myTurn ? pl : null, dimOthers: myTurn,
      onTap: myTurn ? (c) => { if (pl.has(c)) T.act({ t: "play", c }); else { Snd.bad(); toast("そのカードはまだ出せません"); } } : null,
      buttons: myTurn ? [h("button", { class: "btn " + (s.passes[me] >= s.maxPass ? "pink" : "ghost"), onclick: () => {
        if (s.passes[me] >= s.maxPass) T.confirm("次のパスでドボン（負け）です。パスしますか？", () => T.act({ t: "pass" }));
        else T.act({ t: "pass" });
      } }, s.passes[me] >= s.maxPass ? "パス（ドボン）" : "パス")] : [],
    });
  },
};
function T_name(s, seat) { return (s.names && s.names[seat]) || "P" + (seat + 1); }

/* ---------- 大富豪（大貧民） ---------- */
const DAIFUGO_TITLES = { 2: ["大富豪", "大貧民"], 3: ["大富豪", "平民", "大貧民"], 4: ["大富豪", "富豪", "貧民", "大貧民"], 5: ["大富豪", "富豪", "平民", "貧民", "大貧民"] };
const Daifugo = {
  id: "daifugo", name: "大富豪", icon: "👑", min: 2, max: 5, tag: "人気No.1",
  desc: "強いカードで場を流して手札をなくせ！革命・8切りあり",
  rules: "・強さ：3 < 4 < … < K < A < 2 < ジョーカー\n・最初の人が好きなカードを出します（1枚・同じ数字の2〜4枚・同じスートの3枚以上の連番＝階段）。\n・次の人は「同じ枚数・同じ形」で、もっと強いカードを出すか、パスします。\n・全員がパスしたら場が流れ、最後に出した人から再開。\n・手札がなくなった順に 大富豪→富豪→平民→貧民→大貧民。\n\n特別ルール\n・8切り：8を含むと場が流れて、もう一度出せます。\n・革命：同じ数字4枚（または5枚以上の階段）で強さが逆転！\n・スペ3返し：ジョーカー1枚には♠3で勝てます。\n・ジョーカーは好きなカードの代わりに使えます。\n・2回戦目からは、大貧民は強いカード2枚を大富豪へ、大富豪はいらないカード2枚を大貧民へ渡します（貧民↔富豪は1枚）。",
  opts: [{ key: "rounds", label: "回戦", choices: [[1, "1回"], [3, "3回"], [5, "5回"]], def: 3 }],
  setup(n, o) {
    const s = { n, round: 0, rounds: o.rounds || 3, points: Array(n).fill(0), lastRank: null, events: [] };
    this.newRound(s);
    return s;
  },
  newRound(s) {
    s.round++;
    const deck = shuffle(makeDeck(1));
    s.hands = deal(deck, s.n, rnd(s.n)).map((hd) => hd.sort((a, b) => this.base(a) - this.base(b)));
    s.out = []; s.field = null; s.rev = false; s.passed = []; s.lastBy = -1; s.pile = [];
    s.exch = null;
    if (s.lastRank && s.n >= 2) {
      // カード交換（自動）
      const r = s.lastRank, n = s.n, ex = [];
      const give = (from, to, k, best) => {
        const hd = s.hands[from].slice().sort((a, b) => this.base(a) - this.base(b));
        const cs = best ? hd.slice(-k) : hd.slice(0, k);
        cs.forEach((c) => { s.hands[from].splice(s.hands[from].indexOf(c), 1); s.hands[to].push(c); });
        ex.push({ from, to, cards: cs });
      };
      const hi = r[0], lo = r[n - 1];
      give(lo, hi, 2, true); give(hi, lo, 2, false);
      if (n >= 4) { give(r[n - 2], r[1], 1, true); give(r[1], r[n - 2], 1, false); }
      s.hands.forEach((hd) => hd.sort((a, b) => this.base(a) - this.base(b)));
      s.exch = ex;
      s.turn = lo;
    } else {
      s.turn = s.hands.findIndex((hd) => hd.includes(mkCard(2, 3)));
      if (s.turn < 0) s.turn = rnd(s.n);
    }
    s.lead = s.turn;
    ev(s, -1, "big", s.round === 1 ? "スタート！" : s.round + "回戦");
  },
  base(c) { return isJoker(c) ? 13 : (rankOf(c) + 10) % 13; }, // 3→0 … K→10, A→11, 2→12
  key(s, b) { return s.rev ? 12 - b : b; },
  /* 出したカードの形を調べる */
  classify(cards) {
    if (!cards.length) return null;
    const jk = cards.filter(isJoker).length, nat = cards.filter((c) => !isJoker(c));
    if (!nat.length) return cards.length === 1 ? { type: "set", n: 1, b: 13, joker: true } : null;
    const b0 = this.base(nat[0]);
    if (cards.length <= 4 && nat.every((c) => this.base(c) === b0)) return { type: "set", n: cards.length, b: b0 };
    if (cards.length >= 3 && nat.every((c) => suitOf(c) === suitOf(nat[0]))) {
      const bs = nat.map((c) => this.base(c)).sort((a, b) => a - b);
      for (let i = 1; i < bs.length; i++) if (bs[i] === bs[i - 1]) return null;
      const span = bs[bs.length - 1] - bs[0] + 1, gaps = span - bs.length;
      if (gaps > jk) return null;
      let lo = bs[0], hi = bs[bs.length - 1], extra = jk - gaps;
      while (extra > 0 && hi < 12) { hi++; extra--; }
      while (extra > 0 && lo > 0) { lo--; extra--; }
      if (extra > 0) return null;
      return { type: "seq", n: cards.length, lo, hi, suit: suitOf(nat[0]) };
    }
    return null;
  },
  beats(s, p, f) {
    if (!f) return true;
    if (p.type !== f.type || p.n !== f.n) return false;
    if (p.type === "set") {
      if (f.joker && f.n === 1) return p.n === 1 && p.spe3;
      if (p.joker) return true;
      return this.key(s, p.b) > this.key(s, f.b);
    }
    return s.rev ? p.hi < f.lo : p.lo > f.hi;
  },
  playInfo(s, cards) {
    const p = this.classify(cards); if (!p) return null;
    if (p.type === "set" && p.n === 1 && cards[0] === mkCard(0, 3)) p.spe3 = true;
    return p;
  },
  canPlay(s, seat, cards) {
    if (!cards.length || !cards.every((c) => s.hands[seat].includes(c))) return false;
    if (new Set(cards).size !== cards.length) return false;
    const p = this.playInfo(s, cards); if (!p) return false;
    return this.beats(s, p, s.field);
  },
  actors(s) { return s.over || s.roundOver ? [] : [s.turn]; },
  valid(s, seat, m) {
    if (s.over || s.roundOver || seat !== s.turn || s.wait) return false;
    if (m.t === "pass") return !!s.field;
    return m.t === "play" && this.canPlay(s, seat, m.cards);
  },
  alive(s, i) { return s.hands[i].length > 0; },
  apply(s, seat, m) {
    s.exch = null;
    if (m.t === "pass") {
      s.passed.push(seat); ev(s, seat, "toast", "パス");
    } else {
      const p = this.playInfo(s, m.cards);
      m.cards.forEach((c) => s.hands[seat].splice(s.hands[seat].indexOf(c), 1));
      s.field = Object.assign(p, { cards: m.cards.slice(), by: seat });
      s.pile.push(m.cards.slice());
      s.lastBy = seat; s.passed = [];
      const has8 = m.cards.some((c) => !isJoker(c) && rankOf(c) === 8);
      const revo = (p.type === "set" && p.n >= 4) || (p.type === "seq" && p.n >= 5);
      if (revo) { s.rev = !s.rev; ev(s, seat, "big", s.rev ? "革命！" : "革命返し！"); ev(s, seat, "say", "good"); }
      if (!s.hands[seat].length) {
        s.out.push(seat); ev(s, seat, "toast", DAIFUGO_TITLES[s.n][s.out.length - 1] + "！");
        ev(s, seat, "say", s.out.length === 1 ? "win" : "good");
      }
      if (p.spe3 && !revo) ev(s, seat, "big", "スペ3返し！");
      if (has8) { ev(s, seat, "big", "8切り！"); return this.clearField(s, seat); }
    }
    const alive = [...Array(s.n).keys()].filter((i) => this.alive(s, i));
    if (alive.length <= 1) return this.endRound(s, alive[0]);
    // 出した人以外の生存者が全員パスしたら場が流れる
    const others = alive.filter((i) => i !== s.lastBy);
    if (s.field && others.every((i) => s.passed.includes(i))) return this.clearField(s, s.lastBy);
    s.turn = nextSeat(s, seat, (i) => this.alive(s, i) && !s.passed.includes(i));
  },
  clearField(s, leader) {
    s.field = null; s.passed = []; s.pile = [];
    const alive = [...Array(s.n).keys()].filter((i) => this.alive(s, i));
    if (alive.length <= 1) return this.endRound(s, alive[0]);
    s.turn = this.alive(s, leader) ? leader : nextSeat(s, leader, (i) => this.alive(s, i));
    s.flow = (s.flow || 0) + 1;
  },
  endRound(s, last) {
    if (last != null && !s.out.includes(last)) { s.out.push(last); ev(s, last, "say", "lose"); }
    const n = s.n;
    s.out.forEach((seat, k) => (s.points[seat] += n - 1 - k));
    s.lastRank = s.out.slice();
    s.history = (s.history || []).concat([s.out.slice()]);
    if (s.round >= s.rounds) { s.over = true; return; }
    s.roundOver = true;
    s.wait = { ms: 3200, then: "next" };
  },
  resolve(s, then) { if (then === "next") { s.roundOver = false; this.newRound(s); } },
  /* CPU：出せる手を全部あげて評価 */
  allPlays(s, hd) {
    const plays = [], jk = hd.filter(isJoker), nat = hd.filter((c) => !isJoker(c));
    const byB = {};
    nat.forEach((c) => (byB[this.base(c)] = byB[this.base(c)] || []).push(c));
    for (const b in byB) {
      const a = byB[b];
      for (let k = 1; k <= Math.min(4, a.length); k++) plays.push(a.slice(0, k));
      for (let j = 1; j <= jk.length; j++) if (a.length + j <= 4) plays.push(a.concat(jk.slice(0, j)));
      if (+b === 0) { const sp = a.find((c) => c === mkCard(0, 3)); if (sp) plays.push([sp]); }
    }
    if (jk.length) plays.push([jk[0]]);
    // 階段
    for (let su = 0; su < 4; su++) {
      const have = new Set(nat.filter((c) => suitOf(c) === su).map((c) => this.base(c)));
      for (let lo = 0; lo <= 10; lo++) for (let len = 3; lo + len <= 13; len++) {
        const need = []; let miss = 0;
        for (let b = lo; b < lo + len; b++) { if (have.has(b)) need.push(nat.find((c) => suitOf(c) === su && this.base(c) === b)); else miss++; }
        if (miss > jk.length || need.length < 1) { if (miss > jk.length) break; continue; }
        plays.push(need.concat(jk.slice(0, miss)));
      }
    }
    return plays.filter((p) => this.canPlay(s, s.hands.indexOf(hd), p));
  },
  cpu(s, seat, lv) {
    const hd = s.hands[seat];
    let plays = this.allPlays(s, hd);
    if (!plays.length) return { t: "pass" };
    const strongLeft = hd.length;
    const val = (cards) => {
      const p = this.playInfo(s, cards);
      const nat = cards.filter((c) => !isJoker(c));
      const lowKey = p.type === "set" ? (p.joker && !nat.length ? 14 : this.key(s, p.b)) : this.key(s, s.rev ? p.hi : p.lo);
      let sc = -lowKey * 2 + cards.length * (s.field ? 0.5 : 2.2);
      if (cards.some(isJoker)) sc -= strongLeft > 3 ? 12 : 1;
      if (p.type === "set") { const same = hd.filter((c) => !isJoker(c) && this.base(c) === p.b).length; if (same > nat.length) sc -= 4 * (same - nat.length); }
      if (nat.some((c) => rankOf(c) === 8)) sc += s.field ? 4 : 1;
      if ((p.type === "set" && p.n >= 4) || (p.type === "seq" && p.n >= 5)) {
        const avg = hd.reduce((a, c) => a + this.base(c), 0) / hd.length;
        sc += (s.rev ? avg > 6 : avg < 6) ? 10 : -10;
      }
      if (cards.length === hd.length) sc += 100;
      return sc;
    };
    if (lv === 0) { if (s.field && rnd(5) === 0) return { t: "pass" }; return { t: "play", cards: pick(plays) }; }
    plays.sort((a, b) => val(b) - val(a));
    const best = plays[0];
    // まだ手札が多いのに切り札を使うなら、たまにパス
    if (s.field && hd.length > 4) {
      const p = this.playInfo(s, best);
      const k = p.type === "set" ? (p.joker && !best.some((c) => !isJoker(c)) ? 14 : this.key(s, p.b)) : 0;
      if (k >= 11 && rnd(lv === 2 ? 3 : 2) === 0) return { t: "pass" };
    }
    return { t: "play", cards: best };
  },
  cpuDelay() { return 800 + rnd(600); },
  result(s) {
    const order = [...Array(s.n).keys()].sort((a, b) => s.points[b] - s.points[a]);
    return order.map((seat, k) => ({ seat, rank: k, score: s.points[seat] + "pt", note: s.lastRank ? DAIFUGO_TITLES[s.n][s.lastRank.indexOf(seat)] : "" }));
  },
  title(s, seat) { return s.lastRank && s.lastRank.includes(seat) ? DAIFUGO_TITLES[s.n][s.lastRank.indexOf(seat)] : ""; },
  render(s, T) {
    const me = T.me;
    T.opps((i) => ({
      count: s.hands[i].length, turn: !s.over && !s.roundOver && s.turn === i,
      badge: s.out.includes(i) ? DAIFUGO_TITLES[s.n][s.out.indexOf(i)] : s.passed.includes(i) ? "パス" : this.title(s, i) || null,
      gold: s.out.indexOf(i) === 0,
    }));
    const mid = T.mid(0.22, 0.56);
    const info = h("div", { class: "row", style: { justifyContent: "center", gap: "6px" } },
      h("span", { class: "chip" }, s.round + "/" + s.rounds + "回戦"), s.rev ? h("span", { class: "chip", style: { background: "#ffe1ea", color: "var(--red)" } }, "革命中") : null);
    mid.append(info);
    const fieldBox = h("div", { style: { position: "relative", height: "112px", width: "100%" } });
    const piles = (s.pile || []).slice(-3);
    piles.forEach((cards, k) => {
      const row = h("div", { style: { position: "absolute", left: "50%", top: 6 + k * 6 + "px", display: "flex", gap: "3px", translate: `calc(-50% + ${(k - piles.length + 1) * 10}px) 0`, opacity: k === piles.length - 1 ? 1 : 0.55, zIndex: k } });
      setCardSize(row, 62);
      cards.forEach((c) => row.append(cardEl(c, { static: true, cls: k === piles.length - 1 ? "enter" : "" })));
      fieldBox.append(row);
    });
    if (!piles.length) fieldBox.append(h("div", { class: "status", style: { top: "40px" } }, h("span", null, s.roundOver ? "ラウンド終了！" : "場は空いています")));
    mid.append(fieldBox);
    if (s.exch && me >= 0) {
      const mine = s.exch.filter((e) => e.from === me || e.to === me);
      if (mine.length) mid.append(h("div", { class: "status", style: { position: "static" } }, h("span", { style: { fontSize: "12px" } }, mine.map((e) => (e.from === me ? T.name(e.to) + "へ " : T.name(e.from) + "から ") + e.cards.map(cardName).join(" ")).join(" / "))));
    }
    const myTurn = !s.over && !s.roundOver && s.turn === me;
    mid.append(h("div", { class: "status", style: { position: "static" } }, h("span", null,
      s.roundOver ? "順位：" + s.out.map((i, k) => DAIFUGO_TITLES[s.n][k] + " " + T.name(i)).join("・") :
      myTurn ? (s.field ? "同じ形でもっと強いカードを出そう" : "好きなカードを出そう（親）") : T.name(s.turn) + " の番")));
    if (me < 0) return;
    const sel = T.sel;
    for (const c of [...sel]) if (!s.hands[me].includes(c)) sel.delete(c);
    const selCards = [...sel];
    const ok = myTurn && this.canPlay(s, me, selCards);
    const hd = s.hands[me].slice().sort((a, b) => this.key(s, this.base(a)) - this.key(s, this.base(b)) || suitOf(a) - suitOf(b));
    T.myArea(hd, {
      info: T.meInfo((this.title(s, me) ? this.title(s, me) + "・" : "") + s.points[me] + "pt", myTurn),
      selected: sel, keepOrder: true,
      onTap: myTurn ? (c) => { if (sel.has(c)) sel.delete(c); else sel.add(c); Snd.tick(); T.redraw(); } : null,
      buttons: myTurn ? [
        h("button", { class: "btn ghost", disabled: !s.field, onclick: () => { sel.clear(); T.act({ t: "pass" }); } }, "パス"),
        h("button", { class: "btn pink", disabled: !ok, onclick: () => { const cs = [...sel]; sel.clear(); T.act({ t: "play", cards: cs }); } }, "出す" + (selCards.length ? "（" + selCards.length + "枚）" : "")),
      ] : [],
    });
  },
};

/* ---------- 神経衰弱 ---------- */
const Memory = {
  id: "memory", name: "神経衰弱", icon: "🧠", min: 1, max: 5, tag: "記憶力",
  desc: "同じ数字の2枚を当てよう。ひとりでも、みんなでも",
  rules: "・カードを全部裏向きに並べます。\n・自分の番に2枚めくり、同じ数字ならもらえて、もう一度めくれます。\n・ちがったら裏に戻して次の人へ。\n・最後にいちばん多くカードを取った人の勝ち！\n\nCPUの記憶力は難しさで変わります。",
  opts: [{ key: "size", label: "枚数", choices: [[26, "26枚（はやい）"], [52, "52枚"]], def: 26 }],
  setup(n, o) {
    let cards;
    if (o.size === 52) cards = makeDeck();
    else { const ss = shuffle([0, 1, 2, 3]).slice(0, 2); cards = []; ss.forEach((su) => { for (let r = 1; r <= 13; r++) cards.push(mkCard(su, r)); }); }
    shuffle(cards);
    return { n, cards: cards.map((c) => ({ c, st: 0 })), seen: cards.map(() => 0), flip: [], turn: rnd(n), score: Array(n).fill(0), events: [], t0: Date.now(), tries: 0 };
  },
  actors(s) { return s.over || s.wait ? [] : [s.turn]; },
  valid(s, seat, m) { return !s.over && !s.wait && seat === s.turn && m.t === "flip" && s.cards[m.i] && s.cards[m.i].st === 0 && !s.flip.includes(m.i); },
  apply(s, seat, m) {
    s.flip.push(m.i); s.cards[m.i].st = 1; s.seen[m.i] = 1;
    if (s.flip.length === 2) {
      s.tries++;
      const [a, b] = s.flip;
      if (rankOf(s.cards[a].c) === rankOf(s.cards[b].c)) { s.wait = { ms: 700, then: "take" }; ev(s, seat, "say", "good"); }
      else s.wait = { ms: 1150, then: "back" };
    }
  },
  resolve(s, then) {
    const [a, b] = s.flip;
    if (then === "take") {
      s.cards[a].st = s.cards[b].st = 2; s.cards[a].by = s.cards[b].by = s.turn; s.score[s.turn] += 2;
      if (s.cards.every((x) => x.st === 2)) { s.over = true; s.tEnd = Date.now(); }
    } else {
      s.cards[a].st = s.cards[b].st = 0;
      s.turn = (s.turn + 1) % s.n;
    }
    s.flip = [];
  },
  cpu(s, seat, lv) {
    const mem = [0.35, 0.65, 0.92][lv];
    const known = [];
    s.cards.forEach((x, i) => { if (x.st === 0 && s.seen[i] && Math.random() < mem && !s.flip.includes(i)) known.push(i); });
    const unseen = s.cards.map((x, i) => i).filter((i) => s.cards[i].st === 0 && !s.seen[i] && !s.flip.includes(i));
    const any = s.cards.map((x, i) => i).filter((i) => s.cards[i].st === 0 && !s.flip.includes(i));
    if (s.flip.length === 1) {
      const r = rankOf(s.cards[s.flip[0]].c);
      const m = known.find((i) => rankOf(s.cards[i].c) === r);
      if (m != null) return { t: "flip", i: m };
      return { t: "flip", i: pick(unseen.length ? unseen : any) };
    }
    for (const i of known) for (const j of known) if (i < j && rankOf(s.cards[i].c) === rankOf(s.cards[j].c)) return { t: "flip", i };
    return { t: "flip", i: pick(unseen.length ? unseen : any) };
  },
  cpuDelay() { return 650 + rnd(400); },
  result(s) {
    const order = [...Array(s.n).keys()].sort((a, b) => s.score[b] - s.score[a]);
    let rank = 0;
    return order.map((seat, k) => { if (k > 0 && s.score[seat] < s.score[order[k - 1]]) rank = k; return { seat, rank, score: s.score[seat] + "枚" }; });
  },
  render(s, T) {
    const me = T.me;
    if (s.n > 1) T.opps((i) => ({ count: s.score[i] + "枚", turn: !s.over && s.turn === i }));
    const total = s.cards.length;
    const colsN = total > 26 ? 8 : 6, rowsN = Math.ceil(total / colsN);
    const top = s.n > 1 ? 120 : 34, bottom = 92;
    const cw = Math.min((T.W - 20 - (colsN - 1) * 4) / colsN, ((T.H - top - bottom) / rowsN - 4) / 1.4, 64);
    const g = h("div", { class: "grid-cards", style: { top: top + "px", gridTemplateColumns: `repeat(${colsN}, ${cw}px)` } });
    setCardSize(g, cw);
    const myTurn = !s.over && !s.wait && s.turn === me;
    s.cards.forEach((x, i) => {
      const e = cardEl(x.c, { static: true, down: x.st === 0, cls: x.st === 2 ? "gone" : x.st === 1 ? "flip" : "" });
      if (x.st === 0 && myTurn) e.addEventListener("click", () => T.act({ t: "flip", i }));
      g.append(e);
    });
    T.area.append(g);
    T.myArea(null, {
      info: T.meInfo(s.n > 1 ? "取った枚数 " + s.score[me] + "枚" : "めくった回数 " + s.tries + "回", myTurn),
      status: s.over ? "おしまい！" : myTurn ? (s.flip.length ? "もう1枚めくろう" : "2枚めくろう") : s.wait ? (s.flip.length === 2 && rankOf(s.cards[s.flip[0]].c) === rankOf(s.cards[s.flip[1]].c) ? "そろった！" : "ざんねん…") : T.name(s.turn) + " の番",
    });
  },
};

/* ---------- ダウト ---------- */
const Doubt = {
  id: "doubt", name: "ダウト", icon: "🤥", min: 2, max: 5, tag: "ウソつき",
  desc: "A,2,3…と順番に出す。ウソだと思ったら「ダウト！」",
  rules: "・全部のカードを配ります。\n・A→2→3…→K→A…の順に、決められた数字のカードを裏向きで1〜4枚出します。\n・持っていなければウソをついて別のカードを出してもOK！\n・ウソだと思ったら「ダウト！」。\n　・本当にウソなら、ウソをついた人が場のカードを全部引き取ります。\n　・本当だったら、ダウトした人が全部引き取ります。\n・最初に手札がなくなった人の勝ち！",
  opts: [],
  setup(n) {
    const s = { n, hands: deal(shuffle(makeDeck()), n, rnd(n)).map((hd) => hd.sort(byRankSuit)), pile: [], need: 1, turn: rnd(n), phase: "play", events: [] };
    return s;
  },
  actors(s) {
    if (s.over) return [];
    if (s.phase === "play") return [s.turn];
    if (s.phase === "doubt") return [...Array(s.n).keys()].filter((i) => i !== s.lastBy && !s.skip.includes(i));
    return [];
  },
  valid(s, seat, m) {
    if (s.over) return false;
    if (s.phase === "play") return m.t === "play" && seat === s.turn && m.cards.length >= 1 && m.cards.length <= 4 && m.cards.every((c) => s.hands[seat].includes(c)) && new Set(m.cards).size === m.cards.length;
    if (s.phase === "doubt") return (m.t === "doubt" || m.t === "skip") && seat !== s.lastBy && !s.skip.includes(seat);
    return false;
  },
  apply(s, seat, m) {
    if (m.t === "play") {
      m.cards.forEach((c) => s.hands[seat].splice(s.hands[seat].indexOf(c), 1));
      s.last = { by: seat, cards: m.cards.slice(), need: s.need };
      s.pile.push(...m.cards); s.lastBy = seat; s.skip = [];
      s.phase = "doubt"; s.wait = { ms: 3600, then: "nodoubt" }; s.doubtId = (s.doubtId || 0) + 1;
      ev(s, seat, "toast", rankLabel(s.need) + " を" + m.cards.length + "枚");
      return;
    }
    if (m.t === "skip") {
      s.skip.push(seat);
      if (this.actors(s).length === 0) { s.wait = { ms: 250, then: "nodoubt" }; }
      return;
    }
    // ダウト！
    const lie = s.last.cards.some((c) => rankOf(c) !== s.last.need);
    const loser = lie ? s.last.by : seat;
    s.reveal = { by: seat, lie, cards: s.last.cards, loser };
    s.hands[loser].push(...s.pile); s.hands[loser].sort(byRankSuit);
    s.pile = [];
    ev(s, seat, "big", "ダウト！");
    ev(s, seat, "say", lie ? "good" : "bad");
    ev(s, s.last.by, "say", lie ? "bad" : "good");
    s.phase = "reveal"; s.wait = { ms: 2300, then: "next" };
  },
  resolve(s, then) {
    if (then === "nodoubt" || then === "next") {
      s.reveal = then === "next" ? s.reveal : null;
      const p = s.last.by;
      if (!s.hands[p].length) { s.over = true; s.winner = p; ev(s, p, "say", "win"); return; }
      s.need = (s.need % 13) + 1;
      s.turn = (p + 1) % s.n;
      s.phase = "play"; s.reveal = null; s.skip = [];
    }
  },
  cpu(s, seat, lv) {
    const hd = s.hands[seat];
    if (s.phase === "play") {
      const real = hd.filter((c) => rankOf(c) === s.need);
      if (real.length) {
        let cs = real.slice();
        if (lv === 2 && hd.length > real.length && rnd(3) === 0 && cs.length < 4) { const lie = hd.filter((c) => rankOf(c) !== s.need); cs.push(pick(lie)); }
        return { t: "play", cards: cs };
      }
      // ウソをつく：次に自分の番で使わなそうなカード
      const myNext = ((s.need - 1 + s.n) % 13) + 1;
      const cand = hd.filter((c) => rankOf(c) !== myNext);
      return { t: "play", cards: [pick(cand.length ? cand : hd)] };
    }
    if (s.phase === "doubt") {
      const claim = s.last.need, k = s.last.cards.length;
      const own = hd.filter((c) => rankOf(c) === claim).length;
      if (own + k > 4) return { t: "doubt" };
      // 残りの枚数から、ウソの確率をざっくり見積もる
      const avail = 4 - own;
      let p = [0.1, 0.08, 0.06][lv] + (k >= 3 ? 0.12 : 0) + (k > avail - 1 ? 0.1 : 0) + own * 0.05;
      if (s.hands[s.last.by].length === 0) p += 0.6;
      if (lv >= 1 && s.pile.length > 8) p -= 0.04;
      return Math.random() < p ? { t: "doubt" } : { t: "skip" };
    }
    return null;
  },
  cpuDelay(s) { return s.phase === "doubt" ? 900 + rnd(1800) : 900 + rnd(700); },
  result(s) {
    const order = [...Array(s.n).keys()].sort((a, b) => (a === s.winner ? -1 : b === s.winner ? 1 : s.hands[a].length - s.hands[b].length));
    return order.map((seat, k) => ({ seat, rank: k, score: s.hands[seat].length + "枚" }));
  },
  render(s, T) {
    const me = T.me;
    T.opps((i) => ({ count: s.hands[i].length, turn: !s.over && s.phase === "play" && s.turn === i }));
    const mid = T.mid(0.2, 0.6);
    mid.append(h("div", { class: "row", style: { justifyContent: "center" } }, h("span", { class: "chip" }, "次の数字：" + rankLabel(s.phase === "play" ? s.need : s.last.need)), h("span", { class: "chip" }, "場 " + s.pile.length + "枚")));
    const pileBox = h("div", { style: { position: "relative", height: "104px", width: "160px" } });
    setCardSize(pileBox, 58);
    if (s.reveal) {
      const row = h("div", { style: { display: "flex", gap: "4px", justifyContent: "center" } });
      s.reveal.cards.forEach((c) => row.append(cardEl(c, { static: true, cls: "flip" })));
      pileBox.append(row);
    } else {
      const n = Math.min(s.pile.length, 8);
      for (let k = 0; k < n; k++) { const e = cardEl(0, { down: true }); e.style.left = 50 + (k % 3) * 4 - 4 + "px"; e.style.top = 10 + k * 2 + "px"; e.style.rotate = ((k * 37) % 21) - 10 + "deg"; pileBox.append(e); }
    }
    mid.append(pileBox);
    let msg = "";
    if (s.phase === "play") msg = s.turn === me ? rankLabel(s.need) + " のカードを出そう（ウソでもOK）" : T.name(s.turn) + " が " + rankLabel(s.need) + " を出す番";
    else if (s.phase === "doubt") msg = T.name(s.last.by) + "「" + rankLabel(s.last.need) + " を" + s.last.cards.length + "枚」…ダウトする？";
    else if (s.reveal) msg = T.name(s.reveal.by) + " のダウト！ → " + (s.reveal.lie ? "ウソだった！" : "本当だった！") + " " + T.name(s.reveal.loser) + " が引き取り";
    mid.append(h("div", { class: "status", style: { position: "static" } }, h("span", null, msg)));
    if (s.phase === "doubt") mid.append(T.timerBar());
    if (me < 0) return;
    const sel = T.sel;
    for (const c of [...sel]) if (!s.hands[me].includes(c)) sel.delete(c);
    const buttons = [];
    if (s.phase === "play" && s.turn === me) {
      buttons.push(h("button", { class: "btn pink", disabled: !(sel.size >= 1 && sel.size <= 4), onclick: () => { const cs = [...sel]; sel.clear(); T.act({ t: "play", cards: cs }); } }, "出す（" + sel.size + "枚）"));
    } else if (s.phase === "doubt" && s.last.by !== me && !s.skip.includes(me)) {
      buttons.push(h("button", { class: "btn ghost", onclick: () => T.act({ t: "skip" }) }, "スルー"));
      buttons.push(h("button", { class: "btn pink", onclick: () => T.act({ t: "doubt" }) }, "ダウト！"));
    }
    const can = s.phase === "play" && s.turn === me;
    T.myArea(s.hands[me], {
      info: T.meInfo(s.hands[me].length + "枚", can),
      selected: sel, keepOrder: true,
      playable: can ? new Set(s.hands[me].filter((c) => rankOf(c) === s.need)) : null,
      onTap: can ? (c) => { if (sel.has(c)) sel.delete(c); else if (sel.size < 4) sel.add(c); Snd.tick(); T.redraw(); } : null,
      buttons,
    });
  },
};
