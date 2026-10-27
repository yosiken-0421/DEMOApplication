"use strict";
/* ===== ルーレット・大小（シックボー）・クラップス・丁半・もふもふダービー ===== */

/* ---------------- ルーレット（ヨーロピアン 0〜36） ---------------- */
const RL_RED = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
const RL_ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const rlColor = (n) => (n === 0 ? "green" : RL_RED.includes(n) ? "red" : "black");
const RL_OUT = { red: 1, black: 1, odd: 1, even: 1, low: 1, high: 1, d1: 2, d2: 2, d3: 2, c1: 2, c2: 2, c3: 2 };
function rlWins(spot, n) {
  if (spot[0] === "n") return +spot.slice(1) === n;
  if (n === 0) return false;
  switch (spot) {
    case "red": return RL_RED.includes(n);
    case "black": return !RL_RED.includes(n);
    case "odd": return n % 2 === 1;
    case "even": return n % 2 === 0;
    case "low": return n <= 18;
    case "high": return n >= 19;
    case "d1": return n <= 12;
    case "d2": return n >= 13 && n <= 24;
    case "d3": return n >= 25;
    case "c1": return n % 3 === 1;
    case "c2": return n % 3 === 2;
    case "c3": return n % 3 === 0;
  }
  return false;
}
const Roulette = {
  id: "roulette", name: "ルーレット", icon: "🎡", min: 1, max: 5, tag: "定番",
  desc: "玉が止まる数字を予想！1点賭けなら36倍。赤黒・奇数偶数などもOK",
  rules: "回転盤の玉がどの数字（0〜36）に止まるかを予想して賭けます。\n\n払い戻し（賭けたチップ＋配当）\n・数字1つ：35倍（36倍になって戻る）\n・赤／黒、奇数／偶数、1〜18／19〜36：1倍\n・1〜12／13〜24／25〜36（ダズン）：2倍\n・縦の列（2:1と書かれた場所）：2倍\n・0に止まったときは、0に賭けた人以外は負けです。\n\n同じ場所を何回もタップすると賭けが増えます。いくつの場所に賭けてもOK。\n決められたラウンドが終わったとき、チップが一番多い人の勝ち！",
  opts: House.opts(),
  sound: "chip",
  ok(sp) { return sp in RL_OUT || /^n([0-9]|[12][0-9]|3[0-6])$/.test(sp); },
  setup(n, o) { return House.setup(n, o, { num: null, spin: 0, hist: [] }); },
  newRound(s) { s.num = null; },
  actors(s) { return s.over || s.wait ? [] : House.betActors(s); },
  valid(s, seat, m) { return House.validBet(s, seat, m, (sp) => this.ok(sp)); },
  apply(s, seat, m) { if (House.applyBet(s, seat, m)) { s.phase = "spin"; s.spin++; s.num = rnd(37); s.wait = { ms: 4300, then: "pay" }; } },
  resolve(s, then) {
    if (then === "next") return House.next(s, this);
    if (then === "pay") {
      const n = s.num;
      s.hist = [n].concat(s.hist).slice(0, 14);
      ev(s, -1, "big", n + (n === 0 ? " 緑" : RL_RED.includes(n) ? " 赤" : " 黒"));
      const nets = Array(s.n).fill(null);
      for (let i = 0; i < s.n; i++) {
        if (!House.inPlay(s, i)) continue;
        let net = 0;
        for (const sp in s.bets[i]) { const a = s.bets[i][sp]; net += rlWins(sp, n) ? a * (sp[0] === "n" ? 35 : RL_OUT[sp]) : -a; }
        nets[i] = net;
      }
      House.settle(s, nets, 3000);
    }
  },
  cpu(s, seat, lv) {
    return House.cpuBet(s, seat, () => {
      const a = House.cpuStake(s, seat, lv);
      const r = Math.random();
      if (lv === 2) return [{ spot: pick(["red", "black", "odd", "even", "low", "high"]), amt: a }];
      if (lv === 1) return r < 0.6 ? [{ spot: pick(["red", "black", "odd", "even"]), amt: a }] : [{ spot: pick(["d1", "d2", "d3", "c1", "c2", "c3"]), amt: a }];
      const l = [{ spot: "n" + rnd(37), amt: Math.max(10, Math.round(a / 40) * 10) }];
      if (rnd(2)) l.push({ spot: pick(["red", "black"]), amt: a });
      if (rnd(3) === 0) l.push({ spot: "n" + rnd(37), amt: 10 });
      return l;
    });
  },
  cpuDelay() { return 500 + rnd(1000); },
  result(s) { return House.result(s); },
  render(s, T) {
    House.players(s, T);
    const mid = T.mid();
    const tb = h("div", { class: "felt rl" });
    mid.append(tb);
    // 回転盤
    const segs = RL_ORDER.map((n) => ({ label: n, color: n === 0 ? "#2fb47a" : RL_RED.includes(n) ? "#e5546c" : "#3a3346" }));
    const hub = svg("g", null, svg("circle", { r: 58, fill: "#f6d79a" }), svg("circle", { r: 40, fill: "#e9b97a" }), svg("circle", { r: 12, fill: "#fff6ec" }));
    const W = wheelSvg(segs, 124, { inner: 66, textR: 82, fs: 9, hub });
    const spinning = s.phase === "spin";
    spinTo(T, "rlw", W.g, s.num == null ? null : s.spin, RL_ORDER.indexOf(s.num), 37, spinning, 3800);
    const top = h("div", { class: "rl-top" },
      h("div", { class: "wheel-box" }, W.root, h("div", { class: "wheel-ptr" }, "▼"), s.num != null && !spinning ? h("div", { class: "rl-num " + rlColor(s.num) }, s.num) : null),
      h("div", { class: "rl-hist" }, h("small", null, "これまで"), h("div", null, s.hist.map((n) => h("i", { class: rlColor(n) }, n)))));
    tb.append(top);
    // ベット盤
    const res = s.phase === "result";
    const sp = (id, label, cls) => House.spot(s, T, id, { label, cls: "rl-c " + (cls || ""), win: res && rlWins(id, s.num), lose: false });
    const grid = h("div", { class: "rl-board" });
    grid.append(Object.assign(sp("n0", "0", "green zero"), {}));
    for (let r = 0; r < 12; r++) for (let c = 0; c < 3; c++) { const n = r * 3 + c + 1; const e = sp("n" + n, n, rlColor(n)); e.style.gridRow = r + 2; e.style.gridColumn = c + 2; grid.append(e); }
    [["d1", "1-12"], ["d2", "13-24"], ["d3", "25-36"]].forEach(([id, lb], k) => { const e = sp(id, lb, "out v"); e.style.gridRow = 2 + k * 4 + " / span 4"; e.style.gridColumn = 1; grid.append(e); });
    [["low", "1-18"], ["even", "偶数"], ["red", "赤"], ["black", "黒"], ["odd", "奇数"], ["high", "19-36"]].forEach(([id, lb], k) => { const e = sp(id, lb, "out " + (id === "red" ? "red" : id === "black" ? "black" : "")); e.style.gridRow = 2 + k * 2 + " / span 2"; e.style.gridColumn = 5; grid.append(e); });
    ["c1", "c2", "c3"].forEach((id, k) => { const e = sp(id, "2:1", "out"); e.style.gridRow = 14; e.style.gridColumn = k + 2; grid.append(e); });
    tb.append(grid);
    House.bottom(s, T, { status: spinning ? "ルーレットが回っています…" : null });
  },
};

