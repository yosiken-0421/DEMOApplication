"use strict";
/* ===== カードのカジノゲーム：ブラックジャック・バカラ・ドラゴンタイガー・スリーカードポーカー ===== */

/* 6デッキのシュー（残りが少なくなったら混ぜ直す） */
function shoeDraw(s) {
  if (!s.shoe || s.shoe.length < 20) { if (s.shoe) ev(s, -1, "toast", "カードを混ぜ直しました"); s.shoe = shuffle([].concat(makeDeck(), makeDeck(), makeDeck(), makeDeck(), makeDeck(), makeDeck())); }
  return s.shoe.pop();
}
/* カードを横に並べる（新しいカードだけ登場アニメ） */
function cardRow(T, key, cards, o) {
  o = o || {};
  const row = h("div", { class: "crow" + (o.cls ? " " + o.cls : "") });
  setCardSize(row, o.cw || 44);
  const seenKey = "seen_" + key, seen = T.ui[seenKey] || 0;
  cards.forEach((c, k) => {
    const e = cardEl(c, { static: true, down: o.down ? o.down(k) : false });
    if (k >= seen && !o.noAnim) e.classList.add("enter");
    row.append(e);
  });
  T.ui[seenKey] = cards.length;
  if (!cards.length && o.empty !== false) row.append(h("div", { class: "card static ghostcard" }));
  return row;
}

