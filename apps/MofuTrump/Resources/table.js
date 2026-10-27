"use strict";
/* ===== 対戦卓：ルールを動かし、CPUを操作し、オンラインで状態を同期する =====
   ホスト（ひとりで遊ぶときは自分）が状態を持ち、変更のたびに全員へ配る。
   ゲスト（オンラインの参加者）は操作をホストへ送り、届いた状態を表示する。 */
class Table {
  constructor(o) {
    this.g = o.game; this.seats = o.seats; this.opts = o.opts || {}; this.me = o.me; this.level = o.level ?? 1;
    this.net = o.net || null; this.host = o.host !== false; this.area = o.area; this.onExit = o.onExit; this.onAgain = o.onAgain;
    this.cpuT = {}; this.waitT = null; this.lastEv = 0; this.sel = new Set(); this.alive = true; this.recv = Date.now();
    this.bubbles = {}; this.resultShown = false;
    this._ro = () => this.render();
    window.addEventListener("resize", this._ro);
  }
  /* ---------- ホスト ---------- */
  start() {
    const s = this.g.setup(this.seats.length, this.opts);
    s.names = this.seats.map((x) => x.name);
    s.v = 0; this.s = s; this.lastEv = 0; this.resultShown = false; this.sel.clear();
    this.counted = false;
    this.changed(true);
    this.seats.forEach((st, i) => { if (st.kind === "cpu" && rnd(2)) this.addBubble(i, charLine(st.char, "hi")); });
  }
  hostAct(seat, m) {
    if (!this.alive || !this.s || this.s.over) return false;
    let ok = false;
    try { ok = this.g.valid(this.s, seat, m); } catch (e) { ok = false; }
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
      }, s.wait.ms * (window.__FAST ? 0.05 : 1));
    }
    this.recv = Date.now();
    if (this.net) this.net.broadcast({ t: "st", s });
    this.afterState(first);
    this.scheduleCpu();
  }
  cpuKey(s) { return JSON.stringify([s.phase, s.turn, s.doubtId, s.round, s.hand, s.tick, s.flip ? s.flip.length : null, s.over, !!s.wait]); }
  scheduleCpu() {
    const s = this.s;
    const key = this.cpuKey(s);
    const acts = s.over ? [] : this.g.actors(s);
    for (const k in this.cpuT) {
      const t = this.cpuT[k];
      if (!acts.includes(+k) || (!this.g.realtime && t.key !== key)) { clearTimeout(t.id); delete this.cpuT[k]; }
    }
    for (const seat of acts) {
      if (!this.seats[seat] || this.seats[seat].kind !== "cpu" || this.cpuT[seat]) continue;
      const delay = (this.g.cpuDelay ? this.g.cpuDelay(s, seat, this.level) : 900) * (window.__FAST ? 0.03 : 1);
      const id = setTimeout(() => {
        delete this.cpuT[seat];
        if (!this.alive || this.s.over) return;
        if (!this.g.actors(this.s).includes(seat)) return;
        let m = null;
        try { m = this.g.cpu(this.s, seat, this.level); } catch (e) { console.error(e); }
        if (m && this.hostAct(seat, m)) return;
        // 動けなかったとき（スピードなど）は少し待ってもう一度
        if (this.g.realtime) this.scheduleCpu();
        else if (m) console.warn("CPUの手が無効", this.g.id, m);
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
    if (this.me < 0) return;
    if (this.host) { if (!this.hostAct(this.me, m)) { Snd.bad(); } }
    else if (this.net) this.net.toHost({ t: "mv", m });
  }
  /* ---------- 共通：状態が変わったとき ---------- */
  afterState(first) {
    const s = this.s;
    const evs = (s.events || []).filter((e) => e.id > this.lastEv);
    this.lastEv = s.ev || this.lastEv;
    let sound = !first;
    for (const e of evs) {
      if (e.kind === "big") { bigMsg(e.text); Snd.big(); sound = false; }
      else if (e.kind === "say" && e.seat >= 0 && this.seats[e.seat]) this.addBubble(e.seat, charLine(this.seats[e.seat].char, e.text));
      else if (e.kind === "toast" && e.seat >= 0) this.addBubble(e.seat, e.text);
      else if (e.kind === "toast") toast(e.text);
    }
    const myTurnNow = this.me >= 0 && !s.over && this.g.actors(s).includes(this.me) && !this.g.realtime;
    if (myTurnNow && !this.wasMyTurn) { Snd.tick(); Native.haptic("light"); }
    else if (sound) Snd.card();
    this.wasMyTurn = myTurnNow;
    this.render();
    if (s.over && !this.resultShown) { this.resultShown = true; setTimeout(() => this.showResult(), window.__FAST ? 50 : 1100); }
  }
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
      const el = h("div", { class: "bubble" }, b.text);
      if (+seat === this.me) { el.style.top = "auto"; el.style.bottom = "34px"; el.classList.add("up"); }
      anchor.append(el);
    }
  }
  /* ---------- 表示 ---------- */
  render() {
    if (!this.s || !this.alive) return;
    const a = this.area;
    a.innerHTML = "";
    this.avEl = {};
    const T = this.helpers();
    try { this.g.render(this.s, T); } catch (e) { console.error(e); a.append(h("div", { class: "status", style: { top: "40%" } }, h("span", null, "表示エラー: " + e.message))); }
    // 真ん中の領域を自分の手札の上までに合わせる
    const me = a.querySelector(".me"), mid = a.querySelector(".mid");
    if (mid) mid.style.bottom = (me ? me.offsetHeight + 4 : 10) + "px";
    this.placeBubbles();
    if (this.s.wait && this.timerEl) this.tickTimer();
  }
  tickTimer() {
    cancelAnimationFrame(this._raf);
    const loop = () => {
      if (!this.timerEl || !this.timerEl.isConnected || !this.s.wait) return;
      const left = Math.max(0, this.s.wait.ms - (Date.now() - this.recv));
      this.timerEl.style.width = (left / this.s.wait.ms) * 100 + "%";
      this._raf = requestAnimationFrame(loop);
    };
    loop();
  }
  helpers() {
    const self = this, a = this.area, s = this.s;
    const W = a.clientWidth, H = a.clientHeight;
    const name = (i) => (i === self.me ? "あなた" : self.seats[i] ? self.seats[i].name : "?");
    const T = {
      me: this.me, W, H, area: a, sel: this.sel, name,
      act: (m) => self.act(m),
      redraw: () => self.render(),
      confirm: (msg, fn) => modal(h("div", null, h("p", null, msg), h("div", { class: "row" }, h("button", { class: "btn ghost", onclick: closeModal }, "やめる"), h("button", { class: "btn pink", onclick: () => { closeModal(); fn(); } }, "OK")))),
      opps(info) {
        const strip = h("div", { class: "opps" });
        const n = self.seats.length;
        for (let k = 1; k < n + (self.me < 0 ? 1 : 0); k++) {
          const i = self.me < 0 ? k - 1 : (self.me + k) % n;
          const st = self.seats[i], d = info(i) || {};
          const av = avatar(st.char, st.name);
          const box = h("div", { class: "opp" + (d.turn ? " turn" : "") }, av,
            d.count != null ? h("div", { class: "cnt" }, typeof d.count === "number" ? d.count + "枚" : d.count) : null,
            d.badge ? h("div", { class: "badge" + (d.gold ? " gold" : "") }, d.badge) : null);
          if (d.mini && d.mini.length) { const mini = h("div", { class: "mini" }); d.mini.forEach((c) => mini.append(cardEl(c, { static: true }))); box.append(mini); }
          if (d.sub) box.append(h("div", { class: "cnt", style: { background: "var(--lemon)" } }, d.sub));
          if (st.kind === "remote" && st.gone) box.style.opacity = 0.5;
          strip.append(box);
          self.avEl[i] = box;
        }
        if (n > 4) strip.querySelectorAll(".opp").forEach((x) => (x.style.width = "76px"));
        a.append(strip);
        T.hasOpps = true;
        return strip;
      },
      mid() {
        const m = h("div", { class: "mid", style: { top: (T.hasOpps ? 116 : 30) + "px", bottom: "200px" } });
        a.append(m); return m;
      },
      meInfo(text, turn) {
        const st = self.seats[self.me] || { char: Save.data.me.char };
        const av = avatar(st.char, null);
        const el = h("div", { class: "me-info" + (turn ? " turn" : "") }, av, h("span", null, text), turn ? h("span", { class: "t" }, "あなたの番") : null);
        el.style.position = "relative";
        self.avEl[self.me] = el;
        return el;
      },
      statusAt(y, text) { a.append(h("div", { class: "status", style: { top: y + "px" } }, h("span", null, text))); },
      timerBar() { const i = h("i"); self.timerEl = i; return h("div", { class: "timer-bar" }, i); },
      myArea(cards, o) {
        o = o || {};
        const me = h("div", { class: "me" });
        if (o.status) me.append(h("div", { class: "status", style: { position: "static", marginBottom: "6px" } }, h("span", null, o.status)));
        if (o.buttons && o.buttons.length) me.append(h("div", { class: "actions" }, o.buttons));
        if (o.info) me.append(o.info);
        if (cards) {
          const hand = h("div", { class: "hand" });
          me.append(hand);
          a.append(me);
          const list = o.keepOrder ? cards : cards.slice().sort(bySuitRank);
          renderHand(hand, list, { maxW: W - 16, cw: o.cw, selected: o.selected, playable: o.playable, dimOthers: o.dimOthers, onTap: o.onTap, enter: o.enter });
        } else a.append(me);
        return me;
      },
    };
    return T;
  }
  showResult() {
    if (!this.alive) return;
    const res = this.g.result(this.s);
    const mine = res.find((r) => r.seat === this.me);
    const win = mine && mine.rank === 0;
    const id = this.g.id;
    if (this.me >= 0 && !this.counted) {
      this.counted = true;
      const st = Save.stat(id); st.plays++; if (win) st.wins++;
      if (this.net) { const o = Save.stat("online"); o.plays++; if (win) o.wins++; }
      Save.write();
    }
    if (win) { Snd.win(); confetti(70); Native.haptic("success"); } else Snd.lose();
    const myChar = (this.seats[this.me] || {}).char || Save.data.me.char;
    const topSeat = res[0] ? res[0].seat : 0;
    const list = h("div", { class: "rank-list" }, res.map((r) => h("div", null,
      h("span", { class: "r" }, ["🥇", "🥈", "🥉"][r.rank] || r.rank + 1 + "位"),
      avatar(this.seats[r.seat].char, null), h("span", null, r.seat === this.me ? "あなた" : this.seats[r.seat].name),
      h("span", { class: "sc" }, (r.score || "") + (r.note ? " " + r.note : "")))));
    const btns = [];
    if (this.host) {
      btns.push(h("button", { class: "btn ghost", onclick: () => { closeModal(); this.onExit && this.onExit(); } }, this.net ? "ロビーへ" : "やめる"));
      btns.push(h("button", { class: "btn pink", onclick: () => { closeModal(); this.onAgain ? this.onAgain() : this.start(); } }, "もう一回"));
    } else {
      btns.push(h("button", { class: "btn ghost", onclick: () => { closeModal(); this.onExit && this.onExit(true); } }, "退出する"));
      btns.push(h("div", { class: "note", style: { width: "100%" } }, "ホストが次のゲームを選ぶのを待っています…"));
    }
    modal(h("div", null,
      h("img", { class: "chr", src: CHARS[win ? myChar : this.seats[topSeat].char].img }),
      h("h3", null, win ? "あなたの勝ち！🎉" : mine ? (mine.rank + 1) + "位" : "おしまい"),
      h("p", null, "「" + charLine(win ? myChar : this.seats[topSeat].char, "win") + "」"),
      list, h("div", { class: "row wrap" }, btns)), { lock: true });
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
    clearTimeout(this.waitT); cancelAnimationFrame(this._raf);
    window.removeEventListener("resize", this._ro);
  }
}
