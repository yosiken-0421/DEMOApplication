"use strict";
/* ===== 画面のつなぎ ===== */
const App = {
  runner: null, table: null, mode: null,
  init() {
    Save.load();
    // タイトルのキャラ
    const tc = $("titleChars");
    CHAR_IDS.forEach((id, k) => tc.append(h("div", { class: "tc", style: { animationDelay: k * 0.45 + "s" } }, h("img", { src: CHARS[id].img, alt: CHARS[id].name, draggable: "false" }), h("span", null, CHARS[id].name))));
    document.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => { Snd.init(); Snd.tick(); this.go(b.dataset.go); }));
    document.querySelectorAll("[data-back]").forEach((b) => b.addEventListener("click", () => { Snd.tick(); UI.back(); }));
    $("gameBack").addEventListener("click", () => this.onGameBack && this.onGameBack());
    $("sndBtn").addEventListener("click", () => { Save.data.snd = !Save.data.snd; Save.write(); this.updSnd(); Snd.init(); Snd.ok(); });
    this.updSnd();
    UI.onShow.online = () => Room.render();
    UI.onShow.list = () => this.renderList(this.mode);
    UI.go("title", false);
    document.addEventListener("gesturestart", (e) => e.preventDefault());
    Native.send("ready");
    if (Native.has) Net.authenticate();
  },
  updSnd() { $("sndBtn").textContent = Save.data.snd ? "🔊 音 ON" : "🔇 音 OFF"; },
  go(where) {
    if (where === "solo" || where === "cpu") { this.mode = where; this.renderList(where); UI.go("list"); }
    else if (where === "online") { Net.authenticate(); UI.go("online"); Room.render(); }
    else if (where === "profile") { this.renderProfile(); UI.go("profile"); }
  },
  /* ---------- ゲーム一覧 ---------- */
  renderList(mode) {
    $("listTitle").textContent = mode === "solo" ? "ひとりで遊ぶ" : "CPUと対戦";
    const L = $("gameList"); L.innerHTML = "";
    const games = mode === "solo" ? SOLO_GAMES : MULTI_GAMES;
    games.forEach((g) => {
      const st = Save.data.stats[g.id];
      let best = "";
      if (st) {
        if (mode === "solo") best = st.wins ? "クリア " + st.wins + "回" + (st.best ? "・最速 " + fmtTime(st.best) : "") : st.hi ? "ハイスコア " + st.hi : st.low != null ? "ベスト 残り" + st.low + "枚" : "";
        else best = st.plays ? st.wins + "勝 / " + st.plays + "戦" : "";
      }
      L.append(h("button", { class: "gcard", onclick: () => { Snd.tick(); this.openSetup(g, mode); } },
        h("div", { class: "gi" }, g.icon), g.tag ? h("span", { class: "tag" }, g.tag) : null,
        h("b", null, g.name), h("small", null, mode === "cpu" ? g.min + "〜" + g.max + "人　" + g.desc : g.desc),
        best ? h("div", { class: "best" }, best) : null));
    });
  },
  /* ---------- 設定画面 ---------- */
  openSetup(g, mode) {
    $("setupTitle").textContent = g.icon + " " + g.name;
    $("setupRules").onclick = () => rulesModal(g.name, g.rules);
    const saved = Save.data.opts[g.id] || {};
    const conf = { opts: {}, cpus: saved.cpus ?? Math.min(3, g.max - 1), level: saved.level ?? 1 };
    (g.opts || []).forEach((o) => (conf.opts[o.key] = saved[o.key] ?? o.def));
    if (mode === "cpu") conf.cpus = clamp(conf.cpus, Math.max(0, g.min - 1), g.max - 1);
    const render = () => {
      const b = $("setupBody"); b.innerHTML = "";
      b.append(h("div", { class: "panel" }, h("p", { style: { margin: 0, lineHeight: 1.6 } }, g.desc)));
      if (mode === "cpu") {
        const minC = Math.max(0, g.min - 1), maxC = g.max - 1;
        b.append(h("div", { class: "panel" }, h("h3", null, "CPUの人数"), h("div", { class: "seg" },
          [...Array(maxC - minC + 1).keys()].map((k) => k + minC).map((k) => h("button", { class: conf.cpus === k ? "on" : "", onclick: () => { conf.cpus = k; render(); } }, k === 0 ? "ひとり" : k + "人")))));
        if (conf.cpus > 0) {
          b.append(h("div", { class: "panel" }, h("h3", null, "CPUの強さ"), h("div", { class: "seg" }, LV_NAME.map((nm, k) => h("button", { class: conf.level === k ? "on" : "", onclick: () => { conf.level = k; render(); } }, nm)))));
          const prev = h("div", { class: "vs-preview" }, avatar(Save.data.me.char, "あなた"), this.cpuChars(conf.cpus).map((c) => avatar(c, CHARS[c].name)));
          b.append(h("div", { class: "panel" }, h("h3", null, "メンバー"), prev));
        }
      }
      (g.opts || []).forEach((o) => {
        b.append(h("div", { class: "panel" }, h("h3", null, o.label), h("div", { class: "seg" }, o.choices.map(([val, lab]) => h("button", { class: conf.opts[o.key] === val ? "on" : "", onclick: () => { conf.opts[o.key] = val; render(); } }, lab)))));
      });
      b.append(h("button", { class: "btn pink wide", style: { fontSize: "18px", padding: "16px" }, onclick: () => {
        Snd.init(); Snd.ok();
        Save.data.opts[g.id] = Object.assign({ cpus: conf.cpus, level: conf.level }, conf.opts); Save.write();
        if (mode === "solo") this.startSolo(g, conf.opts); else this.startCpu(g, conf);
      } }, "▶ はじめる"));
      b.append(h("button", { class: "btn ghost wide", onclick: () => rulesModal(g.name, g.rules) }, "📖 ルールを見る"));
    };
    render();
    UI.go("setup");
  },
  cpuChars(n) { const free = CHAR_IDS.filter((c) => c !== Save.data.me.char); return free.slice(0, n); },
  /* ---------- ゲーム画面 ---------- */
  openGameScreen(g, onBack) {
    $("gameTitle").textContent = g.icon + " " + g.name;
    $("gameRules").onclick = () => rulesModal(g.name, g.rules);
    $("gameArea").innerHTML = "";
    this.onGameBack = onBack;
    if (UI.cur !== "game") UI.go("game");
  },
  startSolo(g, opts) {
    this.openGameScreen(g, () => this.confirmQuit());
    requestAnimationFrame(() => { this.runner = new SoloRunner(g, opts, $("gameArea")); this.runner.start(); });
  },
  startCpu(g, conf) {
    this.openGameScreen(g, () => this.confirmQuit());
    const me = Save.data.me;
    const seats = [{ name: me.name || "あなた", char: me.char, kind: "me" }].concat(this.cpuChars(conf.cpus).map((c) => ({ name: CHARS[c].name, char: c, kind: "cpu" })));
    requestAnimationFrame(() => {
      this.table = new Table({ game: g, seats, opts: conf.opts, me: 0, level: conf.level, area: $("gameArea"), onExit: () => this.backFromGame() });
      this.table.start();
    });
  },
  confirmQuit() {
    const playing = (this.runner && this.runner.moves && !this.runner.done) || (this.table && this.table.s && !this.table.s.over);
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
    const inp = h("input", { value: me.name || "", maxlength: 10, placeholder: "なまえ（オンラインで表示）", style: { width: "100%", fontSize: "16px", padding: "12px", borderRadius: "14px", border: "2px solid #f0e6ef", fontFamily: "inherit", userSelect: "text", webkitUserSelect: "text" } });
    inp.addEventListener("change", () => { me.name = inp.value.trim().slice(0, 10); Save.write(); toast("なまえを保存しました"); });
    b.append(h("div", { class: "panel" }, h("h3", null, "なまえ"), inp));
    const rows = SOLO_GAMES.concat(MULTI_GAMES).map((g) => {
      const st = Save.data.stats[g.id] || { plays: 0, wins: 0 };
      return h("tr", null, h("td", null, g.icon + " " + g.name), h("td", null, (SOLO_GAMES.includes(g) ? "クリア " : "勝ち ") + st.wins + " / " + st.plays + "回"));
    });
    const on = Save.data.stats.online || { plays: 0, wins: 0 };
    rows.push(h("tr", null, h("td", null, "📡 オンライン合計"), h("td", null, "勝ち " + on.wins + " / " + on.plays + "回")));
    b.append(h("div", { class: "panel" }, h("h3", null, "記録"), h("table", { class: "stat-table" }, rows)));
    b.append(h("div", { class: "panel" }, h("h3", null, "キャラクター紹介"),
      ...[["mofupi", "のんびり屋だけど、みんなのことが大好き。マイペースな癒し系。"], ["kuronya", "ちょっと不機嫌でツンデレな黒猫。実はさみしがり屋。"], ["pyonta", "元気いっぱいのうさぎの男の子。失敗してもへこたれない！"], ["penpen", "ちょっとドジなペンギンの子。食べることと遊ぶことが大好き。"], ["gaorun", "食いしん坊で好奇心旺盛なちいさな恐竜。いつも何かを探してる。"]]
        .map(([id, t]) => h("div", { class: "row", style: { marginBottom: "8px" } }, avatar(id, null), h("div", { style: { fontSize: "13px", lineHeight: 1.5 } }, h("b", null, CHARS[id].name), h("br"), t)))));
    b.querySelectorAll(".panel .row .av").forEach((x) => (x.style.width = "56px"));
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
