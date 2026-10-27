"use strict";
/* ===== ひとりで遊ぶパズル =====
   各パズルは start(area, opts, api) で始まり、{ destroy } を返す。
   api.win(info) … クリア　api.over(info) … ゲームオーバー（スコア記録）　api.moved() … 手を進めた */

/* 共通：パズル用の枠 */
function pzFrame(area, o) {
  area.innerHTML = "";
  const hud = h("div", { class: "pz-hud" }, h("span", { class: "pill" }), h("span", { class: "pill" }));
  const body = h("div", { class: "pz-body" });
  const tools = h("div", { class: "pz-tools" });
  area.append(hud, body, tools);
  return { hud, L: hud.children[0], R: hud.children[1], body, tools };
}
function pzSquare(body, cols, rows, pad) {
  const r = body.getBoundingClientRect();
  pad = pad == null ? 6 : pad;
  const cs = Math.floor(Math.min((r.width - 8 - pad * 2) / cols, (r.height - 8 - pad * 2) / rows));
  const el = h("div", { class: "pz-board", style: { width: cs * cols + pad * 2 + "px", height: cs * rows + pad * 2 + "px" } });
  body.append(el);
  return { el, cs, pad, x: (c) => pad + c * cs, y: (r2) => pad + r2 * cs };
}
function timer(fn) { const t0 = Date.now(); const iv = setInterval(() => fn((Date.now() - t0) / 1000), 1000); fn(0); return { stop: () => { clearInterval(iv); return (Date.now() - t0) / 1000; }, sec: () => (Date.now() - t0) / 1000 }; }

