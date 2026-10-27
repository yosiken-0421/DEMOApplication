"use strict";
/* ---------- スピード（2人・早い者勝ち） ---------- */
const Speed = {
  id: "speed", name: "スピード", icon: "⚡", min: 2, max: 2, tag: "2人用", realtime: true,
  desc: "ターンなしの早い者勝ち！数字が1つ違うカードをどんどん出せ",
  rules: "2人で同時に遊ぶ、早さ勝負のゲームです。\n\n・赤（♥♦）と黒（♠♣）で26枚ずつ分け、手前に4枚ずつ表向きで並べます。\n・真ん中の2つの台札に、数字が1つ上か下のカードを出せます（KとAもつながる）。\n・出したら山札から補充。順番はありません、早い者勝ち！\n・2人とも出せなくなったら、それぞれ山札から1枚ずつ台札に出して再開。\n・先に全部のカードを出しきった人の勝ち！\n\nカードをタップすると、出せる台札に出ます。",
  opts: [],
  setup(n) {
    const red = shuffle(makeDeck().filter(isRed)), blk = shuffle(makeDeck().filter((c) => !isRed(c)));
    const s = { n: 2, stock: [red, blk], field: [[], []], center: [[], []], phase: "ready", events: [], winner: -1, tick: 0 };
    for (let p = 0; p < 2; p++) for (let i = 0; i < 4; i++) s.field[p].push(s.stock[p].pop());
    s.wait = { ms: 2200, then: "go" };
    ev(s, -1, "big", "せーの…");
    return s;
  },
  near(a, b) { const d = Math.abs(rankOf(a) - rankOf(b)); return d === 1 || d === 12; },
  topOf(s, k) { const c = s.center[k]; return c[c.length - 1]; },
  canPut(s, p, f, k) { const c = s.field[p][f]; return c != null && s.center[k].length && this.near(c, this.topOf(s, k)); },
  anyMove(s, p) { for (let f = 0; f < 4; f++) for (let k = 0; k < 2; k++) if (this.canPut(s, p, f, k)) return { f, k }; return null; },
  actors(s) { return s.over || s.phase !== "play" ? [] : [0, 1]; },
  valid(s, seat, m) { return !s.over && s.phase === "play" && m.t === "put" && seat >= 0 && seat < 2 && this.canPut(s, seat, m.f, m.k); },
  apply(s, seat, m) {
    const c = s.field[seat][m.f];
    s.center[m.k].push(c);
    s.lastPut = { seat, c, k: m.k, id: (s.lastPut ? s.lastPut.id : 0) + 1 };
    s.field[seat][m.f] = s.stock[seat].length ? s.stock[seat].pop() : null;
    if (s.field[seat].every((x) => x == null) && !s.stock[seat].length) { s.over = true; s.winner = seat; ev(s, seat, "say", "win"); ev(s, 1 - seat, "say", "lose"); return; }
    this.checkStuck(s);
  },
  checkStuck(s) {
    if (s.phase === "play" && !this.anyMove(s, 0) && !this.anyMove(s, 1)) { s.phase = "stuck"; s.wait = { ms: 1300, then: "go" }; ev(s, -1, "toast", "どっちも出せない！　せーの…"); }
  },
  resolve(s, then) {
    if (then !== "go") return;
    // それぞれ台札へ1枚出す（山札がなければ場から）
    for (let p = 0; p < 2; p++) {
      let c = null;
      if (s.stock[p].length) c = s.stock[p].pop();
      else { const f = s.field[p].findIndex((x) => x != null); if (f >= 0) { c = s.field[p][f]; s.field[p][f] = null; } }
      if (c != null) s.center[p].push(c);
    }
    for (let p = 0; p < 2; p++) if (s.field[p].every((x) => x == null) && !s.stock[p].length) { s.over = true; s.winner = p; ev(s, p, "say", "win"); ev(s, 1 - p, "say", "lose"); return; }
    s.phase = "play"; s.tick++;
    ev(s, -1, "big", "スピード！");
    this.checkStuck(s);
  },
  cpu(s, seat, lv) { const m = this.anyMove(s, seat); return m ? { t: "put", f: m.f, k: m.k } : null; },
  cpuDelay(s, seat, lv) { return [1700, 1050, 650][lv] + rnd([900, 600, 350][lv]); },
  result(s) { const w = s.winner; return [{ seat: w, rank: 0 }, { seat: 1 - w, rank: 1, score: "のこり" + (s.stock[1 - w].length + s.field[1 - w].filter((x) => x != null).length) + "枚" }]; },
  render(s, T) {
    const me = T.me < 0 ? 0 : T.me, op = 1 - me;
    T.opps((i) => ({ count: "山 " + s.stock[i].length, turn: false }));
    const W = T.W, cw = Math.min((W - 40) / 4.6, 74), ch = cw * 1.4;
    const wrap = h("div", { style: { position: "absolute", left: 0, right: 0, top: "116px", display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" } });
    setCardSize(wrap, cw);
    // 相手の場
    const opRow = h("div", { style: { display: "flex", gap: "6px" } });
    s.field[op].forEach((c) => opRow.append(c == null ? h("div", { class: "slot", style: { position: "relative" } }) : cardEl(c, { static: true, cls: "dim" })));
    wrap.append(opRow);
    // 台札
    const cen = h("div", { style: { display: "flex", gap: cw * 0.6 + "px", alignItems: "center", margin: "6px 0" } });
    for (let k = 0; k < 2; k++) {
      const box = h("div", { style: { position: "relative", width: cw * 1.15 + "px", height: ch * 1.15 + "px" } });
      setCardSize(box, cw * 1.15);
      const pile = s.center[k];
      if (!pile.length) box.append(h("div", { class: "slot" }, ""));
      pile.slice(-3).forEach((c, j, arr) => {
        const e = cardEl(c, { cls: j === arr.length - 1 && s.lastPut && s.lastPut.k === k ? "enter" : "" });
        e.style.left = "0px"; e.style.top = "0px"; e.style.rotate = (((c * 13) % 9) - 4) + "deg";
        box.append(e);
      });
      cen.append(box);
    }
    wrap.append(cen);
    // 自分の場
    const myRow = h("div", { style: { display: "flex", gap: "6px" } });
    const play = s.phase === "play" && !s.over && T.me >= 0;
    s.field[me].forEach((c, f) => {
      if (c == null) { myRow.append(h("div", { class: "slot", style: { position: "relative" } })); return; }
      const ks = [0, 1].filter((k) => this.canPut(s, me, f, k));
      const e = cardEl(c, { static: true, cls: play && ks.length ? "can" : "" });
      e.addEventListener("pointerdown", (ev2) => {
        ev2.preventDefault();
        if (!play) return;
        if (!ks.length) { e.classList.remove("shake"); void e.offsetWidth; e.classList.add("shake"); Snd.bad(); return; }
        T.act({ t: "put", f, k: ks[0] });
      });
      myRow.append(e);
    });
    wrap.append(myRow);
    T.area.append(wrap);
    T.myArea(null, {
      info: T.meInfo("山札 " + s.stock[me].length + "枚", false),
      status: s.over ? "おしまい！" : s.phase === "ready" ? "準備して…" : s.phase === "stuck" ? "どっちも出せない！せーの…" : "どんどん出そう！",
    });
  },
};

/* ---------- ブラックジャック ---------- */
function bjValue(cards) {
  let v = 0, a = 0;
  for (const c of cards) { const r = rankOf(c); if (r === 1) { a++; v += 11; } else v += Math.min(10, r); }
  while (v > 21 && a) { v -= 10; a--; }
  return { v, soft: a > 0 };
}
const Blackjack = {
  id: "blackjack", name: "ブラックジャック", icon: "🎰", min: 1, max: 5, tag: "カジノ",
  desc: "21に近いほうが勝ち！ディーラーと勝負。みんなでチップを競おう",
  rules: "・ディーラー（親）との勝負です。みんなで一緒に遊べます。\n・カードの点数：2〜10はそのまま、J・Q・Kは10、Aは1か11。\n・最初に2枚配られます。21に近づくように「ヒット」で1枚ずつ引けます。\n・21をこえたら「バースト」で負け。\n・「スタンド」でストップ。\n・「ダブル」：賭け金を2倍にして1枚だけ引きます。\n・ディーラーは17以上になるまで引きます。\n・最初の2枚で21（ブラックジャック）なら賭け金の1.5倍もらえます。\n\n決められた回数が終わったとき、チップがいちばん多い人の勝ち！",
  opts: [{ key: "rounds", label: "回数", choices: [[5, "5回"], [10, "10回"]], def: 5 }],
  setup(n, o) {
    const s = { n, chips: Array(n).fill(1000), round: 0, rounds: o.rounds || 5, events: [], shoe: [] };
    this.startBet(s);
    return s;
  },
  draw(s) { if (s.shoe.length < 20) s.shoe = shuffle(makeDeck().concat(makeDeck())); return s.shoe.pop(); },
  startBet(s) {
    s.round++;
    s.phase = "bet"; s.bets = Array(s.n).fill(0); s.hands = Array.from({ length: s.n }, () => []); s.dealer = []; s.res = null;
    s.state = Array(s.n).fill(""); s.turn = -1;
    s.out = [...Array(s.n).keys()].map((i) => s.chips[i] < 10);
  },
  inGame(s, i) { return !s.out[i]; },
  actors(s) {
    if (s.over) return [];
    if (s.phase === "bet") return [...Array(s.n).keys()].filter((i) => this.inGame(s, i) && !s.bets[i]);
    if (s.phase === "play") return [s.turn];
    return [];
  },
  valid(s, seat, m) {
    if (s.over) return false;
    if (s.phase === "bet") return m.t === "bet" && this.inGame(s, seat) && !s.bets[seat] && m.amt >= 10 && m.amt <= s.chips[seat];
    if (s.phase === "play" && seat === s.turn) {
      if (m.t === "hit" || m.t === "stand") return true;
      if (m.t === "double") return s.hands[seat].length === 2 && s.chips[seat] >= s.bets[seat] * 2;
    }
    return false;
  },
  apply(s, seat, m) {
    if (m.t === "bet") {
      s.bets[seat] = m.amt;
      if (this.actors(s).length === 0) this.dealAll(s);
      return;
    }
    const hd = s.hands[seat];
    if (m.t === "hit" || m.t === "double") {
      if (m.t === "double") { s.bets[seat] *= 2; s.state[seat] = "ダブル"; }
      hd.push(this.draw(s));
      const v = bjValue(hd).v;
      if (v > 21) { s.state[seat] = "バースト"; ev(s, seat, "say", "bad"); return this.nextPlayer(s); }
      if (v === 21 || m.t === "double") { if (!s.state[seat]) s.state[seat] = "スタンド"; return this.nextPlayer(s); }
      return;
    }
    s.state[seat] = "スタンド";
    this.nextPlayer(s);
  },
  dealAll(s) {
    const seats = [...Array(s.n).keys()].filter((i) => this.inGame(s, i));
    for (let k = 0; k < 2; k++) { seats.forEach((i) => s.hands[i].push(this.draw(s))); s.dealer.push(this.draw(s)); }
    seats.forEach((i) => { if (bjValue(s.hands[i]).v === 21) { s.state[i] = "BJ!"; } });
    if (bjValue(s.dealer).v === 21) { s.phase = "dealer"; s.dealerBJ = true; ev(s, -1, "big", "ディーラーBJ…"); s.wait = { ms: 900, then: "settle" }; return; }
    s.phase = "play"; s.turn = -1;
    this.nextPlayer(s);
  },
  nextPlayer(s) {
    for (let i = s.turn + 1; i < s.n; i++) if (this.inGame(s, i) && !s.state[i]) { s.turn = i; return; }
    s.turn = -1; s.phase = "dealer"; s.wait = { ms: 800, then: "dealer" };
  },
  resolve(s, then) {
    if (then === "dealer") {
      const alive = [...Array(s.n).keys()].some((i) => this.inGame(s, i) && s.state[i] !== "バースト" && s.state[i] !== "BJ!");
      const d = bjValue(s.dealer);
      if (alive && d.v < 17) { s.dealer.push(this.draw(s)); s.wait = { ms: 750, then: "dealer" }; return; }
      s.wait = { ms: 500, then: "settle" }; return;
    }
    if (then === "settle") {
      const d = bjValue(s.dealer).v, dbj = s.dealerBJ;
      s.res = Array(s.n).fill(null);
      for (let i = 0; i < s.n; i++) {
        if (!this.inGame(s, i)) continue;
        const v = bjValue(s.hands[i]).v, b = s.bets[i], bj = s.state[i] === "BJ!";
        let gain;
        if (bj && !dbj) gain = Math.floor(b * 1.5);
        else if (dbj) gain = bj ? 0 : -b;
        else if (v > 21) gain = -b;
        else if (d > 21 || v > d) gain = b;
        else if (v === d) gain = 0;
        else gain = -b;
        s.chips[i] += gain; s.res[i] = gain;
        ev(s, i, "say", gain > 0 ? "good" : gain < 0 ? "bad" : "turn");
      }
      s.dealerBJ = false;
      s.phase = "result";
      const left = [...Array(s.n).keys()].filter((i) => s.chips[i] >= 10).length;
      if (s.round >= s.rounds || left === 0) { s.over = true; return; }
      s.wait = { ms: 3200, then: "next" };
      return;
    }
    if (then === "next") this.startBet(s);
  },
  cpu(s, seat, lv) {
    if (s.phase === "bet") { const base = [50, 100, 100][lv]; return { t: "bet", amt: Math.min(s.chips[seat], pick([base, base, base * 2, 10 * (1 + rnd(5))])) }; }
    const hd = s.hands[seat], { v, soft } = bjValue(hd), up = Math.min(10, rankOf(s.dealer[0])) || 10, upv = rankOf(s.dealer[0]) === 1 ? 11 : up;
    if (lv === 0) return { t: v < 16 ? "hit" : "stand" };
    if (hd.length === 2 && !soft && (v === 11 || (v === 10 && upv <= 9)) && s.chips[seat] >= s.bets[seat] * 2) return { t: "double" };
    if (soft) return { t: v <= 17 || (v === 18 && upv >= 9) ? "hit" : "stand" };
    if (v >= 17) return { t: "stand" };
    if (v >= 13) return { t: upv <= 6 ? "stand" : "hit" };
    if (v === 12) return { t: upv >= 4 && upv <= 6 ? "stand" : "hit" };
    return { t: "hit" };
  },
  cpuDelay(s) { return s.phase === "bet" ? 500 + rnd(700) : 900 + rnd(500); },
  result(s) {
    const order = [...Array(s.n).keys()].sort((a, b) => s.chips[b] - s.chips[a]);
    let rank = 0;
    return order.map((seat, k) => { if (k > 0 && s.chips[seat] < s.chips[order[k - 1]]) rank = k; return { seat, rank, score: s.chips[seat] + "枚" }; });
  },
  render(s, T) {
    const me = T.me;
    if (s.n > 1) T.opps((i) => ({ count: s.chips[i] + "枚", turn: s.phase === "play" && s.turn === i, badge: s.out[i] ? "おやすみ" : s.res && s.res[i] != null ? (s.res[i] > 0 ? "+" + s.res[i] : s.res[i] === 0 ? "±0" : s.res[i]) : s.state[i] || (s.bets[i] ? "BET " + s.bets[i] : null), gold: s.res && s.res[i] > 0, mini: s.hands[i] }));
    const mid = T.mid(s.n > 1 ? 0.2 : 0.08, 0.55);
    // ディーラー
    const showAll = s.phase === "dealer" || s.phase === "result";
    const drow = h("div", { style: { display: "flex", gap: "4px", justifyContent: "center", minHeight: "86px" } });
    setCardSize(drow, 58);
    s.dealer.forEach((c, k) => drow.append(cardEl(c, { static: true, down: k === 1 && !showAll, cls: "enter" })));
    mid.append(h("div", { class: "chip" }, "ディーラー" + (s.dealer.length ? "　" + (showAll ? bjValue(s.dealer).v : "?") : "")), drow);
    mid.append(h("div", { class: "row", style: { justifyContent: "center" } }, h("span", { class: "chip" }, s.round + "/" + s.rounds + "回目")));
    if (me < 0) return;
    const hd = s.hands[me], v = hd.length ? bjValue(hd).v : 0;
    let status = "", buttons = [];
    if (s.out[me]) status = "チップが足りないのでおやすみ";
    else if (s.phase === "bet") {
      if (!s.bets[me]) {
        status = "賭けるチップをえらんでね（持ち " + s.chips[me] + "枚）";
        buttons = [10, 50, 100, 250].filter((a) => a <= s.chips[me]).map((a) => h("button", { class: "btn lemon", onclick: () => T.act({ t: "bet", amt: a }) }, a));
        if (s.chips[me] > 250) buttons.push(h("button", { class: "btn pink", onclick: () => T.act({ t: "bet", amt: s.chips[me] }) }, "全部"));
      } else status = "みんなが賭けるのを待っています…";
    } else if (s.phase === "play" && s.turn === me) {
      status = "合計 " + v + "　どうする？";
      buttons = [h("button", { class: "btn ghost", onclick: () => T.act({ t: "stand" }) }, "スタンド"), h("button", { class: "btn mint", onclick: () => T.act({ t: "hit" }) }, "ヒット")];
      if (hd.length === 2 && s.chips[me] >= s.bets[me] * 2) buttons.push(h("button", { class: "btn lemon", onclick: () => T.act({ t: "double" }) }, "ダブル"));
    } else if (s.phase === "result" && s.res) {
      const g = s.res[me];
      status = g > 0 ? "勝ち！ +" + g + "枚" : g < 0 ? "負け… " + g + "枚" : "引き分け";
    } else if (s.phase === "play") status = T.name(s.turn) + " の番";
    else status = "ディーラーの番…";
    T.myArea(hd, {
      info: T.meInfo("チップ " + s.chips[me] + "枚" + (s.bets[me] ? "　BET " + s.bets[me] : "") + (hd.length ? "　合計 " + v : ""), s.phase === "play" && s.turn === me),
      status, buttons, cw: 64, enter: new Set(hd.slice(-1)),
    });
  },
};

/* ---------- ポーカー（5カードドロー） ---------- */
const HAND_NAMES = ["ハイカード", "ワンペア", "ツーペア", "スリーカード", "ストレート", "フラッシュ", "フルハウス", "フォーカード", "ストレートフラッシュ"];
function pokerEval(cards) {
  const rs = cards.map((c) => (rankOf(c) === 1 ? 14 : rankOf(c))).sort((a, b) => b - a);
  const flush = cards.every((c) => suitOf(c) === suitOf(cards[0]));
  const uniq = [...new Set(rs)];
  let straight = false, high = rs[0];
  if (uniq.length === 5 && rs[0] - rs[4] === 4) straight = true;
  if (uniq.length === 5 && rs[0] === 14 && rs[1] === 5) { straight = true; high = 5; }
  const cnt = {}; rs.forEach((r) => (cnt[r] = (cnt[r] || 0) + 1));
  const groups = Object.keys(cnt).map(Number).sort((a, b) => cnt[b] - cnt[a] || b - a);
  const shape = groups.map((g) => cnt[g]);
  let cat;
  if (straight && flush) cat = 8; else if (shape[0] === 4) cat = 7; else if (shape[0] === 3 && shape[1] === 2) cat = 6;
  else if (flush) cat = 5; else if (straight) cat = 4; else if (shape[0] === 3) cat = 3; else if (shape[0] === 2 && shape[1] === 2) cat = 2; else if (shape[0] === 2) cat = 1; else cat = 0;
  const tb = straight ? [high] : groups;
  return { cat, score: [cat].concat(tb), name: HAND_NAMES[cat] };
}
const cmpScore = (a, b) => { for (let i = 0; i < Math.max(a.length, b.length); i++) { const d = (a[i] || 0) - (b[i] || 0); if (d) return d; } return 0; };
const Poker = {
  id: "poker", name: "ポーカー", icon: "♠️", min: 2, max: 5, tag: "役づくり",
  desc: "5枚の手札を1回交換して役を作る。かけひきでチップを奪え！",
  rules: "5カードドローポーカーです。\n\n・参加料（10枚）を払って5枚配られます。\n・1回目の賭け：チェック（様子見）／ベット・レイズ（賭ける）／コール（同額にする）／フォールド（降りる）。\n・交換：いらないカードをえらんで交換（0〜5枚）。\n・2回目の賭けのあと、残った人で手札を見せ合い、いちばん強い役の人がチップを全部もらえます。\n\n役の強さ（弱→強）\nハイカード < ワンペア < ツーペア < スリーカード < ストレート < フラッシュ < フルハウス < フォーカード < ストレートフラッシュ\n\n決められた回数が終わったら、チップがいちばん多い人の勝ち！",
  opts: [{ key: "hands", label: "回数", choices: [[5, "5回"], [10, "10回"]], def: 5 }],
  setup(n, o) {
    const s = { n, chips: Array(n).fill(1000), hand: 0, hands: o.hands || 5, button: rnd(n), events: [] };
    this.newHand(s);
    return s;
  },
  alive(s, i) { return s.chips[i] > 0 || s.total && s.total[i] > 0; },
  newHand(s) {
    s.hand++;
    s.deck = shuffle(makeDeck());
    s.inHand = [...Array(s.n).keys()].map((i) => s.chips[i] > 0);
    s.cards = Array.from({ length: s.n }, () => []);
    s.folded = Array(s.n).fill(false); s.total = Array(s.n).fill(0); s.bets = Array(s.n).fill(0);
    s.drew = Array(s.n).fill(-1); s.show = null; s.win = null;
    s.button = nextSeat(s, s.button, (i) => s.inHand[i]);
    for (let i = 0; i < s.n; i++) if (s.inHand[i]) { const a = Math.min(10, s.chips[i]); s.chips[i] -= a; s.total[i] += a; }
    for (let k = 0; k < 5; k++) for (let i = 0; i < s.n; i++) if (s.inHand[i]) s.cards[i].push(s.deck.pop());
    s.cards.forEach((c) => c.sort(byRankSuit));
    this.startBetting(s, 1);
  },
  live(s) { return [...Array(s.n).keys()].filter((i) => s.inHand[i] && !s.folded[i]); },
  canAct(s, i) { return s.inHand[i] && !s.folded[i] && s.chips[i] > 0; },
  startBetting(s, r) {
    s.phase = "bet" + r; s.bets = Array(s.n).fill(0); s.acted = Array(s.n).fill(false); s.raises = 0; s.unit = r === 1 ? 20 : 40;
    s.turn = nextSeat(s, s.button, (i) => this.canAct(s, i));
    if (this.live(s).filter((i) => this.canAct(s, i)).length < 2 && this.maxBet(s) === 0) { s.turn = -1; this.endBetting(s); }
  },
  maxBet(s) { return Math.max(...s.bets); },
  toCall(s, i) { return Math.min(this.maxBet(s) - s.bets[i], s.chips[i]); },
  actors(s) { return s.over || s.wait ? [] : s.phase === "draw" ? [s.turn] : s.phase.startsWith("bet") && s.turn >= 0 ? [s.turn] : []; },
  valid(s, seat, m) {
    if (s.over || s.wait || seat !== s.turn) return false;
    if (s.phase === "draw") return m.t === "draw" && Array.isArray(m.idx) && m.idx.every((k) => k >= 0 && k < 5) && new Set(m.idx).size === m.idx.length;
    const tc = this.toCall(s, seat);
    if (m.t === "fold") return true;
    if (m.t === "check") return tc === 0;
    if (m.t === "call") return tc > 0;
    if (m.t === "raise") return s.raises < 3 && s.chips[seat] > tc;
    return false;
  },
  put(s, i, a) { a = Math.min(a, s.chips[i]); s.chips[i] -= a; s.bets[i] += a; s.total[i] += a; },
  apply(s, seat, m) {
    if (s.phase === "draw") {
      const keep = s.cards[seat].filter((_, k) => !m.idx.includes(k));
      while (keep.length < 5) keep.push(s.deck.pop());
      s.cards[seat] = keep.sort(byRankSuit); s.drew[seat] = m.idx.length;
      ev(s, seat, "toast", m.idx.length ? m.idx.length + "枚交換" : "交換なし");
      const nx = nextSeat(s, seat, (i) => this.live(s).includes(i) && s.drew[i] < 0);
      if (nx < 0 || s.drew[nx] >= 0) this.startBetting(s, 2); else s.turn = nx;
      return;
    }
    const tc = this.toCall(s, seat);
    if (m.t === "fold") { s.folded[seat] = true; ev(s, seat, "toast", "フォールド"); }
    else if (m.t === "check") ev(s, seat, "toast", "チェック");
    else if (m.t === "call") { this.put(s, seat, tc); ev(s, seat, "toast", s.chips[seat] === 0 ? "オールイン" : "コール"); }
    else if (m.t === "raise") {
      this.put(s, seat, tc + s.unit); s.raises++; s.acted = s.acted.map(() => false);
      ev(s, seat, "toast", (this.maxBet(s) === s.bets[seat] && tc === 0 && s.raises === 1 ? "ベット " : "レイズ ") + s.bets[seat]);
    }
    s.acted[seat] = true;
    const live = this.live(s);
    if (live.length === 1) return this.award(s, [live[0]]);
    const need = live.filter((i) => s.chips[i] > 0 && (!s.acted[i] || s.bets[i] < this.maxBet(s)));
    if (!need.length) return this.endBetting(s);
    s.turn = nextSeat(s, seat, (i) => need.includes(i));
  },
  endBetting(s) {
    if (s.phase === "bet1") {
      s.phase = "draw"; s.bets = Array(s.n).fill(0);
      s.turn = nextSeat(s, s.button, (i) => this.live(s).includes(i));
      return;
    }
    // ショーダウン
    const live = this.live(s);
    s.show = live;
    const evs = {}; live.forEach((i) => (evs[i] = pokerEval(s.cards[i])));
    s.handNames = {}; live.forEach((i) => (s.handNames[i] = evs[i].name));
    // サイドポットを含めて分配
    const levels = [...new Set(s.total.filter((t) => t > 0))].sort((a, b) => a - b);
    let prev = 0; const gains = Array(s.n).fill(0);
    for (const lv of levels) {
      const amount = s.total.reduce((a, t) => a + Math.max(0, Math.min(t, lv) - prev), 0);
      const elig = live.filter((i) => s.total[i] >= lv);
      if (elig.length) {
        let best = [elig[0]];
        for (const i of elig.slice(1)) { const c = cmpScore(evs[i].score, evs[best[0]].score); if (c > 0) best = [i]; else if (c === 0) best.push(i); }
        const share = Math.floor(amount / best.length);
        best.forEach((i, k) => (gains[i] += share + (k === 0 ? amount - share * best.length : 0)));
      } else { // 全員降りた分は直前の勝者へ
        gains[live[0]] += amount;
      }
      prev = lv;
    }
    this.finishHand(s, gains);
  },
  award(s, winners) {
    const pot = s.total.reduce((a, b) => a + b, 0), gains = Array(s.n).fill(0);
    gains[winners[0]] = pot; s.show = null;
    this.finishHand(s, gains);
  },
  finishHand(s, gains) {
    for (let i = 0; i < s.n; i++) s.chips[i] += gains[i];
    s.win = gains.map((g, i) => g - s.total[i]);
    s.pot = gains.reduce((a, b) => a + b, 0);
    const top = gains.indexOf(Math.max(...gains));
    ev(s, top, "say", "win");
    s.phase = "result"; s.turn = -1;
    const left = [...Array(s.n).keys()].filter((i) => s.chips[i] > 0).length;
    if (s.hand >= s.hands || left < 2) { s.over = true; return; }
    s.wait = { ms: 3800, then: "next" };
  },
  resolve(s, then) { if (then === "next") this.newHand(s); },
  cpu(s, seat, lv) {
    const hd = s.cards[seat], e = pokerEval(hd), tc = this.toCall(s, seat);
    if (s.phase === "draw") return { t: "draw", idx: this.cpuDiscard(hd, lv) };
    // 強さ 0〜1
    let st = [0.15, 0.4, 0.55, 0.7, 0.8, 0.85, 0.92, 0.97, 1][e.cat];
    if (e.cat === 1) st += (e.score[1] - 8) * 0.025;
    if (e.cat === 0) st += (e.score[1] - 10) * 0.02;
    if (s.phase === "bet1") { const d = this.cpuDiscard(hd, lv); if (d.length === 1 && e.cat < 2) st = Math.max(st, 0.38); }
    if (lv === 0) st += (Math.random() - 0.5) * 0.5;
    const r2 = s.phase === "bet2";
    const bluff = lv === 2 && r2 && tc === 0 && Math.random() < 0.06;
    const raiseAt = lv === 2 ? (r2 ? 0.66 : 0.6) : 0.62;
    if ((st > raiseAt || bluff) && s.raises < 3 && s.chips[seat] > tc && Math.random() < 0.85) return { t: "raise" };
    if (tc === 0) return { t: "check" };
    const pot = s.total.reduce((a, b) => a + b, 0), potOdds = tc / (pot + tc);
    if (lv === 2) {
      // つよい：相手のレイズ回数も見て慎重に
      const need = (r2 ? 0.42 : 0.33) + potOdds * 0.5 + s.raises * 0.05;
      return st > need ? { t: "call" } : { t: "fold" };
    }
    if (st > 0.35 + potOdds * 0.6 || (st > 0.3 && tc <= 20) || (lv === 0 && Math.random() < 0.25)) return { t: "call" };
    return { t: "fold" };
  },
  cpuDiscard(hd, lv) {
    const e = pokerEval(hd);
    if (e.cat >= 4 && e.cat !== 7) return [];
    const r = hd.map((c) => (rankOf(c) === 1 ? 14 : rankOf(c)));
    const cnt = {}; r.forEach((x) => (cnt[x] = (cnt[x] || 0) + 1));
    if (e.cat === 7 || e.cat === 3 || e.cat === 2 || e.cat === 1) return hd.map((_, k) => k).filter((k) => cnt[r[k]] === 1 && !(e.cat === 7));
    // 4枚フラッシュ／4枚ストレート狙い
    if (lv > 0) {
      for (let su = 0; su < 4; su++) { const idx = hd.map((c, k) => k).filter((k) => suitOf(hd[k]) === su); if (idx.length === 4) return hd.map((_, k) => k).filter((k) => !idx.includes(k)); }
      const sorted = hd.map((c, k) => ({ r: r[k], k })).sort((a, b) => a.r - b.r);
      for (let skip = 0; skip < 5; skip++) { const rest = sorted.filter((_, j) => j !== skip); if (new Set(rest.map((x) => x.r)).size === 4 && rest[3].r - rest[0].r === 3) return [sorted[skip].k]; }
    }
    // 高いカード2枚を残す
    const order = hd.map((c, k) => k).sort((a, b) => r[b] - r[a]);
    return order.slice(lv === 0 ? 1 : 2);
  },
  cpuDelay(s) { return 900 + rnd(800); },
  result(s) {
    const order = [...Array(s.n).keys()].sort((a, b) => s.chips[b] - s.chips[a]);
    let rank = 0;
    return order.map((seat, k) => { if (k > 0 && s.chips[seat] < s.chips[order[k - 1]]) rank = k; return { seat, rank, score: s.chips[seat] + "枚" }; });
  },
  render(s, T) {
    const me = T.me;
    T.opps((i) => ({
      count: s.chips[i] + "枚", turn: s.turn === i && !s.wait,
      badge: !s.inHand[i] ? "おやすみ" : s.folded[i] ? "降り" : s.win && s.win[i] > 0 ? "+" + s.win[i] : s.bets[i] ? "BET " + s.bets[i] : s.phase === "draw" && s.drew[i] >= 0 ? s.drew[i] + "枚交換" : null,
      gold: s.win && s.win[i] > 0,
      mini: s.show && s.show.includes(i) ? s.cards[i] : null,
      sub: s.show && s.show.includes(i) ? s.handNames[i] : null,
    }));
    const mid = T.mid(0.24, 0.5);
    const pot = s.total.reduce((a, b) => a + b, 0);
    mid.append(h("div", { class: "row", style: { justifyContent: "center" } }, h("span", { class: "chip" }, s.hand + "/" + s.hands + "回目"), h("span", { class: "chip" }, "ポット " + (s.phase === "result" ? s.pot : pot))));
    if (me < 0) return;
    const hd = s.cards[me], e = hd.length === 5 ? pokerEval(hd) : null;
    const sel = T.sel;
    for (const k of [...sel]) if (typeof k !== "number" || k > 4) sel.delete(k);
    let status = "", buttons = [];
    const my = s.turn === me && !s.wait;
    if (!s.inHand[me]) status = "チップがなくなりました（見学中）";
    else if (s.folded[me] && s.phase !== "result") status = "降りました。結果を待とう";
    else if (s.phase === "result") status = s.win[me] > 0 ? "勝ち！ +" + s.win[me] + "枚" : s.show ? "結果：" + s.show.map((i) => T.name(i) + " " + s.handNames[i]).join(" / ") : "このゲームは終わり";
    else if (s.phase === "draw") {
      status = my ? "交換するカードをえらんでね" : T.name(s.turn) + " が交換中…";
      if (my) buttons = [h("button", { class: "btn pink", onclick: () => { const idx = [...sel].map((x) => hd.indexOf(hd[x])); sel.clear(); T.act({ t: "draw", idx }); } }, sel.size ? sel.size + "枚交換" : "交換しない")];
    } else if (my) {
      const tc = this.toCall(s, me);
      status = tc ? "コールに " + tc + "枚必要" : "どうする？";
      buttons = [h("button", { class: "btn ghost", onclick: () => T.act({ t: "fold" }) }, "降りる")];
      buttons.push(tc ? h("button", { class: "btn mint", onclick: () => T.act({ t: "call" }) }, "コール") : h("button", { class: "btn mint", onclick: () => T.act({ t: "check" }) }, "チェック"));
      if (s.raises < 3 && s.chips[me] > tc) buttons.push(h("button", { class: "btn lemon", onclick: () => T.act({ t: "raise" }) }, (this.maxBet(s) ? "レイズ +" : "ベット ") + s.unit));
    } else status = s.turn >= 0 ? T.name(s.turn) + " の番" : "";
    const view = hd.map((c, k) => k);
    T.myArea(hd, {
      info: T.meInfo("チップ " + s.chips[me] + "枚" + (e ? "　" + e.name : ""), my),
      status, buttons, keepOrder: true, cw: 62,
      selected: new Set([...sel].map((k) => hd[k])),
      onTap: s.phase === "draw" && my ? (c) => { const k = hd.indexOf(c); if (sel.has(k)) sel.delete(k); else sel.add(k); Snd.tick(); T.redraw(); } : null,
    });
  },
};

const MULTI_GAMES = [Daifugo, BabaNuki, Sevens, Speed, Doubt, Memory, Blackjack, Poker, JijiNuki];
const ALL_GAMES = {};
SOLO_GAMES.concat(MULTI_GAMES).forEach((g) => (ALL_GAMES[g.id] = g));
