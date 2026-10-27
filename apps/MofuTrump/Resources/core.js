"use strict";
/* ===== 共通ユーティリティ ===== */
const $ = (id) => document.getElementById(id);
const h = (tag, attrs, ...kids) => {
  const e = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === "class") e.className = v;
    else if (k === "style" && typeof v === "object") Object.assign(e.style, v);
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (k === "html") e.innerHTML = v;
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(String(k)));
  return e;
};
const rnd = (n) => Math.floor(Math.random() * n);
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const clone = (o) => JSON.parse(JSON.stringify(o));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pick = (a) => a[rnd(a.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ===== ネイティブ（iPhoneアプリ）との橋渡し ===== */
const Native = {
  has: !!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.app),
  send(type, extra) {
    if (!this.has) return false;
    try { window.webkit.messageHandlers.app.postMessage(JSON.stringify(Object.assign({ type }, extra || {}))); return true; } catch (e) { return false; }
  },
  haptic(kind) { this.send("haptic", { kind: kind || "light" }); },
};

/* ===== セーブ ===== */
const Save = {
  key: "mofutrump_v1",
  data: null,
  load() {
    let raw = null;
    if (window.__SAVE__) raw = window.__SAVE__;
    else { try { raw = localStorage.getItem(this.key); } catch (e) {} }
    try { this.data = raw ? JSON.parse(raw) : null; } catch (e) { this.data = null; }
    if (!this.data) this.data = {};
    const d = this.data;
    d.me = d.me || { char: "pyonta", name: "" };
    d.snd = d.snd !== false;
    d.stats = d.stats || {};
    d.opts = d.opts || {};
    return d;
  },
  write() {
    const s = JSON.stringify(this.data);
    if (!Native.send("save", { data: s })) { try { localStorage.setItem(this.key, s); } catch (e) {} }
  },
  stat(id) { return (this.data.stats[id] = this.data.stats[id] || { plays: 0, wins: 0 }); },
};

/* ===== 効果音（WebAudio で合成） ===== */
const Snd = {
  ctx: null,
  init() {
    if (this.ctx) { if (this.ctx.state === "suspended") this.ctx.resume(); return; }
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
  },
  tone(f, d, type, vol, slide, delay) {
    if (!Save.data.snd || !this.ctx) return;
    const t = this.ctx.currentTime + (delay || 0);
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type || "sine"; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + d);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol || 0.15, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g); g.connect(this.ctx.destination); o.start(t); o.stop(t + d + 0.02);
  },
  noise(d, vol) {
    if (!Save.data.snd || !this.ctx) return;
    const n = Math.floor(this.ctx.sampleRate * d), b = this.ctx.createBuffer(1, n, this.ctx.sampleRate), ch = b.getChannelData(0);
    for (let i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = this.ctx.createBufferSource(), g = this.ctx.createGain(), f = this.ctx.createBiquadFilter();
    f.type = "highpass"; f.frequency.value = 1800; s.buffer = b; g.gain.value = vol || 0.12;
    s.connect(f); f.connect(g); g.connect(this.ctx.destination); s.start();
  },
  card() { this.noise(0.06, 0.1); },
  place() { this.noise(0.05, 0.08); this.tone(520, 0.06, "triangle", 0.05); },
  ok() { this.tone(660, 0.1, "triangle", 0.12); this.tone(880, 0.14, "triangle", 0.12, null, 0.08); },
  bad() { this.tone(220, 0.18, "square", 0.05, 160); },
  tick() { this.tone(1200, 0.04, "sine", 0.06); },
  win() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.22, "triangle", 0.13, null, i * 0.11)); },
  lose() { [392, 330, 262].forEach((f, i) => this.tone(f, 0.25, "sine", 0.1, null, i * 0.15)); },
  big() { this.tone(300, 0.3, "sawtooth", 0.06, 900); this.tone(900, 0.25, "triangle", 0.1, null, 0.25); },
};