/* ---------- 数独 ---------- */
const SUDOKU = {
  solve(g, limit) {
    // g: 81の配列（0=空）。解の数を limit まで数える
    const rows = Array(9).fill(0), cols = Array(9).fill(0), boxes = Array(9).fill(0);
    const empty = [];
    for (let i = 0; i < 81; i++) {
      const v = g[i]; if (!v) { empty.push(i); continue; }
      const b = 1 << v, r = (i / 9) | 0, c = i % 9, x = ((r / 3) | 0) * 3 + ((c / 3) | 0);
      if (rows[r] & b || cols[c] & b || boxes[x] & b) return 0;
      rows[r] |= b; cols[c] |= b; boxes[x] |= b;
    }
    let count = 0; const sol = g.slice();
    const rec = () => {
      if (count >= limit) return;
      // いちばん候補が少ないマス
      let best = -1, bm = 0, bc = 10;
      for (const i of empty) {
        if (sol[i]) continue;
        const r = (i / 9) | 0, c = i % 9, x = ((r / 3) | 0) * 3 + ((c / 3) | 0);
        const m = ~(rows[r] | cols[c] | boxes[x]) & 0x3fe;
        let n = 0; for (let k = m; k; k &= k - 1) n++;
        if (n < bc) { bc = n; best = i; bm = m; if (n <= 1) break; }
      }
      if (best < 0) { count++; if (count === 1) SUDOKU.last = sol.slice(); return; }
      if (!bc) return;
      const r = (best / 9) | 0, c = best % 9, x = ((r / 3) | 0) * 3 + ((c / 3) | 0);
      const ds = []; for (let v = 1; v <= 9; v++) if (bm & (1 << v)) ds.push(v);
      if (SUDOKU.rand) shuffle(ds);
      for (const v of ds) {
        const b = 1 << v;
        sol[best] = v; rows[r] |= b; cols[c] |= b; boxes[x] |= b;
        rec();
        sol[best] = 0; rows[r] &= ~b; cols[c] &= ~b; boxes[x] &= ~b;
        if (count >= limit) return;
      }
    };
    rec();
    return count;
  },
  make(clues) {
    SUDOKU.rand = true; SUDOKU.solve(Array(81).fill(0), 1); SUDOKU.rand = false;
    const full = SUDOKU.last.slice(), g = full.slice();
    const order = shuffle([...Array(81).keys()]);
    let filled = 81;
    for (const i of order) {
      if (filled <= clues) break;
      const keep = g[i]; g[i] = 0;
      if (SUDOKU.solve(g, 2) !== 1) g[i] = keep; else filled--;
    }
    return { puzzle: g, sol: full };
  },
};
const PZ_Sudoku = {
  id: "sudoku", name: "数独", icon: "🔢", tag: "脳トレ",
  desc: "1〜9の数字を、たて・よこ・3×3のどこにも同じ数字がないように埋めよう",
  rules: "・空いているマスに1〜9の数字を入れます。\n・たての列、よこの行、太線で囲まれた3×3のブロック、どれにも同じ数字が入ってはいけません。\n・全部うまったらクリア！\n\nマスをタップ→下の数字をタップで記入。「メモ」をONにすると小さな候補メモが書けます。同じ数字がぶつかっていると赤くなります。",
  opts: [{ key: "lv", label: "むずかしさ", def: 1, choices: [[0, "かんたん"], [1, "ふつう"], [2, "むずかしい"]] }],
  start(area, o, api) {
    const F = pzFrame(area);
    const clues = [40, 32, 27][o.lv ?? 1];
    const { puzzle, sol } = SUDOKU.make(clues);
    const g = puzzle.slice(), given = puzzle.map((x) => !!x), memo = Array.from({ length: 81 }, () => new Set());
    let sel = given.indexOf(false), memoMode = false, miss = 0, done = false;
    const hist = [];
    const tm = timer((t) => (F.L.textContent = "⏱ " + fmtTime(t)));
    const conflict = (i) => {
      const v = g[i]; if (!v) return false;
      const r = (i / 9) | 0, c = i % 9;
      for (let k = 0; k < 9; k++) {
        if (k !== c && g[r * 9 + k] === v) return true;
        if (k !== r && g[k * 9 + c] === v) return true;
      }
      const br = r - (r % 3), bc = c - (c % 3);
      for (let dr = 0; dr < 3; dr++) for (let dc = 0; dc < 3; dc++) { const j = (br + dr) * 9 + bc + dc; if (j !== i && g[j] === v) return true; }
      return false;
    };
    const put = (v) => {
      if (done || sel < 0 || given[sel]) return;
      hist.push([sel, g[sel], new Set(memo[sel])]);
      if (memoMode && v) { g[sel] = 0; memo[sel].has(v) ? memo[sel].delete(v) : memo[sel].add(v); }
      else {
        g[sel] = g[sel] === v ? 0 : v; memo[sel].clear();
        if (v && g[sel] && g[sel] !== sol[sel]) { miss++; Native.haptic("soft"); }
        // 同じ行・列・ブロックのメモからその数字を消す
        if (g[sel]) { const r = (sel / 9) | 0, c = sel % 9; for (let j = 0; j < 81; j++) { const rr = (j / 9) | 0, cc = j % 9; if (rr === r || cc === c || ((rr / 3) | 0) === ((r / 3) | 0) && ((cc / 3) | 0) === ((c / 3) | 0)) memo[j].delete(g[sel]); } }
      }
      Snd.tick(); api.moved();
      draw();
      if (g.every((x, i) => x === sol[i])) { done = true; const t = tm.stop(); setTimeout(() => api.win({ time: t, text: "ミス " + miss + "回" }), 400); }
    };
    const draw = () => {
      F.body.innerHTML = "";
      F.R.textContent = "ミス " + miss;
      const B = pzSquare(F.body, 9, 9, 4);
      const sv = g[sel];
      for (let i = 0; i < 81; i++) {
        const r = (i / 9) | 0, c = i % 9;
        let cls = "sd-cell" + (given[i] ? " given" : "") + (i === sel ? " sel" : "");
        if (sel >= 0 && i !== sel && (((sel / 9) | 0) === r || sel % 9 === c || (((sel / 9 / 3) | 0) === ((r / 3) | 0) && (((sel % 9) / 3) | 0) === ((c / 3) | 0)))) cls += " peer";
        if (sv && g[i] === sv) cls += " same";
        if (conflict(i)) cls += " bad";
        if (c % 3 === 2 && c < 8) cls += " br"; if (r % 3 === 2 && r < 8) cls += " bb";
        const e = at(B.el, B.x(c), B.y(r), B.cs, B.cs, cls, { onclick: () => { sel = i; Snd.tick(); draw(); } });
        if (g[i]) e.append(h("b", null, g[i]));
        else if (memo[i].size) { const m = h("div", { class: "memo" }); for (let v = 1; v <= 9; v++) m.append(h("i", null, memo[i].has(v) ? v : "")); e.append(m); }
      }
      const pad = h("div", { class: "sd-pad" });
      for (let v = 1; v <= 9; v++) {
        const left = 9 - g.filter((x) => x === v).length;
        pad.append(h("button", { class: left <= 0 ? "dim" : "", onclick: () => put(v) }, h("b", null, v), h("small", null, left > 0 ? left : "")));
      }
      F.body.append(pad);
    };
    F.tools.append(
      h("button", { class: "btn ghost small", onclick: () => { const x = hist.pop(); if (!x) return; g[x[0]] = x[1]; memo[x[0]] = x[2]; sel = x[0]; draw(); } }, "↩︎ もどす"),
      h("button", { class: "btn ghost small", onclick: () => put(0) }, "⌫ 消す"),
      h("button", { class: "btn ghost small memo-btn", onclick: (e) => { memoMode = !memoMode; e.currentTarget.classList.toggle("on", memoMode); e.currentTarget.textContent = "✏️ メモ " + (memoMode ? "ON" : "OFF"); } }, "✏️ メモ OFF"),
      h("button", { class: "btn ghost small", onclick: () => {
        const empties = [...Array(81).keys()].filter((i) => g[i] !== sol[i]);
        if (!empties.length) return;
        const i = sel >= 0 && g[sel] !== sol[sel] ? sel : pick(empties);
        sel = i; memoMode = false; const mm = memoMode; put(sol[i]); memoMode = mm; toast("ヒント：ここは " + sol[i]);
      } }, "💡 ヒント"));
    draw();
    return { destroy: () => tm.stop(), redraw: draw };
  },
};

