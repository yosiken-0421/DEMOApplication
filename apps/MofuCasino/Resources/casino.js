"use strict";
/* ===== カジノ共通 =====
   ・もふコイン（ひとりで遊ぶマシン用の財布。遊び用で、お金の価値はありません。購入もできません）
   ・チップの見た目
   ・「ディーラーと勝負する卓」（ブラックジャック・ルーレットなど）のベットの仕組み = House */

const fmtN = (n) => Math.round(n).toLocaleString("ja-JP");

/* ---------- もふコイン ---------- */
const Wallet = {
  get() { return Save.data.coins; },
  can(n) { return Save.data.coins >= n; },
  add(n) {
    Save.data.coins = Math.max(0, Math.round(Save.data.coins + n));
    Save.data.coinsMax = Math.max(Save.data.coinsMax || 0, Save.data.coins);
    Save.write(); this.paint();
  },
  paint() { document.querySelectorAll(".coin-pill b").forEach((e) => (e.textContent = fmtN(Save.data.coins))); },
  pill(onclick) { return h("button", { class: "coin-pill", onclick: onclick || (() => Wallet.menu()) }, h("i", null, "🪙"), h("b", null, fmtN(Save.data.coins))); },
  today() { const d = new Date(); return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(); },
  /* 1日1回のログインボーナス */
  daily() {
    if (Save.data.daily === this.today()) return 0;
    Save.data.daily = this.today();
    const n = 500;
    this.add(n);
    return n;
  },
  /* コインがなくなったときのおこづかい */
  rescue() {
    if (Save.data.coins >= 100) return 0;
    Save.data.rescues = (Save.data.rescues || 0) + 1;
    this.add(1000);
    return 1000;
  },
  menu() {
    const c = Save.data.me.char;
    const can = Save.data.coins < 100;
    modal(h("div", null,
      h("img", { class: "chr", src: CHARS[c].img }),
      h("h3", null, "🪙 もふコイン " + fmtN(Save.data.coins) + "枚"),
      h("p", { class: "note" }, "ひとりで遊ぶマシン（スロットなど）で使うコインです。遊び用なので、お金の価値はありません（購入・換金はできません）。"),
      h("p", { class: "note" }, "最高記録 " + fmtN(Save.data.coinsMax || 0) + "枚"),
      h("p", { class: "note" }, "毎日はじめて開くと +500枚。コインが100枚より少なくなったら、おこづかい（+1000枚）がもらえます。"),
      h("div", { class: "row" },
        h("button", { class: "btn ghost", onclick: closeModal }, "とじる"),
        h("button", { class: "btn lemon", disabled: !can, onclick: () => { const n = Wallet.rescue(); closeModal(); if (n) { Snd.init(); Snd.coin(); toast("おこづかい +" + n + "枚！"); } } }, "🎁 おこづかい"))));
  },
};

/* ---------- チップ ---------- */
const CHIP_VALS = [10, 50, 100, 500, 1000, 5000];
const CHIP_COL = { 10: "#6fa8ff", 50: "#ff7fa6", 100: "#3fbf8c", 500: "#9a7bff", 1000: "#f2b632", 5000: "#ff7a59" };
const chipLabel = (v) => (v >= 1000 && v % 1000 === 0 ? v / 1000 + "K" : v >= 10000 ? Math.floor(v / 1000) + "K" : String(v));
const chipColor = (v) => { let c = CHIP_COL[10]; for (const k of CHIP_VALS) if (v >= k) c = CHIP_COL[k]; return c; };
function chipEl(v, o) {
  o = o || {};
  return h("div", { class: "chip" + (o.sel ? " sel" : "") + (o.cls ? " " + o.cls : "") + (o.off ? " off" : ""), style: { "--cc": chipColor(v) }, onclick: o.onclick || null }, h("span", null, chipLabel(v)));
}
/* 下に出すチップ選び */
function chipTray(T, avail, onPick) {
  const vals = CHIP_VALS.filter((v) => v <= Math.max(10, avail * 1.0001) || v === 10);
  if (!T.ui.chip || !vals.includes(T.ui.chip)) T.ui.chip = vals.filter((v) => v <= Math.max(10, avail / 10)).pop() || 10;
  return h("div", { class: "chip-tray" }, vals.map((v) => chipEl(v, { sel: T.ui.chip === v, off: v > avail, onclick: () => { T.ui.chip = v; Snd.init(); Snd.chip(); onPick ? onPick(v) : T.redraw(); } })));
}