/* ---------------- 大小（シックボー） ---------------- */
const SB_TOT = { 4: 50, 5: 18, 6: 14, 7: 12, 8: 8, 9: 6, 10: 6, 11: 6, 12: 6, 13: 8, 14: 12, 15: 14, 16: 18, 17: 50 };
const SicBo = {
  id: "sicbo", name: "大小（シックボー）", icon: "🎲", min: 1, max: 5, tag: "サイコロ",
  desc: "3つのサイコロの合計は大きい？小さい？合計ぴったりなら最大50倍",
  rules: "3つのサイコロを振って、出目を予想します。\n\n・大：合計11〜17（1倍）　小：合計4〜10（1倍）\n・奇数／偶数：合計が奇数か偶数か（1倍）\n　※ゾロ目（3つ同じ）のときは、大・小・奇数・偶数はすべて負け\n・合計ぴったり：4か17は50倍、5か16は18倍、6か15は14倍、7か14は12倍、8か13は8倍、9〜12は6倍\n・数字（1〜6）：その数字が1個出たら1倍、2個なら2倍、3個なら3倍\n・ゾロ目どれか：30倍\n\n決められたラウンドが終わったとき、チップが一番多い人の勝ち！",
  opts: House.opts(),
  sound: "dice",
  ok(sp) { return ["big", "small", "odd", "even", "any3"].includes(sp) || /^t([4-9]|1[0-7])$/.test(sp) || /^s[1-6]$/.test(sp); },
  setup(n, o) { return House.setup(n, o, { dice: [1, 2, 3], hist: [] }); },
  newRound(s) { s.rolled = false; },
  actors(s) { return s.over || s.wait ? [] : House.betActors(s); },
  valid(s, seat, m) { return House.validBet(s, seat, m, (sp) => this.ok(sp)); },
  apply(s, seat, m) { if (House.applyBet(s, seat, m)) { s.phase = "roll"; s.dice = [1 + rnd(6), 1 + rnd(6), 1 + rnd(6)]; ev(s, -1, "snd", "dice"); s.wait = { ms: 1500, then: "pay" }; } },
  win(sp, d) {
    const t = d[0] + d[1] + d[2], tri = d[0] === d[1] && d[1] === d[2];
    if (sp === "big") return !tri && t >= 11 ? 1 : 0;
    if (sp === "small") return !tri && t <= 10 ? 1 : 0;
    if (sp === "odd") return !tri && t % 2 ? 1 : 0;
    if (sp === "even") return !tri && t % 2 === 0 ? 1 : 0;
    if (sp === "any3") return tri ? 30 : 0;
    if (sp[0] === "t") return +sp.slice(1) === t ? SB_TOT[t] : 0;
    if (sp[0] === "s") return d.filter((x) => x === +sp[1]).length;
    return 0;
  },
  resolve(s, then) {
    if (then === "next") return House.next(s, this);
    if (then === "pay") {
      s.rolled = true;
      const d = s.dice, t = d[0] + d[1] + d[2], tri = d[0] === d[1] && d[1] === d[2];
      s.hist = [tri ? "ゾ" : t >= 11 ? "大" : "小"].concat(s.hist).slice(0, 16);
      ev(s, -1, "big", tri ? "ゾロ目！" : t + (t >= 11 ? " 大" : " 小"));
      const nets = Array(s.n).fill(null);
      for (let i = 0; i < s.n; i++) {
        if (!House.inPlay(s, i)) continue;
        let net = 0;
        for (const sp in s.bets[i]) { const a = s.bets[i][sp], w = this.win(sp, d); net += w ? a * w : -a; }
        nets[i] = net;
      }
      House.settle(s, nets, 2800);
    }
  },
  cpu(s, seat, lv) {
    return House.cpuBet(s, seat, () => {
      const a = House.cpuStake(s, seat, lv);
      const l = [{ spot: pick(["big", "small"]), amt: a }];
      if (lv === 0 && rnd(2)) l.push({ spot: "t" + (4 + rnd(14)), amt: 10 });
      if (lv === 1 && rnd(3) === 0) l.push({ spot: "s" + (1 + rnd(6)), amt: Math.max(10, Math.round(a / 30) * 10) });
      return l;
    });
  },
  cpuDelay() { return 500 + rnd(900); },
  result(s) { return House.result(s); },
  render(s, T) {
    House.players(s, T);
    const mid = T.mid();
    const tb = h("div", { class: "felt sb" });
    mid.append(tb);
    const rolling = s.phase === "roll";
    const shown = rolling || s.phase === "result";
    tb.append(h("div", { class: "sb-top" },
      h("div", { class: "bowl" }, h("div", { class: "dice-row" }, s.dice.map((v) => dieEl(rolling ? 1 + rnd(6) : v, { roll: rolling, size: 40, cls: shown ? "" : "dim" })))),
      h("div", { class: "rl-hist" }, h("small", null, "これまで"), h("div", null, s.hist.map((x) => h("i", { class: x === "大" ? "red" : x === "小" ? "black" : "green" }, x))))));
    const res = s.phase === "result";
    const sp = (id, label, sub, cls) => House.spot(s, T, id, { label, sub, cls: "sb-c " + (cls || ""), win: res && this.win(id, s.dice) > 0 });
    const g = h("div", { class: "sb-board" });
    g.append(h("div", { class: "sb-row r4" }, sp("small", "小", "4〜10・1倍", "red"), sp("odd", "奇数", "1倍"), sp("even", "偶数", "1倍"), sp("big", "大", "11〜17・1倍", "red")));
    const tr = h("div", { class: "sb-row r7" });
    for (let t = 4; t <= 17; t++) tr.append(sp("t" + t, t, SB_TOT[t] + "倍", "num"));
    g.append(tr);
    g.append(h("div", { class: "sb-row r7" }, [1, 2, 3, 4, 5, 6].map((v) => sp("s" + v, dieEl(v, { size: 22 }), "1〜3倍", "die-c")), sp("any3", "ゾロ目", "30倍", "gold")));
    tb.append(g);
    House.bottom(s, T, { status: rolling ? "サイコロを振っています…" : null });
  },
};