/* ---------- ペグソリティア ---------- */
const PZ_Peg = {
  id: "peg", name: "ペグソリティア", icon: "📍", tag: "定番パズル",
  desc: "ピンを飛びこえて取っていき、最後の1本を目指すひとり遊びの名作",
  rules: "・ピンを1本選び、となりのピンを飛びこえて、その向こうの空いている穴へ動かします（たて・よこのみ）。\n・飛びこえられたピンは取りのぞかれます。\n・動かせなくなったら終わり。残りのピンが少ないほど良い成績！\n・最後の1本になればクリア。真ん中に残せたら「パーフェクト」！",
  opts: [{ key: "bd", label: "スタート", def: "en", choices: [["easy", "練習（8本）"], ["mid", "中級（16本）"], ["en", "本番（32本）"]] }],
  start(area, o, api) {
    const F = pzFrame(area);
    const N = 7;
    const holes = [];
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) holes.push((r >= 2 && r <= 4) || (c >= 2 && c <= 4));
    let peg = holes.map((x) => x);
    peg[24] = false;
    if (o.bd === "easy" || o.bd === "mid") {
      // 真ん中の1本から逆向きに動かして、必ず解ける問題を作る
      const want = o.bd === "easy" ? 8 : 16;
      for (let tries = 0; tries < 50; tries++) {
        peg = holes.map(() => false); peg[24] = true;
        let guard = 0;
        while (peg.filter((x) => x).length < want && guard++ < 400) {
          const back = [];
          peg.forEach((p, t) => { if (!p) return; const r = (t / N) | 0, c = t % N;
            for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) { const mr = r + dr, mc = c + dc, fr = r + dr * 2, fc = c + dc * 2;
              if (fr < 0 || fr >= N || fc < 0 || fc >= N) continue; const m = mr * N + mc, f = fr * N + fc;
              if (holes[m] && holes[f] && !peg[m] && !peg[f]) back.push([t, m, f]); } });
          if (!back.length) break;
          const [t, m, f] = pick(back); peg[t] = false; peg[m] = true; peg[f] = true;
        }
        if (peg.filter((x) => x).length >= want) break;
      }
    }
    let sel = -1, done = false, moves = 0;
    const hist = [];
    const tm = timer((t) => (F.L.textContent = "⏱ " + fmtTime(t)));
    const jumpsFrom = (i) => {
      const r = (i / N) | 0, c = i % N, out = [];
      for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const mr = r + dr, mc = c + dc, tr = r + dr * 2, tc = c + dc * 2;
        if (tr < 0 || tr >= N || tc < 0 || tc >= N) continue;
        const m = mr * N + mc, t = tr * N + tc;
        if (holes[t] && peg[m] && !peg[t]) out.push([t, m]);
      }
      return out;
    };
    const anyMove = () => peg.some((p, i) => p && jumpsFrom(i).length);
    const check = () => {
      if (anyMove()) return;
      done = true;
      const left = peg.filter((x) => x).length, t = tm.stop();
      setTimeout(() => {
        if (left === 1) api.win({ time: t, low: 1, text: peg[24] ? "パーフェクト！真ん中に残せた！" : "最後の1本！" });
        else api.over({ low: left, text: "のこり " + left + " 本" });
      }, 500);
    };
    const draw = () => {
      F.body.innerHTML = "";
      F.R.textContent = "のこり " + peg.filter((x) => x).length + " 本";
      const B = pzSquare(F.body, N, N, 10);
      B.el.classList.add("peg-board");
      const targets = sel >= 0 ? new Map(jumpsFrom(sel)) : new Map();
      for (let i = 0; i < N * N; i++) {
        if (!holes[i]) continue;
        const r = (i / N) | 0, c = i % N;
        const can = targets.has(i);
        const e = at(B.el, B.x(c), B.y(r), B.cs, B.cs, "peg-hole" + (can ? " can" : "") + (i === sel ? " sel" : ""), {
          onclick: () => {
            if (done) return;
            if (can) {
              hist.push(peg.slice());
              peg[sel] = false; peg[targets.get(i)] = false; peg[i] = true; sel = i; moves++;
              Snd.place(); api.moved();
              if (!jumpsFrom(i).length) sel = -1;
              draw(); check(); return;
            }
            if (peg[i] && jumpsFrom(i).length) { sel = sel === i ? -1 : i; Snd.tick(); }
            else if (peg[i]) { Snd.bad(); toast("このピンは動かせない"); sel = -1; }
            draw();
          } });
        if (peg[i]) e.append(h("div", { class: "peg" + (jumpsFrom(i).length ? " mv" : "") }));
      }
    };
    F.tools.append(
      h("button", { class: "btn ghost small", onclick: () => { if (done) return; const x = hist.pop(); if (x) { peg = x; sel = -1; draw(); } } }, "↩︎ もどす"),
      h("button", { class: "btn ghost small", onclick: () => { if (done) return; const ok = peg.map((p, i) => (p && jumpsFrom(i).length ? i : -1)).filter((i) => i >= 0); if (ok.length) { sel = pick(ok); draw(); toast("このピンが動かせるよ"); } } }, "💡 ヒント"));
    draw();
    return { destroy: () => tm.stop(), redraw: draw };
  },
};