/* ===== ディーラーと勝負する卓（みんな同時にベット → 結果 → 次のラウンド） ===== */
const HOUSE_OPTS = [
  { key: "chips", label: "はじめのチップ", choices: [[1000, "1,000"], [3000, "3,000"], [10000, "10,000"]], def: 1000 },
  { key: "rounds", label: "ラウンド数", choices: [[5, "5回"], [10, "10回"], [20, "20回"]], def: 10 },
];
const House = {
  opts(extra) { return HOUSE_OPTS.concat(extra || []); },
  setup(n, o, x) {
    const c = o.chips || 1000;
    const s = {
      n, chips: Array(n).fill(c), start: c, round: 1, rounds: o.rounds || 10, phase: "bet",
      bets: Array.from({ length: n }, () => ({})), lock: Array.from({ length: n }, () => ({})),
      ready: Array(n).fill(false), out: Array(n).fill(false), last: Array(n).fill(null), prev: Array(n).fill(null),
      over: false, events: [],
    };
    return Object.assign(s, x || {});
  },
  sum(o) { let t = 0; for (const k in o) t += o[k]; return t; },
  staked(s, i) { return this.sum(s.bets[i]) + this.sum(s.lock[i] || {}); },
  avail(s, i) { return s.chips[i] - this.staked(s, i); },
  inPlay(s, i) { return !s.out[i] && this.staked(s, i) > 0; },
  betActors(s) { return s.phase !== "bet" ? [] : [...Array(s.n).keys()].filter((i) => !s.out[i] && !s.ready[i]); },
  okAmt(a) { return Number.isInteger(a) && a > 0; },
  validBet(s, seat, m, spotOk) {
    if (s.phase !== "bet" || s.ready[seat] || s.out[seat]) return false;
    const av = this.avail(s, seat);
    if (m.t === "bet") return typeof m.spot === "string" && spotOk(m.spot, seat) && this.okAmt(m.amt) && m.amt <= av;
    if (m.t === "bets") {
      if (!Array.isArray(m.list) || !m.list.length || m.list.length > 12) return false;
      let tot = 0;
      for (const b of m.list) { if (!b || typeof b.spot !== "string" || !spotOk(b.spot, seat) || !this.okAmt(b.amt)) return false; tot += b.amt; }
      return tot <= av;
    }
    if (m.t === "clear") return this.sum(s.bets[seat]) > 0;
    if (m.t === "rebet") {
      const p = s.prev[seat];
      if (!p || this.sum(s.bets[seat]) > 0) return false;
      for (const k in p) if (!spotOk(k, seat)) return false;
      return this.sum(p) > 0 && this.sum(p) <= av;
    }
    if (m.t === "done") return true;
    return false;
  },
  /* 戻り値 true = 全員ベット完了 */
  applyBet(s, seat, m) {
    const b = s.bets[seat];
    if (m.t === "bet") { b[m.spot] = (b[m.spot] || 0) + m.amt; ev(s, -1, "snd", "chip"); }
    else if (m.t === "bets") { m.list.forEach((x) => (b[x.spot] = (b[x.spot] || 0) + x.amt)); ev(s, -1, "snd", "chip"); }
    else if (m.t === "clear") s.bets[seat] = {};
    else if (m.t === "rebet") { s.bets[seat] = clone(s.prev[seat]); ev(s, -1, "snd", "chip"); }
    else if (m.t === "done") {
      s.ready[seat] = true;
      if (this.sum(b) > 0) s.prev[seat] = clone(b);
      else if (this.sum(s.lock[seat] || {}) === 0) ev(s, seat, "toast", "見送り");
      return this.betActors(s).length === 0;
    }
    return false;
  },
  /* 精算：nets[i] = 増減（null は参加なし） */
  settle(s, nets, ms) {
    let best = -1, bv = 0, worst = -1, wv = 0;
    for (let i = 0; i < s.n; i++) {
      const v = nets[i];
      s.last[i] = v == null ? null : Math.round(v);
      if (v == null) continue;
      s.chips[i] = Math.max(0, Math.round(s.chips[i] + v));
      if (v > bv) { bv = v; best = i; }
      if (v < wv) { wv = v; worst = i; }
    }
    if (best >= 0) ev(s, best, "say", bv >= 1000 ? "win" : "good");
    if (worst >= 0 && worst !== best && rnd(2)) ev(s, worst, "say", "bad");
    ev(s, -1, "snd", best >= 0 ? "coin" : "chip");
    s.phase = "result";
    s.wait = { ms: ms || 2600, then: "next" };
  },
  /* 次のラウンドへ（終わりなら over） */
  next(s, g) {
    s.round++;
    s.bets = Array.from({ length: s.n }, () => ({}));
    s.last = Array(s.n).fill(null);
    for (let i = 0; i < s.n; i++) if (s.chips[i] - this.sum(s.lock[i] || {}) < 10 && this.sum(s.lock[i] || {}) === 0) s.out[i] = true;
    s.ready = s.out.slice();
    if (s.round > s.rounds || s.out.every((x) => x)) {
      s.round = Math.min(s.round, s.rounds);
      if (g.finish) g.finish(s);
      s.over = true; s.phase = "end";
      const best = Math.max(...s.chips);
      s.chips.forEach((c, i) => { if (c === best) ev(s, i, "say", "win"); });
      return;
    }
    s.phase = "bet";
    if (g.newRound) g.newRound(s);
  },
  result(s) {
    const order = [...Array(s.n).keys()].sort((a, b) => s.chips[b] - s.chips[a]);
    return order.map((seat) => ({ seat, rank: order.findIndex((x) => s.chips[x] === s.chips[seat]), score: fmtN(s.chips[seat]), note: (s.chips[seat] >= s.start ? "+" : "") + fmtN(s.chips[seat] - s.start) }));
  },
  /* CPUの賭け金 */
  cpuStake(s, seat, level, frac) {
    const av = this.avail(s, seat);
    if (av < 10) return 0;
    const f = frac != null ? frac : level === 0 ? 0.04 + Math.random() * 0.16 : level === 1 ? 0.04 + Math.random() * 0.06 : 0.03 + Math.random() * 0.04;
    let a = Math.round((s.start * f + av * f * 0.5) / 10) * 10;
    if (s.round >= s.rounds - 1 && level >= 1 && s.chips[seat] < Math.max(...s.chips)) a = Math.round(av * 0.3 / 10) * 10;   // 終盤は勝負
    return clamp(a, 10, av);
  },
  /* CPU：まだ賭けていなければ list を、賭けたら done */
  cpuBet(s, seat, choose) {
    if (this.sum(s.bets[seat]) > 0 || this.avail(s, seat) < 10) return { t: "done" };
    const list = (choose() || []).filter((b) => b && b.amt > 0);
    if (!list.length) return { t: "done" };
    let tot = 0; const av = this.avail(s, seat);
    const ok = list.filter((b) => { b.amt = Math.floor(b.amt); if (tot + b.amt > av || b.amt <= 0) return false; tot += b.amt; return true; });
    return ok.length ? { t: "bets", list: ok } : { t: "done" };
  },
  /* ---------- 表示 ---------- */
  players(s, T, o) {
    o = o || {};
    return T.players((i) => {
      const lv = s.last[i];
      return {
        turn: s.phase === "bet" ? !s.ready[i] && !s.out[i] : o.turn ? o.turn(i) : false,
        score: fmtN(s.chips[i]),
        dim: s.out[i],
        badge: lv != null && s.phase === "result" ? (lv > 0 ? "+" + fmtN(lv) : lv < 0 ? fmtN(lv) : "±0") : o.badge ? o.badge(i) : s.phase === "bet" && s.ready[i] && !s.out[i] ? (this.staked(s, i) ? "BET" : "見送り") : null,
        gold: lv != null && lv > 0 && s.phase === "result",
      };
    });
  },
  /* 賭けられる場所（ボタン） */
  spot(s, T, id, o) {
    o = o || {};
    const me = T.me;
    const canBet = s.phase === "bet" && me >= 0 && !s.ready[me] && !s.out[me] && (o.ok !== false);
    const amt = me >= 0 ? (s.bets[me][id] || 0) + ((s.lock[me] || {})[id] || 0) : 0;
    const who = [];
    for (let i = 0; i < s.n; i++) if (i !== me && ((s.bets[i][id] || 0) + ((s.lock[i] || {})[id] || 0)) > 0) who.push(i);
    const el = h("div", { class: "spot " + (o.cls || "") + (canBet ? " can" : "") + (o.win ? " win" : "") + (o.lose ? " lose" : ""), style: o.style || null,
      onclick: canBet ? () => {
        const av = House.avail(s, me);
        const a = Math.min(T.ui.chip || 10, av);
        if (a <= 0) { toast("チップが足りません"); Snd.bad(); return; }
        Snd.init(); Snd.chip(); T.act({ t: "bet", spot: id, amt: a });
      } : null },
      o.label != null ? h("div", { class: "sl" }, o.label) : null,
      o.sub ? h("div", { class: "ss" }, o.sub) : null,
      amt ? chipEl(amt, { cls: "mine" }) : null,
      who.length ? h("div", { class: "who" }, who.slice(0, 4).map((i) => h("img", { src: CHARS[T.charOf(i)].img, alt: "" }))) : null);
    return el;
  },
  /* 下のエリア（ベット中は チップ選び＋ボタン） */
  bottom(s, T, o) {
    o = o || {};
    const me = T.me, rd = "R" + s.round + "/" + s.rounds + "　";
    const betting = s.phase === "bet" && me >= 0 && !s.ready[me] && !s.out[me];
    if (betting) {
      const av = this.avail(s, me), stk = this.sum(s.bets[me]);
      const btns = [
        h("button", { class: "btn ghost small", disabled: !stk, onclick: () => T.act({ t: "clear" }) }, "↺ 戻す"),
        s.prev[me] && !stk ? h("button", { class: "btn sky small", disabled: this.sum(s.prev[me]) > av, onclick: () => T.act({ t: "rebet" }) }, "↻ 前と同じ") : null,
        h("button", { class: "btn pink", onclick: () => T.act({ t: "done" }) }, stk || this.sum(s.lock[me] || {}) ? "✔ ベット確定" : "見送る"),
      ];
      return T.bottom({ status: rd + (o.betStatus || "賭ける場所をタップ") + "（賭け " + fmtN(stk) + "）", hot: true, extra: chipTray(T, av), buttons: btns });
    }
    let st = o.status;
    if (!st) {
      if (s.phase === "bet") st = me >= 0 && s.out[me] ? "チップがなくなりました（見学中）" : "みんなのベットを待っています…";
      else if (s.phase === "result" && me >= 0 && s.last[me] != null) st = s.last[me] > 0 ? "🎉 +" + fmtN(s.last[me]) + " 勝ち！" : s.last[me] < 0 ? "残念… " + fmtN(s.last[me]) : "引き分け（戻し）";
      else st = "…";
    }
    return T.bottom({ status: rd + st, hot: o.hot, extra: o.extra, buttons: o.buttons });
  },
};

