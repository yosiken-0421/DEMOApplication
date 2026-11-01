#!/usr/bin/env python3
"""全国の市区町村一覧（座標・気象庁の予報区つき）を www/municipalities.js に生成する。

入力
- 気象庁 area.json（市町村名・よみ・所属する一次細分区域と府県予報区）
  https://www.jma.go.jp/bosai/common/const/area.json  … 政府標準利用規約（出典：気象庁ホームページ）
- Wikidata の全国地方公共団体コード(P429)と座標(P625) … CC0

使い方
  python3 tools/build_municipalities.py --fetch            # GitHub Actions 上で実行
  python3 tools/build_municipalities.py --area A.json --wikidata W.json   # テスト用
検証に失敗したら終了コード1で止まり、ファイルは書き換えない。
"""
import argparse, json, math, re, sys, time, urllib.parse, urllib.request
from pathlib import Path

PREFS = ["", "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県", "茨城県", "栃木県", "群馬県",
         "埼玉県", "千葉県", "東京都", "神奈川県", "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県",
         "岐阜県", "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県",
         "鳥取県", "島根県", "岡山県", "広島県", "山口県", "徳島県", "香川県", "愛媛県", "高知県", "福岡県",
         "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県"]
AREA_URL = "https://www.jma.go.jp/bosai/common/const/area.json"
SPARQL = "https://query.wikidata.org/sparql"
QUERY = """SELECT ?item ?code ?coord ?label WHERE {
  ?item wdt:P429 ?code; wdt:P625 ?coord.
  OPTIONAL { ?item rdfs:label ?label FILTER(LANG(?label)="ja") }
}"""
UA = "SoraMatome-build/1.0 (personal weather app; https://github.com/yosiken-0421/SoraMatome-iOS)"


def get(url, tries=4):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.load(r)
        except Exception as e:  # noqa
            if i == tries - 1:
                raise
            print(f"retry {url[:60]}…: {e}", file=sys.stderr)
            time.sleep(5 * (i + 1))


def common_prefix(xs):
    p = xs[0]
    for x in xs[1:]:
        while not x.startswith(p):
            p = p[:-1]
    return p


def trim_to(text, pattern):
    m = re.match(pattern, text)
    return m.group(1) if m else text


def english_name(xs):
    for x in xs:
        x = re.sub(r"\s*\(.*?\)", "", x)
        m = re.search(r"([A-Z][A-Za-z-]*(?: [A-Z][A-Za-z-]*)* (?:City|Town|Village|Ward))$", x)
        if m:
            return m.group(1)
    return ""


def parse_point(wkt):
    m = re.fullmatch(r"Point\(([-0-9.]+) ([-0-9.]+)\)", wkt.strip())
    return (float(m.group(2)), float(m.group(1))) if m else None


def build(area, wd):
    for k in ("offices", "class10s", "class15s", "class20s"):
        if not isinstance(area.get(k), dict) or not area[k]:
            raise SystemExit(f"area.json の形式が想定と違います: {k}")
    # Wikidata: 団体コード上5桁 → 候補座標
    coords = {}
    for b in wd["results"]["bindings"]:
        code = re.sub(r"\D", "", b["code"]["value"])
        if len(code) not in (5, 6):
            continue
        pt = parse_point(b["coord"]["value"])
        if not pt or not (20 <= pt[0] <= 46.5 and 122 <= pt[1] <= 154.5):
            continue
        coords.setdefault(code[:5], []).append((b.get("label", {}).get("value", ""), pt))

    # 気象庁 class20 を団体コード単位にまとめる（1つの市が複数の区域に分かれる場合がある）
    groups = {}
    for c20, v in area["class20s"].items():
        if not re.fullmatch(r"\d{7}", c20):
            continue
        c15 = area["class15s"].get(v.get("parent", ""))
        c10code = c15.get("parent") if c15 else None
        c10 = area["class10s"].get(c10code or "")
        office = c10.get("parent") if c10 else None
        if not c10 or office not in area["offices"]:
            raise SystemExit(f"予報区をたどれません: {c20} {v.get('name')}")
        g = groups.setdefault(c20[:5], {"names": [], "kana": [], "en": [], "areas": set(), "offices": set()})
        g["names"].append(v["name"]); g["kana"].append(v.get("kana", "")); g["en"].append(v.get("enName", ""))
        g["areas"].add(c10code); g["offices"].add(office)

    rows, missing, split = [], [], []
    for code, g in sorted(groups.items()):
        pref = PREFS[int(code[:2])] if 0 < int(code[:2]) < len(PREFS) else ""
        # 分割された市町村（例：「北見市北見」「北見市留辺蘂」「佐世保市（宇久地域を除く）」）は共通の市町村名にまとめる
        if len(g["names"]) == 1:
            name, kana, en = g["names"][0], g["kana"][0], g["en"][0]
        else:
            name = trim_to(common_prefix(g["names"]), r"^(.*?[市区町村])")
            kana = trim_to(common_prefix(g["kana"]), r"^(.*(?:し|く|ちょう|まち|むら|そん))")
            en = english_name(g["en"])
        cands = coords.get(code, [])
        if not cands:
            missing.append(f"{code} {pref}{name}")
            continue
        pt = next((p for lab, p in cands if lab == name), cands[0][1])
        offices = sorted(g["offices"])
        if len(offices) != 1:
            split.append(f"{code} {name}")
        area_code = next(iter(g["areas"])) if len(g["areas"]) == 1 else ""
        rows.append([code, name, kana, en, pref, round(pt[0], 4), round(pt[1], 4), offices[0], area_code])
    return rows, missing, split