/* ---------- かさねて2048 ---------- */
const PZ_2048 = {
  id: "p2048", name: "かさねて2048", icon: "🟨", tag: "スワイプ",
  desc: "スワイプで同じ数字をかさねて大きく！2048を作れたらクリア",
  rules: "・上下左右にスワイプすると、すべてのタイルがその方向にすべります。\n・同じ数字のタイルがぶつかると合体して2倍になります。\n・1回動かすごとに新しいタイル（2か4）が出ます。\n・2048のタイルを作ったらクリア！（そのまま続けてハイスコアを狙えます）\n・動かせなくなったらおしまい。",
  opts: [{ key: "sz", label: "ばんの大きさ", def: 4, choices: [[4, "4×4"], [5, "5×5"]] }],
  start(area, o, api) {
    const F = pzFrame(area);
    const N = o.sz || 4;
    let g = Array(N * N).fill(0), score = 0, won = false, over = false, moved = new Set(), born = -1;
    const hist = [];
    const add = () => { const e = g.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0); if (!e.length) return -1; const i = pick(e); g[i] = rnd(10) ? 2 : 4; return i; };
    add(); add();
    const line = (idx) => {
      const vals = idx.map((i) => g[i]).filter((v) => v);
      const out = []; let gain = 0;
      for (let k = 0; k < vals.length; k++) { if (vals[k] === vals[k + 1]) { out.push(vals[k] * 2); gain += vals[k] * 2; k++; } else out.push(vals[k]); }
      while (out.length < N) out.push(0);
      return { out, gain };
    };
    const move = (dir) => {
      if (over) return;
      const before = g.slice(); let gain = 0; moved = new Set();
      for (let k = 0; k < N; k++) {
        let idx = [];
        for (let j = 0; j < N; j++) {
          if (dir === "L") idx.push(k * N + j); if (dir === "R") idx.push(k * N + N - 1 - j);
          if (dir === "U") idx.push(j * N + k); if (dir === "D") idx.push((N - 1 - j) * N + k);
        }
        const r = line(idx); gain += r.gain;
        idx.forEach((i, j) => { if (g[i] !== r.out[j]) moved.add(i); g[i] = r.out[j]; });
      }
      if (g.every((v, i) => v === before[i])) { Snd.bad(); return; }
      hist.push([before, score]); if (hist.length > 30) hist.shift();
      score += gain; born = add();
      Snd.tick(); if (gain >= 64) Snd.ok(); api.moved();
      draw();
      if (!won && g.includes(2048)) { won = true; setTimeout(() => api.win({ score, keep: true, text: "2048 達成！続けてハイスコアを目指そう" }), 300); }
      if (!canMove()) { over = true; setTimeout(() => api.over({ score, text: "スコア " + score }), 500); }
    };
    const canMove = () => {
      if (g.includes(0)) return true;
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) { const v = g[r * N + c]; if ((c < N - 1 && g[r * N + c + 1] === v) || (r < N - 1 && g[(r + 1) * N + c] === v)) return true; }
      return false;
    };
    const draw = () => {
      F.body.innerHTML = "";
      F.L.textContent = "スコア " + score;
      F.R.textContent = "ベスト " + Math.max(score, (Save.data.stats.p2048 || {}).hi || 0);
      const B = pzSquare(F.body, N, N, 8);
      B.el.classList.add("t48-board");
      for (let i = 0; i < N * N; i++) {
        const r = (i / N) | 0, c = i % N, v = g[i];
        const e = at(B.el, B.x(c) + 4, B.y(r) + 4, B.cs - 8, B.cs - 8, "t48 v" + Math.min(v, 4096) + (i === born ? " born" : moved.has(i) && v ? " mv" : ""));
        if (v) e.append(h("b", { style: { fontSize: B.cs * (v >= 1000 ? 0.28 : v >= 100 ? 0.34 : 0.42) + "px" } }, v));
        if (v >= 2048) e.append(h("img", { src: CHARS[["mofupi", "kuronya", "pyonta", "penpen", "gaorun"][Math.min(4, Math.log2(v) - 11)]].img, alt: "" }));
      }
    };
    // スワイプ
    let sx = 0, sy = 0, st = false;
    const ts = (e) => { const p = e.touches ? e.touches[0] : e; sx = p.clientX; sy = p.clientY; st = true; };
    const te = (e) => {
      if (!st) return; st = false;
      const p = e.changedTouches ? e.changedTouches[0] : e;
      const dx = p.clientX - sx, dy = p.clientY - sy;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
      move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "R" : "L") : dy > 0 ? "D" : "U");
    };
    F.body.addEventListener("touchstart", ts, { passive: true }); F.body.addEventListener("touchend", te);
    F.body.addEventListener("mousedown", ts); F.body.addEventListener("mouseup", te);
    const key = (e) => { const m = { ArrowLeft: "L", ArrowRight: "R", ArrowUp: "U", ArrowDown: "D" }[e.key]; if (m) { e.preventDefault(); move(m); } };
    window.addEventListener("keydown", key);
    F.tools.append(
      h("button", { class: "btn ghost small", onclick: () => { const x = hist.pop(); if (!x || over) return; [g, score] = [x[0], x[1]]; moved = new Set(); born = -1; draw(); } }, "↩︎ もどす"),
      h("span", { class: "note" }, "スワイプで動かす"));
    draw();
    return { destroy: () => window.removeEventListener("keydown", key), redraw: draw, move };
  },
};

