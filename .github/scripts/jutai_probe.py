#!/usr/bin/env python3
"""JARTIC 道路交通情報Now!! のデータ形式を調べてログに出す（調査用・5回目：関東の高速）。"""
import json, urllib.request, collections

UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
B = "https://www.jartic.or.jp"


def get(url):
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Referer": B + "/map/"})
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.read().decode("utf-8", "replace")
    except Exception as e:
        return ""


HW = ("自動車道", "高速", "外環", "首都", "道路", "ＩＣ", "JCT", "ＪＣＴ", "バイパス")
t = json.loads(get(B + "/d/traffic_info/r1/target.json"))["target"]
print("target", t)
stat = collections.Counter()
keys = collections.Counter()
samples = collections.defaultdict(list)
for code in ["R08", "R09", "R10", "R11", "R12", "R13", "R14", "R19", "R22", "R23"]:
    for ev in ["301", "401", "501", "601", "801", "1101", "1301", "15011", "15012"]:
        for mt in ["d"]:
            txt = get(f"{B}/d/traffic_info/r1/{t}/{mt}/{ev}/{code}.json")
            if not txt:
                stat[(ev, "none")] += 1
                continue
            j = json.loads(txt)
            ri = j.get("road-info") or {}
            names = [n for n, _ in ri.get("l", [])]
            feats = j.get("features", [])
            stat[(ev, "feats")] += len(feats)
            for f in feats:
                p = f.get("properties") or {}
                for k in p:
                    keys[(ev, k)] += 1
                if len(samples[ev]) < 6 and any(h in json.dumps(p, ensure_ascii=False) for h in ("自動車道", "高速", "外環")):
                    samples[ev].append((code, p))
            hw = [n for n in names if any(h in n for h in ("自動車道", "高速", "外環", "首都"))]
            print(f"{code} {ev}: features={len(feats)} t={ri.get('t')} 高速系の路線={hw[:15]}")

print("\n==== 各イベント種別の項目名 ====")
for ev in ["301", "401", "501", "601", "801", "1101", "1301", "15011", "15012"]:
    print(ev, stat[(ev, 'feats')], sorted({k for (e, k) in keys if e == ev}))
print("\n==== 高速道路のサンプル ====")
for ev, lst in samples.items():
    for code, p in lst:
        q = dict(p); q.pop("p", None)
        print(f"[{ev} {code}]", json.dumps(q, ensure_ascii=False)[:1200])

print("\n==== s（簡易図）側の首都高等 ====")
for code in ["C01", "C02", "A13", "A12", "A11"]:
    for ev in ["301", "401", "601"]:
        txt = get(f"{B}/d/traffic_info/r1/{t}/s/{ev}/{code}.json")
        if txt:
            j = json.loads(txt)
            fs = j.get("features", [])
            print(f"s/{ev}/{code}: features={len(fs)}", json.dumps([ {k:v for k,v in (f.get('properties') or {}).items() if k!='p'} for f in fs[:2]], ensure_ascii=False)[:900])
