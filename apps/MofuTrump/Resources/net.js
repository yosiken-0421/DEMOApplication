"use strict";
/* ===== オンライン通信 =====
   iPhone：Game Center（GameKit）のリアルタイム対戦。招待コード = playerGroup（同じ番号の人どうしだけがつながる）
   ブラウザ（動作確認用）：BroadcastChannel で同じブラウザの別タブとつながる */
const Net = {
  native: Native.has,
  me: null,          // {id, name}
  peers: [],         // 他のプレイヤー [{id,name}]
  on: null,          // イベントを受け取る関数
  auth: { state: "idle", ok: false, name: "" },
  emit(e) { if (this.on) this.on(e); },
  /* --- Game Center（ネイティブ）から届くイベント --- */
  fromNative(e) {
    if (e.ev === "auth") { this.auth = { state: "done", ok: !!e.ok, name: e.name || "", error: e.error }; if (e.ok) this.me = { id: e.id, name: e.name }; }
    if (e.ev === "started") { this.me = e.me; this.peers = e.players.filter((p) => p.id !== e.me.id); }
    if (e.ev === "joined") { if (!this.peers.find((p) => p.id === e.player.id)) this.peers.push(e.player); }
    if (e.ev === "left") { this.peers = this.peers.filter((p) => p.id !== e.id); }
    if (e.ev === "data") { let msg; try { msg = JSON.parse(e.msg); } catch (x) { return; } if (msg.to && msg.to !== (this.me && this.me.id)) return; this.emit({ ev: "msg", from: e.from, msg }); return; }
    this.emit(e);
  },
  authenticate() {
    if (!this.native) { this.auth = { state: "done", ok: true, name: "ブラウザ" }; return; }
    if (this.auth.state === "pending" || this.auth.ok) return;
    this.auth.state = "pending"; Native.send("gc_auth");
  },
  /* 招待コードで部屋をさがす */
  joinCode(code, players) {
    this.peers = [];
    if (this.native) { Native.send("gc_code", { code: +code, players }); return; }
    this.mockJoin(code, players);
  },
  invite(max) { if (this.native) Native.send("gc_host", { min: 2, max: max || 5 }); },
  cancel() { if (this.native) Native.send("gc_cancel"); else this.mockLeave(); },
  leave() { if (this.native) Native.send("gc_leave"); else this.mockLeave(); this.peers = []; },
  sendRaw(obj) {
    const text = JSON.stringify(obj);
    if (this.native) Native.send("gc_send", { data: text });
    else if (this.bc) this.bc.postMessage({ k: "data", from: this.me.id, msg: text });
  },
  /* --- ブラウザ用のにせ通信（2つのタブで動作確認できる） --- */
  mockJoin(code, players) {
    this.mockLeave();
    const id = "web-" + Math.random().toString(36).slice(2, 8);
    this.me = { id, name: (Save.data.me.name || "プレイヤー") + "(" + id.slice(4, 7) + ")" };
    const bc = (this.bc = new BroadcastChannel("mofutrump-" + code));
    const seen = new Map([[id, this.me]]);
    let started = false;
    const check = () => {
      if (started || seen.size < players) return;
      started = true;
      const all = [...seen.values()].sort((a, b) => (a.id < b.id ? -1 : 1)).slice(0, players);
      if (!all.find((p) => p.id === id)) { this.mockLeave(); this.emit({ ev: "error", message: "部屋がいっぱいでした" }); return; }
      clearInterval(this.mockIv);
      this.peers = all.filter((p) => p.id !== id);
      this.emit({ ev: "started", me: this.me, players: all });
    };
    bc.onmessage = (e) => {
      const d = e.data;
      if (d.k === "here") { if (!seen.has(d.p.id)) { seen.set(d.p.id, d.p); bc.postMessage({ k: "here", p: this.me }); } check(); }
      else if (d.k === "data" && started) {
        let msg; try { msg = JSON.parse(d.msg); } catch (x) { return; }
        if (!this.peers.find((p) => p.id === d.from)) return;
        if (msg.to && msg.to !== id) return;
        this.emit({ ev: "msg", from: d.from, msg });
      } else if (d.k === "bye" && started && this.peers.find((p) => p.id === d.id)) { this.peers = this.peers.filter((p) => p.id !== d.id); this.emit({ ev: "left", id: d.id }); }
    };
    bc.postMessage({ k: "here", p: this.me });
    this.mockIv = setInterval(() => bc.postMessage({ k: "here", p: this.me }), 1000);
  },
  mockLeave() {
    clearInterval(this.mockIv);
    if (this.bc) { try { this.bc.postMessage({ k: "bye", id: this.me && this.me.id }); this.bc.close(); } catch (e) {} this.bc = null; }
  },
};
window.__gcEvent = (e) => { try { Net.fromNative(typeof e === "string" ? JSON.parse(e) : e); } catch (x) { console.error(x); } };

