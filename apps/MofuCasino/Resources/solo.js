"use strict";
/* ===== ひとりで遊ぶマシン（もふコインを使う） =====
   各マシンは start(area, api) で始まり、{ destroy } を返す。
   api.bet(n) … コインを払う（足りなければ false）　api.win(n, text) … コインをもらう */

const BET_STEPS = [10, 20, 50, 100, 200, 500, 1000, 5000];
/* 共通の枠：上にコイン、真ん中、下に操作 */
function mFrame(area, g) {
  area.innerHTML = "";
  const top = h("div", { class: "m-top" }, Wallet.pill(), h("div", { class: "m-last" }));
  const body = h("div", { class: "m-body" });
  const ctrl = h("div", { class: "m-ctrl" });
  area.append(top, body, ctrl);
  return { top, body, ctrl, last: top.children[1] };
}
/* 賭け金の選択（− 100 ＋） */
function betPicker(key, onChange, steps) {
  steps = steps || BET_STEPS;
  const st = (Save.data.opts["bet_" + key] = Save.data.opts["bet_" + key] || steps[1] || steps[0]);
  let k = Math.max(0, steps.indexOf(st));
  const val = h("b", null, fmtN(steps[k]));
  const set = (d) => { k = clamp(k + d, 0, steps.length - 1); val.textContent = fmtN(steps[k]); Save.data.opts["bet_" + key] = steps[k]; Snd.init(); Snd.chip(); onChange && onChange(steps[k]); el.classList.toggle("over", steps[k] > Wallet.get()); };
  const el = h("div", { class: "bet-pick" }, h("button", { onclick: () => set(-1) }, "−"), h("div", null, h("small", null, "BET"), val), h("button", { onclick: () => set(1) }, "＋"));
  el.get = () => steps[k];
  el.lock = (on) => el.classList.toggle("locked", !!on);
  el.refresh = () => el.classList.toggle("over", steps[k] > Wallet.get());
  el.refresh();
  return el;
}
function noCoins(api) {
  Snd.bad();
  if (Wallet.get() < 100) Wallet.menu(); else toast("コインが足りません");
}

/* ---------------- もふもふスロット ---------------- */
const SLOT_SYMS = [
  { id: "cherry", e: "🍒", w: 22, pay: 14 },
  { id: "bell", e: "🔔", w: 17, pay: 28 },
  { id: "star", e: "⭐", w: 14, pay: 40 },
  { id: "pyonta", img: "pyonta", w: 11, pay: 55, chr: 1 },
  { id: "penpen", img: "penpen", w: 10, pay: 70, chr: 1 },
  { id: "mofupi", img: "mofupi", w: 8, pay: 100, chr: 1 },
  { id: "kuronya", img: "kuronya", w: 6, pay: 160, chr: 1 },
  { id: "gaorun", img: "gaorun", w: 5, pay: 250, chr: 1 },
  { id: "seven", e: "7", w: 3, pay: 777 },
];
const SLOT_LINES = [[1, 1, 1], [0, 0, 0], [2, 2, 2], [0, 1, 2], [2, 1, 0]];
const SLOT_W = SLOT_SYMS.reduce((a, s) => a + s.w, 0);
function slotPick() { let r = Math.random() * SLOT_W; for (let k = 0; k < SLOT_SYMS.length; k++) { r -= SLOT_SYMS[k].w; if (r < 0) return k; } return 0; }
function slotSpin() { return [0, 1, 2].map(() => [slotPick(), slotPick(), slotPick()]); }   // [列][行]
function slotWins(grid) {
  const wins = [];
  SLOT_LINES.forEach((ln, li) => {
    const a = grid[0][ln[0]], b = grid[1][ln[1]], c = grid[2][ln[2]];
    if (a === b && b === c) wins.push({ li, sym: a, mul: SLOT_SYMS[a].pay });
    else if (a === 0 && b === 0) wins.push({ li, sym: 0, mul: 2, two: true });   // さくらんぼ2つ
    else if (SLOT_SYMS[a].chr && SLOT_SYMS[b].chr && SLOT_SYMS[c].chr) wins.push({ li, sym: a, mul: 1, mix: true });   // キャラ3体ミックス
  });
  return wins;
}
function slotSymEl(k) { const s = SLOT_SYMS[k]; return h("div", { class: "sym s-" + s.id }, s.img ? h("img", { src: CHARS[s.img].img, alt: "" }) : s.e); }
const M_Slot = {
  id: "m_slot", name: "もふもふスロット", icon: "🎰", tag: "人気No.1",
  desc: "3×3のスロット。5本のラインでそろえよう。7が3つでジャックポット！",
  rules: "BETを決めて「スピン」。リールが止まったとき、5本のライン（横3本・ナナメ2本）のどれかで同じ絵柄が3つそろうと当たりです。\n\nBETはライン5本分の合計です（1ラインあたり BET÷5）。\n\n配当（1ラインあたりの倍率）\n・7 7 7：777倍（ジャックポット！）\n・がおるん×3：250倍\n・くろにゃ×3：160倍\n・もふぴー×3：100倍\n・ぺんぺん×3：70倍\n・ぴょんた×3：55倍\n・⭐×3：40倍／🔔×3：28倍／🍒×3：14倍\n・左から🍒🍒：2倍\n・キャラ3体（ちがう子どうしでもOK）：1倍\n\n「オート」にすると自動で回り続けます（もう一度押すと止まります）。",
  start(area, api) {
    const F = mFrame(area, this);
    const cell = Math.min(96, Math.floor((area.clientWidth - 60) / 3));
    let grid = slotSpin(), spinning = false, auto = false, alive = true;
    const machine = h("div", { class: "slot-machine", style: { "--cell": cell + "px" } });
    const reels = [0, 1, 2].map(() => h("div", { class: "reel" }, h("div", { class: "strip" })));
    const lines = h("div", { class: "slot-lines" });
    machine.append(h("div", { class: "slot-head" }, "MOFU MOFU SLOT"), h("div", { class: "reels" }, reels, lines));
    const pay = h("div", { class: "slot-pay" }, SLOT_SYMS.slice().reverse().map((s, k) => h("div", null, slotSymEl(SLOT_SYMS.length - 1 - k), h("span", null, "×" + s.pay))));
    F.body.append(machine, pay);
    const draw = (stripLen) => reels.forEach((r, c) => {
      const st = r.firstChild; st.innerHTML = ""; st.style.transition = "none"; st.style.transform = "translateY(0)";
      for (let k = 0; k < 3; k++) st.append(slotSymEl(grid[c][k]));
    });
    draw();
    const bp = betPicker("slot");
    const spinBtn = h("button", { class: "btn pink spin-btn", onclick: () => spin() }, "スピン");
    const autoBtn = h("button", { class: "btn ghost small", onclick: () => { auto = !auto; autoBtn.classList.toggle("on", auto); autoBtn.textContent = auto ? "■ オート中" : "▶ オート"; if (auto && !spinning) spin(); } }, "▶ オート");
    F.ctrl.append(h("div", { class: "row" }, bp, spinBtn), autoBtn);
    const spin = () => {
      if (spinning || !alive) return;
      const bet = bp.get();
      if (!api.bet(bet)) { auto = false; autoBtn.classList.remove("on"); autoBtn.textContent = "▶ オート"; return noCoins(api); }
      spinning = true; bp.lock(true); spinBtn.disabled = true; lines.innerHTML = ""; F.last.textContent = "";
      Snd.init(); Snd.chip();
      const old = grid; grid = slotSpin();
      reels.forEach((r, c) => {
        const st = r.firstChild; st.innerHTML = ""; st.style.transition = "none";
        const N = 14 + c * 6;
        const seq = [];
        for (let k = 0; k < 3; k++) seq.push(grid[c][k]);
        for (let k = 0; k < N; k++) seq.push(slotPick());
        for (let k = 0; k < 3; k++) seq.push(old[c][k]);
        seq.forEach((k) => st.append(slotSymEl(k)));
        st.style.transform = "translateY(" + -(seq.length - 3) * cell + "px)";
        st.getBoundingClientRect();
        const ms = 700 + c * 380;
        st.style.transition = "transform " + ms + "ms cubic-bezier(.3,.1,.25,1.08)";
        st.style.transform = "translateY(0)";
        setTimeout(() => { if (alive) { Snd.stone(); Native.haptic("soft"); } }, ms);
      });
      let t = 0; const tick = () => { if (!alive || t++ > 22) return; Snd.spin(); setTimeout(tick, 70); }; tick();
      setTimeout(() => {
        if (!alive) return;
        draw();
        const wins = slotWins(grid);
        const per = bet / 5;
        const total = Math.floor(wins.reduce((a, w) => a + w.mul * per, 0));
        wins.forEach((w) => {
          const ln = SLOT_LINES[w.li];
          lines.append(svg("svg", { class: "line l" + w.li, viewBox: "0 0 300 300", preserveAspectRatio: "none" }, svg("polyline", { points: ln.map((r, c) => (c * 100 + 50) + "," + (r * 100 + 50)).join(" ") })));
          ln.forEach((r, c) => { if (!w.two || c < 2) reels[c].firstChild.children[r].classList.add("hit"); });
        });
        spinning = false; bp.lock(false); spinBtn.disabled = false;
        if (total > 0) {
          const jp = wins.some((w) => SLOT_SYMS[w.sym].id === "seven" && !w.mix && !w.two);
          api.win(total, jp ? "ジャックポット！" : total >= bet * 10 ? "大当たり！" : null, jp);
          F.last.textContent = "+" + fmtN(total);
        }
        bp.refresh();
        if (auto) setTimeout(() => { if (auto && alive) spin(); }, total > 0 ? 1100 : 450);
      }, 700 + 2 * 380 + 120);
    };
    return { destroy() { alive = false; auto = false; } };
  },
};

