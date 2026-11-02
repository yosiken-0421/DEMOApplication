#!/usr/bin/env python3
"""JARTIC 道路交通情報Now!! のデータ形式を調べてログに出す（調査用・3回目）。"""
import re, json, urllib.request

UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
B = "https://www.jartic.or.jp"


def get(url, limit=3_000_000):
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Referer": B + "/map/"})
        with urllib.request.urlopen(req, timeout=20) as r:
            d = r.read(limit)
            print(f"[{r.status}] {r.headers.get('content-type','')} {len(d)}B {url}")
            return d.decode("utf-8", "replace")
    except Exception as e:
        print(f"[ERR] {e} {url}")
        return ""


main = get(B + "/js/main.js")
k = main.find("TRAFFIC_EVENT")
print("===== main.js 設定 =====")
print(main[max(0, k - 1500): k + 3000])

mj = get(B + "/js/map.js")
print("\n===== map.js ポップアップ（getProperties）=====")
n = 0
for m in re.finditer(r"getProperties\(\)", mj):
    n += 1
    if n > 45:
        break
    print("---", mj[max(0, m.start() - 250): m.end() + 900].replace("\n", " "))

print("\n===== map.js の r1〜r5 / map_type / date の使われ方 =====")
for kw in ["map_type", "{date}", "TRAFFIC_EVENT_R1", "TRAFFIC_EVENT_R2", "target.json", "highway", "HIGHWAY"]:
    for m in list(re.finditer(re.escape(kw), mj))[:6]:
        print(f"--- [{kw}]", mj[max(0, m.start() - 300): m.end() + 300].replace("\n", " "))

print("\n===== target.json =====")
for base in ["/d/traffic_info", "/s/traffic_info", "/d/traffic_info/r1", ""]:
    for r in ["r1", "r2", "r3", "r4", "r5"]:
        t = get(f"{B}{base}/{r}/target.json")
        if t:
            print("   ", t[:800])
