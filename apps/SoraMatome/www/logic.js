"use strict";
// 空まとめ: 画面に依存しないデータ処理（Nodeのテストからも読み込む）
(function (root) {
  // 都道府県名 → 気象庁の府県予報区コード。
  // 北海道・鹿児島県・沖縄県は予報区が複数に分かれるため、自動では割り当てない（誤った地域の予報を出さない）。
  const PREFS = ["", "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県", "茨城県", "栃木県", "群馬県",
    "埼玉県", "千葉県", "東京都", "神奈川県", "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県",
    "岐阜県", "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県",
    "鳥取県", "島根県", "岡山県", "広島県", "山口県", "徳島県", "香川県", "愛媛県", "高知県", "福岡県",
    "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県"];
  const MULTI_OFFICE = new Set(["北海道", "鹿児島県", "沖縄県"]);

  function officeForPrefecture(name) {
    if (typeof name !== "string" || MULTI_OFFICE.has(name)) return null;
    const i = PREFS.indexOf(name);
    return i > 0 ? String(i).padStart(2, "0") + "0000" : null;
  }

  function weatherInfo(x) {
    if (x == null || !Number.isFinite(x)) return ["—", "不明"];
    if (x === 0) return ["☀️", "快晴"];
    if (x <= 2) return ["🌤️", "晴れ時々曇り"];
    if (x === 3) return ["☁️", "曇り"];
    if (x === 45 || x === 48) return ["🌫️", "霧"];
    if (x >= 51 && x <= 57) return ["🌦️", "霧雨"];
    if (x >= 61 && x <= 67) return ["🌧️", "雨"];
    if (x >= 71 && x <= 77) return ["🌨️", "雪"];
    if (x >= 80 && x <= 82) return ["🌦️", "にわか雨"];
    if (x === 85 || x === 86) return ["❄️", "にわか雪"];
    if (x >= 95 && x <= 99) return ["⛈️", "雷雨"];
    return ["—", "不明"];
  }

  // 日本時間の "YYYY-MM-DDTHH" / "YYYY-MM-DD"
  function jstParts(date) {
    const s = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit",
      day: "2-digit", hour: "2-digit", hourCycle: "h23" }).format(date);
    const hour = s.replace(" ", "T").slice(0, 13);
    return { hour, day: hour.slice(0, 10) };
  }

  // 時間別予報（Asia/Tokyoのローカル時刻文字列）から現在時刻以降の開始位置。過去データしかなければ -1。
  function hourlyStart(times, now) {
    if (!Array.isArray(times)) return -1;
    const h = jstParts(now).hour;
    return times.findIndex(t => typeof t === "string" && t.slice(0, 13) >= h);
  }

  function dayLabel(date, now) {
    const today = jstParts(now).day;
    const d = new Date(today + "T00:00:00Z");
    const tomorrow = new Date(d.getTime() + 86400000).toISOString().slice(0, 10);
    const md = date.slice(5).replace("-", "/");
    if (date === today) return "今日 " + md;
    if (date === tomorrow) return "明日 " + md;
    const wd = "日月火水木金土"[new Date(date + "T00:00:00Z").getUTCDay()];
    return md + "（" + wd + "）";
  }

  // 気象庁 forecast/{office}.json を解析する。
  // area が分かっていればその区域を詳しく、分からなければ全区域を並べる（推測で1区域を選ばない）。
  function parseJmaForecast(data, areaCode, now) {
    const s = Array.isArray(data) ? data[0] : null;
    const series = s && Array.isArray(s.timeSeries) ? s.timeSeries[0] : null;
    if (!series || !Array.isArray(series.areas) || !series.areas.length) throw new Error("形式不明");
    const issued = Date.parse(s.reportDatetime);
    if (!Number.isFinite(issued)) throw new Error("発表時刻なし");
    if (now.getTime() - issued > 30 * 3600000) throw new Error("古い発表");
    const fmt = t => new Date(t).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric" });
    const clean = x => String(x || "").replace(/\s+/g, " ").trim();
    const target = areaCode ? series.areas.find(a => a.area && a.area.code === areaCode) : null;
    if (target) {
      if (!Array.isArray(target.weathers) || !target.weathers.length) throw new Error("内容なし");
      return {
        exact: true, office: s.publishingOffice || "", issued, title: target.area.name,
        lines: target.weathers.slice(0, 3).map((w, i) => (series.timeDefines && series.timeDefines[i] ? fmt(series.timeDefines[i]) : "予報" + (i + 1)) + "：" + clean(w))
      };
    }
    const day = series.timeDefines && series.timeDefines[0] ? fmt(series.timeDefines[0]) : "";
    const lines = series.areas.filter(a => a.area && Array.isArray(a.weathers) && a.weathers.length)
      .map(a => a.area.name + "（" + day + "）：" + clean(a.weathers[0]));
    if (!lines.length) throw new Error("内容なし");
    return { exact: false, office: s.publishingOffice || "", issued, title: "府県内の全区域", lines };
  }

  // ジオコーディング結果から日本の地点を選び、地点情報に変換する
  function placeFromGeocode(d) {
    const p = d && Array.isArray(d.results) ? d.results.find(x => x.country_code === "JP" &&
      Number.isFinite(x.latitude) && Number.isFinite(x.longitude)) : null;
    if (!p) return null;
    const place = { name: p.name + (p.admin1 && p.admin1 !== p.name ? "（" + p.admin1 + "）" : ""), lat: p.latitude, lon: p.longitude };
    const office = officeForPrefecture(p.admin1);
    if (office) place.office = office;
    return place;
  }

  function cacheUsable(saved, now, maxHours) {
    return !!(saved && saved.data && Number.isFinite(saved.time) && now.getTime() - saved.time >= 0 &&
      now.getTime() - saved.time < maxHours * 3600000);
  }

  // ---- 全国市区町村の検索（www/municipalities.js、端末内で完結） ----
  function normalize(x) {
    return String(x || "").normalize("NFKC").toLowerCase().replace(/ヶ/g, "ケ")
      .replace(/[\u30a1-\u30f6]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60))
      .replace(/[\s・･,，、.。()（）]/g, "");
  }
  const PREF_SHORT = PREFS.slice(1).map(p => [p, p === "北海道" ? p : p.replace(/[都府県]$/, "")]);

  function rowToPlace(r) {
    return { code: r[0], name: r[1], kana: r[2], pref: r[4], lat: r[5], lon: r[6], office: r[7], area: r[8] || undefined };
  }

  // 戻り値：候補の地点（最大 limit 件）。漢字・ひらがな・カタカナ・ローマ字、「市」なし、県名つきに対応。
  // 「福島町（北海道）」のように県名で始まる市町村もあるため、県名として読む解釈と読まない解釈の両方で探す。
  function searchMunicipalities(rows, query, limit) {
    const q0 = normalize(query);
    if (!q0 || !Array.isArray(rows)) return [];
    const tries = [[q0, null]];
    for (const [full, short] of PREF_SHORT) {
      const head = [normalize(full), normalize(short)].find(h => q0.startsWith(h));
      if (head) { tries.push([q0.slice(head.length), full]); break; }
    }
    const best = new Map();
    for (const [q, pref] of tries) {
      for (const r of rows) {
        if (pref && r[4] !== pref) continue;
        const name = normalize(r[1]), kana = normalize(r[2]), en = normalize(r[3]);
        let score;
        if (q && (name === q || kana === q)) score = 0;
        else if (name.startsWith(q) || kana.startsWith(q)) score = 1;   // q が空（県名だけ）ならその県の全件
        else if (en && en.startsWith(q)) score = 2;
        else if (q.length >= 2 && (name.includes(q) || kana.includes(q))) score = 3;
        else continue;
        if (!best.has(r[0]) || best.get(r[0])[0] > score) best.set(r[0], [score, /[市区]$/.test(r[1]) ? 0 : 1, r]);
      }
    }
    return [...best.values()].sort((a, b) => a[0] - b[0] || a[1] - b[1] || (a[2][0] < b[2][0] ? -1 : 1))
      .slice(0, limit || 20).map(x => rowToPlace(x[2]));
  }

  // ---- お気に入り地域（端末内に保存） ----
  const FAVORITE_MAX = 12;
  function placeKey(p) {
    return p && p.code ? "c:" + p.code : p ? "g:" + Number(p.lat).toFixed(2) + "," + Number(p.lon).toFixed(2) : "";
  }
  function validPlace(p) {
    return !!(p && typeof p.name === "string" && p.name && Number.isFinite(p.lat) && Number.isFinite(p.lon) &&
      p.lat > 20 && p.lat < 46.5 && p.lon > 122 && p.lon < 154.5);
  }
  // 保存データ（壊れていることもある）を安全な一覧に戻す。団体コードがあれば最新の一覧データで置き換える。
  function loadFavorites(raw, byCode) {
    let list;
    try { list = typeof raw === "string" ? JSON.parse(raw) : raw; } catch (_) { return null; }
    if (!Array.isArray(list)) return null;
    const out = [], seen = new Set();
    for (const x of list) {
      const p = x && x.code && byCode ? byCode(x.code) || x : x;
      if (!validPlace(p) || seen.has(placeKey(p))) continue;
      seen.add(placeKey(p)); out.push(p);
      if (out.length >= FAVORITE_MAX) break;
    }
    return out;
  }
  function isFavorite(list, p) { return list.some(x => placeKey(x) === placeKey(p)); }
  function addFavorite(list, p) {
    if (!validPlace(p) || isFavorite(list, p) || list.length >= FAVORITE_MAX) return list;
    return [...list, p];
  }
  function removeFavorite(list, p) { return list.filter(x => placeKey(x) !== placeKey(p)); }
  function moveFavorite(list, p, delta) {
    const i = list.findIndex(x => placeKey(x) === placeKey(p)), j = i + delta;
    if (i < 0 || j < 0 || j >= list.length) return list;
    const out = list.slice(); [out[i], out[j]] = [out[j], out[i]]; return out;
  }

  const api = { FAVORITE_MAX, placeKey, validPlace, loadFavorites, isFavorite, addFavorite, removeFavorite, moveFavorite, normalize, searchMunicipalities, rowToPlace, officeForPrefecture, weatherInfo, jstParts, hourlyStart, dayLabel, parseJmaForecast, placeFromGeocode, cacheUsable };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.SoraLogic = api;
})(typeof window !== "undefined" ? window : globalThis);