/* ---------------- ビデオポーカー（ジャックス・オア・ベター） ---------------- */
const VP_PAY = [
  ["ロイヤルフラッシュ", 250], ["ストレートフラッシュ", 50], ["フォーカード", 25], ["フルハウス", 9], ["フラッシュ", 6],
  ["ストレート", 4], ["スリーカード", 3], ["ツーペア", 2], ["ジャックス以上のペア", 1],
];
function vpRank(cards) {
  const e = evalBest(cards);
  if (e.cat === 8) return e.score[1] === 14 ? 0 : 1;
  if (e.cat === 7) return 2; if (e.cat === 6) return 3; if (e.cat === 5) return 4; if (e.cat === 4) return 5;
  if (e.cat === 3) return 6; if (e.cat === 2) return 7;
  if (e.cat === 1 && e.score[1] >= 11) return 8;
  return -1;
}
const M_VideoPoker = {
  id: "m_vpoker", name: "ビデオポーカー", icon: "🃏", tag: "戦略",
  desc: "5枚から残すカードを選んで1回交換。ジャック以上のペアから当たり",
  rules: "「配る」で5枚のカードが配られます。残したいカード（ホールド）をタップして、「交換」を押すと残りのカードが入れかわります。できた役で配当がもらえます。\n\n配当（BETの何倍か）\n・ロイヤルフラッシュ（10・J・Q・K・Aの同じマーク）：250倍\n・ストレートフラッシュ：50倍\n・フォーカード：25倍\n・フルハウス：9倍\n・フラッシュ：6倍\n・ストレート：4倍\n・スリーカード：3倍\n・ツーペア：2倍\n・J・Q・K・Aのワンペア：1倍（BETが戻ってくる）\n\nコツ：ペアや役になりそうなカードは残しましょう。",
  start(area, api) {
    const F = mFrame(area, this);
    let cards = [], held = [false, false, false, false, false], phase = "idle", deck = [], bet = 0, alive = true;
    const table = h("div", { class: "vp-pay" });
    const hand = h("div", { class: "vp-hand" });
    const msg = h("div", { class: "vp-msg" }, "BETを決めて「配る」");
    F.body.append(table, hand, msg);
    const cw = Math.min(70, Math.floor((area.clientWidth - 40) / 5));
    setCardSize(hand, cw);
    const paint = (hitRow) => {
      table.innerHTML = "";
      VP_PAY.forEach(([nm, m], k) => table.append(h("div", { class: k === hitRow ? "on" : "" }, h("span", null, nm), h("b", null, "×" + m))));
      hand.innerHTML = "";
      for (let k = 0; k < 5; k++) {
        const c = cards[k];
        const el = c == null ? h("div", { class: "card static back" }) : cardEl(c, { static: true });
        const box = h("div", { class: "vp-c" + (held[k] ? " held" : ""), onclick: () => { if (phase !== "hold") return; held[k] = !held[k]; Snd.tick(); paint(-1); } }, el, h("div", { class: "hl" }, held[k] ? "HOLD" : ""));
        hand.append(box);
      }
    };
    paint(-1);
    const bp = betPicker("vp");
    const btn = h("button", { class: "btn pink spin-btn", onclick: () => go() }, "配る");
    F.ctrl.append(h("div", { class: "row" }, bp, btn));
    const go = () => {
      if (!alive) return;
      Snd.init();
      if (phase !== "hold") {
        bet = bp.get();
        if (!api.bet(bet)) return noCoins(api);
        deck = shuffle(makeDeck()); cards = [deck.pop(), deck.pop(), deck.pop(), deck.pop(), deck.pop()]; held = [false, false, false, false, false];
        phase = "hold"; bp.lock(true); btn.textContent = "交換"; Snd.card(); F.last.textContent = "";
        const r = vpRank(cards);
        msg.textContent = r >= 0 ? "いまの役：" + VP_PAY[r][0] + "（残すカードをタップ）" : "残すカードをタップして「交換」";
        // 役があればホールドの候補を光らせる
        paint(r);
        return;
      }
      for (let k = 0; k < 5; k++) if (!held[k]) cards[k] = deck.pop();
      Snd.card();
      const r = vpRank(cards);
      phase = "idle"; bp.lock(false); btn.textContent = "配る";
      paint(r);
      if (r >= 0) { const w = bet * VP_PAY[r][1]; api.win(w, r <= 2 ? VP_PAY[r][0] + "！" : null, r <= 1); msg.textContent = VP_PAY[r][0] + "！ +" + fmtN(w); F.last.textContent = "+" + fmtN(w); }
      else { msg.textContent = "役なし… もう一回！"; Snd.lose(); }
      bp.refresh();
    };
    return { destroy() { alive = false; } };
  },
};

