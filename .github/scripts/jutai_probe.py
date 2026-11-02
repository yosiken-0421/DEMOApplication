#!/usr/bin/env python3
"""JARTIC 道路交通情報Now!! のデータ形式を調べてログに出す（調査用・2回目）。"""
import re, urllib.request, urllib.parse, html as H

UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"


def get(url, limit=3_000_000, ref="https://www.jartic.or.jp/map/"):
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Referer": ref, "X-Requested-With": "XMLHttpRequest"})
        with urllib.request.urlopen(req, timeout=20) as r:
            d = r.read(limit)
            print(f"[{r.status}] {r.headers.get('content-type','')} {len(d)}B {url}")
            return d.decode("utf-8", "replace")
    except Exception as e:
        print(f"[ERR] {e} {url}")
        return ""


def text(h):
    h = re.sub(r"(?s)<(script|style)[^>]*>.*?</\1>", " ", h)
    return re.sub(r"\s+", " ", H.unescape(re.sub(r"<[^>]+>", " ", h)))


print("===== map.js の URL らしき箇所 =====")
mj = get("https://www.jartic.or.jp/js/map.js")
hits = set()
for m in re.finditer(r'(/d/[A-Za-z0-9_./{}$+-]*|traffic_info[A-Za-z0-9_./-]*|\.json)', mj):
    s = mj[max(0, m.start() - 160): m.end() + 120].replace("\n", " ")
    key = m.group(0)
    if (key, s[:60]) in hits:
        continue
    hits.add((key, s[:60]))
for k, _ in sorted(hits)[:10]:
    pass
seen = 0
for m in re.finditer(r'/d/[A-Za-z0-9_./-]*', mj):
    if seen > 80:
        break
    seen += 1
    print("---", mj[max(0, m.start() - 220): m.end() + 160].replace("\n", " "))

print("\n===== 高速の渋滞ページ =====")
for u in ["https://www.jartic.or.jp/service/trafficjam/trafficjam_highway/",
          "https://www.jartic.or.jp/service/trafficjam/trafficjam_highway/map/?p=1",
          "https://www.jartic.or.jp/service/trafficjam/trafficjam_highway/map/?p=3"]:
    h = get(u)
    print(text(h)[:2500])
    for m in re.findall(r'(?:src|href|data-[a-z-]+)=["\']([^"\']+)["\']', h):
        if any(x in m for x in ("json", "/d/", "list", "map", "js")):
            print("   ref:", m)

print("\n===== main.js / common-lib.js の /d/ =====")
for js in ["https://www.jartic.or.jp/js/main.js", "https://www.jartic.or.jp/js/common-lib.js"]:
    t = get(js)
    for m in list(re.finditer(r'/d/[A-Za-z0-9_./-]*', t))[:20]:
        print("---", t[max(0, m.start() - 200): m.end() + 120].replace("\n", " "))