/* ---------------- ブラックジャック ---------------- */
function bjTotal(cards) {
  let t = 0, a = 0;
  for (const c of cards) { const r = rankOf(c); if (r === 1) { a++; t += 11; } else t += Math.min(10, r); }
  while (t > 21 && a) { t -= 10; a--; }
  return { t, soft: a > 0 };
}
const bjVal = (c) => Math.min(10, rankOf(c));
const Blackjack = {
  id: "blackjack", name: "ブラックジャック", icon: "🃏", min: 1, max: 5, tag: "定番",
  desc: "ディーラーより21に近づけたら勝ち！ヒット・スタンド・ダブル・スプリット",
  rules: "カジノでいちばん人気のカードゲームです。みんなそれぞれディーラーと勝負します。\n\n・はじめにチップを賭けます。\n・2枚ずつ配られます。カードの数字を足して21に近づけます（J・Q・Kは10、Aは1か11の都合のいい方）。\n・ヒット：もう1枚もらう／スタンド：止める\n・ダブル：賭けを2倍にして、あと1枚だけもらう（最初の2枚のとき）\n・スプリット：同じ数字の2枚を2つの手に分ける（賭けも同じ額を追加）\n・21を超えたらバースト（負け）。\n・ディーラーは17以上になるまで引きます。\n・最初の2枚で21（A＋10点のカード）はブラックジャック！1.5倍もらえます。\n\n払い戻し：勝ち 1倍／ブラックジャック 1.5倍／引き分けは戻し\n決められたラウンドが終わったとき、チップが一番多い人の勝ち！",
  opts: House.opts(),
  sound: "card",
  setup(n, o) { return House.setup(n, o, { dealer: [], hole: true, hands: Array(n).fill(null), turn: null }); },
  newRound(s) { s.dealer = []; s.hole = true; s.hands = Array(s.n).fill(null); s.turn = null; },
  actors(s) {
    if (s.over || s.wait) return [];
    if (s.phase === "bet") return House.betActors(s);
    if (s.phase === "play" && s.turn) return [s.turn.seat];
    return [];
  },
  committed(s, i) { return (s.hands[i] || []).reduce((a, hd) => a + hd.bet, 0); },
  valid(s, seat, m) {
    if (s.phase === "bet") return House.validBet(s, seat, m, (sp) => sp === "main");
    if (s.phase !== "play" || !s.turn || s.turn.seat !== seat) return false;
    const hd = s.hands[seat][s.turn.h];
    const free = s.chips[seat] - this.committed(s, seat);
    if (m.t === "hit" || m.t === "stand") return true;
    if (m.t === "double") return hd.cards.length === 2 && free >= hd.bet;
    if (m.t === "split") return hd.cards.length === 2 && s.hands[seat].length === 1 && bjVal(hd.cards[0]) === bjVal(hd.cards[1]) && free >= hd.bet;
    return false;
  },
  apply(s, seat, m) {
    if (s.phase === "bet") { if (House.applyBet(s, seat, m)) s.wait = { ms: 350, then: "deal" }; return; }
    const hd = s.hands[seat][s.turn.h];
    if (m.t === "hit") { hd.cards.push(shoeDraw(s)); ev(s, -1, "snd", "card"); }
    else if (m.t === "stand") hd.done = true;
    else if (m.t === "double") { hd.bet *= 2; hd.dbl = true; hd.cards.push(shoeDraw(s)); hd.done = true; ev(s, seat, "toast", "ダブル！"); }
    else if (m.t === "split") {
      const c2 = hd.cards.pop();
      const nh = { cards: [c2], bet: hd.bet, done: false, split: true };
      hd.split = true;
      hd.cards.push(shoeDraw(s)); nh.cards.push(shoeDraw(s));
      s.hands[seat].push(nh);
      if (rankOf(c2) === 1) { hd.done = true; nh.done = true; }   // Aのスプリットは1枚ずつ
      ev(s, seat, "toast", "スプリット！");
    }
    const t = bjTotal(hd.cards).t;
    if (t > 21) { hd.done = true; hd.bust = true; ev(s, seat, "say", "bad"); }
    else if (t === 21) hd.done = true;
    for (const x of s.hands[seat]) { const tt = bjTotal(x.cards).t; if (tt >= 21) x.done = true; if (tt > 21) x.bust = true; }
    this.advance(s);
  },
  /* 次に操作する手をさがす */
  advance(s) {
    for (let i = 0; i < s.n; i++) {
      const hs = s.hands[i]; if (!hs) continue;
      for (let k = 0; k < hs.length; k++) if (!hs[k].done) { s.turn = { seat: i, h: k }; return; }
    }
    s.turn = null; s.phase = "dealer";
    s.wait = { ms: 700, then: "dealer" };
  },
  resolve(s, then) {
    if (then === "next") return House.next(s, this);
    if (then === "deal") {
      s.phase = "play";
      for (let i = 0; i < s.n; i++) if (House.inPlay(s, i)) s.hands[i] = [{ cards: [], bet: s.bets[i].main, done: false }];
      for (let r = 0; r < 2; r++) { for (let i = 0; i < s.n; i++) if (s.hands[i]) s.hands[i][0].cards.push(shoeDraw(s)); s.dealer.push(shoeDraw(s)); }
      ev(s, -1, "snd", "card");
      if (!s.hands.some(Boolean)) { s.hole = false; return this.settle(s); }
      // ディーラーのブラックジャック確認
      const up = s.dealer[0];
      if ((rankOf(up) === 1 || bjVal(up) === 10) && bjTotal(s.dealer).t === 21) {
        s.hole = false; ev(s, -1, "big", "ディーラーBJ…");
        return this.settle(s);
      }
      for (let i = 0; i < s.n; i++) if (s.hands[i]) { const hd = s.hands[i][0]; if (bjTotal(hd.cards).t === 21) { hd.done = true; hd.bj = true; ev(s, i, "toast", "ブラックジャック！"); } }
      return this.advance(s);
    }
    if (then === "dealer") {
      if (s.hole) { s.hole = false; ev(s, -1, "snd", "card"); }
      const anyLive = s.hands.some((hs) => hs && hs.some((x) => !x.bust && !x.bj));
      const t = bjTotal(s.dealer).t;
      if (anyLive && t < 17) { s.dealer.push(shoeDraw(s)); ev(s, -1, "snd", "card"); s.wait = { ms: 650, then: "dealer" }; return; }
      return this.settle(s);
    }
  },
  settle(s) {
    const d = bjTotal(s.dealer).t, dbj = d === 21 && s.dealer.length === 2;
    const nets = Array(s.n).fill(null);
    for (let i = 0; i < s.n; i++) {
      const hs = s.hands[i]; if (!hs) continue;
      let net = 0;
      for (const hd of hs) {
        const t = bjTotal(hd.cards).t;
        if (hd.bust) hd.res = "lose", net -= hd.bet;
        else if (hd.bj && !dbj) hd.res = "bj", net += Math.floor(hd.bet * 1.5);
        else if (dbj && !hd.bj) hd.res = "lose", net -= hd.bet;
        else if (d > 21 || t > d) hd.res = "win", net += hd.bet;
        else if (t < d) hd.res = "lose", net -= hd.bet;
        else hd.res = "push";
      }
      nets[i] = net;
    }
    if (d > 21) ev(s, -1, "big", "ディーラーバースト！");
    House.settle(s, nets, 3000);
  },
  /* CPU：ベーシックストラテジー（やさしいはテキトー） */
  cpu(s, seat, lv) {
    if (s.phase === "bet") return House.cpuBet(s, seat, () => [{ spot: "main", amt: House.cpuStake(s, seat, lv) }]);
    const hd = s.hands[seat][s.turn.h], { t, soft } = bjTotal(hd.cards), up = bjVal(s.dealer[0]) === 1 ? 11 : bjVal(s.dealer[0]);
    const can = (mv) => this.valid(s, seat, mv);
    if (lv === 0) return t < 13 + rnd(4) ? { t: "hit" } : { t: "stand" };
    if (can({ t: "split" })) { const v = bjVal(hd.cards[0]); if (v === 1 || v === 8 || (lv === 2 && (v === 9 && up !== 7 && up < 10 || (v === 2 || v === 3 || v === 7) && up <= 7 || v === 6 && up <= 6))) return { t: "split" }; }
    const dbl = can({ t: "double" });
    if (soft) {
      if (t >= 19) return { t: "stand" };
      if (t === 18) return up >= 9 ? { t: "hit" } : dbl && lv === 2 && up >= 3 && up <= 6 ? { t: "double" } : { t: "stand" };
      if (dbl && lv === 2 && up >= 4 && up <= 6) return { t: "double" };
      return { t: "hit" };
    }
    if (t >= 17) return { t: "stand" };
    if (t >= 13) return up <= 6 ? { t: "stand" } : { t: "hit" };
    if (t === 12) return up >= 4 && up <= 6 ? { t: "stand" } : { t: "hit" };
    if (t === 11 && dbl) return { t: "double" };
    if (t === 10 && dbl && up <= 9) return { t: "double" };
    if (t === 9 && dbl && lv === 2 && up >= 3 && up <= 6) return { t: "double" };
    return { t: "hit" };
  },
  cpuDelay(s) { return s.phase === "bet" ? 500 + rnd(700) : 650 + rnd(400); },
  result(s) { return House.result(s); },
  render(s, T) {
    House.players(s, T, { turn: (i) => s.turn && s.turn.seat === i });
    const mid = T.mid();
    const tb = h("div", { class: "felt bj" });
    mid.append(tb);
    // ディーラー
    const dt = s.dealer.length ? (s.hole ? bjTotal([s.dealer[0]]).t : bjTotal(s.dealer).t) : null;
    tb.append(h("div", { class: "dealer" }, h("div", { class: "dl" }, "ディーラー" + (dt != null ? "：" + (s.hole ? dt + " ＋？" : dt > 21 ? dt + " バースト" : dt) : "")),
      cardRow(T, "d", s.dealer, { down: (k) => k === 1 && s.hole, cw: 48 })));
    tb.append(h("div", { class: "felt-text" }, "ブラックジャックは 3 : 2　ディーラーは17で止まる"));
    if (s.phase === "bet") {
      tb.append(h("div", { class: "spot-row" }, House.spot(s, T, "main", { label: "BET", cls: "circle big" })));
    } else {
      const seats = h("div", { class: "bj-seats n" + s.n });
      for (let i = 0; i < s.n; i++) {
        const hs = s.hands[i];
        const box = h("div", { class: "bj-seat" + (i === T.me ? " me" : "") + (s.turn && s.turn.seat === i ? " turn" : "") });
        box.append(h("div", { class: "bj-nm" }, h("img", { src: CHARS[T.charOf(i)].img }), T.name(i)));
        if (!hs) box.append(h("div", { class: "note" }, s.out[i] ? "見学" : "見送り"));
        else hs.forEach((hd, k) => {
          const tt = bjTotal(hd.cards);
          const lab = hd.bj ? "BJ!" : hd.bust ? tt.t + " バースト" : (tt.soft && tt.t < 21 ? "ソフト" : "") + tt.t;
          const res = hd.res ? { win: "勝ち", bj: "BJ勝ち", lose: "負け", push: "引分" }[hd.res] : "";
          box.append(h("div", { class: "bj-hand" + (s.turn && s.turn.seat === i && s.turn.h === k ? " cur" : "") + (hd.res ? " r-" + hd.res : "") },
            cardRow(T, "p" + i + "_" + k, hd.cards, { cw: i === T.me ? 40 : s.n >= 4 ? 28 : 34 }),
            h("div", { class: "bj-tot" }, lab, h("span", { class: "bj-bet" }, "🪙" + fmtN(hd.bet) + (hd.dbl ? "×2" : "")), res ? h("b", null, res) : null)));
        });
        seats.append(box);
      }
      tb.append(seats);
    }
    // 下
    const my = T.myTurn && s.phase === "play" && s.turn && s.turn.seat === T.me;
    if (my) {
      const hd = s.hands[T.me][s.turn.h], t = bjTotal(hd.cards);
      House.bottom(s, T, {
        status: "あなたの番：" + (t.soft && t.t < 21 ? "ソフト" : "") + t.t + (s.hands[T.me].length > 1 ? "（" + (s.turn.h + 1) + "つ目の手）" : ""), hot: true,
        buttons: [
          h("button", { class: "btn mint", onclick: () => T.act({ t: "hit" }) }, "ヒット"),
          h("button", { class: "btn pink", onclick: () => T.act({ t: "stand" }) }, "スタンド"),
          this.valid(s, T.me, { t: "double" }) ? h("button", { class: "btn lemon", onclick: () => T.act({ t: "double" }) }, "ダブル") : null,
          this.valid(s, T.me, { t: "split" }) ? h("button", { class: "btn sky", onclick: () => T.act({ t: "split" }) }, "スプリット") : null,
        ],
      });
    } else House.bottom(s, T, { status: s.phase === "play" && s.turn ? T.turnText(s.turn.seat) : s.phase === "dealer" ? "ディーラーがカードを引いています…" : null });
  },
};