/* ---------------- キノ ---------------- */
const KENO_PAY = {
  1: [0, 3.8], 2: [0, 1.2, 8], 3: [0, 0.5, 2.8, 26], 4: [0, 0.4, 1.5, 6, 80],
  5: [0, 0.2, 1, 3.5, 18, 250], 6: [0, 0, 0.8, 2.5, 8, 60, 1000], 7: [0, 0, 0.4, 1.6, 5, 25, 250, 2000], 8: [0, 0, 0.2, 1.1, 3.5, 13, 120, 800, 5000],
};
const M_Keno = {
  id: "m_keno", name: "キノ", icon: "🔢", tag: "数字",
  desc: "1〜40から好きな数字を最大8個えらぶ。10個の当たり数字とたくさん重なれば大きな配当",
  rules: "1〜40の中から好きな数字を1〜8個えらんで「スタート」。\n10個の当たり数字が出て、えらんだ数字といくつ重なったか（ヒット数）で配当が決まります。\n\n・えらぶ数が多いほど、全部当てたときの配当がすごく大きくなります（8個中8ヒットで5000倍！）。\n・配当表は画面の右側に出ます（BETの何倍か）。\n・「おまかせ」でランダムにえらべます。",
  start(area, api) {
    const F = mFrame(area, this);
    const pickSet = new Set(Save.data.opts.kenoPick || []);
    let drawn = [], running = false, alive = true;
    const board = h("div", { class: "keno-board" });
    const side = h("div", { class: "keno-side" });
    F.body.append(h("div", { class: "keno-wrap" }, board, side));
    const paint = () => {
      board.innerHTML = "";
      for (let n = 1; n <= 40; n++) {
        const p = pickSet.has(n), d = drawn.includes(n);
        board.append(h("button", { class: "kn" + (p ? " pick" : "") + (d ? " drawn" : "") + (p && d ? " hit" : ""), onclick: () => {
          if (running) return;
          if (p) pickSet.delete(n); else if (pickSet.size < 8) pickSet.add(n); else { toast("えらべるのは8個まで"); return; }
          drawn = []; Snd.init(); Snd.tick(); paint();
        } }, n));
      }
      side.innerHTML = "";
      const k = pickSet.size, hits = drawn.filter((n) => pickSet.has(n)).length;
      side.append(h("div", { class: "kh" }, k ? k + "個えらび中" : "数字をえらぼう"));
      if (k) KENO_PAY[k].forEach((m, i) => { if (m) side.append(h("div", { class: "kp" + (drawn.length === 10 && i === hits ? " on" : "") }, h("span", null, i + "ヒット"), h("b", null, "×" + m))); });
      if (drawn.length) side.append(h("div", { class: "kh hitn" }, hits + " ヒット"));
    };
    paint();
    const bp = betPicker("keno");
    const goBtn = h("button", { class: "btn pink spin-btn", onclick: () => go() }, "スタート");
    F.ctrl.append(h("div", { class: "row" }, bp, goBtn),
      h("div", { class: "row" }, h("button", { class: "btn ghost small", onclick: () => { if (running) return; pickSet.clear(); while (pickSet.size < 5) pickSet.add(1 + rnd(40)); drawn = []; Snd.tick(); paint(); } }, "🎲 おまかせ"),
        h("button", { class: "btn ghost small", onclick: () => { if (running) return; pickSet.clear(); drawn = []; paint(); } }, "クリア")));
    const go = async () => {
      if (running || !alive) return;
      const k = pickSet.size;
      if (!k) { toast("数字を1つ以上えらんでね"); Snd.bad(); return; }
      const bet = bp.get();
      if (!api.bet(bet)) return noCoins(api);
      Save.data.opts.kenoPick = [...pickSet]; Save.write();
      running = true; bp.lock(true); goBtn.disabled = true; drawn = []; F.last.textContent = "";
      Snd.init();
      const pool = shuffle([...Array(40).keys()].map((x) => x + 1)).slice(0, 10);
      for (const n of pool) {
        await sleep(window.__FAST ? 1 : 260);
        if (!alive) return;
        drawn.push(n);
        if (pickSet.has(n)) { Snd.ok(); Native.haptic("light"); } else Snd.tick();
        paint();
      }
      const hits = drawn.filter((n) => pickSet.has(n)).length;
      const w = Math.floor(bet * KENO_PAY[k][hits]);
      running = false; bp.lock(false); goBtn.disabled = false;
      if (w > 0) { api.win(w, KENO_PAY[k][hits] >= 20 ? hits + "ヒット！" : null, KENO_PAY[k][hits] >= 200); F.last.textContent = "+" + fmtN(w); } else Snd.lose();
      bp.refresh();
    };
    return { destroy() { alive = false; } };
  },
};

