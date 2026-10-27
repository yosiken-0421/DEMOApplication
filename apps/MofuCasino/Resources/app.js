"use strict";
/* ===== 収録ゲーム ===== */
const MULTI_GAMES = [Blackjack, Roulette, Baccarat, Holdem, Chinchiro, Derby, SicBo, ThreeCard, Craps, DragonTiger, Chohan, Bingo];
const GAME_CAT = {
  blackjack: "cards", baccarat: "cards", holdem: "cards", threecard: "cards", dragontiger: "cards",
  roulette: "dice", sicbo: "dice", craps: "dice", chohan: "dice",
  chinchiro: "party", derby: "party", bingo: "party",
};
const ALL_GAMES = {};
MULTI_GAMES.forEach((g) => (ALL_GAMES[g.id] = g));

/* ===== 画面のつなぎ ===== */
const App = {
  runner: null, table: null, mode: null,
  init() {
    Save.load();
    const tc = $("titleChars");
    CHAR_IDS.forEach((id, k) => tc.append(h("div", { class: "tc", style: { animationDelay: k * 0.45 + "s" } }, h("img", { src: CHARS[id].img, alt: CHARS[id].name, draggable: "false" }), h("span", null, CHARS[id].name))));
    document.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => { Snd.init(); Snd.tick(); this.go(b.dataset.go); }));
    document.querySelectorAll("[data-back]").forEach((b) => b.addEventListener("click", () => { Snd.tick(); UI.back(); }));
    $("gameBack").addEventListener("click", () => this.onGameBack && this.onGameBack());
    $("sndBtn").addEventListener("click", () => { Save.data.snd = !Save.data.snd; Save.write(); this.updSnd(); Snd.init(); Snd.ok(); });
    $("titleCoin").append(Wallet.pill());
    this.updSnd();
    $("cntSolo").textContent = "スロット・プリンコなど " + SOLO_GAMES.length + "種";
    $("cntCpu").textContent = "ブラックジャック・ルーレットなど " + MULTI_GAMES.length + "種";
    UI.onShow.online = () => Room.render();
    UI.onShow.list = () => this.renderList(this.mode);
    UI.onShow.title = () => Wallet.paint();
    UI.go("title", false);
    document.addEventListener("gesturestart", (e) => e.preventDefault());
    Native.send("ready");
    if (Native.has) Net.authenticate();
    const d = Wallet.daily();
    if (d) setTimeout(() => { Snd.init(); toast("🎁 ログインボーナス もふコイン +" + d + "枚！", 2600); }, 600);
  },
  updSnd() { $("sndBtn").textContent = Save.data.snd ? "🔊 音 ON" : "🔇 音 OFF"; },
  go(where) {
    if (where === "solo" || where === "cpu" || where === "local") { this.mode = where; this.renderList(where); UI.go("list"); }
    else if (where === "online") { Net.authenticate(); UI.go("online"); Room.render(); }
    else if (where === "profile") { this.renderProfile(); UI.go("profile"); }
  },
  /* ---------- ゲーム一覧 ---------- */
  renderList(mode) {
    $("listTitle").textContent = { solo: "ひとりでマシン", cpu: "CPUとカジノ", local: "みんなで（1台で）" }[mode];
    const L = $("gameList"); L.innerHTML = "";
    const card = (g) => {
      const st = Save.data.stats[g.id];
      let best = "";
      if (st) {
        if (mode === "solo") best = [st.plays ? st.plays + "回" : "", st.hi ? "最高 +" + fmtN(st.hi) : ""].filter(Boolean).join("・");
        else if (mode === "cpu") best = st.plays ? st.wins + "勝 / " + st.plays + "戦" : "";
      }
      return h("button", { class: "gcard", onclick: () => { Snd.tick(); this.openSetup(g, mode); } },
        h("div", { class: "gi" }, g.icon), g.tag ? h("span", { class: "tag" }, g.tag) : null,
        h("b", null, g.name), h("small", null, mode === "solo" ? g.desc : (g.min === g.max ? g.min + "人" : g.min + "〜" + g.max + "人") + "　" + g.desc),
        best ? h("div", { class: "best" }, best) : null);
    };
    if (mode === "solo") {
      L.append(h("div", { class: "panel full coin-panel" }, Wallet.pill(), h("span", { class: "note" }, "もふコインで遊ぶマシンです（遊び用・お金の価値はありません）")));
      SOLO_GAMES.forEach((g) => L.append(card(g)));
      return;
    }
    const games = MULTI_GAMES.filter((g) => mode !== "local" || g.max >= 2);
    const sec = (cat, title) => { const gs = games.filter((g) => GAME_CAT[g.id] === cat); if (gs.length) L.append(h("div", { class: "section-h full" }, title), ...gs.map(card)); };
    if (mode === "local") L.append(h("div", { class: "panel full note" }, "1台のスマホを順番に回して遊べます。人数が足りないときはCPUも入れられます。"));
    else L.append(h("div", { class: "panel full note" }, "卓ごとに配られるチップで遊びます。ひとりでも、CPUを増やして2〜5人でも遊べます。CPUに勝って1位になると、もふコイン +300枚！"));
    sec("cards", "🃏 カードゲーム");
    sec("dice", "🎲 ルーレット・サイコロ");
    sec("party", "🎉 みんなでワイワイ");
  },
  /* ---------- 設定画面 ---------- */
  openSetup(g, mode) {
    if (mode === "solo") return this.startSolo(g);
    $("setupTitle").textContent = g.icon + " " + g.name;
    $("setupRules").onclick = () => rulesModal(g.name, g.rules);
    const saved = (Save.data.opts[g.id + "_" + mode] || Save.data.opts[g.id]) || {};
    const conf = { opts: {}, cpus: saved.cpus ?? Math.min(mode === "local" ? 0 : 3, g.max - 1), level: saved.level ?? 1, humans: saved.humans ?? 2 };
    (g.opts || []).forEach((o) => (conf.opts[o.key] = saved[o.key] ?? o.def));
    const fix = () => {
      if (mode === "cpu") conf.cpus = clamp(conf.cpus, Math.max(0, g.min - 1), g.max - 1);
      if (mode === "local") { conf.humans = clamp(conf.humans, 2, g.max); conf.cpus = clamp(conf.cpus, 0, g.max - conf.humans); }
    };
    fix();
    const render = () => {
      fix();
      const b = $("setupBody"); b.innerHTML = "";
      b.append(h("div", { class: "panel" }, h("p", { style: { margin: 0, lineHeight: 1.6 } }, g.desc)));
      const seg = (title, vals, cur, set, lab) => h("div", { class: "panel" }, h("h3", null, title), h("div", { class: "seg" }, vals.map((k) => h("button", { class: cur === k ? "on" : "", onclick: () => { set(k); render(); } }, lab(k)))));
      const range = (a, z) => [...Array(z - a + 1).keys()].map((k) => k + a);
      if (mode === "local") {
        b.append(seg("遊ぶ人数（この端末で）", range(2, g.max), conf.humans, (k) => (conf.humans = k), (k) => k + "人"));
        if (g.max - conf.humans > 0) b.append(seg("CPUも入れる？", range(0, g.max - conf.humans), conf.cpus, (k) => (conf.cpus = k), (k) => (k === 0 ? "なし" : "+" + k + "人")));
      }
      if (mode === "cpu") {
        const minC = Math.max(0, g.min - 1), maxC = g.max - 1;
        if (maxC > minC) b.append(seg("CPUの人数", range(minC, maxC), conf.cpus, (k) => (conf.cpus = k), (k) => (k === 0 ? "ひとり" : k + "人")));
      }
      if (conf.cpus > 0) b.append(seg("CPUの強さ", [0, 1, 2], conf.level, (k) => (conf.level = k), (k) => LV_NAME[k]));
      const seats = this.makeSeats(g, mode, conf);
      b.append(h("div", { class: "panel" }, h("h3", null, "メンバー"), h("div", { class: "vs-preview" }, seats.map((x) => avatar(x.char, x.name)))));
      (g.opts || []).forEach((o) => b.append(seg(o.label, o.choices.map((c) => c[0]), conf.opts[o.key], (k) => (conf.opts[o.key] = k), (k) => o.choices.find((c) => c[0] === k)[1])));
      b.append(h("button", { class: "btn pink wide", style: { fontSize: "18px", padding: "16px" }, onclick: () => {
        Snd.init(); Snd.ok();
        Save.data.opts[g.id + "_" + mode] = Object.assign({ cpus: conf.cpus, level: conf.level, humans: conf.humans }, conf.opts); Save.write();
        this.startTable(g, mode, conf);
      } }, "▶ はじめる"));
      b.append(h("button", { class: "btn ghost wide", onclick: () => rulesModal(g.name, g.rules) }, "📖 ルールを見る"));
      b.append(h("p", { class: "note", style: { textAlign: "center" } }, "チップは遊び用です。お金の価値はありません。"));
    };
    render();
    UI.go("setup");
  },
  makeSeats(g, mode, conf) {
    const me = Save.data.me;
    const order = [me.char].concat(CHAR_IDS.filter((c) => c !== me.char));
    const seats = [];
    if (mode === "local") {
      for (let k = 0; k < conf.humans; k++) seats.push({ name: k === 0 && me.name ? me.name : "プレイヤー" + (k + 1), char: order[k % 5], kind: "local" });
    } else seats.push({ name: me.name || "あなた", char: me.char, kind: "me" });
    for (let k = 0; k < conf.cpus; k++) { const c = order[(seats.length) % 5]; seats.push({ name: CHARS[c].name + (mode === "local" ? "(CPU)" : ""), char: c, kind: "cpu" }); }
    return seats;
  },
  /* ---------- ゲーム画面 ---------- */
  openGameScreen(g, onBack) {
    $("gameTitle").textContent = g.icon + " " + g.name;
    $("gameRules").onclick = () => rulesModal(g.name, g.rules);
    $("gameArea").innerHTML = "";
    $("gameArea").className = "game-area" + (g.start ? " machine" : " casino");
    this.onGameBack = onBack;
    if (UI.cur !== "game") UI.go("game");
  },
  startTable(g, mode, conf) {
    this.openGameScreen(g, () => this.confirmQuit());
    const seats = this.makeSeats(g, mode, conf);
    requestAnimationFrame(() => {
      this.table = new Table({ game: g, seats, opts: conf.opts, me: 0, level: conf.level, area: $("gameArea"), hotseat: mode === "local", onExit: () => this.backFromGame() });
      this.table.start();
    });
  },
  /* ひとりで遊ぶマシン */
  startSolo(g) {
    this.openGameScreen(g, () => this.backFromGame());
    requestAnimationFrame(() => {
      if (this.runner) this.runner.destroy();
      const st = Save.stat(g.id);
      const api = {
        bet: (n) => { if (!Wallet.can(n)) return false; Wallet.add(-n); st.plays++; return true; },
        win: (n, text, jackpot, quiet) => {
          Wallet.add(n); st.wins++;
          if (n > (st.hi || 0)) st.hi = n;
          Save.write();
          if (jackpot) { Snd.jackpot(); confetti(90); Native.haptic("success"); }
          else if (!quiet || text) Snd.coin();
          if (text) bigMsg(text, jackpot ? "#f2b632" : "#ff8fb1");
          this.coinFly(n);
        },
        lose: () => {},
      };
      $("gameArea").innerHTML = "";
      this.runner = g.start($("gameArea"), api);
    });
  },
  coinFly(n) {
    const e = h("div", { class: "coin-fly" }, "+" + fmtN(n) + " 🪙");
    $("fx").append(e); setTimeout(() => e.remove(), 1200);
  },
  confirmQuit() {
    const playing = this.table && this.table.s && !this.table.s.over && this.table.s.v > 2;
    if (!playing) return this.backFromGame();
    modal(h("div", null, h("h3", null, "ゲームをやめますか？"), h("div", { class: "row" }, h("button", { class: "btn ghost", onclick: closeModal }, "つづける"), h("button", { class: "btn pink", onclick: () => { closeModal(); this.backFromGame(); } }, "やめる"))));
  },
  backFromGame() {
    if (this.runner) { this.runner.destroy(); this.runner = null; }
    if (this.table) { this.table.destroy(); this.table = null; }
    $("gameArea").innerHTML = "";
    document.querySelectorAll(".bubble").forEach((b) => b.remove());
    UI.back();
    if (UI.cur === "list") this.renderList(this.mode);
    Wallet.paint();
  },
  showOnline() {
    if (UI.cur === "game") { $("gameArea").innerHTML = ""; UI.go("online", false); UI.stack = UI.stack.filter((x) => x !== "online" && x !== "game"); if (!UI.stack.length) UI.stack = ["title"]; }
    Room.render();
  },
  /* ---------- キャラ・記録 ---------- */
  renderProfile() {
    const b = $("profileBody"); b.innerHTML = "";
    const me = Save.data.me;
    const chars = h("div", { class: "chars" }, CHAR_IDS.map((id) => h("button", { class: me.char === id ? "on" : "", onclick: () => { me.char = id; Save.write(); Snd.init(); Snd.tick(); this.renderProfile(); } }, h("img", { src: CHARS[id].img }), h("span", null, CHARS[id].name))));
    b.append(h("div", { class: "panel" }, h("h3", null, "あなたのキャラ"), chars,
      h("p", { class: "note", style: { textAlign: "center", marginTop: "8px" } }, "「" + charLine(me.char, "hi") + "」")));
    const inp = h("input", { value: me.name || "", maxlength: 10, placeholder: "なまえ（オンラインで表示）", class: "name-input" });
    inp.addEventListener("change", () => { me.name = inp.value.trim().slice(0, 10); Save.write(); toast("なまえを保存しました"); });
    b.append(h("div", { class: "panel" }, h("h3", null, "なまえ"), inp));
    b.append(h("div", { class: "panel" }, h("h3", null, "🪙 もふコイン"), h("div", { class: "row" }, Wallet.pill(), h("span", { class: "note" }, "最高 " + fmtN(Save.data.coinsMax || 0) + "枚"))));
    const rows = [];
    rows.push(h("tr", { class: "hd" }, h("td", { colspan: 2 }, "ひとりでマシン")));
    SOLO_GAMES.forEach((g) => { const st = Save.data.stats[g.id] || { plays: 0, wins: 0 }; rows.push(h("tr", null, h("td", null, g.icon + " " + g.name), h("td", null, st.plays + "回" + (st.hi ? "・最高 +" + fmtN(st.hi) : "")))); });
    rows.push(h("tr", { class: "hd" }, h("td", { colspan: 2 }, "カジノ卓（CPU・オンライン）")));
    MULTI_GAMES.forEach((g) => { const st = Save.data.stats[g.id] || { plays: 0, wins: 0 }; rows.push(h("tr", null, h("td", null, g.icon + " " + g.name), h("td", null, "1位 " + st.wins + " / " + st.plays + "回"))); });
    const on = Save.data.stats.online || { plays: 0, wins: 0 };
    rows.push(h("tr", null, h("td", null, "📡 オンライン合計"), h("td", null, "1位 " + on.wins + " / " + on.plays + "回")));
    b.append(h("div", { class: "panel" }, h("h3", null, "記録"), h("table", { class: "stat-table" }, rows)));
    b.append(h("div", { class: "panel" }, h("h3", null, "キャラクター紹介"),
      ...[["mofupi", "のんびり屋だけど、みんなのことが大好き。いつもマイペースな癒し系の子。"], ["kuronya", "ちょっと不機嫌でツンデレな黒猫。実はさみしがり屋でみんなに甘えたい。"], ["pyonta", "元気いっぱいのうさぎの男の子。失敗してもへこたれず、いつも前向き！"], ["penpen", "ちょっとドジなペンギンの子。食べることと遊ぶことが大好き！"], ["gaorun", "食いしん坊で好奇心旺盛なちいさな恐竜。いつも何かを探してる！"]]
        .map(([id, t]) => h("div", { class: "row intro" }, avatar(id, null), h("div", null, h("b", null, CHARS[id].name), h("br"), t)))));
    b.append(h("div", { class: "panel note" }, "このアプリのコイン・チップはすべて遊び用です。お金の価値はなく、購入・換金・景品との交換はできません。"));
  },
  share(text) {
    if (Native.send("share", { text })) return;
    if (navigator.share) navigator.share({ text }).catch(() => {}); else this.copy(text);
  },
  copy(text) {
    if (Native.send("copy", { text })) { toast("コピーしました"); return; }
    try { navigator.clipboard.writeText(text); toast("コピーしました"); } catch (e) { toast(text); }
  },
};
window.addEventListener("DOMContentLoaded", () => App.init());
