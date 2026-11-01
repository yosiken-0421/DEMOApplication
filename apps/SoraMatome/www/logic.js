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

  const api = { officeForPrefecture, weatherInfo, jstParts, hourlyStart, dayLabel, parseJmaForecast, placeFromGeocode, cacheUsable };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.SoraLogic = api;
})(typeof window !== "undefined" ? window : globalThis);