/* ---------------- ハイ＆ロー ---------------- */
const M_HighLow = {
  id: "m_hilo", name: "ハイ＆ロー", icon: "⬆️", tag: "かんたん",
  desc: "次のカードは大きい？小さい？当てるたびに倍率アップ。好きなときにやめられる",
  rules: "表になっているカードより、次のカードが「大きい（ハイ）」か「小さい（ロー）」かを当てます。\n\n・強さ：A（いちばん小さい）＜2＜…＜10＜J＜Q＜K（いちばん大きい）\n・当たる確率が低い方を当てるほど、倍率が大きく上がります（ボタンに次の倍率が出ます）。\n・同じ数字が出たら「引き分け」で、倍率はそのまま続きます。\n・はずれると賭けたコインは没収。\n・「コインを受け取る」でいつでもやめて、BET×倍率のコインをもらえます。",
  start(area, api) {
    const F = mFrame(area, this);
    let deck = [], cur = null, mult = 1, bet = 0, playing = false, alive = true, streak = 0, hist = [];
    const cardBox = h("div", { class: "hl-card" });
    const info = h("div", { class: "hl-info" });
    const histEl = h("div", { class: "hl-hist" });
    F.body.append(histEl, cardBox, info);
    setCardSize(cardBox, Math.min(120, area.clientWidth * 0.3));
    const pr = (r) => ({ hi: (13 - r) / 13, lo: (r - 1) / 13 });
    const next = (r, dir) => { const p = pr(r)[dir]; return p > 0 ? Math.floor(mult * 0.96 / (p / (1 - 1 / 13)) * 100) / 100 : 0; };
    const bp = betPicker("hilo");
    const hiBtn = h("button", { class: "btn mint" });
    const loBtn = h("button", { class: "btn sky" });
    const cashBtn = h("button", { class: "btn lemon wide" });
    const startBtn = h("button", { class: "btn pink spin-btn", onclick: () => begin() }, "はじめる");
    F.ctrl.append(h("div", { class: "row" }, bp, startBtn), h("div", { class: "row" }, hiBtn, loBtn), cashBtn);
    const paint = (enter) => {
      cardBox.innerHTML = "";
      const e = cur == null ? h("div", { class: "card static back" }) : cardEl(cur, { static: true });
      if (enter) e.classList.add("enter");
      cardBox.append(e);
      histEl.innerHTML = ""; const hr = h("div", { class: "crow" }); setCardSize(hr, 30); hist.slice(-8).forEach((c) => hr.append(cardEl(c, { static: true }))); histEl.append(hr);
      const r = cur == null ? 0 : rankOf(cur);
      hiBtn.style.display = loBtn.style.display = cashBtn.style.display = playing ? "" : "none";
      startBtn.style.display = playing ? "none" : "";
      bp.lock(playing);
      if (playing) {
        const nh = next(r, "hi"), nl = next(r, "lo");
        hiBtn.innerHTML = ""; hiBtn.append(h("span", null, "⬆ ハイ"), h("small", null, nh ? "×" + nh : "−"));
        loBtn.innerHTML = ""; loBtn.append(h("span", null, "⬇ ロー"), h("small", null, nl ? "×" + nl : "−"));
        hiBtn.disabled = !nh; loBtn.disabled = !nl;
        cashBtn.textContent = "🪙 コインを受け取る（" + fmtN(Math.floor(bet * mult)) + "）";
        cashBtn.disabled = streak === 0;
        info.innerHTML = ""; info.append(h("div", null, "いまの倍率 ", h("b", null, "×" + mult.toFixed(2))), h("small", null, streak + "連続あたり"));
      } else { info.innerHTML = ""; info.append(h("div", null, "BETを決めて「はじめる」")); }
    };
    const begin = () => {
      if (!alive) return;
      bet = bp.get();
      if (!api.bet(bet)) return noCoins(api);
      Snd.init(); Snd.card();
      deck = shuffle(makeDeck()); cur = deck.pop(); mult = 1; streak = 0; hist = []; playing = true; F.last.textContent = "";
      paint(true);
    };
    const guess = (dir) => {
      if (!playing) return;
      const r = rankOf(cur), nm = next(r, dir);
      if (!nm) return;
      if (deck.length < 5) deck = shuffle(makeDeck());
      const c = deck.pop(), r2 = rankOf(c);
      hist.push(cur); cur = c; Snd.card();
      if (r2 === r) { toast("同じ数字！引き分け"); paint(true); return; }
      if ((dir === "hi" && r2 > r) || (dir === "lo" && r2 < r)) { mult = nm; streak++; Snd.ok(); Native.haptic("light"); paint(true); if (streak >= 12) cash(); return; }
      playing = false; Snd.lose(); Native.haptic("soft"); bigMsg("はずれ…", "#86b8ff");
      F.last.textContent = "-" + fmtN(bet);
      api.lose && api.lose();
      paint(true); bp.refresh();
    };
    const cash = () => {
      if (!playing || !streak) return;
      const w = Math.floor(bet * mult);
      playing = false;
      api.win(w, mult >= 10 ? "×" + mult.toFixed(1) + "！" : null, mult >= 30);
      F.last.textContent = "+" + fmtN(w);
      paint(false); bp.refresh();
    };
    hiBtn.onclick = () => guess("hi"); loBtn.onclick = () => guess("lo"); cashBtn.onclick = () => cash();
    paint(false);
    return { destroy() { alive = false; } };
  },
};

