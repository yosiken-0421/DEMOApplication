"use strict";
/* ===== 陣取りブロック（ブロックを角でつなげて陣地を広げる・2〜4人） ===== */
const BK = (() => {
  const RAW = [
    [[0, 0]],
    [[0, 0], [0, 1]],
    [[0, 0], [0, 1], [0, 2]], [[0, 0], [1, 0], [1, 1]],
    [[0, 0], [0, 1], [0, 2], [0, 3]], [[0, 0], [1, 0], [2, 0], [2, 1]], [[0, 0], [0, 1], [0, 2], [1, 1]], [[0, 1], [0, 2], [1, 0], [1, 1]], [[0, 0], [0, 1], [1, 0], [1, 1]],
    [[0, 1], [0, 2], [1, 0], [1, 1], [2, 1]], [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]], [[0, 0], [1, 0], [2, 0], [3, 0], [3, 1]], [[0, 1], [1, 1], [2, 0], [2, 1], [3, 0]],
    [[0, 0], [0, 1], [1, 0], [1, 1], [2, 0]], [[0, 0], [0, 1], [0, 2], [1, 1], [2, 1]], [[0, 0], [0, 2], [1, 0], [1, 1], [1, 2]], [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2]],
    [[0, 0], [1, 0], [1, 1], [2, 1], [2, 2]], [[0, 1], [1, 0], [1, 1], [1, 2], [2, 1]], [[0, 1], [1, 0], [1, 1], [2, 1], [3, 1]], [[0, 0], [0, 1], [1, 1], [2, 1], [2, 2]],
  ];
  const norm = (cells) => {
    const mr = Math.min(...cells.map((x) => x[0])), mc = Math.min(...cells.map((x) => x[1]));
    return cells.map(([r, c]) => [r - mr, c - mc]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  };
  const ORI = RAW.map((cells) => {
    const out = [], seen = new Set();
    let cur = cells;
    for (let f = 0; f < 2; f++) {
      for (let k = 0; k < 4; k++) {
        const n = norm(cur), key = JSON.stringify(n);
        if (!seen.has(key)) { seen.add(key); out.push(n); }
        cur = cur.map(([r, c]) => [c, -r]); // 90度回す
      }
      cur = cells.map(([r, c]) => [r, -c]); // 裏返す
    }
    return out;
  });
  return { RAW, ORI };
})();
const Blocks = {
  id: "blocks", name: "陣取りブロック", icon: "🧩", min: 2, max: 4, tag: "2〜4人",
  desc: "21種類のブロックを角どうしでつなげて陣地を広げよう。置けなくなるまで勝負！",
  rules: "・それぞれ21個のブロック（1〜5マス）を持っています。\n・最初のブロックは、自分のスタート地点（★）にかかるように置きます。\n・2個目からは、自分のブロックと「角だけ」でくっつくように置きます。自分のブロックと辺がくっつくのはダメ。\n・相手のブロックとは、辺でくっついてもOK。\n・置けなくなったらパス。全員置けなくなったら終了。\n・置いたマスの数が点数。全部置けたら+15点（最後が1マスのブロックならさらに+5点）。\n\n操作：下のブロックをえらぶ→盤をタップで仮置き→「回す」「裏返す」で向きを変えて→「ここに置く」",
  opts: [],
  sound: "place",
  size(n) { return n === 2 ? 14 : 20; },
  starts(n, N) { return n === 2 ? [[4, 4], [9, 9]] : [[0, 0], [0, N - 1], [N - 1, N - 1], [N - 1, 0]]; },
  setup(n) {
    const N = this.size(n);
    return { n, N, b: Array(N * N).fill(-1), left: Array.from({ length: n }, () => BK.RAW.map((_, i) => i)), first: Array(n).fill(true), out: Array(n).fill(false), lastPc: Array(n).fill(-1), turn: 0, over: false, events: [], last: [] };
  },
  fits(s, seat, cells) {
    const N = s.N, b = s.b;
    let corner = false;
    const st = this.starts(s.n, N)[seat];
    let coversStart = false;
    for (const [r, c] of cells) {
      if (r < 0 || r >= N || c < 0 || c >= N || b[r * N + c] >= 0) return false;
      for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) { const rr = r + dr, cc = c + dc; if (rr >= 0 && rr < N && cc >= 0 && cc < N && b[rr * N + cc] === seat) return false; }
      for (const [dr, dc] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { const rr = r + dr, cc = c + dc; if (rr >= 0 && rr < N && cc >= 0 && cc < N && b[rr * N + cc] === seat) corner = true; }
      if (r === st[0] && c === st[1]) coversStart = true;
    }
    return s.first[seat] ? coversStart : corner;
  },
  place(m) { return BK.ORI[m.pc][m.o].map(([r, c]) => [r + m.r, c + m.c]); },
  /* 角になれる空きマス（ここにブロックの1マスを置く必要がある） */
  anchors(s, seat) {
    const N = s.N, out = [];
    if (s.first[seat]) return [this.starts(s.n, N)[seat]];
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      if (s.b[r * N + c] >= 0) continue;
      let edge = false, diag = false;
      for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) { const rr = r + dr, cc = c + dc; if (rr >= 0 && rr < N && cc >= 0 && cc < N && s.b[rr * N + cc] === seat) edge = true; }
      if (edge) continue;
      for (const [dr, dc] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { const rr = r + dr, cc = c + dc; if (rr >= 0 && rr < N && cc >= 0 && cc < N && s.b[rr * N + cc] === seat) diag = true; }
      if (diag) out.push([r, c]);
    }
    return out;
  },
  allMoves(s, seat, limit) {
    const out = [], seen = new Set();
    const an = this.anchors(s, seat);
    for (const pc of s.left[seat]) {
      BK.ORI[pc].forEach((cells, o) => {
        for (const [ar, ac] of an) for (const [pr, pcc] of cells) {
          const m = { t: "put", pc, o, r: ar - pr, c: ac - pcc };
          const key = pc + "," + o + "," + m.r + "," + m.c;
          if (seen.has(key)) continue; seen.add(key);
          if (this.fits(s, seat, this.place(m))) { out.push(m); if (limit && out.length >= limit) return; }
        }
      });
      if (limit && out.length >= limit) break;
    }
    return out;
  },
  canMove(s, seat) { return this.allMoves(s, seat, 1).length > 0; },
  actors(s) { return s.over ? [] : [s.turn]; },
  valid(s, seat, m) {
    if (seat !== s.turn || m.t !== "put" || !s.left[seat].includes(m.pc) || !BK.ORI[m.pc] || !BK.ORI[m.pc][m.o]) return false;
    return this.fits(s, seat, this.place(m));
  },
  apply(s, seat, m) {
    const cells = this.place(m);
    cells.forEach(([r, c]) => (s.b[r * s.N + c] = seat));
    s.left[seat] = s.left[seat].filter((x) => x !== m.pc);
    s.first[seat] = false; s.lastPc[seat] = m.pc; s.last = cells.map(([r, c]) => r * s.N + c);
    if (cells.length === 5 && rnd(3) === 0) ev(s, seat, "say", "good");
    if (!s.left[seat].length) { ev(s, -1, "toast", (s.names ? s.names[seat] : "") + " は全部置いた！"); ev(s, seat, "say", "win"); }
    // 次に置ける人
    let t = seat;
    for (let k = 0; k < s.n; k++) {
      t = (t + 1) % s.n;
      if (s.out[t]) continue;
      if (s.left[t].length && this.canMove(s, t)) { s.turn = t; return; }
      s.out[t] = true;
      ev(s, -1, "toast", (s.names ? s.names[t] : "") + (s.left[t].length ? " はもう置けない" : " は全部置いた"));
    }
    s.over = true;
  },
  score(s, seat) {
    const left = s.left[seat].reduce((a, pc) => a + BK.RAW[pc].length, 0);
    const placed = 89 - left;
    return placed + (s.left[seat].length ? 0 : 15 + (s.lastPc[seat] === 0 ? 5 : 0));
  },
  cpu(s, seat, level) {
    const ms = this.allMoves(s, seat);
    if (!ms.length) return null;
    const N = s.N;
    const oppAnch = new Set();
    if (level >= 1) for (let o = 0; o < s.n; o++) if (o !== seat && !s.out[o]) this.anchors(s, o).forEach(([r, c]) => oppAnch.add(r * N + c));
    const ctr = (N - 1) / 2;
    const sc = ms.map((m) => {
      const cells = this.place(m);
      const size = cells.length;
      let v = size * 10;
      if (level === 0) return { m, v: v + Math.random() * 25 };
      // 新しくできる自分の角
      const set = new Set(cells.map(([r, c]) => r * N + c));
      let corners = 0;
      for (const [r, c] of cells) for (const [dr, dc] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const rr = r + dr, cc = c + dc; if (rr < 0 || rr >= N || cc < 0 || cc >= N) continue;
        const k = rr * N + cc; if (set.has(k) || s.b[k] >= 0) continue;
        let edge = false;
        for (const [er, ec] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) { const r2 = rr + er, c2 = cc + ec; if (r2 >= 0 && r2 < N && c2 >= 0 && c2 < N && (s.b[r2 * N + c2] === seat || set.has(r2 * N + c2))) edge = true; }
        if (!edge) corners++;
      }
      let block = 0; for (const k of set) if (oppAnch.has(k)) block++;
      // 序盤は中央へ向かう
      const leftN = s.left[seat].length;
      const toward = leftN > 14 ? -cells.reduce((a, [r, c]) => a + Math.abs(r - ctr) + Math.abs(c - ctr), 0) / size : 0;
      v += corners * 3 + block * (level === 2 ? 6 : 3) + toward * 2.2;
      // 1マスは最後に取っておく
      if (m.pc === 0 && leftN > 2) v -= 25;
      return { m, v: v + Math.random() * (level === 1 ? 6 : 1) };
    });
    return pickByLevel(sc, 2);
  },
  cpuDelay() { return 650 + rnd(400); },
  result(s) {
    const t = [...Array(s.n).keys()].map((i) => this.score(s, i));
    const order = [...Array(s.n).keys()].sort((a, b) => t[b] - t[a]);
    return order.map((seat) => ({ seat, rank: order.findIndex((x) => t[x] === t[seat]), score: t[seat] + "点", note: s.left[seat].length ? "のこり" + s.left[seat].length + "個" : "全部置いた！" }));
  },
  render(s, T, ui) {
    T.players((i) => ({ turn: !s.over && s.turn === i, color: SEAT_COLORS[i], score: this.score(s, i) + "点", badge: s.out[i] && !s.over ? "おわり" : null, dim: s.out[i] }));
    const mid = T.mid();
    const mine = T.myTurn && s.turn === T.me;
    const seat = s.turn;
    if (ui.pc != null && (!mine || !s.left[seat].includes(ui.pc))) { ui.pc = null; ui.at = null; }
    // ブロック置き場
    const tray = h("div", { class: "bk-tray" });
    const showSeat = mine ? seat : T.me >= 0 ? T.me : seat;
    s.left[showSeat].forEach((pc) => {
      const cells = BK.ORI[pc][pc === ui.pc ? ui.o || 0 : 0];
      const R = Math.max(...cells.map((x) => x[0])) + 1, C = Math.max(...cells.map((x) => x[1])) + 1;
      const u = 11;
      const box = h("div", { class: "bk-pc" + (pc === ui.pc ? " sel" : ""), style: { width: C * u + "px", height: R * u + "px" }, onclick: mine ? () => { ui.pc = pc; ui.o = 0; Snd.tick(); T.redraw(); } : null });
      cells.forEach(([r, c]) => { const q = h("i"); q.style.left = c * u + "px"; q.style.top = r * u + "px"; q.style.background = SEAT_COLORS[showSeat]; box.append(q); });
      tray.append(box);
    });
    let okPlace = false, preview = null;
    if (mine && ui.pc != null && ui.at) {
      const cells = BK.ORI[ui.pc][ui.o || 0];
      const R = Math.max(...cells.map((x) => x[0])), C = Math.max(...cells.map((x) => x[1]));
      const m = { t: "put", pc: ui.pc, o: ui.o || 0, r: ui.at[0] - Math.floor(R / 2), c: ui.at[1] - Math.floor(C / 2) };
      preview = { m, cells: this.place(m) };
      okPlace = this.fits(s, seat, preview.cells);
    }
    const nOri = ui.pc != null ? BK.ORI[ui.pc].length : 1;
    const turnBtns = mine && ui.pc != null ? [
      h("button", { class: "btn ghost small", onclick: () => { ui.o = this.rotIdx(ui.pc, ui.o || 0, "rot"); T.redraw(); } }, "↻ 回す"),
      h("button", { class: "btn ghost small", disabled: nOri <= 1, onclick: () => { ui.o = this.rotIdx(ui.pc, ui.o || 0, "flip"); T.redraw(); } }, "⇋ 裏返す"),
      h("button", { class: "btn pink small", disabled: !okPlace, onclick: () => { const m = preview.m; ui.pc = null; ui.at = null; T.act(m); } }, "✓ ここに置く"),
    ] : [];
    T.bottom({ status: T.turnText(seat, ui.pc == null ? (s.first[seat] ? "最初は★にかかるように置こう" : "ブロックをえらぼう") : ui.at ? (okPlace ? "「ここに置く」で決定" : "そこには置けない（角でつなげよう）") : "盤をタップして仮置き"), hot: mine, extra: tray, buttons: turnBtns });
    const N = s.N;
    const B = boardBox(mid, T, N, N, { cls: "bk-board", pad: 3 });
    const cs = B.cs;
    const last = new Set(s.last || []);
    const st = this.starts(s.n, N);
    const anch = mine && ui.pc == null ? new Set(this.anchors(s, seat).map(([r, c]) => r * N + c)) : new Set();
    const prevSet = preview ? new Set(preview.cells.map(([r, c]) => r * N + c)) : new Set();
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const k = r * N + c, o = s.b[k];
      const cell = at(B.el, B.x(c), B.y(r), cs, cs, "bk-cell" + (o >= 0 ? " on" : "") + (last.has(k) ? " last" : "") + (anch.has(k) ? " anch" : ""), {
        onclick: mine && ui.pc != null ? () => { ui.at = [r, c]; T.redraw(); } : null });
      if (o >= 0) cell.style.setProperty("--pc", SEAT_COLORS[o]);
      st.forEach(([sr, sc2], i) => { if (sr === r && sc2 === c && i < s.n && o < 0) { cell.textContent = "★"; cell.style.color = SEAT_COLORS[i]; } });
      if (prevSet.has(k)) { cell.classList.add(okPlace ? "pv-ok" : "pv-ng"); cell.style.setProperty("--pv", SEAT_COLORS[seat]); }
    }
    // はみ出した仮置きも見えるように
  },
  rotIdx(pc, o, how) {
    const cur = BK.ORI[pc][o];
    const t = how === "rot" ? cur.map(([r, c]) => [c, -r]) : cur.map(([r, c]) => [r, -c]);
    const mr = Math.min(...t.map((x) => x[0])), mc = Math.min(...t.map((x) => x[1]));
    const key = JSON.stringify(t.map(([r, c]) => [r - mr, c - mc]).sort((a, b) => a[0] - b[0] || a[1] - b[1]));
    const i = BK.ORI[pc].findIndex((x) => JSON.stringify(x) === key);
    return i >= 0 ? i : o;
  },
};