/* ---------------- バカラ ---------------- */
const bacVal = (c) => { const r = rankOf(c); return r >= 10 ? 0 : r; };
const bacTotal = (cs) => cs.reduce((a, c) => a + bacVal(c), 0) % 10;
const Baccarat = {
  id: "baccarat", name: "バカラ", icon: "👑", min: 1, max: 5, tag: "定番",
  desc: "プレイヤーとバンカー、9に近いのはどっち？予想して賭けるだけのかんたんゲーム",
  rules: "「プレイヤー」と「バンカー」のどちらが勝つかを予想して賭けます。\n\n・カードの点数：A=1、2〜9はそのまま、10・J・Q・K=0。合計の下1けたが点数（例：7＋8=15→5点）。\n・9に近い方が勝ち。\n・3枚目を引くかどうかは決まったルールで自動で決まります。\n\n払い戻し\n・プレイヤー：1倍\n・バンカー：0.95倍（5%の手数料）\n・タイ（引き分け）：8倍（このときプレイヤー/バンカーへの賭けは戻ってきます）\n・Pペア／Bペア：最初の2枚が同じ数字なら11倍\n\n決められたラウンドが終わったとき、チップが一番多い人の勝ち！",
  opts: House.opts(),
  sound: "card",
  SPOTS: ["player", "banker", "tie", "ppair", "bpair"],
  setup(n, o) { return House.setup(n, o, { p: [], b: [], shown: 0, order: [], hist: [] }); },
  newRound(s) { s.p = []; s.b = []; s.shown = 0; s.order = []; s.win = null; },
  actors(s) { return s.over || s.wait ? [] : House.betActors(s); },
  valid(s, seat, m) { return House.validBet(s, seat, m, spotIn(this.SPOTS)); },
  apply(s, seat, m) { if (House.applyBet(s, seat, m)) s.wait = { ms: 350, then: "deal" }; },
  resolve(s, then) {
    if (then === "next") return House.next(s, this);
    if (then === "deal") {
      s.phase = "deal";
      const p = [shoeDraw(s)], b = [shoeDraw(s)]; p.push(shoeDraw(s)); b.push(shoeDraw(s));
      s.order = ["p", "b", "p", "b"];
      const pt = bacTotal(p), bt = bacTotal(b);
      if (pt < 8 && bt < 8) {
        let p3 = null;
        if (pt <= 5) { p3 = shoeDraw(s); p.push(p3); s.order.push("p"); }
        const v = p3 == null ? null : bacVal(p3);
        let draw;
        if (v == null) draw = bt <= 5;
        else draw = bt <= 2 || (bt === 3 && v !== 8) || (bt === 4 && v >= 2 && v <= 7) || (bt === 5 && v >= 4 && v <= 7) || (bt === 6 && (v === 6 || v === 7));
        if (draw) { b.push(shoeDraw(s)); s.order.push("b"); }
      }
      s.full = { p, b }; s.p = []; s.b = []; s.shown = 0;
      s.wait = { ms: 500, then: "reveal" };
      return;
    }
    if (then === "reveal") {
      const side = s.order[s.shown];
      if (side) { const arr = s.full[side], cur = s[side]; cur.push(arr[cur.length]); s.shown++; ev(s, -1, "snd", "card"); s.wait = { ms: s.shown >= 4 ? 900 : 550, then: "reveal" }; return; }
      const pt = bacTotal(s.p), bt = bacTotal(s.b);
      const w = pt > bt ? "player" : bt > pt ? "banker" : "tie";
      s.win = w;
      s.hist = s.hist.concat([w[0]]).slice(-24);
      ev(s, -1, "big", { player: "プレイヤーの勝ち", banker: "バンカーの勝ち", tie: "タイ！" }[w]);
      const pp = rankOf(s.p[0]) === rankOf(s.p[1]), bp = rankOf(s.b[0]) === rankOf(s.b[1]);
      s.pairs = { ppair: pp, bpair: bp };
      const nets = Array(s.n).fill(null);
      for (let i = 0; i < s.n; i++) {
        if (!House.inPlay(s, i)) continue;
        const bt2 = s.bets[i]; let net = 0;
        if (bt2.player) net += w === "player" ? bt2.player : w === "tie" ? 0 : -bt2.player;
        if (bt2.banker) net += w === "banker" ? Math.floor(bt2.banker * 0.95) : w === "tie" ? 0 : -bt2.banker;
        if (bt2.tie) net += w === "tie" ? bt2.tie * 8 : -bt2.tie;
        if (bt2.ppair) net += pp ? bt2.ppair * 11 : -bt2.ppair;
        if (bt2.bpair) net += bp ? bt2.bpair * 11 : -bt2.bpair;
        nets[i] = net;
      }
      House.settle(s, nets, 3000);
    }
  },
  cpu(s, seat, lv) {
    return House.cpuBet(s, seat, () => {
      const a = House.cpuStake(s, seat, lv), r = Math.random();
      const main = lv === 2 ? (r < 0.6 ? "banker" : "player") : r < 0.48 ? "banker" : r < 0.92 ? "player" : "tie";
      const list = [{ spot: main, amt: main === "tie" ? Math.max(10, Math.round(a / 30) * 10) : a }];
      if (lv === 0 && rnd(4) === 0) list.push({ spot: pick(["ppair", "bpair"]), amt: 10 });
      return list;
    });
  },
  cpuDelay() { return 500 + rnd(900); },
  result(s) { return House.result(s); },
  render(s, T) {
    House.players(s, T);
    const mid = T.mid();
    const tb = h("div", { class: "felt bac" });
    mid.append(tb);
    const pt = s.p.length ? bacTotal(s.p) : "", bt = s.b.length ? bacTotal(s.b) : "";
    tb.append(h("div", { class: "bac-hands" },
      h("div", { class: "bac-side p" + (s.win === "player" ? " won" : "") }, h("div", { class: "bl" }, "プレイヤー ", h("b", null, pt)), cardRow(T, "bp", s.p, { cw: 44 })),
      h("div", { class: "bac-side b" + (s.win === "banker" ? " won" : "") }, h("div", { class: "bl" }, "バンカー ", h("b", null, bt)), cardRow(T, "bb", s.b, { cw: 44 }))));
    const res = s.phase === "result";
    const W = (sp) => res && (s.win === sp || (s.pairs && s.pairs[sp]));
    const L = (sp) => res && !W(sp) && !(s.win === "tie" && (sp === "player" || sp === "banker"));
    tb.append(h("div", { class: "spot-grid bac-spots" },
      House.spot(s, T, "ppair", { label: "Pペア", sub: "11倍", cls: "sm blue", win: W("ppair"), lose: L("ppair") }),
      House.spot(s, T, "tie", { label: "タイ", sub: "8倍", cls: "sm green", win: W("tie"), lose: L("tie") }),
      House.spot(s, T, "bpair", { label: "Bペア", sub: "11倍", cls: "sm red", win: W("bpair"), lose: L("bpair") }),
      House.spot(s, T, "player", { label: "プレイヤー", sub: "1倍", cls: "wide blue", win: W("player"), lose: L("player") }),
      House.spot(s, T, "banker", { label: "バンカー", sub: "0.95倍", cls: "wide red", win: W("banker"), lose: L("banker") })));
    tb.append(h("div", { class: "road" }, s.hist.map((x) => h("i", { class: "r" + x }, x === "p" ? "P" : x === "b" ? "B" : "T"))));
    House.bottom(s, T, { status: s.phase === "deal" ? "カードをめくっています…" : null });
  },
};