/* ---------------- 宝さがし（マインズ） ---------------- */
const M_Mines = {
  id: "m_mines", name: "宝さがし", icon: "💎", tag: "ドキドキ",
  desc: "5×5のマスから宝石をさがす。めくるほど倍率アップ、ばくだんが出たらおしまい",
  rules: "25マスの中に、ばくだんがかくれています（数は選べます）。\n\n・マスをタップしてめくり、宝石💎が出たら倍率アップ！\n・ばくだん💣が出たら、賭けたコインは没収です。\n・「コインを受け取る」でいつでもやめて、BET×倍率をもらえます。\n・ばくだんが多いほど、1つめくったときの倍率の上がり方が大きくなります。",
  start(area, api) {
    const F = mFrame(area, this);
    let bombs = Save.data.opts.mines || 3, mines = null, open = new Set(), playing = false, bet = 0, alive = true, boom = -1;
    const mult = (k) => { let m = 0.97; for (let i = 0; i < k; i++) m *= (25 - i) / (25 - bombs - i); return Math.floor(m * 100) / 100; };
    const grid = h("div", { class: "mn-grid" });
    const info = h("div", { class: "hl-info" });
    const seg = h("div", { class: "seg mn-seg" });
    F.body.append(seg, grid, info);
    const bp = betPicker("mines");
    const startBtn = h("button", { class: "btn pink spin-btn", onclick: () => begin() }, "はじめる");
    const cashBtn = h("button", { class: "btn lemon wide", onclick: () => cash() });
    F.ctrl.append(h("div", { class: "row" }, bp, startBtn), cashBtn);
    const paint = () => {
      seg.innerHTML = "";
      [1, 3, 5, 10].forEach((b) => seg.append(h("button", { class: bombs === b ? "on" : "", disabled: playing, onclick: () => { bombs = b; Save.data.opts.mines = b; Snd.tick(); paint(); } }, "💣" + b)));
      grid.innerHTML = "";
      for (let k = 0; k < 25; k++) {
        const isOpen = open.has(k), show = !playing && mines;
        const isB = mines && mines.has(k);
        grid.append(h("button", { class: "mn" + (isOpen ? " open" : "") + (show && isB ? " bomb" + (k === boom ? " boom" : "") : "") + (show && !isB && !isOpen ? " ghost" : ""), onclick: () => tap(k) },
          isOpen ? (k % 5 === 2 && k === 12 ? "⭐" : "💎") : show ? (isB ? "💣" : "💎") : ""));
      }
      startBtn.style.display = playing ? "none" : ""; cashBtn.style.display = playing ? "" : "none";
      bp.lock(playing);
      info.innerHTML = "";
      if (playing) {
        cashBtn.textContent = "🪙 コインを受け取る（" + fmtN(Math.floor(bet * mult(open.size))) + "）"; cashBtn.disabled = !open.size;
        info.append(h("div", null, "いまの倍率 ", h("b", null, "×" + (open.size ? mult(open.size) : 1).toFixed(2))), h("small", null, "次をあてると ×" + mult(open.size + 1).toFixed(2)));
      } else info.append(h("div", null, "ばくだんの数とBETを決めて「はじめる」"));
    };
    const begin = () => {
      if (!alive) return;
      bet = bp.get();
      if (!api.bet(bet)) return noCoins(api);
      Snd.init(); Snd.chip();
      const all = shuffle([...Array(25).keys()]);
      mines = new Set(all.slice(0, bombs)); open = new Set(); playing = true; boom = -1; F.last.textContent = "";
      paint();
    };
    const tap = (k) => {
      if (!playing || open.has(k)) return;
      if (mines.has(k)) { boom = k; playing = false; Snd.bad(); Snd.lose(); Native.haptic("soft"); bigMsg("ドカーン！", "#e34b62"); F.last.textContent = "-" + fmtN(bet); paint(); bp.refresh(); return; }
      open.add(k); Snd.ok(); Native.haptic("light");
      if (open.size === 25 - bombs) return cash();
      paint();
    };
    const cash = () => {
      if (!playing || !open.size) return;
      const m = mult(open.size), w = Math.floor(bet * m);
      playing = false;
      api.win(w, m >= 10 ? "×" + m.toFixed(1) + "！" : null, m >= 50);
      F.last.textContent = "+" + fmtN(w);
      paint(); bp.refresh();
    };
    paint();
    return { destroy() { alive = false; } };
  },
};

