import json, urllib.request
UA = {"User-Agent": "Mozilla/5.0 (iPhone)", "Referer": "https://www.jartic.or.jp/map/"}
B = "https://www.jartic.or.jp/d/traffic_info"
def get(u):
    try: return json.loads(urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=20).read())
    except Exception as e: print("ERR", u, e); return None
t = get(B + "/r1/target.json")["target"]
def coords(g):
    out = []
    def walk(c):
        if isinstance(c, list) and c and isinstance(c[0], (int, float)): out.append(c)
        elif isinstance(c, list):
            for x in c: walk(x)
    walk((g or {}).get("coordinates")); return out
for mt in ["s", "d"]:
    for code in ["A03", "C01"]:
        j = get(f"{B}/r1/{t}/{mt}/301/{code}.json")
        if not j: continue
        n = 0
        for f in j.get("features", []):
            p = f.get("properties") or {}
            if p.get("l") == "f": continue
            r = p.get("r", "")
            if not any(k in r for k in ("外環", "東関東", "湾岸", "京葉", "６号", "中央環状", "５号")): continue
            cs = coords(f.get("geometry"))
            n += 1
            if n > 14: break
            print(mt, code, p.get("z"), r, p.get("d"), p.get("i"), p.get("j") or p.get("rd"), "| p=", p.get("p"), "ce=", p.get("ce"),
                  "| geom", (f.get("geometry") or {}).get("type"), len(cs), "first", cs[:2], "last", cs[-2:])