/* ---------- スライドパズル ---------- */
const PZ_Slide = {
  id: "slide", name: "スライドパズル", icon: "🔀", tag: "定番パズル",
  desc: "バラバラの数字タイルをすべらせて、1から順番に並べよう",
  rules: "・空きマスのとなりのタイルをタップすると、空きマスへすべります（同じ列なら複数まとめて動かせます）。\n・左上から1, 2, 3…と順番に並べ、右下を空きマスにしたらクリア！\n・少ない手数・短い時間を目指そう。",
  opts: [{ key: "sz", label: "大きさ", def: 4, choices: [[3, "3×3"], [4, "4×4"], [5, "5×5"]] }],
  start(area, o, api) {
    const F = pzFrame(area);
    const N = o.sz || 4;
    let g = [...Array(N * N).keys()].map((i) => (i + 1) % (N * N)); // 0 = 空
    let e = N * N - 1, moves = 0, done = false;
    // 解ける並びにするため、空きマスをランダムに動かす
    let prev = -1;
    for (let k = 0; k < N * N * 40; k++) {
      const r = (e / N) | 0, c = e % N;
      const nb = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].filter(([a, b]) => a >= 0 && a < N && b >= 0 && b < N).map(([a, b]) => a * N + b).filter((x) => x !== prev);
      const t = pick(nb); g[e] = g[t]; g[t] = 0; prev = e; e = t;
    }
    const tm = timer((t) => (F.L.textContent = "⏱ " + fmtTime(t)));
    const solved = () => g.every((v, i) => v === (i + 1) % (N * N));
    if (solved()) { const a = 0, b = 1; [g[a], g[b]] = [g[b], g[a]]; if (g[a] === 0 || g[b] === 0) { [g[a], g[b]] = [g[b], g[a]]; } }
    const tap = (i) => {
      if (done) return;
      const r = (i / N) | 0, c = i % N, er = (e / N) | 0, ec = e % N;
      if (r !== er && c !== ec) { Snd.bad(); return; }
      const step = r === er ? (c > ec ? 1 : -1) : (r > er ? N : -N);
      while (e !== i) { const nx = e + step; g[e] = g[nx]; g[nx] = 0; e = nx; moves++; }
      Snd.tick(); api.moved();
      draw();
      if (solved()) { done = true; const t = tm.stop(); setTimeout(() => api.win({ time: t, text: moves + " 手でクリア！" }), 350); }
    };
    const draw = () => {
      F.body.innerHTML = "";
      F.R.textContent = "手数 " + moves;
      const B = pzSquare(F.body, N, N, 8);
      B.el.classList.add("sl-board");
      g.forEach((v, i) => {
        if (!v) return;
        const r = (i / N) | 0, c = i % N;
        const ok = v === i + 1;
        const t = at(B.el, B.x(c) + 3, B.y(r) + 3, B.cs - 6, B.cs - 6, "sl-tile" + (ok ? " ok" : ""), { onclick: () => tap(i) });
        t.append(h("b", { style: { fontSize: B.cs * 0.4 + "px" } }, v));
      });
      if (done) { const im = h("img", { class: "sl-win", src: CHARS[Save.data.me.char].img, alt: "" }); B.el.append(im); }
    };
    F.tools.append(h("span", { class: "note" }, "空きマスと同じ列のタイルをタップ"));
    draw();
    return { destroy: () => tm.stop(), redraw: draw };
  },
};