/* ---------------- プリンコ ---------------- */
const PLINKO = {
  8: { low: [5.6, 2.1, 1.1, 1, 0.5, 1, 1.1, 2.1, 5.6], high: [29, 4, 1.5, 0.3, 0.2, 0.3, 1.5, 4, 29] },
  12: { low: [10, 3, 1.6, 1.4, 1.1, 1, 0.5, 1, 1.1, 1.4, 1.6, 3, 10], high: [170, 24, 8.1, 2, 0.7, 0.2, 0.2, 0.2, 0.7, 2, 8.1, 24, 170] },
};
const M_Plinko = {
  id: "m_plinko", name: "プリンコ", icon: "🔵", tag: "運だめし",
  desc: "玉を落として、くぎにカン・コン。はしっこに落ちたら大当たり！",
  rules: "玉を上から落とすと、くぎに当たって右か左にはねながら落ちていきます。いちばん下の箱に書かれた倍率で、コインがもらえます。\n\n・はしっこほど倍率が高く、真ん中ほど低くなります。\n・段数（8段／12段）とリスク（ひくい／たかい）を選べます。リスクが高いと、はしっこの倍率がとても大きくなるかわりに、真ん中はかなり低くなります。\n・玉は続けて何個でも落とせます。",
  start(area, api) {
    const F = mFrame(area, this);
    let rows = Save.data.opts.plRows || 8, risk = Save.data.opts.plRisk || "low", alive = true, balls = 0;
    const seg = h("div", { class: "row pl-opts" });
    const box = h("div", { class: "pl-box" });
    F.body.append(seg, box);
    let geo = null;
    const build = () => {
      seg.innerHTML = "";
      seg.append(h("div", { class: "seg" }, [8, 12].map((r) => h("button", { class: rows === r ? "on" : "", disabled: balls > 0, onclick: () => { rows = r; Save.data.opts.plRows = r; build(); } }, r + "段"))),
        h("div", { class: "seg" }, [["low", "ひくい"], ["high", "たかい"]].map(([k, l]) => h("button", { class: risk === k ? "on" : "", disabled: balls > 0, onclick: () => { risk = k; Save.data.opts.plRisk = k; build(); } }, "リスク " + l))));
      box.innerHTML = "";
      const W = Math.min(box.clientWidth || area.clientWidth - 20, 420), H = Math.max(200, (box.clientHeight || 320) - 4);
      const gap = Math.min(W / (rows + 2), (H - 40) / (rows + 1));
      const top = 14, cx = W / 2;
      geo = { gap, top, cx, W, H };
      const board = h("div", { class: "pl-board", style: { width: W + "px", height: top + gap * (rows + 1) + 34 + "px" } });
      for (let r = 0; r < rows; r++) for (let k = 0; k <= r + 2; k++) {
        if (r === 0 && (k === 0)) {}
        const x = cx + (k - (r + 2) / 2) * gap, y = top + (r + 1) * gap;
        board.append(h("i", { class: "peg", style: { left: x + "px", top: y + "px" } }));
      }
      const mul = PLINKO[rows][risk];
      const y = top + (rows + 1) * gap + 6;
      mul.forEach((m, k) => {
        const x = cx + (k - rows / 2) * gap;
        const hot = Math.abs(k - rows / 2) / (rows / 2);
        board.append(h("div", { class: "pl-bin", id: "plb" + k, style: { left: x + "px", top: y + "px", width: gap - 3 + "px", background: "hsl(" + (130 - hot * 130) + ",75%," + (70 - hot * 12) + "%)" } }, m >= 100 ? Math.round(m) : m));
      });
      box.append(board);
      geo.board = board;
    };
    requestAnimationFrame(build);
    const bp = betPicker("plinko");
    const dropBtn = h("button", { class: "btn pink spin-btn", onclick: () => drop() }, "玉を落とす");
    F.ctrl.append(h("div", { class: "row" }, bp, dropBtn));
    const drop = () => {
      if (!alive || !geo) return;
      const bet = bp.get();
      if (!api.bet(bet)) return noCoins(api);
      Snd.init(); Snd.tick();
      balls++; seg.querySelectorAll("button").forEach((b) => (b.disabled = true));
      const path = []; let pos = 0;
      for (let r = 0; r < rows; r++) { const d = rnd(2); pos += d; path.push(pos); }
      const { gap, top, cx, board } = geo;
      const ball = h("div", { class: "pl-ball", style: { left: cx + "px", top: top - 4 + "px" } });
      board.append(ball);
      let r = 0;
      const step = () => {
        if (!alive) return;
        if (r < rows) {
          const k = path[r];
          const x = cx + (k - (r + 1) / 2) * gap, y = top + (r + 1) * gap - gap * 0.35;
          ball.style.left = x + "px"; ball.style.top = y + "px";
          Snd.tone(1100 + r * 40, 0.03, "sine", 0.04);
          r++; setTimeout(step, window.__FAST ? 1 : 150);
          return;
        }
        const k = path[rows - 1];
        ball.style.top = top + (rows + 1) * gap + 4 + "px";
        setTimeout(() => {
          ball.remove(); balls--;
          if (!balls) seg.querySelectorAll("button").forEach((b) => (b.disabled = false));
          const m = PLINKO[rows][risk][k], w = Math.floor(bet * m);
          const bin = board.querySelector("#plb" + k); if (bin) { bin.classList.remove("pop"); bin.getBoundingClientRect(); bin.classList.add("pop"); }
          if (w > 0) api.win(w, m >= 20 ? "×" + m + "！" : null, m >= 100, true);
          F.last.textContent = (w >= bet ? "+" : "") + fmtN(w) + "（×" + m + "）";
          bp.refresh();
        }, window.__FAST ? 1 : 160);
      };
      setTimeout(step, 60);
    };
    return { destroy() { alive = false; } };
  },
};

/* ---------------- ビッグホイール ---------------- */
const BW_SEGS = (() => {
  const plan = [1, 2, 1, 5, 1, 2, 1, 10, 1, 2, 1, 5, 1, 2, 1, 20, 1, 2, 1, 5, 1, 2, 1, 10, 1, 2, 1, 40, 1, 2, 1, 5, 1, 2, 1, 10, 1, 2, 1, 5, 1, 2, 1, 20, 1, 2, 1, 5, 1, 2, 1, 10, 1, 41];
  return plan;   // 54マス（40と41はキャラの40倍マス）
})();
const BW_KIND = [1, 2, 5, 10, 20, 40, 41];
const BW_COL = { 1: "#ffd66b", 2: "#7fd6b4", 5: "#86b8ff", 10: "#b9a3ff", 20: "#ff8fb1", 40: "#ff7a59", 41: "#33304a" };
const M_Wheel = {
  id: "m_wheel", name: "ビッグホイール", icon: "🎡", tag: "みんな好き",
  desc: "大きなホイールを回して止まる数字を予想。数字がそのまま倍率！",
  rules: "大きなホイール（54マス）を回して、どの数字で止まるかを予想します。数字がそのまま倍率です。\n\n・1：24マス（1倍）\n・2：15マス（2倍）\n・5：7マス（5倍）\n・10：4マス（10倍）\n・20：2マス（20倍）\n・もふ★：1マス（40倍）\n・くろ★：1マス（40倍）\n\nいくつの数字に賭けてもOK。賭けたい数字をタップ（タップするたびにBETの額が追加）して「回す」。",
  start(area, api) {
    const F = mFrame(area, this);
    let bets = {}, spinning = false, alive = true, spinId = 0, idx = null;
    const ui = { ui: {} };
    const segs = BW_SEGS.map((v) => ({ label: v === 40 ? "もふ" : v === 41 ? "くろ" : v, color: BW_COL[v], text: v === 1 ? "#5a4320" : "#fff" }));
    const size = Math.min(area.clientWidth - 40, 260);
    const W = wheelSvg(segs, size, { inner: 34, textR: 84, fs: 8, rim: "#b8803f", hub: svg("g", null, svg("circle", { r: 32, fill: "#fff6ec" }), svg("text", { "text-anchor": "middle", "dominant-baseline": "middle", "font-size": 13, "font-weight": 900, fill: "#ff8fb1" }, "MOFU")) });
    const wbox = h("div", { class: "wheel-box big" }, W.root, h("div", { class: "wheel-ptr" }, "▼"));
    const spots = h("div", { class: "bw-spots" });
    F.body.append(wbox, spots);
    spinTo(ui, "bw", W.g, null, 0, 54, false, 0);
    const name = (v) => (v === 40 ? "もふ★" : v === 41 ? "くろ★" : String(v));
    const paintSpots = (win) => {
      spots.innerHTML = "";
      BW_KIND.forEach((v) => spots.append(h("button", { class: "bw-s" + (win === v ? " win" : ""), style: { "--sc": BW_COL[v] }, onclick: () => {
        if (spinning) return;
        const amt = bp.get(), tot = Object.values(bets).reduce((a, b) => a + b, 0);
        if (tot + amt > Wallet.get()) { noCoins(); return; }
        bets[v] = (bets[v] || 0) + amt; Snd.init(); Snd.chip(); paintSpots();
      } }, v === 40 ? h("img", { src: CHARS.mofupi.img }) : v === 41 ? h("img", { src: CHARS.kuronya.img }) : null, h("b", null, name(v)), h("small", null, "×" + (v === 41 ? 40 : v)), bets[v] ? chipEl(bets[v], { cls: "mine" }) : null)));
    };
    paintSpots();
    const bp = betPicker("wheel");
    const spinBtn = h("button", { class: "btn pink spin-btn", onclick: () => spin() }, "回す");
    F.ctrl.append(h("div", { class: "row" }, bp, spinBtn), h("button", { class: "btn ghost small", onclick: () => { if (!spinning) { bets = {}; paintSpots(); } } }, "賭けを戻す"));
    const spin = () => {
      if (spinning || !alive) return;
      const tot = Object.values(bets).reduce((a, b) => a + b, 0);
      if (!tot) { toast("数字をタップして賭けてね"); Snd.bad(); return; }
      if (!api.bet(tot)) return noCoins(api);
      spinning = true; spinBtn.disabled = true; bp.lock(true); F.last.textContent = "";
      idx = rnd(54); spinId++;
      spinTo(ui, "bw", W.g, spinId, idx, 54, true, window.__FAST ? 10 : 4200);
      setTimeout(() => {
        if (!alive) return;
        const v = BW_SEGS[idx], m = v === 41 ? 40 : v;
        const w = (bets[v] || 0) * (m + 1);
        spinning = false; spinBtn.disabled = false; bp.lock(false);
        paintSpots(v);
        bigMsg(name(v) + "！", BW_COL[v]);
        if (w > 0) { api.win(w, m >= 20 ? "×" + m + "！" : null, m >= 40); F.last.textContent = "+" + fmtN(w); } else Snd.lose();
        bets = {}; setTimeout(() => alive && !spinning && paintSpots(), 1500);
        bp.refresh();
      }, (window.__FAST ? 20 : 4300));
    };
    return { destroy() { alive = false; } };
  },
};