/* ---------------- ドラゴンタイガー ---------------- */
const DragonTiger = {
  id: "dragontiger", name: "ドラゴンタイガー", icon: "🐉", min: 1, max: 5, tag: "かんたん",
  desc: "1枚ずつ配って大きい方が勝ち。いちばんシンプルなカードの勝負",
  rules: "「ドラゴン」と「タイガー」に1枚ずつカードを配り、数字が大きい方が勝ちです。\n\n・強さ：A（いちばん弱い）＜2＜…＜10＜J＜Q＜K（いちばん強い）。マークは関係ありません。\n・ドラゴン／タイガー：当たれば1倍\n・タイ（同じ数字）：8倍\n・タイになったとき、ドラゴン／タイガーへの賭けは半分が戻ってきます。\n\n決められたラウンドが終わったとき、チップが一番多い人の勝ち！",
  opts: House.opts(),
  sound: "card",
  setup(n, o) { return House.setup(n, o, { d: null, t: null, hist: [] }); },
  newRound(s) { s.d = null; s.t = null; s.win = null; },
  actors(s) { return s.over || s.wait ? [] : House.betActors(s); },
  valid(s, seat, m) { return House.validBet(s, seat, m, spotIn(["dragon", "tiger", "tie"])); },
  apply(s, seat, m) { if (House.applyBet(s, seat, m)) s.wait = { ms: 350, then: "d" }; },
  resolve(s, then) {
    if (then === "next") return House.next(s, this);
    if (then === "d") { s.phase = "deal"; s.d = shoeDraw(s); ev(s, -1, "snd", "card"); s.wait = { ms: 700, then: "t" }; return; }
    if (then === "t") { s.t = shoeDraw(s); ev(s, -1, "snd", "card"); s.wait = { ms: 700, then: "pay" }; return; }
    if (then === "pay") {
      const a = rankOf(s.d), b = rankOf(s.t), w = a > b ? "dragon" : b > a ? "tiger" : "tie";
      s.win = w; s.hist = s.hist.concat([w[0]]).slice(-24);
      ev(s, -1, "big", { dragon: "ドラゴン！", tiger: "タイガー！", tie: "タイ！" }[w]);
      const nets = Array(s.n).fill(null);
      for (let i = 0; i < s.n; i++) {
        if (!House.inPlay(s, i)) continue;
        const bt = s.bets[i]; let net = 0;
        for (const k of ["dragon", "tiger"]) if (bt[k]) net += w === k ? bt[k] : w === "tie" ? -Math.floor(bt[k] / 2) : -bt[k];
        if (bt.tie) net += w === "tie" ? bt.tie * 8 : -bt.tie;
        nets[i] = net;
      }
      House.settle(s, nets, 2400);
    }
  },
  cpu(s, seat, lv) {
    return House.cpuBet(s, seat, () => {
      const a = House.cpuStake(s, seat, lv);
      const l = [{ spot: rnd(2) ? "dragon" : "tiger", amt: a }];
      if (lv === 0 && rnd(5) === 0) l.push({ spot: "tie", amt: 10 });
      return l;
    });
  },
  cpuDelay() { return 400 + rnd(800); },
  result(s) { return House.result(s); },
  render(s, T) {
    House.players(s, T);
    const mid = T.mid();
    const tb = h("div", { class: "felt dt" });
    mid.append(tb);
    const slot = (c, key) => { const r = h("div", { class: "crow" }); setCardSize(r, 70); if (c != null) { const e = cardEl(c, { static: true }); if (!T.ui[key]) e.classList.add("enter"); T.ui[key] = 1; r.append(e); } else { T.ui[key] = 0; r.append(h("div", { class: "card static ghostcard" })); } return r; };
    const res = s.phase === "result";
    tb.append(h("div", { class: "dt-cards" },
      h("div", { class: "dt-side" + (s.win === "dragon" ? " won" : "") }, h("div", { class: "bl" }, "🐉 ドラゴン"), slot(s.d, "dc")),
      h("div", { class: "dt-vs" }, "VS"),
      h("div", { class: "dt-side" + (s.win === "tiger" ? " won" : "") }, h("div", { class: "bl" }, "🐯 タイガー"), slot(s.t, "tc"))));
    tb.append(h("div", { class: "spot-grid three" },
      House.spot(s, T, "dragon", { label: "ドラゴン", sub: "1倍", cls: "tall red", win: res && s.win === "dragon", lose: res && s.win === "tiger" }),
      House.spot(s, T, "tie", { label: "タイ", sub: "8倍", cls: "tall green", win: res && s.win === "tie", lose: res && s.win !== "tie" }),
      House.spot(s, T, "tiger", { label: "タイガー", sub: "1倍", cls: "tall blue", win: res && s.win === "tiger", lose: res && s.win === "dragon" })));
    tb.append(h("div", { class: "road" }, s.hist.map((x) => h("i", { class: "r" + (x === "d" ? "b" : x === "t" ? "p" : "t") }, x === "d" ? "龍" : x === "t" ? "虎" : "T"))));
    House.bottom(s, T, { status: s.phase === "deal" ? "カードをめくっています…" : null });
  },
};

