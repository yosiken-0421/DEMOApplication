#!/usr/bin/env python3
"""JARTIC 道路交通情報Now!! のページ・スクリプト・データURLを調べて probe-out/ に保存する（調査用）。"""
import os, re, urllib.request, urllib.parse, json

OUT = "probe-out"
os.makedirs(OUT, exist_ok=True)
UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
seen = {}


def get(url, limit=3_000_000):
    if url in seen:
        return seen[url]
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Referer": "https://www.jartic.or.jp/"})
        with urllib.request.urlopen(req, timeout=20) as r:
            data = r.read(limit)
            info = (r.status, r.headers.get("content-type", ""), len(data))
    except Exception as e:
        data, info = b"", ("ERR", str(e), 0)
    seen[url] = (info, data)
    print(f"[{info[0]}] {info[1]} {info[2]}B  {url}")
    return seen[url]


def save(name, data):
    p = os.path.join(OUT, re.sub(r"[^A-Za-z0-9._-]", "_", name)[:150])
    with open(p, "wb") as f:
        f.write(data)


start = ["https://www.jartic.or.jp/", "https://www.jartic.or.jp/map/", "https://www.jartic.or.jp/d/traffic_info/",
         "https://www.jartic.or.jp/s/", "https://www.jartic.or.jp/d/"]
urls = set()
for u in start:
    info, data = get(u)
    save("page_" + u, data)
    html = data.decode("utf-8", "replace")
    for m in re.findall(r'(?:src|href)=["\']([^"\']+)["\']', html):
        urls.add(urllib.parse.urljoin(u, m))

js = [u for u in urls if re.search(r"\.js(\?|$)", u) and "jartic" in u]
cands = set()
for u in sorted(js)[:60]:
    info, data = get(u)
    t = data.decode("utf-8", "replace")
    save("js_" + u, data)
    for m in re.findall(r'["\'`]([^"\'`\s]*?(?:\.json|/api/|/d/|traffic|jam|kisei|regulation|tile)[^"\'`\s]*)["\'`]', t):
        cands.add(m)

with open(os.path.join(OUT, "candidates.txt"), "w") as f:
    f.write("\n".join(sorted(cands)))
print("\n==== 候補URL/パス ====")
for c in sorted(cands)[:400]:
    print(c)

print("\n==== 候補の取得 ====")
for c in sorted(cands)[:150]:
    if "${" in c or "{" in c:
        continue
    full = urllib.parse.urljoin("https://www.jartic.or.jp/", c)
    if "jartic" not in full:
        continue
    info, data = get(full, 400_000)
    if data and ("json" in info[1] or data[:1] in (b"{", b"[")):
        save("data_" + full, data)
        print("   先頭:", data[:600].decode("utf-8", "replace").replace("\n", " "))

# 旧形式の確認
for cd in ["13", "12", "11", "M_13_301"]:
    get(f"https://www.jartic.or.jp/_json/M_{cd}_301.json")