/* ---------- じらいさがし ---------- */
const PZ_Mines = {
  id: "mines", name: "じらいさがし", icon: "💣", tag: "推理",
  desc: "数字をヒントに、じらいを踏まずに全部のマスを開けよう",
  rules: "・マスをタップすると開きます。じらいを開けたら負け！\n・開いたマスの数字は、まわり8マスにあるじらいの数です。\n・じらいだと思うマスには🚩旗を立てておけます（「🚩旗モード」をONにしてタップ、またはマスを長押し）。\n・じらい以外のマスを全部開けたらクリア！\n・最初のタップは必ず安全です。",
  opts: [{ key: "lv", label: "むずかしさ", def: 0, choices: [[0, "9×9 じらい10"], [1, "10×14 じらい22"], [2, "12×18 じらい40"]] }],
  start(area, o, api) {
    const F = pzFrame(area);
    const [C, R, M] = [[9, 9, 10], [10, 14, 22], [12, 18, 40]][o.lv ?? 0];
    let mine = null, open = Array(R * C).fill(false), flag = Array(R * C).fill(false), done = false, flagMode = false, boom = -1;
    const tm = { t: null };
    const nb = (i) => { const r = (i / C) | 0, c = i % C, out = []; for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { if (!dr && !dc) continue; const rr = r + dr, cc = c + dc; if (rr >= 0 && rr < R && cc >= 0 && cc < C) out.push(rr * C + cc); } return out; };
    const cnt = (i) => nb(i).filter((j) => mine[j]).length;
    const plant = (safe) => {
      mine = Array(R * C).fill(false);
      const ban = new Set([safe, ...nb(safe)]);
      const cand = shuffle([...Array(R * C).keys()].filter((i) => !ban.has(i)));
      cand.slice(0, M).forEach((i) => (mine[i] = true));
      tm.t = timer((t) => (F.L.textContent = "⏱ " + fmtTime(t)));
    };
    const reveal = (i) => {
      const st = [i];
      while (st.length) { const x = st.pop(); if (open[x] || flag[x]) continue; open[x] = true; if (!mine[x] && cnt(x) === 0) nb(x).forEach((j) => { if (!open[j]) st.push(j); }); }
    };
    const tap = (i, alt) => {
      if (done) return;
      if (alt || flagMode) { if (!open[i]) { flag[i] = !flag[i]; Snd.tick(); Native.haptic("light"); draw(); } return; }
      if (flag[i]) return;
      if (!mine) plant(i);
      if (open[i]) {
        // 開いた数字マス：旗の数が合っていれば、まわりをまとめて開ける
        const n = cnt(i); if (!n) return;
        const ns = nb(i); if (ns.filter((j) => flag[j]).length !== n) return;
        for (const j of ns) if (!open[j] && !flag[j]) { if (mine[j]) { boom = j; break; } reveal(j); }
      } else if (mine[i]) boom = i;
      else reveal(i);
      api.moved();
      if (boom >= 0) {
        done = true; mine.forEach((m, j) => { if (m) open[j] = true; });
        Snd.bad(); Native.haptic("soft"); draw(); tm.t && tm.t.stop();
        setTimeout(() => api.over({ text: "じらいを踏んじゃった…" }), 700); return;
      }
      Snd.tick();
      draw();
      if (open.filter((x) => !x).length === M) { done = true; const t = tm.t.stop(); draw(); setTimeout(() => api.win({ time: t }), 400); }
    };
    const draw = () => {
      F.body.innerHTML = "";
      F.R.textContent = "💣 " + (M - flag.filter((x) => x).length);
      if (!mine) F.L.textContent = "⏱ 0:00";
      const B = pzSquare(F.body, C, R, 4);
      B.el.classList.add("ms-board");
      for (let i = 0; i < R * C; i++) {
        const r = (i / C) | 0, c = i % C;
        let cls = "ms-cell" + (open[i] ? " open" : "") + (i === boom ? " boom" : "");
        const e = at(B.el, B.x(c), B.y(r), B.cs, B.cs, cls);
        let lp = null, longed = false;
        e.addEventListener("touchstart", () => { longed = false; lp = setTimeout(() => { longed = true; tap(i, true); }, 380); }, { passive: true });
        e.addEventListener("touchend", (ev2) => { clearTimeout(lp); if (longed) ev2.preventDefault(); });
        e.addEventListener("touchmove", () => clearTimeout(lp), { passive: true });
        e.addEventListener("click", () => { if (!longed) tap(i); longed = false; });
        e.addEventListener("contextmenu", (ev2) => { ev2.preventDefault(); tap(i, true); });
        if (open[i]) {
          if (mine && mine[i]) e.textContent = "💣";
          else { const n = cnt(i); if (n) { e.textContent = n; e.classList.add("n" + n); } }
        } else if (flag[i]) e.textContent = "🚩";
        e.style.fontSize = B.cs * 0.55 + "px";
      }
    };
    const fb = h("button", { class: "btn ghost small", onclick: () => { flagMode = !flagMode; fb.classList.toggle("on", flagMode); fb.textContent = "🚩 旗モード " + (flagMode ? "ON" : "OFF"); } }, "🚩 旗モード OFF");
    F.tools.append(fb, h("span", { class: "note" }, "長押しでも旗"));
    draw();
    return { destroy: () => tm.t && tm.t.stop(), redraw: draw };
  },
};