/* ===== キャラクター（添付イラストをそのまま使用・変形しない） ===== */
const CHARS = {
  mofupi: { name: "もふぴー", img: "chr_mofupi.png", color: "#ffd9a8",
    lines: { win: ["えへへ〜、勝っちゃった〜♪", "みんなありがと〜", "のんびりいったら勝てたよ〜"], lose: ["みんなすごいね〜", "ま、いっか〜♪", "つぎはがんばるよ〜"],
      good: ["いい感じ〜♪", "わ〜い"], bad: ["あれれ〜？", "う〜ん…"], turn: ["のんびりいくよ〜", "どれにしよっかな〜"], hi: ["よろしくね〜♪"] } },
  kuronya: { name: "くろにゃ", img: "chr_kuronya.png", color: "#c9b8ff",
    lines: { win: ["ふん、当然の結果にゃ", "べ、別にうれしくないにゃ…", "まぁ、こんなもんにゃ"], lose: ["や、やれやれ…手加減したにゃ", "…つ、次は負けないにゃ", "ちょっとだけ悔しいにゃ"],
      good: ["ふふん", "見たかにゃ"], bad: ["…やれやれにゃ", "にゃっ！？"], turn: ["やれやれ…", "仕方ないにゃ"], hi: ["…一緒に遊んであげるにゃ"] } },
  pyonta: { name: "ぴょんた", img: "chr_pyonta.png", color: "#ffc2d4",
    lines: { win: ["やったー！ぴょーん！", "勝ったぞー！", "最高の気分だぴょん！"], lose: ["くやしい〜！でも次は負けない！", "まだまだこれからだー！", "失敗しても前向き！"],
      good: ["よーし！", "いっけー！"], bad: ["うわぁっ！", "まだまだ！"], turn: ["いっくぞー！", "ぼくの番！"], hi: ["よろしくぴょん！"] } },
  penpen: { name: "ぺんぺん", img: "chr_penpen.png", color: "#cfe2ff",
    lines: { win: ["わーい！おやつ買いに行こう！", "ぼく、勝っちゃった！？", "やったー！"], lose: ["あれれ〜？まちがえちゃった？", "おなかすいた〜", "えへへ、負けちゃった"],
      good: ["えいっ！", "やった〜"], bad: ["あわわ…", "あれ〜？"], turn: ["えいっ！これでいいかな？", "うーんと…"], hi: ["いっぱい遊ぼうね！"] } },
  gaorun: { name: "がおるん", img: "chr_gaorun.png", color: "#c8f0b8",
    lines: { win: ["がおー！お宝ゲットだ！", "がおがお〜！勝ったぞ！", "ごほうびに何か食べたい！"], lose: ["がおぉ…おなかすいた…", "つぎは見つけるぞ！", "がお…くやしい"],
      good: ["がおっ！", "見つけた！"], bad: ["がおっ！？", "あれれ？"], turn: ["これ何かな？がおっ！", "さがすぞ〜"], hi: ["がおー！よろしく！"] } },
};
const CHAR_IDS = Object.keys(CHARS);
const charLine = (cid, kind) => { const c = CHARS[cid] || CHARS.pyonta; return pick(c.lines[kind] || c.lines.turn); };
function avatar(cid, name, cls) {
  const c = CHARS[cid] || CHARS.pyonta;
  return h("div", { class: "av " + (cls || "") },
    h("div", { class: "face", style: { background: "#fff" } }, h("img", { src: c.img, alt: c.name, draggable: "false" })),
    name !== null ? h("div", { class: "nm" }, name || c.name) : null);
}

/* ===== 画面・モーダル・演出 ===== */
const UI = {
  stack: [],
  cur: null,
  go(id, push = true) {
    if (this.cur && push) this.stack.push(this.cur);
    document.querySelectorAll(".screen").forEach((s) => s.classList.remove("on"));
    $("scr-" + id).classList.add("on");
    this.cur = id;
  },
  back() {
    const p = this.stack.pop() || "title";
    this.go(p, false);
    if (UI.onShow[p]) UI.onShow[p]();
  },
  onShow: {},
};
function toast(msg, ms) {
  const t = $("toast"); t.textContent = msg; t.classList.add("on");
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("on"), ms || 1800);
}
function modal(content, opts) {
  const m = $("modal"), c = $("modalCard");
  c.innerHTML = ""; c.append(content);
  m.classList.remove("hidden");
  m.onclick = (e) => { if (e.target === m && !(opts && opts.lock)) closeModal(); };
}
function closeModal() { $("modal").classList.add("hidden"); }
function bigMsg(text, color) {
  const e = h("div", { class: "bigmsg" }, text);
  if (color) { e.style.webkitTextStrokeColor = color; e.style.textShadow = `0 4px 0 ${color},0 10px 24px rgba(0,0,0,.25)`; }
  $("fx").append(e); setTimeout(() => e.remove(), 1400);
}
function confetti(n) {
  const cols = ["#ff8fb1", "#7fd6b4", "#86b8ff", "#ffd66b", "#b9a3ff"];
  for (let i = 0; i < (n || 60); i++) {
    const e = h("div", { class: "confetti", style: { left: Math.random() * 100 + "vw", background: pick(cols), animationDuration: 1.8 + Math.random() * 1.8 + "s", animationDelay: Math.random() * 0.6 + "s" } });
    $("fx").append(e); setTimeout(() => e.remove(), 4500);
  }
}
function fmtTime(sec) { sec = Math.floor(sec); return Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0"); }
function rulesModal(title, text) {
  modal(h("div", null, h("h3", null, title + " のルール"), h("div", { class: "rules-text", style: { textAlign: "left" } }, text),
    h("button", { class: "btn pink wide", onclick: closeModal }, "わかった！")));
}
