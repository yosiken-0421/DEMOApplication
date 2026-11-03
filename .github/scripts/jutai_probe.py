import json, urllib.request
UA = {"User-Agent": "Mozilla/5.0 (iPhone)", "Referer": "https://www.jartic.or.jp/map/"}
B = "https://www.jartic.or.jp/d/traffic_info"
def raw(u):
    try: return urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=20).read()
    except Exception as e: return b""
t = json.loads(raw(B + "/r1/target.json"))["target"]
codes = [f"A{i:02d}" for i in range(1, 12)] + [f"C{i:02d}" for i in range(1, 6)]
for ev in ["301", "801", "1101"]:
    for c in codes:
        d = raw(f"{B}/r1/{t}/d/{ev}/{c}.json")
        if not d: print(ev, c, "なし"); continue
        j = json.loads(d); fs = j.get("features", [])
        jams = [f for f in fs if "j" in (f.get("properties") or {})]
        xs = [];
        def walk(x):
            if isinstance(x, list) and x and isinstance(x[0], (int, float)): xs.append(x)
            elif isinstance(x, list):
                for y in x: walk(y)
        for f in fs: walk((f.get("geometry") or {}).get("coordinates"))
        bb = (min(p[0] for p in xs), min(p[1] for p in xs), max(p[0] for p in xs), max(p[1] for p in xs)) if xs else None
        print(ev, c, f"{len(d)//1024}KB", "features", len(fs), "jams", len(jams), "bbox", bb)
        if c == "A03" and ev == "301":
            for f in jams[:4]:
                p = f["properties"]; g = f["geometry"]
                print("   jam", {k: v for k, v in p.items() if k != "p"}, g["type"], str(g["coordinates"])[:200])
        if ev in ("801", "1101") and c in ("A03", "C01") and fs:
            print("   例", fs[0].get("properties"), fs[0].get("geometry"))