/* ---------- ヒット＆ブロー ---------- */
const PZ_HitBlow = {
  id: "hitblow", name: "ヒット＆ブロー", icon: "🎯", tag: "推理",
  desc: "かくされた4つの色を当てよう。ヒントは「ヒット」と「ブロー」だけ！",
  rules: "・CPUが、6色の中からちがう色を4つ選んで、順番に並べてかくしています。\n・4つの色を選んで「こたえる」と、ヒントが出ます。\n　🎯ヒット：色も場所も合っている数\n　💫ブロー：色は合っているけど場所がちがう数\n・10回以内に4ヒットで正解！",
  opts: [{ key: "lv", label: "むずかしさ", def: 0, choices: [[0, "6色・ちがう色"], [1, "8色・ちがう色"], [2, "6色・同じ色もあり"]] }],
  start(area, o, api) {
    const F = pzFrame(area);
    const lv = o.lv ?? 0;
    const COLS = ["#ff7fa6", "#5aa2ff", "#4cc79a", "#ffc23d", "#a98bff", "#ff9a52", "#59d0e0", "#8a7a92"].slice(0, lv === 1 ? 8 : 6);
    const dup = lv === 2;
    const ans = dup ? [0, 0, 0, 0].map(() => rnd(COLS.length)) : shuffle([...COLS.keys()]).slice(0, 4);
    const tries = []; let cur = [], done = false;
    const tm = timer((t) => (F.L.textContent = "⏱ " + fmtTime(t)));
    const judge = (g) => {
      let hit = 0, blow = 0;
      const ra = [], rg = [];
      g.forEach((v, i) => { if (v === ans[i]) hit++; else { ra.push(ans[i]); rg.push(v); } });
      rg.forEach((v) => { const k = ra.indexOf(v); if (k >= 0) { blow++; ra.splice(k, 1); } });
      return { hit, blow };
    };
    const draw = () => {
      F.body.innerHTML = "";
      F.R.textContent = "あと " + (10 - tries.length) + " 回";
      const list = h("div", { class: "hb-list" });
      for (let k = 0; k < 10; k++) {
        const t = tries[k];
        const row = h("div", { class: "hb-row" + (k === tries.length && !done ? " cur" : "") }, h("span", { class: "no" }, k + 1));
        const g = t ? t.g : k === tries.length ? cur : [];
        for (let j = 0; j < 4; j++) row.append(h("i", { class: "pin" + (g[j] == null ? " empty" : ""), style: g[j] != null ? { background: COLS[g[j]] } : null, onclick: k === tries.length && g[j] != null && !done ? () => { cur.splice(j, 1); Snd.tick(); draw(); } : null }));
        row.append(h("span", { class: "res" }, t ? "🎯" + t.hit + "　💫" + t.blow : ""));
        list.append(row);
      }
      if (done) {
        const row = h("div", { class: "hb-row ans" }, h("span", { class: "no" }, "答"));
        ans.forEach((v) => row.append(h("i", { class: "pin", style: { background: COLS[v] } })));
        list.append(row);
      }
      F.body.append(list);
      const pal = h("div", { class: "hb-pal" });
      COLS.forEach((col, v) => pal.append(h("button", { style: { background: col }, disabled: done || cur.length >= 4 || (!dup && cur.includes(v)), onclick: () => { cur.push(v); Snd.tick(); draw(); } })));
      F.body.append(pal);
    };
    F.tools.append(
      h("button", { class: "btn ghost small", onclick: () => { cur.pop(); draw(); } }, "⌫ 1つ消す"),
      h("button", { class: "btn pink small", onclick: () => {
        if (done || cur.length < 4) { toast("4つ選んでね"); return; }
        const r = judge(cur); tries.push({ g: cur.slice(), hit: r.hit, blow: r.blow }); cur = [];
        api.moved();
        if (r.hit === 4) { done = true; Snd.win(); const t = tm.stop(); draw(); setTimeout(() => api.win({ time: t, low: tries.length, text: tries.length + " 回で正解！" }), 500); return; }
        Snd.place();
        if (tries.length >= 10) { done = true; tm.stop(); draw(); setTimeout(() => api.over({ text: "ざんねん！答えは下の通り" }), 600); return; }
        draw();
      } }, "✓ こたえる"));
    draw();
    return { destroy: () => tm.stop(), redraw: draw };
  },
};