/* ---------------- クラップス ---------------- */
const Craps = {
  id: "craps", name: "クラップス", icon: "🎯", min: 1, max: 5, tag: "サイコロ",
  desc: "2つのサイコロで盛り上がるアメリカの定番。ポイントの目をもう一度出せるか！",
  rules: "2つのサイコロの合計で勝負します。\n\n【パスライン】（いちばん基本）\n・最初の1投（カムアウト）：7か11で勝ち、2・3・12で負け。\n・それ以外の目（4,5,6,8,9,10）が出たら、それが「ポイント」になります。\n・そのあと、ポイントの目がもう一度出たら勝ち、先に7が出たら負け。（1倍）\n\n【ドントパス】パスラインの逆。カムアウトで2・3なら勝ち、7・11なら負け（12は引分）。ポイント後は7が先に出たら勝ち。（1倍）\n　※パス／ドントパスはカムアウトのときだけ賭けられ、決着するまで戻せません。\n\n【1回だけの賭け】\n・フィールド：次の目が 2,3,4,9,10,11,12 なら勝ち（2は2倍、12は3倍、ほかは1倍）\n・エニーセブン：次の目が7なら4倍\n・エニークラップス：次の目が2,3,12なら7倍\n\n決められた投数が終わったとき、チップが一番多い人の勝ち！（終了時に残っているパス／ドントパスは戻ってきます）",
  opts: House.opts(),
  sound: "dice",
  setup(n, o) { return House.setup(n, o, { point: null, dice: [3, 4], hist: [] }); },
  newRound(s) {},
  actors(s) { return s.over || s.wait ? [] : House.betActors(s); },
  valid(s, seat, m) { return House.validBet(s, seat, m, (sp) => ["field", "any7", "craps"].includes(sp) || ((sp === "pass" || sp === "dont") && s.point == null)); },
  apply(s, seat, m) { if (House.applyBet(s, seat, m)) { s.phase = "roll"; s.dice = [1 + rnd(6), 1 + rnd(6)]; ev(s, -1, "snd", "dice"); s.wait = { ms: 1400, then: "pay" }; } },
  resolve(s, then) {
    if (then === "next") return House.next(s, this);
    if (then !== "pay") return;
    const t = s.dice[0] + s.dice[1];
    s.hist = [t].concat(s.hist).slice(0, 16);
    const nets = Array(s.n).fill(null);
    const comeout = s.point == null;
    let msg = "";
    let newPoint = s.point;
    if (comeout) {
      if (t === 7 || t === 11) msg = t + "！ナチュラル";
      else if (t === 2 || t === 3 || t === 12) msg = t + "… クラップス";
      else { newPoint = t; msg = "ポイントは " + t; }
    } else if (t === s.point) { msg = t + "！ポイント達成"; newPoint = null; }
    else if (t === 7) { msg = "7… セブンアウト"; newPoint = null; }
    else msg = String(t);
    for (let i = 0; i < s.n; i++) {
      if (!House.inPlay(s, i)) continue;
      const b = s.bets[i], L = s.lock[i];
      let net = 0;
      // 1回だけの賭け
      if (b.field) net += [2, 3, 4, 9, 10, 11, 12].includes(t) ? b.field * (t === 2 ? 2 : t === 12 ? 3 : 1) : -b.field;
      if (b.any7) net += t === 7 ? b.any7 * 4 : -b.any7;
      if (b.craps) net += t === 2 || t === 3 || t === 12 ? b.craps * 7 : -b.craps;
      // パス・ドントパス
      const pass = (b.pass || 0) + (L.pass || 0), dont = (b.dont || 0) + (L.dont || 0);
      if (comeout) {
        if (t === 7 || t === 11) net += pass - dont;
        else if (t === 2 || t === 3) net += dont - pass;
        else if (t === 12) net -= pass;
        else { if (pass) L.pass = pass; if (dont) L.dont = dont; }
      } else if (t === s.point) { net += pass - dont; delete L.pass; delete L.dont; }
      else if (t === 7) { net += dont - pass; delete L.pass; delete L.dont; }
      if (comeout && newPoint == null) { delete L.pass; delete L.dont; }
      nets[i] = net;
    }
    s.point = newPoint;
    ev(s, -1, "big", msg);
    House.settle(s, nets, 2600);
  },
  finish(s) { s.lock = s.lock.map(() => ({})); },
  cpu(s, seat, lv) {
    return House.cpuBet(s, seat, () => {
      const a = House.cpuStake(s, seat, lv);
      const l = [];
      if (s.point == null && !Object.keys(s.lock[seat]).length) l.push({ spot: lv === 0 && rnd(3) === 0 ? "dont" : rnd(5) ? "pass" : "dont", amt: a });
      if (lv === 0 && rnd(2)) l.push({ spot: pick(["field", "any7", "craps"]), amt: Math.max(10, Math.round(a / 30) * 10) });
      if (lv === 1 && rnd(4) === 0) l.push({ spot: "field", amt: Math.max(10, Math.round(a / 20) * 10) });
      return l;
    });
  },
  cpuDelay() { return 500 + rnd(900); },
  result(s) { return House.result(s); },
  render(s, T) {
    House.players(s, T, { badge: (i) => (s.lock[i].pass ? "パス" : s.lock[i].dont ? "ドント" : null) });
    const mid = T.mid();
    const tb = h("div", { class: "felt cr" });
    mid.append(tb);
    const rolling = s.phase === "roll";
    tb.append(h("div", { class: "sb-top" },
      h("div", { class: "bowl" }, h("div", { class: "dice-row" }, s.dice.map((v) => dieEl(rolling ? 1 + rnd(6) : v, { roll: rolling, size: 44 })))),
      h("div", { class: "cr-point" }, s.point == null ? h("span", { class: "puck off" }, "OFF") : h("span", { class: "puck on" }, "ON", h("b", null, s.point)), h("small", null, s.point == null ? "カムアウト" : "ポイント " + s.point + " を待っています")),
      h("div", { class: "rl-hist" }, h("small", null, "これまで"), h("div", null, s.hist.map((x) => h("i", { class: x === 7 ? "red" : "black" }, x))))));
    const res = s.phase === "result", t = s.dice[0] + s.dice[1];
    const g = h("div", { class: "cr-board" },
      h("div", { class: "sb-row r3" },
        House.spot(s, T, "any7", { label: "エニーセブン", sub: "7で4倍", cls: "sb-c red", win: res && t === 7 }),
        House.spot(s, T, "craps", { label: "エニークラップス", sub: "2・3・12で7倍", cls: "sb-c", win: res && [2, 3, 12].includes(t) })),
      House.spot(s, T, "field", { label: "フィールド", sub: "2(2倍)・3・4・9・10・11・12(3倍)", cls: "sb-c wide", win: res && [2, 3, 4, 9, 10, 11, 12].includes(t) }),
      House.spot(s, T, "dont", { label: "ドントパス", sub: s.point == null ? "パスの逆・1倍" : "決着まで戻せません", cls: "sb-c wide dark", ok: s.point == null }),
      House.spot(s, T, "pass", { label: "パスライン", sub: s.point == null ? "7・11で勝ち・1倍" : "決着まで戻せません", cls: "sb-c wide big", ok: s.point == null }));
    tb.append(g);
    House.bottom(s, T, { status: rolling ? "サイコロを振っています…" : null, betStatus: s.point == null ? "カムアウト：パスラインに賭けよう" : "ポイント" + s.point + "：1回だけの賭けもできるよ" });
  },
};