/* 賭け場所のかんたんチェック用 */
const spotIn = (list) => (sp) => list.includes(sp);

/* ポーカーの点数の比較（大きい方が強い） */
const cmpScore = (a, b) => { for (let i = 0; i < Math.max(a.length, b.length); i++) { const d = (a[i] || 0) - (b[i] || 0); if (d) return d; } return 0; };

/* SVG を作る */
const SVGNS = "http://www.w3.org/2000/svg";
function svg(tag, attrs, ...kids) {
  const e = document.createElementNS(SVGNS, tag);
  if (attrs) for (const k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
  for (const k of kids.flat()) if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(String(k)));
  return e;
}
/* 円盤（ルーレット・ホイール）：segs = [{label, color, text}] */
function wheelSvg(segs, size, o) {
  o = o || {};
  const n = segs.length, R = 100, r0 = o.inner || 0, seg = (Math.PI * 2) / n;
  const root = svg("svg", { viewBox: "-104 -104 208 208", width: size, height: size, class: "wheel-svg" });
  const g = svg("g", { class: "wheel-rot" });
  root.append(svg("circle", { r: 104, fill: o.rim || "#7a4e20" }));
  segs.forEach((sg, k) => {
    const a0 = -Math.PI / 2 + (k - 0.5) * seg, a1 = a0 + seg;
    const p = (a, rr) => (rr * Math.cos(a)).toFixed(2) + " " + (rr * Math.sin(a)).toFixed(2);
    g.append(svg("path", { d: "M" + p(a0, r0) + " L" + p(a0, R) + " A" + R + " " + R + " 0 0 1 " + p(a1, R) + " L" + p(a1, r0) + (r0 ? " A" + r0 + " " + r0 + " 0 0 0 " + p(a0, r0) : "") + " Z", fill: sg.color, stroke: "rgba(255,255,255,.55)", "stroke-width": 0.8 }));
    const am = (k * 360) / n;
    g.append(svg("text", { x: 0, y: -(o.textR || 86), transform: "rotate(" + am + ")", "text-anchor": "middle", "dominant-baseline": "middle", fill: sg.text || "#fff", "font-size": o.fs || 9, "font-weight": 900 }, sg.label));
  });
  if (o.hub) g.append(o.hub);
  root.append(g);
  return { root, g };
}
/* 円盤を回す（同じ id の回転は1回だけ） */
function spinTo(T, key, g, id, idx, n, spinning, ms) {
  const st = T.ui[key] || (T.ui[key] = { ang: 0, id: null, end: 0 });
  const seg = 360 / n, final = (((-idx * seg) % 360) + 360) % 360;
  if (spinning && id != null && st.id !== id) {
    const from = st.ang, base = ((from % 360) + 360) % 360;
    const to = from + 360 * 5 + ((final - base + 360) % 360);
    st.id = id; st.ang = to; st.end = Date.now() + ms;
    g.style.transform = "rotate(" + from + "deg)";
    requestAnimationFrame(() => requestAnimationFrame(() => { g.style.transition = "transform " + ms + "ms cubic-bezier(.12,.6,.15,1)"; g.style.transform = "rotate(" + to + "deg)"; }));
    let k = 0; const tick = () => { if (!g.isConnected || Date.now() > st.end - 300) return; Snd.spin(); k++; setTimeout(tick, 60 + k * k * 1.2); }; setTimeout(tick, 60);
  } else {
    if (id != null && st.id !== id && !spinning) { st.ang = final; st.id = id; }
    g.style.transform = "rotate(" + st.ang + "deg)";
  }
}