/* ===== オンラインの部屋（ロビー → ゲーム） ===== */
const Room = {
  stage: "home",      // home | make | join | search | lobby | game
  code: "", humans: 2, creator: false,
  players: [],        // [{id,name,char,creator}]
  hostId: null,
  conf: null,         // ホストが選んでいる設定 {gid, cpus, level, opts}
  table: null,
  isHost() { return Net.me && this.hostId === Net.me.id; },
  reset() { this.stage = "home"; this.players = []; this.hostId = null; this.conf = null; this.endTable(); },
  endTable() { if (this.table) { this.table.destroy(); this.table = null; } },
  /* 送受信 */
  send(obj, to) { Net.sendRaw(Object.assign({ to }, obj)); },
  broadcast(obj) { this.send(obj); },
  onNet(e) {
    if (e.ev === "auth") return this.render();
    if (e.ev === "started") return this.onStarted(e);
    if (e.ev === "cancelled") { if (this.stage === "search") { this.stage = "home"; this.render(); } return; }
    if (e.ev === "error") { toast(e.message || "エラーが起きました", 2600); if (this.stage === "search") { this.stage = "home"; this.render(); } return; }
    if (e.ev === "disconnected") { return this.lost("通信が切れました"); }
    if (e.ev === "left") return this.onLeft(e.id);
    if (e.ev === "msg") return this.onMsg(e.from, e.msg);
  },
  onStarted(e) {
    // 招待から始まったとき（コード以外）は、招待した人が作成者
    if (this.stage !== "search") { this.creator = !!this.inviting; this.code = ""; }
    this.inviting = false;
    if (UI.cur !== "online") { if (App.runner || App.table) { App.runner && App.runner.destroy(); App.table && App.table.destroy(); App.runner = App.table = null; } closeModal(); UI.stack = ["title"]; UI.go("online", false); }
    this.stage = "hello";
    this.players = [{ id: Net.me.id, name: Save.data.me.name || Net.me.name, char: Save.data.me.char, creator: this.creator }];
    this.sayHello();
    this.helloIv = setInterval(() => this.sayHello(), 1500);
    this.render();
  },
  sayHello() { this.broadcast({ t: "hello", name: Save.data.me.name || Net.me.name, char: Save.data.me.char, creator: this.creator }); },
  checkHellos() {
    if (this.stage !== "hello") return;
    const need = Net.peers.length + 1;
    if (this.players.length < need) return;
    clearInterval(this.helloIv);
    const cr = this.players.filter((p) => p.creator);
    this.hostId = cr.length === 1 ? cr[0].id : this.players.map((p) => p.id).sort()[0];
    // 席順：ホストから
    this.players.sort((a, b) => (a.id === this.hostId ? -1 : b.id === this.hostId ? 1 : a.id < b.id ? -1 : 1));
    this.stage = "lobby";
    Snd.ok(); Native.haptic("success");
    if (this.isHost()) { this.conf = this.conf || this.defaultConf(); this.pushLobby(); }
    this.render();
  },
  defaultConf() { const g = MULTI_GAMES.find((x) => x.max >= this.players.length) || Daifugo; return { gid: g.id, cpus: Math.max(0, Math.min(g.max, 4) - this.players.length), level: 1, opts: {} }; },
  pushLobby() { this.broadcast({ t: "lobby", conf: this.conf, players: this.players, hostId: this.hostId }); },
  onMsg(from, m) {
    if (m.t === "hello") {
      const p = this.players.find((x) => x.id === from);
      const isNew = !p;
      if (p) Object.assign(p, { name: m.name, char: m.char, creator: m.creator });
      else this.players.push({ id: from, name: m.name, char: m.char, creator: m.creator });
      if (this.stage === "hello") this.checkHellos();
      else if (this.stage === "lobby") { if (this.isHost()) this.pushLobby(); this.render(); }
      // 遅れて来た hello に返事
      if (isNew && (this.stage === "hello" || this.stage === "lobby")) this.send({ t: "hello", name: Save.data.me.name || Net.me.name, char: Save.data.me.char, creator: this.creator }, from);
      return;
    }
    if (m.t === "lobby" && from === this.hostId) {
      this.conf = m.conf;
      if (m.players) m.players.forEach((q) => { const p = this.players.find((x) => x.id === q.id); if (p) Object.assign(p, q); });
      if (this.stage === "lobby") this.render();
      return;
    }
    if (m.t === "start" && from === this.hostId) return this.startGuest(m);
    if (m.t === "st" && this.table && !this.table.host && from === this.hostId) { this.table.onState(m.s); return; }
    if (m.t === "seats" && this.table && from === this.hostId) { this.table.seats = m.seats; this.table.render(); return; }
    if (m.t === "mv" && this.table && this.table.host) {
      const seat = this.table.seats.findIndex((s) => s.id === from && s.kind === "remote");
      if (seat >= 0) this.table.hostAct(seat, m.m);
      return;
    }
    if (m.t === "end" && from === this.hostId) { closeModal(); this.endTable(); this.stage = "lobby"; App.showOnline(); this.render(); return; }
    if (m.t === "emote" && this.table) { const seat = this.table.seats.findIndex((s) => s.id === from); if (seat >= 0) this.table.addBubble(seat, m.text); }
  },
  onLeft(id) {
    const p = this.players.find((x) => x.id === id);
    this.players = this.players.filter((x) => x.id !== id);
    if (id === this.hostId) return this.lost("ホストが退出しました");
    if (p) toast(p.name + " が退出しました");
    if (this.table && this.table.host) { const seat = this.table.seats.findIndex((s) => s.id === id); if (seat >= 0) this.table.replaceWithCpu(seat); }
    if (this.players.length < 2 && !this.table) return this.lost("みんな退出しました");
    if (this.stage === "lobby") { if (this.isHost()) { this.fixConf(); this.pushLobby(); } this.render(); }
  },
  lost(msg) {
    clearInterval(this.helloIv);
    Net.leave(); closeModal();
    const wasGame = !!this.table;
    this.reset();
    if (wasGame || UI.cur === "game") App.showOnline();
    this.render();
    modal(h("div", null, h("h3", null, "オンライン対戦"), h("p", null, msg), h("button", { class: "btn pink wide", onclick: closeModal }, "OK")));
  },
  leave() {
    clearInterval(this.helloIv);
    Net.leave();
    this.reset();
    this.render();
  },
  fixConf() {
    const g = ALL_GAMES[this.conf.gid], hn = this.players.length;
    if (!g || hn > g.max) { this.conf = this.defaultConf(); return; }
    this.conf.cpus = clamp(this.conf.cpus, Math.max(0, g.min - hn), g.max - hn);
  },
  /* ホスト：ゲーム開始 */
  startHost() {
    const c = this.conf, g = ALL_GAMES[c.gid];
    const used = new Set(this.players.map((p) => p.char));
    const free = CHAR_IDS.filter((x) => !used.has(x)).concat(CHAR_IDS);
    const seats = this.players.map((p) => ({ id: p.id, name: p.name, char: p.char, kind: "remote" }));
    for (let k = 0; k < c.cpus; k++) { const ch = free[k % free.length]; seats.push({ id: "cpu" + k, name: CHARS[ch].name, char: ch, kind: "cpu" }); }
    const msg = { t: "start", gid: g.id, opts: c.opts, seats, level: c.level };
    this.broadcast(msg);
    this.launch(msg, true);
  },
  startGuest(m) { closeModal(); this.launch(m, false); },
  launch(m, host) {
    this.endTable();
    const g = ALL_GAMES[m.gid];
    const seats = m.seats.map((x) => Object.assign({}, x));
    const me = seats.findIndex((x) => x.id === Net.me.id);
    this.stage = "game";
    App.openGameScreen(g, () => this.confirmLeave());
    const net = {
      broadcast: (obj) => this.broadcast(obj),
      toHost: (obj) => this.send(obj, this.hostId),
    };
    this.table = new Table({
      game: g, seats, opts: m.opts, me, level: m.level, net, host, area: $("gameArea"),
      onExit: (guestLeave) => {
        if (guestLeave) { this.leave(); App.showOnline(); return; }
        this.broadcast({ t: "end" }); this.endTable(); this.stage = "lobby"; App.showOnline(); this.render();
      },
      onAgain: () => { if (this.players.length >= 1) this.startHost(); },
    });
    if (host) this.table.start();
    else $("gameArea").append(h("div", { class: "status", style: { top: "40%" } }, h("span", null, "ホストからのデータを待っています…")));
  },
  confirmLeave() {
    modal(h("div", null, h("h3", null, "退出しますか？"), h("p", null, this.isHost() ? "あなたはホストです。退出すると部屋が解散します。" : "あなたの席はCPUが代わりに遊びます。"),
      h("div", { class: "row" }, h("button", { class: "btn ghost", onclick: closeModal }, "もどる"),
        this.isHost() ? h("button", { class: "btn lemon", onclick: () => { closeModal(); this.broadcast({ t: "end" }); this.endTable(); this.stage = "lobby"; App.showOnline(); this.render(); } }, "ロビーへ") : null,
        h("button", { class: "btn pink", onclick: () => { closeModal(); this.leave(); App.showOnline(); } }, "退出"))));
  },

  /* ===== 画面 ===== */
  render() {
    const b = $("onlineBody"); if (!b) return;
    b.innerHTML = "";
    const st = this.stage;
    if (Net.native && !Net.auth.ok) {
      b.append(h("div", { class: "panel" }, h("h3", null, "Game Center"),
        Net.auth.state === "pending" ? h("div", null, h("div", { class: "spinner" }), h("p", { class: "note", style: { textAlign: "center" } }, "サインイン中…")) :
          h("div", null, h("p", { class: "note" }, "オンライン対戦には Game Center へのサインインが必要です。" + (Net.auth.error ? "（" + Net.auth.error + "）" : "")),
            h("button", { class: "btn sky wide", onclick: () => { Net.auth.state = "idle"; Net.authenticate(); this.render(); } }, "サインインする"))));
      return;
    }
    if (st === "home") {
      b.append(h("div", { class: "panel" }, h("h3", null, "👑 部屋をつくる"), h("p", { class: "note" }, "招待コードを作って、LINEなどで友だちに送ろう。"),
        h("button", { class: "btn pink wide", onclick: () => { this.stage = "make"; this.render(); } }, "部屋をつくる")));
      b.append(h("div", { class: "panel" }, h("h3", null, "🔑 コードで参加"), h("p", { class: "note" }, "友だちから届いた6けたの招待コードを入れよう。"),
        h("button", { class: "btn sky wide", onclick: () => { this.stage = "join"; this.input = ""; this.render(); } }, "コードを入力する")));
      if (Net.native) b.append(h("div", { class: "panel" }, h("h3", null, "🎮 Game Center の友だちを招待"), h("p", { class: "note" }, "Game Center でつながっている友だちに直接招待を送れます。"),
        h("button", { class: "btn ghost wide", onclick: () => { this.inviting = true; Net.invite(5); toast("招待画面をひらいています…"); } }, "友だちを招待")));
      b.append(h("p", { class: "note" }, Net.native ? "※ 遊ぶ人全員がこのアプリを入れて、Game Center にサインインしている必要があります。人数が足りない分はCPUが入れます。" : "※ いまはブラウザのテストモードです。同じブラウザで別のタブを開くと、2人で対戦テストできます。"));
      return;
    }
    if (st === "make") {
      const seg = h("div", { class: "seg" }, [2, 3, 4, 5].map((n) => h("button", { class: this.humans === n ? "on" : "", onclick: () => { this.humans = n; this.render(); } }, n + "人")));
      b.append(h("div", { class: "panel" }, h("h3", null, "遊ぶ人数（あなたもふくめて）"), seg, h("p", { class: "note" }, "人間の人数です。CPUはあとで追加できます。")));
      b.append(h("button", { class: "btn pink wide", onclick: () => {
        this.code = String(this.humans) + String(10000 + rnd(90000));
        this.creator = true; this.stage = "search"; Net.joinCode(this.code, this.humans); this.render();
      } }, "招待コードを作る"));
      b.append(h("button", { class: "btn ghost wide", onclick: () => { this.stage = "home"; this.render(); } }, "もどる"));
      return;
    }
    if (st === "join") {
      const box = h("div", { class: "code-box" }, (this.input || "").padEnd(6, "・"));
      const press = (k) => {
        if (k === "←") this.input = this.input.slice(0, -1);
        else if (this.input.length < 6) this.input += k;
        Snd.init(); Snd.tick(); this.render();
      };
      const pad = h("div", { class: "pad" }, ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "←"].map((k) => k ? h("button", { onclick: () => press(k) }, k) : h("span")));
      const ok = /^[2-5]\d{5}$/.test(this.input || "");
      b.append(h("div", { class: "panel" }, h("h3", null, "招待コード"), box), pad,
        h("button", { class: "btn pink wide", disabled: !ok, onclick: () => { this.code = this.input; this.humans = +this.input[0]; this.creator = false; this.stage = "search"; Net.joinCode(this.code, this.humans); this.render(); } }, "参加する"),
        h("p", { class: "note", style: { color: "var(--red)", minHeight: "1em" } }, (this.input || "").length === 6 && !ok ? "コードがちがうみたい（最初の数字は2〜5）" : ""),
        h("button", { class: "btn ghost wide", onclick: () => { this.stage = "home"; this.render(); } }, "もどる"));
      return;
    }
    if (st === "search" || st === "hello") {
      const shareText = "「もふもふトランプ」で一緒に遊ぼう！\n招待コード：" + this.code + "\nアプリの「オンライン対戦」→「コードで参加」に入れてね";
      b.append(h("div", { class: "panel", style: { textAlign: "center" } },
        this.code ? h("h3", null, this.creator ? "招待コード" : "参加中のコード") : null,
        this.code ? h("div", { class: "code-box" }, this.code) : null,
        this.creator && this.code ? h("div", { class: "row", style: { marginTop: "10px" } },
          h("button", { class: "btn lemon", onclick: () => App.share(shareText) }, "📤 コードを送る"),
          h("button", { class: "btn ghost", onclick: () => App.copy(this.code) }, "📋 コピー")) : null,
        h("div", { class: "spinner", style: { marginTop: "14px" } }),
        h("p", null, st === "hello" ? "つながりました！準備中…" : "みんなを待っています…（" + this.humans + "人）"),
        h("p", { class: "note" }, "全員が同じコードを入れると自動でつながります。")));
      b.append(h("button", { class: "btn ghost wide", onclick: () => { clearInterval(this.helloIv); Net.cancel(); Net.leave(); this.stage = "home"; this.render(); } }, "キャンセル"));
      return;
    }
    if (st === "lobby" || st === "game") {
      const host = this.isHost();
      b.append(h("div", { class: "panel" }, h("h3", null, "メンバー（" + this.players.length + "人）"),
        h("div", { class: "plist" }, this.players.map((p) => h("div", { class: "p" }, avatar(p.char, null), h("span", null, p.name + (p.id === Net.me.id ? "（あなた）" : "")), p.id === this.hostId ? h("span", { class: "host" }, "ホスト") : null)))));
      if (host) this.renderHostConf(b);
      else {
        const c = this.conf, g = c && ALL_GAMES[c.gid];
        b.append(h("div", { class: "panel", style: { textAlign: "center" } },
          h("h3", null, "ホストがゲームを選んでいます"),
          g ? h("p", null, g.icon + " " + g.name + (c.cpus ? "（CPU " + c.cpus + "人・" + LV_NAME[c.level] + "）" : "")) : null,
          h("div", { class: "spinner" })));
      }
      b.append(h("button", { class: "btn ghost wide", onclick: () => this.confirmLeaveLobby() }, "部屋から出る"));
    }
  },
  confirmLeaveLobby() {
    modal(h("div", null, h("h3", null, "部屋から出ますか？"), h("div", { class: "row" }, h("button", { class: "btn ghost", onclick: closeModal }, "もどる"), h("button", { class: "btn pink", onclick: () => { closeModal(); this.leave(); } }, "出る"))));
  },
  renderHostConf(b) {
    this.fixConf();
    const c = this.conf, hn = this.players.length;
    const games = MULTI_GAMES.filter((g) => g.max >= hn);
    const list = h("div", { class: "seg games" }, games.map((g) => h("button", { class: c.gid === g.id ? "on" : "", onclick: () => { c.gid = g.id; c.opts = {}; const gg = ALL_GAMES[g.id]; c.cpus = clamp(Math.max(c.cpus, gg.min - hn), Math.max(0, gg.min - hn), gg.max - hn); this.pushLobby(); this.render(); } }, g.icon + " " + g.name)));
    b.append(h("div", { class: "panel" }, h("h3", null, "ゲームをえらぶ"), list));
    const g = ALL_GAMES[c.gid];
    const minC = Math.max(0, g.min - hn), maxC = g.max - hn;
    if (maxC > 0) b.append(h("div", { class: "panel" }, h("h3", null, "CPUの人数"), h("div", { class: "seg" },
      [...Array(maxC - minC + 1).keys()].map((k) => k + minC).map((k) => h("button", { class: c.cpus === k ? "on" : "", onclick: () => { c.cpus = k; this.pushLobby(); this.render(); } }, k + "人")))));
    if (c.cpus > 0) b.append(h("div", { class: "panel" }, h("h3", null, "CPUの強さ"), h("div", { class: "seg" },
      LV_NAME.map((nm, k) => h("button", { class: c.level === k ? "on" : "", onclick: () => { c.level = k; this.pushLobby(); this.render(); } }, nm)))));
    (g.opts || []).forEach((o) => {
      const v = c.opts[o.key] ?? o.def;
      b.append(h("div", { class: "panel" }, h("h3", null, o.label), h("div", { class: "seg" }, o.choices.map(([val, lab]) => h("button", { class: v === val ? "on" : "", onclick: () => { c.opts[o.key] = val; this.pushLobby(); this.render(); } }, lab)))));
    });
    const total = hn + c.cpus;
    b.append(h("button", { class: "btn pink wide", disabled: total < g.min || total > g.max, onclick: () => this.startHost() }, "▶ " + g.name + " をはじめる（" + total + "人）"),
      h("button", { class: "btn ghost wide", onclick: () => rulesModal(g.name, g.rules) }, "ルールを見る"));
  },
};
Net.on = (e) => Room.onNet(e);
