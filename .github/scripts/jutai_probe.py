import json, urllib.request
UA = {"User-Agent": "Mozilla/5.0 (iPhone)", "Referer": "https://www.jartic.or.jp/map/"}
B = "https://www.jartic.or.jp/d/traffic_info"
def get(u):
    try: return json.loads(urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=20).read())
    except Exception: return {}
t = get(B + "/r1/target.json")["target"]
print("target", t)
for c in ["A03", "A05", "A06", "C01", "C02"]:
    for mt in ["s", "d"]:
        fs = get(f"{B}/r1/{t}/{mt}/301/{c}.json").get("features", [])
        if mt == "s": fs = [f for f in fs if (f.get("properties") or {}).get("z") in (8, None)]
        jams = sorted({(f["properties"].get("r"), f["properties"].get("d"), f["properties"].get("i"), f["properties"].get("j")) for f in fs if "j" in (f.get("properties") or {})})
        ev = sorted({(f["properties"].get("r"), f["properties"].get("d"), f["properties"].get("i"), f["properties"].get("rd")) for f in fs if "j" not in (f.get("properties") or {})})
        print(mt, c, "渋滞", len(jams), jams[:6], "| 規制など", len(ev))