/* ---------- ライツアウト ---------- */
const PZ_Lights = {
  id: "lights", name: "ライツアウト", icon: "💡", tag: "ひらめき",
  desc: "タップすると十字に光が反転。全部のライトを消せるかな？",
  rules: "・マスをタップすると、そのマスと上下左右のマスのライトが反転します（ついている↔消えている）。\n・全部のライトを消したらクリア！\n・少ない手数を目指そう。",
  opts: [{ key: "sz", label: "大きさ", def: 5, choices: [[4, "4×4"], [5, "5×5"], [6, "6×6"]] }],
  start(area, o, api) {
    const F = pzFrame(area);
    const N = o.sz || 5;
    let g = Array(N * N).fill(0), moves = 0, done = false;
    const flip = (i) => { const r = (i / N) | 0, c = i % N; [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dr, dc]) => { const rr = r + dr, cc = c + dc; if (rr >= 0 && rr < N && cc >= 0 && cc < N) g[rr * N + cc] ^= 1; }); };
    // 解ける問題：ランダムに押した状態から始める
    while (!g.some((x) => x)) for (let k = 0; k < N * N; k++) if (rnd(2)) flip(k);
    const tm = timer((t) => (F.L.textContent = "⏱ " + fmtTime(t)));
    const draw = () => {
      F.body.innerHTML = "";
      F.R.textContent = "手数 " + moves;
      const B = pzSquare(F.body, N, N, 8);
      B.el.classList.add("lo-board");
      g.forEach((v, i) => {
        const r = (i / N) | 0, c = i % N;
        const e = at(B.el, B.x(c) + 4, B.y(r) + 4, B.cs - 8, B.cs - 8, "lo-cell" + (v ? " on" : ""), {
          onclick: () => {
            if (done) return; flip(i); moves++; Snd.tick(); api.moved(); draw();
            if (!g.some((x) => x)) { done = true; const t = tm.stop(); setTimeout(() => api.win({ time: t, text: moves + " 手でクリア！" }), 350); }
          } });
        if (v) e.append(h("img", { src: CHARS[["mofupi", "kuronya", "pyonta", "penpen", "gaorun"][(r + c) % 5]].img, alt: "" }));
      });
    };
    F.tools.append(h("span", { class: "note" }, "ついている🐾を全部消そう"));
    draw();
    return { destroy: () => tm.stop(), redraw: draw };
  },
};

const SOLO_GAMES = [PZ_Sudoku, PZ_Peg, PZ_2048, PZ_Slide, PZ_Mines, PZ_HitBlow, PZ_Lights];