/* ---------------- スリーカードポーカー ---------------- */
const TCP_NAMES = ["ハイカード", "ワンペア", "フラッシュ", "ストレート", "スリーカード", "ストレートフラッシュ"];
function tcpEval(cs) {
  const r = cs.map((c) => (rankOf(c) === 1 ? 14 : rankOf(c))).sort((a, b) => b - a);
  const flush = suitOf(cs[0]) === suitOf(cs[1]) && suitOf(cs[1]) === suitOf(cs[2]);
  let straight = r[0] - r[1] === 1 && r[1] - r[2] === 1, top = r[0];
  if (r[0] === 14 && r[1] === 3 && r[2] === 2) { straight = true; top = 3; }
  const trips = r[0] === r[2], pair = !trips && (r[0] === r[1] || r[1] === r[2]);
  let cat = 0, tb = r;
  if (straight && flush) { cat = 5; tb = [top]; }
  else if (trips) cat = 4;
  else if (straight) { cat = 3; tb = [top]; }
  else if (flush) cat = 2;
  else if (pair) { cat = 1; const p = r[1], k = r[0] === r[1] ? r[2] : r[0]; tb = [p, k]; }
  return { cat, score: [cat].concat(tb), name: TCP_NAMES[cat] };
}
const ThreeCard = {
  id: "threecard", name: "スリーカードポーカー", icon: "🎴", min: 1, max: 5, tag: "ポーカー",
  desc: "3枚のポーカーでディーラーと勝負。勝負するか降りるかを決めよう",
  rules: "3枚のカードでディーラーとポーカーの役を比べます。\n\n1) アンティ（勝負用）とペアプラス（役ボーナス用）に賭けます。どちらか片方でもOK。\n2) 3枚配られたら、勝負する（アンティと同じ額を追加）か、降りる（アンティを失う）かを決めます。\n3) ディーラーがQ（クイーン）以上の手でないときは「不成立」：アンティが1倍で勝ち、追加分は戻ってきます。\n4) 成立したら役を比べて、勝てばアンティと追加分の両方が1倍で勝ち。\n\n役（強い順）：ストレートフラッシュ＞スリーカード＞ストレート＞フラッシュ＞ワンペア＞ハイカード\n\nアンティボーナス（勝負したら勝ち負けに関係なく）：ストレート1倍／スリーカード4倍／ストレートフラッシュ5倍\nペアプラス：ワンペア1倍／フラッシュ3倍／ストレート6倍／スリーカード30倍／ストレートフラッシュ40倍",
  opts: House.opts(),
  sound: "card",
  setup(n, o) { return House.setup(n, o, { cards: Array(n).fill(null), dealer: [], dshow: false, dec: Array(n).fill(null) }); },
  newRound(s) { s.cards = Array(s.n).fill(null); s.dealer = []; s.dshow = false; s.dec = Array(s.n).fill(null); s.res = null; },
  actors(s) {
    if (s.over || s.wait) return [];
    if (s.phase === "bet") return House.betActors(s);
    if (s.phase === "decide") return [...Array(s.n).keys()].filter((i) => s.cards[i] && s.dec[i] == null);
    return [];
  },
  valid(s, seat, m) {
    if (s.phase === "bet") return House.validBet(s, seat, m, spotIn(["ante", "pp"]));
    if (s.phase !== "decide" || !s.cards[seat] || s.dec[seat] != null) return false;
    if (m.t === "fold") return true;
    if (m.t === "play") return House.avail(s, seat) >= (s.bets[seat].ante || 0);
    return false;
  },
  apply(s, seat, m) {
    if (s.phase === "bet") { if (House.applyBet(s, seat, m)) s.wait = { ms: 350, then: "deal" }; return; }
    s.dec[seat] = m.t;
    if (m.t === "play") { s.bets[seat].play = s.bets[seat].ante; ev(s, seat, "toast", "勝負！"); ev(s, -1, "snd", "chip"); }
    else ev(s, seat, "toast", "降りる");
    if (!this.actors(s).length) { s.phase = "show"; s.wait = { ms: 600, then: "show" }; }
  },
  resolve(s, then) {
    if (then === "next") return House.next(s, this);
    if (then === "deal") {
      s.deck = shuffle(makeDeck());
      s.dealer = [s.deck.pop(), s.deck.pop(), s.deck.pop()];
      for (let i = 0; i < s.n; i++) if (House.inPlay(s, i)) { s.cards[i] = [s.deck.pop(), s.deck.pop(), s.deck.pop()]; if (!s.bets[i].ante) s.dec[i] = "none"; }
      ev(s, -1, "snd", "card");
      s.phase = "decide";
      if (!this.actors(s).length) { s.phase = "show"; s.wait = { ms: 700, then: "show" }; }
      return;
    }
    if (then === "show") {
      s.dshow = true; ev(s, -1, "snd", "card");
      const de = tcpEval(s.dealer);
      const qual = de.cat >= 1 || de.score[1] >= 12;
      s.res = { dname: de.name, qual };
      ev(s, -1, "big", qual ? "ディーラー " + de.name : "ディーラー不成立");
      const nets = Array(s.n).fill(null);
      s.pr = Array(s.n).fill(null);
      for (let i = 0; i < s.n; i++) {
        if (!s.cards[i]) continue;
        const b = s.bets[i], e = tcpEval(s.cards[i]);
        let net = 0, note = e.name;
        if (b.pp) { const mul = [0, 1, 3, 6, 30, 40][e.cat]; net += mul ? b.pp * mul : -b.pp; }
        if (b.ante) {
          if (s.dec[i] === "fold") { net -= b.ante; note += "・降り"; }
          else {
            const bonus = [0, 0, 0, 1, 4, 5][e.cat]; net += b.ante * bonus;
            if (!qual) { net += b.ante; note += "・不成立で勝ち"; }
            else { const c = cmpScore(e.score, de.score); if (c > 0) { net += b.ante + b.play; note += "・勝ち"; } else if (c < 0) { net -= b.ante + b.play; note += "・負け"; } else note += "・引分"; }
          }
        }
        nets[i] = net; s.pr[i] = note;
      }
      House.settle(s, nets, 3400);
    }
  },
  cpu(s, seat, lv) {
    if (s.phase === "bet") return House.cpuBet(s, seat, () => {
      const a = House.cpuStake(s, seat, lv, lv === 0 ? null : 0.03 + Math.random() * 0.03);
      const l = [{ spot: "ante", amt: a }];
      if (rnd(lv === 2 ? 4 : 2) === 0) l.push({ spot: "pp", amt: Math.max(10, Math.round(a / 20) * 10) });
      return l;
    });
    const e = tcpEval(s.cards[seat]);
    if (!this.valid(s, seat, { t: "play" })) return { t: "fold" };
    if (lv === 0) return e.cat >= 1 || e.score[1] >= 11 || rnd(3) === 0 ? { t: "play" } : { t: "fold" };
    // Q-6-4 以上で勝負（基本戦略）
    const r = e.score.slice(1);
    const ok = e.cat >= 1 || r[0] > 12 || (r[0] === 12 && (r[1] > 6 || (r[1] === 6 && r[2] >= 4)));
    return ok && this.valid(s, seat, { t: "play" }) ? { t: "play" } : { t: "fold" };
  },
  cpuDelay(s) { return s.phase === "bet" ? 500 + rnd(800) : 800 + rnd(600); },
  result(s) { return House.result(s); },
  render(s, T) {
    House.players(s, T, { turn: (i) => s.phase === "decide" && s.cards[i] && s.dec[i] == null, badge: (i) => s.phase === "decide" && s.dec[i] ? { play: "勝負", fold: "降り", none: "" }[s.dec[i]] || null : null });
    const mid = T.mid();
    const tb = h("div", { class: "felt tcp" });
    mid.append(tb);
    const de = s.dshow ? tcpEval(s.dealer) : null;
    tb.append(h("div", { class: "dealer" }, h("div", { class: "dl" }, "ディーラー" + (de ? "：" + de.name + (s.res && !s.res.qual ? "（不成立）" : "") : "")),
      cardRow(T, "d", s.dealer, { down: () => !s.dshow, cw: 46 })));
    if (s.phase === "bet") {
      tb.append(h("div", { class: "felt-text" }, "ディーラーはQ以上で成立"));
      tb.append(h("div", { class: "spot-row" },
        House.spot(s, T, "pp", { label: "ペアプラス", sub: "役で最大40倍", cls: "circle" }),
        House.spot(s, T, "ante", { label: "アンティ", sub: "勝負", cls: "circle big" })));
    } else {
      const seats = h("div", { class: "bj-seats n" + s.n });
      for (let i = 0; i < s.n; i++) {
        const cs = s.cards[i];
        const box = h("div", { class: "bj-seat" + (i === T.me ? " me" : "") + (s.phase === "decide" && cs && s.dec[i] == null ? " turn" : "") });
        box.append(h("div", { class: "bj-nm" }, h("img", { src: CHARS[T.charOf(i)].img }), T.name(i)));
        if (!cs) { box.append(h("div", { class: "note" }, s.out[i] ? "見学" : "見送り")); seats.append(box); continue; }
        const showMine = i === T.me || s.dshow || T.hotseat === false && false;
        const e = tcpEval(cs);
        box.append(cardRow(T, "c" + i, cs, { cw: i === T.me ? 40 : s.n >= 4 ? 28 : 34, down: () => !(i === T.me || s.dshow) }));
        const b = s.bets[i];
        box.append(h("div", { class: "bj-tot" }, showMine ? e.name : "？", h("span", { class: "bj-bet" }, "A" + fmtN(b.ante || 0) + (b.pp ? " PP" + fmtN(b.pp) : "") + (b.play ? " +" + fmtN(b.play) : ""))));
        if (s.pr && s.pr[i] && s.phase === "result") box.append(h("div", { class: "note" }, s.pr[i]));
        seats.append(box);
      }
      tb.append(seats);
    }
    const me = T.me;
    if (s.phase === "decide" && me >= 0 && s.cards[me] && s.dec[me] == null) {
      const e = tcpEval(s.cards[me]), ante = s.bets[me].ante || 0;
      House.bottom(s, T, { status: "あなたの手：" + e.name + "　勝負する？", hot: true, buttons: [
        h("button", { class: "btn ghost", onclick: () => T.act({ t: "fold" }) }, "降りる（-" + fmtN(ante) + "）"),
        h("button", { class: "btn pink", disabled: !this.valid(s, me, { t: "play" }), onclick: () => T.act({ t: "play" }) }, "勝負！（+" + fmtN(ante) + "）")] });
    } else House.bottom(s, T, { status: s.phase === "decide" ? "みんなが考えています…" : s.phase === "show" ? "ディーラーのカードを開きます…" : null });
  },
};