/* ---------------- 丁半 ---------------- */
const Chohan = {
  id: "chohan", name: "丁半", icon: "🏮", min: 1, max: 5, tag: "和風",
  desc: "2つのサイコロの合計は偶数（丁）？奇数（半）？日本の伝統の勝負",
  rules: "壺の中で2つのサイコロを振り、合計が偶数か奇数かを当てます。\n\n・丁（ちょう）：合計が偶数 → 1倍\n・半（はん）：合計が奇数 → 1倍\n・ゾロ目（2つ同じ）：5倍\n\n「入ります」の声のあと、みんな賭け終わったら壺を開けます。\n決められたラウンドが終わったとき、チップが一番多い人の勝ち！",
  opts: House.opts(),
  sound: "dice",
  setup(n, o) { return House.setup(n, o, { dice: [1, 1], open: false, hist: [] }); },
  newRound(s) { s.open = false; },
  actors(s) { return s.over || s.wait ? [] : House.betActors(s); },
  valid(s, seat, m) { return House.validBet(s, seat, m, spotIn(["cho", "han", "zoro"])); },
  apply(s, seat, m) { if (House.applyBet(s, seat, m)) { s.phase = "roll"; s.dice = [1 + rnd(6), 1 + rnd(6)]; ev(s, -1, "toast", "勝負！"); s.wait = { ms: 1300, then: "pay" }; } },
  resolve(s, then) {
    if (then === "next") return House.next(s, this);
    if (then === "pay") {
      s.open = true; ev(s, -1, "snd", "dice");
      const t = s.dice[0] + s.dice[1], cho = t % 2 === 0, zoro = s.dice[0] === s.dice[1];
      s.hist = [cho ? "丁" : "半"].concat(s.hist).slice(0, 16);
      ev(s, -1, "big", (zoro ? "ゾロ目の" : "") + (cho ? "丁！" : "半！"));
      const nets = Array(s.n).fill(null);
      for (let i = 0; i < s.n; i++) {
        if (!House.inPlay(s, i)) continue;
        const b = s.bets[i]; let net = 0;
        if (b.cho) net += cho ? b.cho : -b.cho;
        if (b.han) net += !cho ? b.han : -b.han;
        if (b.zoro) net += zoro ? b.zoro * 5 : -b.zoro;
        nets[i] = net;
      }
      House.settle(s, nets, 2600);
    }
  },
  cpu(s, seat, lv) {
    return House.cpuBet(s, seat, () => {
      const l = [{ spot: rnd(2) ? "cho" : "han", amt: House.cpuStake(s, seat, lv) }];
      if (lv === 0 && rnd(4) === 0) l.push({ spot: "zoro", amt: 10 });
      return l;
    });
  },
  cpuDelay() { return 400 + rnd(900); },
  result(s) { return House.result(s); },
  render(s, T) {
    House.players(s, T);
    const mid = T.mid();
    const tb = h("div", { class: "felt ch" });
    mid.append(tb);
    const t = s.dice[0] + s.dice[1];
    tb.append(h("div", { class: "ch-top" },
      h("div", { class: "tsubo-box" },
        s.open ? h("div", { class: "dice-row" }, s.dice.map((v) => dieEl(v, { size: 48 }))) : null,
        h("div", { class: "tsubo" + (s.open ? " open" : s.phase === "roll" ? " shake" : "") }, "壺")),
      s.open ? h("div", { class: "ch-res" }, t + "　" + (t % 2 ? "半" : "丁")) : h("div", { class: "ch-res dim" }, s.phase === "roll" ? "勝負！" : "さぁ、張った張った！"),
      h("div", { class: "rl-hist" }, h("small", null, "これまで"), h("div", null, s.hist.map((x) => h("i", { class: x === "丁" ? "red" : "black" }, x))))));
    const res = s.phase === "result";
    tb.append(h("div", { class: "spot-grid three" },
      House.spot(s, T, "cho", { label: "丁", sub: "偶数・1倍", cls: "tall red kanji", win: res && t % 2 === 0, lose: res && t % 2 === 1 }),
      House.spot(s, T, "zoro", { label: "ゾロ目", sub: "5倍", cls: "tall green", win: res && s.dice[0] === s.dice[1] }),
      House.spot(s, T, "han", { label: "半", sub: "奇数・1倍", cls: "tall blue kanji", win: res && t % 2 === 1, lose: res && t % 2 === 0 })));
    House.bottom(s, T, { status: s.phase === "roll" ? "壺を振っています…" : null });
  },
};

