"use strict";
/* ===== 対戦卓：ルールを動かし、CPUを操作し、オンラインで状態を同期する =====
   ホスト（ひとり・この端末で遊ぶときは自分）が状態を持ち、変更のたびに全員へ配る。
   ゲスト（オンラインの参加者）は操作をホストへ送り、届いた状態を表示する。
   hotseat = 1台の端末をみんなで回して遊ぶモード（kind:"local" の席が複数） */
class Table {
  constructor(o) {
    this.g = o.game; this.seats = o.seats; this.opts = o.opts || {}; this.me = o.me; this.level = o.level ?? 1;
    this.net = o.net || null; this.host = o.host !== false; this.area = o.area; this.onExit = o.onExit; this.onAgain = o.onAgain;
    this.hotseat = !!o.hotseat;
    this.cpuT = {}; this.waitT = null; this.lastEv = 0; this.alive = true; this.recv = Date.now();
    this.bubbles = {}; this.resultShown = false; this.ui = {};
    this._ro = () => this.render();
    window.addEventListener("resize", this._ro);
  }
  /* ---------- ホスト ---------- */
  start() {
    const s = this.g.setup(this.seats.length, this.opts);
    s.names = this.seats.map((x) => x.name);
    s.v = 0; s.events = s.events || []; this.s = s; this.lastEv = 0; this.resultShown = false; this.ui = {};
    this.counted = false; this.lastLocal = -1;
    this.changed(true);
    this.seats.forEach((st, i) => { if (st.kind === "cpu" && rnd(2)) this.addBubble(i, charLine(st.char, "hi")); });
  }
  hostAct(seat, m) {
    if (!this.alive || !this.s || this.s.over || (this.s.wait && !this.g.liveActs)) return false;
    let ok = false;
    try { ok = this.g.valid(this.s, seat, m); } catch (e) { console.error(e); ok = false; }
    if (!ok) return false;
    this.g.apply(this.s, seat, m);
    this.changed();
    return true;
  }
  changed(first) {
    const s = this.s;
    s.v = (s.v || 0) + 1;
    if (s.wait && !s.wait.id) {
      const id = (s.wait.id = (this.waitSeq = (this.waitSeq || 0) + 1));
      clearTimeout(this.waitT);
      this.waitT = setTimeout(() => {
        if (!this.alive || !this.s.wait || this.s.wait.id !== id) return;
        const then = this.s.wait.then; this.s.wait = null;
        this.g.resolve(this.s, then);
        this.changed();
      }, s.wait.ms * (window.__FAST ? 0.02 : 1));
    }
    this.recv = Date.now();
    if (this.net) this.net.broadcast({ t: "st", s });
    this.afterState(first);
    this.scheduleCpu();
  }
  scheduleCpu() {
    const s = this.s;
    const key = s.v;
    const acts = s.over || s.wait ? [] : this.g.actors(s);
    for (const k in this.cpuT) {
      const t = this.cpuT[k];
      if (!acts.includes(+k) || t.key !== key) { clearTimeout(t.id); delete this.cpuT[k]; }
    }
    for (const seat of acts) {
      if (!this.seats[seat] || this.seats[seat].kind !== "cpu" || this.cpuT[seat]) continue;
      const delay = (this.g.cpuDelay ? this.g.cpuDelay(s, seat, this.level) : 700) * (window.__FAST ? 0.01 : 1);
      const id = setTimeout(() => {
        delete this.cpuT[seat];
        if (!this.alive || this.s.over || this.s.wait) return;
        if (!this.g.actors(this.s).includes(seat)) return;
        let m = null;
        try { m = this.g.cpu(this.s, seat, this.level); } catch (e) { console.error(e); }
        if (m && this.hostAct(seat, m)) return;
        console.warn("CPUの手が無効", this.g.id, m);
        window.__CPU_ERR = (window.__CPU_ERR || 0) + 1;
      }, delay);
      this.cpuT[seat] = { id, key };
    }
  }
  /* ---------- ゲスト ---------- */
  onState(s) {
    if (!this.alive) return;
    const first = !this.s;
    this.s = s; this.recv = Date.now();
    if (first) this.lastEv = s.ev || 0;
    this.afterState(first);
  }
  act(m) {
    Snd.init();
    let seat = this.me;
    // 1台で遊ぶとき：番でない人の操作（ビンゴの穴あけなど）は as で席を指定
    if (m && m.as != null && this.hotseat) { if (!this.isMine(m.as)) return; seat = m.as; }
    if (seat < 0) return;
    if (this.host) { if (!this.hostAct(seat, m)) { Snd.bad(); return false; } return true; }
    if (this.net) this.net.toHost({ t: "mv", m });
    return true;
  }
  /* 1台で遊ぶとき：いま操作できる人（ローカルの席）に視点を合わせる */
  pickLocal() {
    if (!this.hotseat || !this.s) return;
    const acts = this.s.over ? [] : this.g.actors(this.s);
    const loc = acts.find((i) => this.seats[i] && this.seats[i].kind === "local");
    this.me = loc != null ? loc : -1;
  }
  isMine(seat) {
    const st = this.seats[seat];
    if (!st) return false;
    if (this.hotseat) return st.kind === "local";
    return seat === this.me;
  }
  /* ---------- 共通：状態が変わったとき ---------- */
  afterState(first) {
    const s = this.s;
    this.pickLocal();
    const evs = (s.events || []).filter((e) => e.id > this.lastEv);
    this.lastEv = s.ev || this.lastEv;
    let sound = !first;
    for (const e of evs) {
      if (e.kind === "big") { bigMsg(e.text); Snd.big(); sound = false; }
      else if (e.kind === "say" && e.seat >= 0 && this.seats[e.seat]) this.addBubble(e.seat, charLine(this.seats[e.seat].char, e.text));
      else if (e.kind === "toast" && e.seat >= 0) this.addBubble(e.seat, e.text);
      else if (e.kind === "toast") toast(e.text);
      else if (e.kind === "snd" && Snd[e.text]) { Snd[e.text](); sound = false; }
    }
    const myTurnNow = this.me >= 0 && !s.over && !s.wait && this.g.actors(s).includes(this.me);
    if (myTurnNow && (!this.wasMyTurn || (this.hotseat && this.lastLocal !== this.me))) {
      Snd.tick(); Native.haptic("light");
      if (this.hotseat && this.lastLocal !== this.me && this.localCount() > 1) bigMsg(this.seats[this.me].name + " の番", "#86b8ff");
      this.lastLocal = this.me;
    } else if (sound) (this.g.sound ? Snd[this.g.sound] || Snd.stone : Snd.stone).call(Snd);
    this.wasMyTurn = myTurnNow;
    this.render();
    if (s.over && !this.resultShown) { this.resultShown = true; setTimeout(() => this.showResult(), window.__FAST ? 20 : 1300); }
  }
  localCount() { return this.seats.filter((x) => x.kind === "local").length; }
  addBubble(seat, text) {
    this.bubbles[seat] = { text, until: Date.now() + 2200 };
    this.placeBubbles();
    clearTimeout(this._bt); this._bt = setTimeout(() => this.placeBubbles(), 2300);
  }
  placeBubbles() {
    document.querySelectorAll(".bubble").forEach((b) => b.remove());
    const now = Date.now();
    for (const seat in this.bubbles) {
      const b = this.bubbles[seat];
      if (b.until < now) { delete this.bubbles[seat]; continue; }
      const anchor = this.avEl && this.avEl[seat];
      if (!anchor) continue;
      anchor.append(h("div", { class: "bubble" }, b.text));
    }
  }
  /* ---------- 表示 ---------- */
  render() {
    if (!this.s || !this.alive) return;
    const a = this.area;
    a.innerHTML = "";
    this.avEl = {};
    const T = this.helpers();
    try { this.g.render(this.s, T, this.ui); } catch (e) { console.error(e); a.append(h("div", { class: "status", style: { top: "40%" } }, h("span", null, "表示エラー: " + e.message))); }
    this.placeBubbles();
  }
  helpers() {
    const self = this, a = this.area, s = this.s;
    const W = a.clientWidth, H = a.clientHeight;
    const name = (i) => (i === self.me && !self.hotseat ? "あなた" : self.seats[i] ? self.seats[i].name : "?");
    const myTurn = self.me >= 0 && !s.over && !s.wait && self.g.actors(s).includes(self.me);
    const T = {
      me: this.me, W, H, area: a, name, myTurn, hotseat: self.hotseat,
      view: self.hotseat ? 0 : self.me >= 0 ? self.me : 0,     // 盤の向き（この席を手前に）
      seat: (i) => self.seats[i],
      charOf: (i) => (self.seats[i] || {}).char || "mofupi",
      isMine: (i) => self.isMine(i),
      act: (m) => self.act(m),
      redraw: () => self.render(),
      ui: self.ui,
      /* 上のプレイヤー一覧（全員） */
      players(info) {
        const strip = h("div", { class: "pstrip" });
        const n = self.seats.length;
        for (let i = 0; i < n; i++) {
          const st = self.seats[i], d = info(i) || {};
          const box = h("div", { class: "pl" + (d.turn ? " turn" : "") + (d.dim ? " dim" : "") },
            h("div", { class: "pav" }, h("img", { src: CHARS[st.char].img, alt: "", draggable: "false" }), d.color ? h("i", { class: "pc", style: { background: d.color } }, d.mark || "") : null),
            h("div", { class: "pn" }, name(i)),
            d.score != null ? h("div", { class: "ps" }, d.score) : null,
            d.badge ? h("div", { class: "pb" + (d.gold ? " gold" : "") }, d.badge) : null);
          if (st.kind === "remote" && st.gone) box.style.opacity = 0.5;
          strip.append(box);
          self.avEl[i] = box;
        }
        if (n >= 5) strip.classList.add("tight");
        a.append(strip);
        return strip;
      },
      /* 真ん中（盤） */
      mid() { const m = h("div", { class: "mid" }); a.append(m); return m; },
      /* 下（案内とボタン） */
      bottom(o) {
        o = o || {};
        const b = h("div", { class: "bottom" });
        if (o.status) b.append(h("div", { class: "status-line" + (o.hot ? " hot" : "") }, o.status));
        if (o.extra) b.append(o.extra);
        if (o.buttons && o.buttons.length) b.append(h("div", { class: "actions" }, o.buttons.filter(Boolean)));
        a.append(b);
        return b;
      },
      /* 盤の大きさ（mid に入る最大サイズ） */
      fit(mid, ratio) {
        const r = mid.getBoundingClientRect();
        const w = r.width - 8, hh = r.height - 8;
        ratio = ratio || 1;
        return w / hh > ratio ? { w: hh * ratio, h: hh } : { w, h: w / ratio };
      },
      turnText(i, mine) {
        if (s.over) return "おしまい";
        if (self.hotseat && self.isMine(i)) return name(i) + " の番" + (mine ? "：" + mine : "");
        if (i === self.me) return "あなたの番" + (mine ? "：" + mine : "");
        return name(i) + " が考え中…";
      },
    };
    return T;
  }
  showResult() {
    if (!this.alive) return;
    const res = this.g.result(this.s);
    const top = res.filter((r) => r.rank === 0);
    const draw = top.length > 1 && top.length === res.length;
    const mine = res.find((r) => r.seat === this.me);
    const win = !this.hotseat && mine && mine.rank === 0 && !draw;
    const id = this.g.id;
    if (!this.counted && !this.hotseat && this.me >= 0) {
      this.counted = true;
      const st = Save.stat(id); st.plays++; if (win) st.wins++;
      if (this.net) { const o = Save.stat("online"); o.plays++; if (win) o.wins++; }
      Save.write();
      this.bonus = 0;
      if (win && typeof Wallet !== "undefined") { Wallet.add(300); this.bonus = 300; }
    }
    const topSeat = res[0] ? res[0].seat : 0;
    const localWin = this.hotseat && this.seats[topSeat] && this.seats[topSeat].kind === "local";
    if (win || localWin) { Snd.win(); confetti(70); Native.haptic("success"); } else Snd.lose();
    const nm = (i) => (i === this.me && !this.hotseat ? "あなた" : this.seats[i].name);
    const list = h("div", { class: "rank-list" }, res.map((r) => h("div", null,
      h("span", { class: "r" }, draw ? "🤝" : ["🥇", "🥈", "🥉"][r.rank] || r.rank + 1 + "位"),
      avatar(this.seats[r.seat].char, null), h("span", null, nm(r.seat)),
      h("span", { class: "sc" }, (r.score != null ? r.score : "") + (r.note ? " " + r.note : "")))));
    const btns = [];
    if (this.host) {
      btns.push(h("button", { class: "btn ghost", onclick: () => { closeModal(); this.onExit && this.onExit(); } }, this.net ? "ロビーへ" : "やめる"));
      btns.push(h("button", { class: "btn pink", onclick: () => { closeModal(); this.onAgain ? this.onAgain() : this.start(); } }, "もう一回"));
    } else {
      btns.push(h("button", { class: "btn ghost", onclick: () => { closeModal(); this.onExit && this.onExit(true); } }, "退出する"));
      btns.push(h("div", { class: "note", style: { width: "100%" } }, "ホストが次のゲームを選ぶのを待っています…"));
    }
    btns.push(h("button", { class: "btn ghost", onclick: () => { closeModal(); this.peek(); } }, "テーブルを見る"));
    const headChar = draw ? (this.seats[this.me] || this.seats[0]).char : this.seats[topSeat].char;
    const title = draw ? "ひきわけ！" : this.hotseat ? nm(topSeat) + " の勝ち！🎉" : win ? "あなたの勝ち！🎉" : mine ? (mine.rank + 1) + "位" : nm(topSeat) + " の勝ち";
    modal(h("div", null,
      h("img", { class: "chr", src: CHARS[headChar].img }),
      h("h3", null, title),
      h("p", null, "「" + charLine(headChar, draw ? "good" : "win") + "」"),
      win && this.bonus ? h("p", { class: "bonus-line" }, "🪙 優勝ボーナス もふコイン +" + this.bonus) : null,
      list, h("div", { class: "row wrap" }, btns)), { lock: true });
  }
  /* 結果のあと盤面を確認 → 右上のボタンで結果に戻る */
  peek() {
    const b = h("button", { class: "btn lemon small peek", onclick: () => { b.remove(); this.showResult(); } }, "🏆 結果にもどる");
    this.area.append(b);
  }
  replaceWithCpu(seat) {
    const st = this.seats[seat]; if (!st) return;
    st.kind = "cpu"; st.gone = true; st.name = st.name + "(CPU)";
    if (this.s) { this.s.names = this.seats.map((x) => x.name); }
    if (this.net) this.net.broadcast({ t: "seats", seats: this.seats });
    toast(st.name + " が抜けたのでCPUが代わります");
    if (this.s) this.changed();
  }
  destroy() {
    this.alive = false;
    for (const k in this.cpuT) clearTimeout(this.cpuT[k].id);
    this.cpuT = {};
    clearTimeout(this.waitT); clearTimeout(this._bt);
    window.removeEventListener("resize", this._ro);
  }
}