/* ---------------- ロケット（クラッシュ） ---------------- */
const M_Crash = {
  id: "m_crash", name: "ロケット", icon: "🚀", tag: "スリル",
  desc: "どんどん上がる倍率！ロケットが爆発する前に「受け取る」を押せるか？",
  rules: "スタートすると倍率が1.00倍からどんどん上がっていきます。\nいつかロケットが「ドカーン！」と爆発します（いつ爆発するかは毎回ランダム）。\n\n・爆発する前に「受け取る」を押せば、BET×そのときの倍率がもらえます。\n・間に合わなかったら、賭けたコインは没収。\n・「自動で受け取る」の倍率を決めておくと、その倍率になった瞬間に自動で受け取ります。",
  start(area, api) {
    const F = mFrame(area, this);
    let state = "idle", m = 1, crashAt = 1, t0 = 0, bet = 0, alive = true, raf = 0, auto = Save.data.opts.crashAuto || 0, hist = Save.data.opts.crashHist || [];
    const sky = h("div", { class: "cr-sky" });
    const rocket = h("div", { class: "rocket" }, h("img", { src: CHARS.penpen.img }), h("div", { class: "flame" }, "🔥"));
    const num = h("div", { class: "cr-num" }, "1.00×");
    const histEl = h("div", { class: "cr-hist" });
    const graph = svg("svg", { class: "cr-graph", viewBox: "0 0 100 100", preserveAspectRatio: "none" }, svg("polyline", { points: "0,100" }));
    sky.append(graph, rocket, num);
    F.body.append(histEl, sky);
    const autoSeg = h("div", { class: "seg" }, [[0, "なし"], [1.5, "1.5×"], [2, "2×"], [5, "5×"], [10, "10×"]].map(([v, l]) => h("button", { class: auto === v ? "on" : "", onclick: (e) => { auto = v; Save.data.opts.crashAuto = v; autoSeg.querySelectorAll("button").forEach((b) => b.classList.remove("on")); e.currentTarget.classList.add("on"); Snd.tick(); } }, l)));
    const bp = betPicker("crash");
    const btn = h("button", { class: "btn pink spin-btn", onclick: () => (state === "fly" ? cash() : go()) }, "スタート");
    F.ctrl.append(h("div", { class: "row" }, bp, btn), h("div", { class: "row cr-auto" }, h("small", null, "自動で受け取る"), autoSeg));
    const paintHist = () => { histEl.innerHTML = ""; hist.slice(0, 10).forEach((x) => histEl.append(h("i", { class: x >= 2 ? "hi" : "" }, x.toFixed(2) + "×"))); };
    paintHist();
    const place = () => {
      const p = Math.min(1, Math.log(m) / Math.log(Math.max(2.5, m * 1.15)));
      rocket.style.left = 8 + p * 70 + "%"; rocket.style.bottom = 6 + p * 66 + "%";
      num.textContent = m.toFixed(2) + "×";
      const pts = []; for (let k = 0; k <= 20; k++) { const q = k / 20; pts.push((q * (8 + p * 70) + 4).toFixed(1) + "," + (100 - (q * q * (6 + p * 66) + 4)).toFixed(1)); }
      graph.firstChild.setAttribute("points", pts.join(" "));
    };
    const go = () => {
      if (!alive) return;
      bet = bp.get();
      if (!api.bet(bet)) return noCoins(api);
      Snd.init(); Snd.chip();
      const u = Math.random();
      crashAt = Math.max(1, Math.floor((0.97 / (1 - u)) * 100) / 100);
      if (u < 0.03) crashAt = 1;
      state = "fly"; m = 1; t0 = performance.now(); F.last.textContent = "";
      sky.classList.remove("boom", "safe"); sky.classList.add("fly");
      btn.textContent = "🪙 受け取る"; btn.classList.add("cash"); bp.lock(true);
      const loop = (now) => {
        if (!alive || state !== "fly") return;
        const t = (now - t0) / 1000 * (window.__FAST ? 40 : 1);
        m = Math.floor(Math.pow(Math.E, 0.11 * t + 0.0025 * t * t) * 100) / 100;
        if (auto && m >= auto && auto <= crashAt) { m = auto; place(); cash(); return; }
        if (m >= crashAt) { m = crashAt; place(); return crash(); }
        place();
        btn.textContent = "🪙 受け取る（" + fmtN(Math.floor(bet * m)) + "）";
        if (Math.random() < 0.08) Snd.tone(400 + m * 40, 0.03, "sine", 0.03);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    };
    const end = () => {
      state = "idle"; btn.textContent = "スタート"; btn.classList.remove("cash"); bp.lock(false); sky.classList.remove("fly");
      hist.unshift(crashAt); hist = hist.slice(0, 12); Save.data.opts.crashHist = hist; paintHist(); bp.refresh();
    };
    const crash = () => { sky.classList.add("boom"); num.textContent = "ドカーン！ " + crashAt.toFixed(2) + "×"; Snd.bad(); Snd.lose(); Native.haptic("soft"); F.last.textContent = "-" + fmtN(bet); end(); };
    const cash = () => {
      if (state !== "fly") return;
      const w = Math.floor(bet * m);
      state = "cashed"; cancelAnimationFrame(raf);
      sky.classList.add("safe");
      api.win(w, m >= 10 ? m.toFixed(2) + "×！" : null, m >= 50);
      F.last.textContent = "+" + fmtN(w) + "（" + m.toFixed(2) + "×）";
      num.textContent = m.toFixed(2) + "× 受け取り！（爆発 " + crashAt.toFixed(2) + "×）";
      end();
    };
    place();
    return { destroy() { alive = false; cancelAnimationFrame(raf); } };
  },
};

/* ---------------- スクラッチくじ ---------------- */
const SC_TABLE = [[100, 0.0005], [50, 0.0015], [10, 0.015], [5, 0.04], [3, 0.06], [2, 0.08], [1, 0.14]];
const M_Scratch = {
  id: "m_scratch", name: "スクラッチ", icon: "🎟️", tag: "けずる",
  desc: "くじを買ってマスをけずろう。同じ倍率が3つそろえば当たり！",
  rules: "くじを1枚買って、9つのマスをタップしてけずります（「ぜんぶけずる」でも OK）。\n\n・同じ倍率が3つそろったら当たり！くじの値段×その倍率のコインがもらえます。\n・倍率：×1／×2／×3／×5／×10／×50／×100\n・3つそろわなかったらはずれです。",
  start(area, api) {
    const F = mFrame(area, this);
    let cells = null, open = [], price = 0, prize = 0, alive = true, done = true;
    const ticket = h("div", { class: "sc-ticket" });
    F.body.append(ticket);
    const bp = betPicker("scratch", null, [10, 50, 100, 500, 1000]);
    const buyBtn = h("button", { class: "btn pink spin-btn", onclick: () => buy() }, "くじを買う");
    const allBtn = h("button", { class: "btn lemon wide", onclick: () => { if (!cells || done) return; for (let k = 0; k < 9; k++) open[k] = true; Snd.noise(0.2, 0.08); paint(); check(); } }, "ぜんぶけずる");
    F.ctrl.append(h("div", { class: "row" }, bp, buyBtn), allBtn);
    const paint = () => {
      ticket.innerHTML = "";
      ticket.append(h("div", { class: "sc-head" }, h("img", { src: CHARS.gaorun.img }), h("div", null, h("b", null, "もふもふスクラッチ"), h("small", null, "同じ倍率3つで当たり！")), h("img", { src: CHARS.pyonta.img })));
      const g = h("div", { class: "sc-grid" });
      for (let k = 0; k < 9; k++) {
        const v = cells ? cells[k] : null;
        const hit = done && cells && prize && v === prize;
        g.append(h("button", { class: "sc-c" + (cells && open[k] ? " open" : "") + (hit ? " hit" : ""), onclick: () => { if (!cells || done || open[k]) return; open[k] = true; Snd.noise(0.08, 0.08); Native.haptic("soft"); paint(); check(); } },
          cells && open[k] ? "×" + v : cells ? "？" : ""));
      }
      ticket.append(g);
      ticket.append(h("div", { class: "sc-foot" }, cells ? (done ? (prize ? "当たり！×" + prize + "（+" + fmtN(price * prize) + "）" : "はずれ…") : "マスをタップしてけずろう") : "くじの値段を決めて「くじを買う」"));
      allBtn.style.display = cells && !done ? "" : "none";
      buyBtn.disabled = cells && !done; bp.lock(cells && !done);
    };
    const buy = () => {
      if (!alive || (cells && !done)) return;
      price = bp.get();
      if (!api.bet(price)) return noCoins(api);
      Snd.init(); Snd.coin();
      let r = Math.random(); prize = 0;
      for (const [m, p] of SC_TABLE) { if (r < p) { prize = m; break; } r -= p; }
      const vals = [1, 2, 3, 5, 10, 50, 100];
      let arr;
      if (prize) { arr = [prize, prize, prize]; const others = shuffle(vals.filter((v) => v !== prize)); for (let k = 0; arr.length < 9; k++) arr.push(others[Math.floor(k / 2) % others.length]); }
      else { const pool = shuffle(vals.concat(vals)).slice(0, 9); arr = pool; }
      // 3つ以上そろわないように調整
      cells = shuffle(arr); open = Array(9).fill(false); done = false; F.last.textContent = "";
      paint();
    };
    const check = () => {
      if (open.every(Boolean) && !done) {
        done = true;
        if (prize) { const w = price * prize; api.win(w, prize >= 10 ? "×" + prize + "！" : null, prize >= 50); F.last.textContent = "+" + fmtN(w); } else { Snd.lose(); F.last.textContent = "-" + fmtN(price); }
        paint(); bp.refresh();
      }
    };
    paint();
    return { destroy() { alive = false; } };
  },
};

const SOLO_GAMES = [M_Slot, M_VideoPoker, M_Plinko, M_Crash, M_Mines, M_HighLow, M_Wheel, M_Keno, M_Scratch];