/* ---------------- もふもふダービー（キャラのかけっこレース） ---------------- */
const DB_TICKS = 60;
const Derby = {
  id: "derby", name: "もふもふダービー", icon: "🏇", min: 1, max: 5, tag: "レース",
  desc: "5匹のかけっこで1着を予想！人気薄が勝てば大きな配当",
  rules: "もふぴー・くろにゃ・ぴょんた・ぺんぺん・がおるんの5匹がかけっこをします。1着になる子を予想して賭けます（単勝）。\n\n・毎レース、それぞれの調子（◎○▲△）とオッズ（倍率）が表示されます。\n・当たると「賭けたチップ×オッズ」が戻ってきます（オッズ3.5倍なら、100枚が350枚に）。\n・人気がない子ほどオッズが高く、当たると大きいです。\n・何匹に賭けてもOK。\n\n決められたレース数が終わったとき、チップが一番多い人の勝ち！",
  opts: House.opts(),
  sound: "chip",
  setup(n, o) { const s = House.setup(n, o, { hist: [] }); this.newRound(s); return s; },
  newRound(s) {
    // 調子（強さ）を決めて、たくさん走らせて勝率からオッズを出す
    s.pow = CHAR_IDS.map(() => 0.93 + Math.random() * 0.14);
    const wins = Array(5).fill(0), N = 700;
    for (let k = 0; k < N; k++) wins[this.sim(s.pow, false).win]++;
    s.odds = wins.map((w) => { const p = Math.max(w, 10) / N; return clamp(Math.floor((0.88 / p) * 10) / 10, 1.2, 60); });
    s.race = null; s.winner = null;
  },
  /* レース：区間ごとに速さが変わる（追い上げ・失速がある） */
  sim(pow, keep) {
    const pos = Array(5).fill(0), frames = [];
    const seg = pow.map(() => [0, 1, 2, 3, 4, 5, 6, 7].map(() => 0.65 + Math.random() * 0.7));
    let win = -1, t = 0;
    while (win < 0 && t < 400) {
      t++;
      for (let i = 0; i < 5; i++) pos[i] += (pow[i] * seg[i][Math.min(7, Math.floor(t / 9))] * (0.8 + Math.random() * 0.4)) / DB_TICKS;
      if (keep) frames.push(pos.map((p) => Math.round(Math.min(p, 1.02) * 1000) / 1000));
      let best = -1, bp = 1;
      for (let i = 0; i < 5; i++) if (pos[i] >= bp) { bp = pos[i]; best = i; }
      if (best >= 0) win = best;
    }
    return { frames, win: win < 0 ? 0 : win };
  },
  ok(sp) { return /^w[0-4]$/.test(sp); },
  actors(s) { return s.over || s.wait ? [] : House.betActors(s); },
  valid(s, seat, m) { return House.validBet(s, seat, m, (sp) => this.ok(sp)); },
  apply(s, seat, m) {
    if (!House.applyBet(s, seat, m)) return;
    const r = this.sim(s.pow, true);
    s.race = { frames: r.frames, id: (s.raceId = (s.raceId || 0) + 1) };
    s.winner = r.win; s.phase = "race";
    ev(s, -1, "toast", "スタート！");
    s.wait = { ms: r.frames.length * 75 + 900, then: "pay" };
  },
  resolve(s, then) {
    if (then === "next") return House.next(s, this);
    if (then === "pay") {
      const w = s.winner;
      s.hist = [w].concat(s.hist).slice(0, 10);
      ev(s, -1, "big", CHARS[CHAR_IDS[w]].name + " 1着！");
      const nets = Array(s.n).fill(null);
      for (let i = 0; i < s.n; i++) {
        if (!House.inPlay(s, i)) continue;
        let net = 0;
        for (const sp in s.bets[i]) { const a = s.bets[i][sp], k = +sp[1]; net += k === w ? Math.floor(a * s.odds[k]) - a : -a; }
        nets[i] = net;
      }
      House.settle(s, nets, 3000);
    }
  },
  cpu(s, seat, lv) {
    return House.cpuBet(s, seat, () => {
      const a = House.cpuStake(s, seat, lv);
      const fav = s.odds.map((o, k) => [o, k]).sort((x, y) => x[0] - y[0]);
      if (lv === 2) return [{ spot: "w" + fav[0][1], amt: a }];
      if (lv === 1) return [{ spot: "w" + fav[rnd(2)][1], amt: a }];
      const l = [{ spot: "w" + rnd(5), amt: a }];
      if (rnd(2)) l.push({ spot: "w" + rnd(5), amt: Math.max(10, Math.round(a / 30) * 10) });
      return l;
    });
  },
  cpuDelay() { return 500 + rnd(900); },
  result(s) { return House.result(s); },
  mark(s, k) { const sorted = s.odds.slice().sort((a, b) => a - b); return ["◎", "○", "▲", "△", "×"][sorted.indexOf(s.odds[k])]; },
  render(s, T) {
    House.players(s, T);
    const mid = T.mid();
    const tb = h("div", { class: "felt db" });
    mid.append(tb);
    const track = h("div", { class: "db-track" });
    const toks = [];
    CHAR_IDS.forEach((cid, k) => {
      const tok = h("div", { class: "db-tok" + (s.phase === "result" && s.winner === k ? " won" : "") }, h("img", { src: CHARS[cid].img, alt: "" }));
      toks.push(tok);
      track.append(h("div", { class: "db-lane" }, h("span", { class: "db-no" }, k + 1), tok, h("i", { class: "db-goal" })));
    });
    tb.append(h("div", { class: "db-head" }, h("span", null, "🏁 レース " + s.round + "/" + s.rounds), h("span", { class: "db-hist" }, s.hist.length ? "これまでの1着：" : "", s.hist.map((w) => h("img", { src: CHARS[CHAR_IDS[w]].img })))));
    tb.append(track);
    // 位置
    const place = (fr) => toks.forEach((t, k) => (t.style.left = "calc(" + Math.min(1, fr ? fr[k] : 0) * 100 + "% * var(--run))"));
    if (s.race && (s.phase === "race" || s.phase === "result")) {
      const fr = s.race.frames;
      if (s.phase === "result") place(fr[fr.length - 1]);
      else {
        const st = T.ui.db || (T.ui.db = {});
        if (st.id !== s.race.id) { st.id = s.race.id; st.t0 = Date.now(); }
        const step = () => {
          if (!track.isConnected) return;
          const k = Math.min(fr.length - 1, Math.floor((Date.now() - st.t0) / 75));
          place(fr[k]);
          if (k < fr.length - 1) requestAnimationFrame(step);
        };
        step();
      }
    } else place(null);
    // 賭け
    const res = s.phase === "result";
    tb.append(h("div", { class: "db-bets" }, CHAR_IDS.map((cid, k) => House.spot(s, T, "w" + k, {
      label: h("span", null, h("img", { src: CHARS[cid].img, class: "db-face" }), h("em", null, CHARS[cid].name)),
      sub: this.mark(s, k) + " " + s.odds[k].toFixed(1) + "倍", cls: "db-c", win: res && s.winner === k, lose: res && s.winner !== k }))));
    House.bottom(s, T, { status: s.phase === "race" ? "レース中！がんばれ〜！" : null, betStatus: "1着になる子に賭けよう" });
  },
};
