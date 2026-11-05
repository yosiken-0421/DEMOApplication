#!/usr/bin/env python3
"""イントロどんぴしゃ: 年間ランキングを増やして hits.json に追加する。

  - 1970〜2007年: 日本語版 Wikipedia「○年の音楽」の、オリコン年間シングルランキング（多くの年で50位まで）
  - 2008〜2025年: Billboard JAPAN 年間 HOT 100（100位まで）の公式ページ

すでにある曲（曲名と歌手が一致）は追加しない。新しく足した曲は、あとで
「曲データの照合」「読みの収集」ワークフローで Apple の曲データと読みを付ける。
"""
import html as H
import json
import re
import sys
import time
import unicodedata
import urllib.parse
import urllib.request

HITS = "apps/IntroDon/Resources/hits.json"
UA = {"User-Agent": "IntroDonpisha/1.0 (https://github.com/yosiken-0421/DEMOApplication)"}


def nfkc(s):
    return unicodedata.normalize("NFKC", s or "")


def norm(s):
    s = nfkc(s).lower()
    return "".join(c for c in s if unicodedata.category(c)[0] not in "PSZC" and c not in "・〜~ー-‐―☆★♥♡")


def cut(s, seps):
    s = nfkc(s)
    for sep in seps:
        i = s.find(sep)
        if i > 0:
            s = s[:i]
    return s.strip()


TITLE_SEPS = [" / ", "/", "／", "〜", "~", " -", "(", "（", "【", " feat", " Feat"]
SEG_RE = re.compile(r"\s*(?:\bfeat\.?|\bfeaturing\b|\bft\.|\bwith\b|\band\b|&|×|、|,|/|・|\s x\s)\s*", re.I)


def core(t):
    return norm(cut(t, TITLE_SEPS)) or norm(t)


def segs(a):
    return {norm(x) for x in SEG_RE.split(nfkc(a)) if norm(x)}


def same_artist(a, b):
    na, nb = norm(a), norm(b)
    if not na or not nb:
        return False
    if na == nb or (len(na) >= 3 and na in nb) or (len(nb) >= 3 and nb in na):
        return True
    sa, sb = segs(a), segs(b)
    return bool(sa and sb and (sa & sb))


def get(url, retries=4):
    for i in range(retries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
                return r.read().decode("utf-8", "replace")
        except Exception as e:
            print("  retry", url, e, flush=True)
            time.sleep(5 * (i + 1))
    return None


# ---------- Wikipedia（オリコン年間） ----------

def unlink(s):
    s = re.sub(r"\[\[([^\]|]*)\|([^\]]*)\]\]", r"\2", s)
    s = re.sub(r"\[\[([^\]]*)\]\]", r"\1", s)
    s = re.sub(r"<ref[^>]*/>|<ref[^>]*>.*?</ref>", "", s)
    s = re.sub(r"'''?|\{\{[^}]*\}\}", "", s)
    return s.strip()


LINE_RE = re.compile(r"^\*\s*(\d+)\s*位\s*(.+?)\s*[：:]?\s*「(.+?)」")
BAD_HEAD = ["アルバム", "インディーズ", "カラオケ", "洋楽", "DVD", "ビデオ", "新人", "配信", "着うた", "作詞", "作曲", "売上"]


def oricon_year(y):
    q = urllib.parse.urlencode({"action": "parse", "page": f"{y}年の音楽", "prop": "wikitext",
                                "format": "json", "formatversion": "2"})
    t = get("https://ja.wikipedia.org/w/api.php?" + q)
    if not t:
        return []
    w = json.loads(t).get("parse", {}).get("wikitext", "")
    heads = list(re.finditer(r"^(=+)\s*([^=\n]+?)\s*=+\s*$", w, re.M))
    for i, m in enumerate(heads):
        name = m.group(2)
        if "年間" not in name or any(b in name for b in BAD_HEAD):
            continue
        body = w[m.end(): heads[i + 1].start() if i + 1 < len(heads) else len(w)]
        if "オリコン" not in body[:400] and "シングル" not in name:
            continue
        rows = []
        last_artist = ""
        for line in body.splitlines():
            mm = LINE_RE.match(line.strip())
            if not mm:
                continue
            rank, artist, title = int(mm.group(1)), unlink(mm.group(2)), unlink(mm.group(3))
            artist = artist.strip("：: ")
            if not artist:
                artist = last_artist
            last_artist = artist
            title = title.replace("／", " / ")
            rows.append((rank, title, artist))
        if len(rows) >= 20:
            return rows
    return []


# ---------- Billboard JAPAN ----------

BB_RE = re.compile(r'<p class="rank">\s*(\d+)\s*</p>.*?<p class="musuc_title">\s*(.*?)\s*</p>\s*<p class="artist_name">(.*?)</p>', re.S)


def billboard_year(y):
    t = get(f"https://www.billboard-japan.com/charts/detail?a=hot100_year&year={y}")
    if not t:
        return []
    rows = []
    seen = set()
    for rank, title, artist in BB_RE.findall(t):
        rank = int(rank)
        if rank in seen:
            continue
        seen.add(rank)
        title = H.unescape(re.sub(r"<[^>]+>", "", title)).strip()
        artist = H.unescape(re.sub(r"<[^>]+>", "", artist)).strip()
        artist = re.sub(r"\s*\[[^\]]*\]$", "", artist)  # 「関ジャニ∞[エイト]」→「関ジャニ∞」
        rows.append((rank, title, artist))
    return rows


def main():
    hits = json.load(open(HITS, encoding="utf-8"))
    by_core = {}
    for h in hits:
        by_core.setdefault(core(h["t"]), []).append(h)

    def exists(title, artist):
        for h in by_core.get(core(title), []):
            if same_artist(h.get("a") or h.get("aa") or "", artist) or (h.get("aa") and same_artist(h["aa"], artist)):
                return h
        return None

    added = 0
    report = []
    years_from = int(sys.argv[1]) if len(sys.argv) > 1 else 1970
    for y in range(years_from, 2026):
        if y <= 2007:
            rows, src = oricon_year(y), f"オリコン年間シングル（{y}年）"
        else:
            rows, src = billboard_year(y), f"Billboard JAPAN 年間HOT100（{y}年）"
        n = 0
        for rank, title, artist in rows:
            if not title or not artist:
                continue
            h = exists(title, artist)
            if h:
                # 同じ曲がもっと上の順位で入っていたら、そちらを使う
                if h.get("w", 0) == 0 and (h.get("r", 0) == 0 or rank < h["r"]) and h.get("y") == y:
                    h["r"] = rank
                continue
            e = {"t": title, "a": artist, "y": y, "r": rank, "w": 0, "s": src}
            hits.append(e)
            by_core.setdefault(core(title), []).append(e)
            n += 1
        added += n
        report.append(f"| {y} | {len(rows)} | {n} |")
        print(y, len(rows), "rows,", n, "added", flush=True)
        time.sleep(1)

    json.dump(hits, open(HITS, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    text = "## 年間ランキングの追加\n\n| 年 | 取得 | 追加 |\n|---|---|---|\n" + "\n".join(report) + f"\n\n合計 {added} 曲を追加（全 {len(hits)} 曲）\n"
    print(text)
    import os
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8").write(text)


if __name__ == "__main__":
    main()
