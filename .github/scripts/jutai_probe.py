#!/usr/bin/env python3
"""JARTIC 道路交通情報Now!! のデータ形式を調べてログに出す（調査用・6回目：高速の簡易図データ）。"""
import json, urllib.request, collections

UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
B = "https://www.jartic.or.jp"


def get(url):
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Referer": B + "/map/"})
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.read().decode("utf-8", "replace")
    except Exception:
        return ""


t = json.loads(get(B + "/d/traffic_info/r1/target.json"))["target"]
EV = ["301", "401", "501", "601", "801", "1101", "1301", "15011", "15012"]
codes = [f"A{i:02d}" for i in range(0, 20)] + [f"C{i:02d}" for i in range(1, 6)]
keys = collections.defaultdict(set)
samples = collections.defaultdict(list)
rds = collections.Counter()
roads = collections.defaultdict(set)
for code in codes:
    line = []
    for ev in EV:
        txt = get(f"{B}/d/traffic_info/r1/{t}/s/{ev}/{code}.json")
        if not txt:
            continue
        j = json.loads(txt)
        fs = [f for f in j.get("features", []) if (f.get("properties") or {}).get("l") != "f"]
        line.append(f"{ev}:{len(fs)}")
        for f in fs:
            p = f.get("properties") or {}
            keys[ev] |= set(p)
            rds[(ev, p.get("rd"))] += 1
            roads[code].add(p.get("r", "").split("　")[0])
            if len(samples[ev]) < 8 and (code in ("A11", "C01") or len(samples[ev]) < 3):
                q = {k: v for k, v in p.items() if k not in ("p",)}
                samples[ev].append((code, q, f.get("geometry", {}).get("type")))
    if line:
        print(code, " ".join(line))
        print("    路線:", sorted(roads[code])[:40])

print("\n==== 種別ごとの項目名と rd ====")
for ev in EV:
    print(ev, sorted(keys[ev]), [(rd, n) for (e, rd), n in rds.most_common() if e == ev][:15])
print("\n==== サンプル ====")
for ev in EV:
    for code, q, g in samples[ev]:
        print(f"[{ev} {code} {g}]", json.dumps(q, ensure_ascii=False)[:1000])

print("\n==== 外環を含む項目（全種別） ====")
for code in codes:
    for ev in EV:
        txt = get(f"{B}/d/traffic_info/r1/{t}/s/{ev}/{code}.json")
        if "外環" in txt:
            for f in json.loads(txt).get("features", []):
                p = f.get("properties") or {}
                if "外環" in p.get("r", "") and p.get("l") != "f":
                    print(f"[{ev} {code}]", json.dumps({k: v for k, v in p.items() if k != 'p'}, ensure_ascii=False)[:800])