def validate(rows, missing):
    errors = []
    if len(rows) < 1700:
        errors.append(f"件数が少なすぎます: {len(rows)}")
    if len(missing) > 15:
        errors.append(f"座標がない市区町村が多すぎます: {len(missing)}")
    prefs = {r[4] for r in rows}
    if len(prefs) != 47:
        errors.append(f"都道府県がそろっていません: {len(prefs)}")
    by = {(r[4], r[1]): r for r in rows}
    must = [("千葉県", "八街市"), ("千葉県", "千葉市"), ("北海道", "札幌市"), ("大阪府", "大阪市"),
            ("東京都", "千代田区"), ("東京都", "府中市"), ("広島県", "府中市"), ("沖縄県", "那覇市")]
    for k in must:
        if k not in by:
            errors.append(f"見つかりません: {k}")
    if ("千葉県", "千葉市") in by and by[("千葉県", "千葉市")][8] != "120010":
        errors.append("千葉市が千葉県北西部(120010)になっていません")
    for r in rows:
        lat, lon = r[5], r[6]
        # 県庁所在地から極端に離れていないか（同じ団体コードの別の場所を拾っていないか）の粗い確認は県単位で行う
        if not r[1] or not r[7]:
            errors.append(f"項目が空: {r}")
        if not re.search(r"[市区町村]$", r[1]):
            errors.append(f"市区町村名として不自然: {r[1]}")
    return errors


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--fetch", action="store_true")
    ap.add_argument("--area"); ap.add_argument("--wikidata")
    ap.add_argument("--out", default="www/municipalities.js")
    ap.add_argument("--min-check", action="store_true", help="件数などの全国向け検証を省略（テスト用）")
    a = ap.parse_args()
    if a.fetch:
        area = get(AREA_URL)
        wd = get(SPARQL + "?" + urllib.parse.urlencode({"query": QUERY, "format": "json"}))
    else:
        area = json.loads(Path(a.area).read_text()); wd = json.loads(Path(a.wikidata).read_text())
    rows, missing, split = build(area, wd)
    errors = [] if a.min_check else validate(rows, missing)
    # 県ごとの重心から 250km 以上離れた点は座標の取り違えとみなす（離島の多い東京・鹿児島・沖縄・北海道は除く）
    if not a.min_check:
        from collections import defaultdict
        acc = defaultdict(list)
        for r in rows: acc[r[4]].append((r[5], r[6]))
        for r in rows:
            if r[4] in ("東京都", "鹿児島県", "沖縄県", "北海道", "長崎県"):
                continue
            pts = acc[r[4]]; clat = sorted(p[0] for p in pts)[len(pts)//2]; clon = sorted(p[1] for p in pts)[len(pts)//2]
            d = math.hypot((r[5]-clat)*111, (r[6]-clon)*111*math.cos(math.radians(clat)))
            if d > 250: errors.append(f"座標が県から離れすぎ: {r[4]}{r[1]} {d:.0f}km")
    for m in missing: print("座標なし（一覧から除外）:", m)
    for s in split: print("複数の府県予報区にまたがる:", s)
    if errors:
        for e in errors: print("ERROR:", e, file=sys.stderr)
        sys.exit(1)
    body = json.dumps(rows, ensure_ascii=False, separators=(",", ":"))
    js = ("// 自動生成ファイル（tools/build_municipalities.py）。手で編集しないこと。\n"
          "// 出典：気象庁ホームページ（予報区・市町村名・よみ）を加工、Wikidata（座標、CC0）。\n"
          "// 列: [団体コード上5桁, 名称, よみ, 英名, 都道府県, 緯度, 経度, 府県予報区, 一次細分区域(空=複数にまたがる)]\n"
          f"(function(r){{var d={body};if(typeof module!==\"undefined\"&&module.exports)module.exports=d;else r.SoraMunicipalities=d}})"
          "(typeof window!==\"undefined\"?window:globalThis);\n")
    Path(a.out).write_text(js)
    print(f"{len(rows)} 件を書き出しました（座標なし {len(missing)} 件、分割 {len(split)} 件）")


if __name__ == "__main__":
    main()
