#!/usr/bin/env python3
"""JARTIC 道路交通情報Now!! のデータ形式を調べてログに出す（調査用・4回目）。"""
import json, urllib.request

UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
B = "https://www.jartic.or.jp"


def get(url):
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Referer": B + "/map/"})
        with urllib.request.urlopen(req, timeout=30) as r:
            d = r.read()
            print(f"[{r.status}] {len(d)}B {url}")
            return d.decode("utf-8", "replace")
    except Exception as e:
        print(f"[ERR] {e} {url}")
        return ""


dm = json.loads(get(B + "/d/map/degitalmap.json"))
codes = []
for f in dm["features"]:
    cs = f["geometry"]["coordinates"][0]
    if f["geometry"]["type"] == "MultiPolygon":
        cs = f["geometry"]["coordinates"][0][0]
    xs = [c[0] for c in cs]; ys = [c[1] for c in cs]
    hit = min(xs) <= 139.93 <= max(xs) and min(ys) <= 35.77 <= max(ys)
    codes.append(f["id"])
    if hit:
        print("松戸付近を含む:", f["id"], json.dumps(f.get("properties"), ensure_ascii=False))
print("コード数", len(codes), codes[:12], "...", codes[-5:])
print("最初のfeatureのproperties:", json.dumps(dm["features"][0].get("properties"), ensure_ascii=False)[:300])

gen = get(B + "/d/map/simple/generation-current.json")
print("simple generation:", gen[:600])

for r in ["r1", "r2", "r3", "r4"]:
    t = json.loads(get(f"{B}/d/traffic_info/{r}/target.json"))["target"]
    for mt in ["d", "s"]:
        off = get(f"{B}/d/traffic_info/{r}/{t}/{mt}/offer.json")
        print(f"  {r}/{mt} offer:", off[:500])

t = json.loads(get(B + "/d/traffic_info/r1/target.json"))["target"]
kanto = [c for c in codes if c.startswith("R1")] or codes
for ev in ["301", "301_b", "401", "501", "601", "801", "1101", "1301", "15011", "15012"]:
    shown = 0
    for code in codes:
        txt = get(f"{B}/d/traffic_info/r1/{t}/d/{ev}/{code}.json")
        if not txt:
            continue
        try:
            j = json.loads(txt)
        except Exception:
            print("   (JSONでない)", txt[:200]); break
        feats = j.get("features", [])
        if j.get("road-info") or feats:
            print(f"=== イベント {ev} / {code}: features={len(feats)} road-info={json.dumps(j.get('road-info'), ensure_ascii=False)[:600]}")
            for f in feats[:3]:
                print("   props:", json.dumps(f.get("properties"), ensure_ascii=False)[:900])
                print("   geom:", f.get("geometry", {}).get("type"), str(f.get("geometry", {}).get("coordinates"))[:150])
            shown += 1
        if shown >= 2:
            break
r2t = json.loads(get(B + "/d/traffic_info/r2/target.json"))["target"]
for code in codes[:80]:
    txt = get(f"{B}/d/traffic_info/r2/{r2t}/d/900/{code}.json")
    if txt and '"features":[{' in txt.replace(" ", ""):
        j = json.loads(txt)
        print("=== r2 900", code, json.dumps(j["features"][0].get("properties"), ensure_ascii=False)[:900])
        break
