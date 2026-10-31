#!/usr/bin/env python3
"""イントロどんぴしゃ: 曲名・歌手名の読み（ふりがな）を日本語版 Wikipedia の記事の冒頭から集める。

採用するのは、記事の書き出しが
  「曲名」（よみ）は、…       （曲の記事）
  歌手名（よみ、…）は、…      （歌手の記事）
の形で、かつ次の条件を全部満たすときだけ（それ以外は読みを付けない）
  - 書き出しの名前が、曲名・歌手名と表記ゆれを除いて一致する
  - （ ）の中身がひらがな・カタカナだけ
  - 元の名前に含まれるかなが、同じ順番で読みにも含まれる（別の記事の読みを拾わないため）
  - 曲の記事は、冒頭に歌手名が書かれている。歌手の記事は、冒頭に音楽の仕事の言葉がある

結果は hits.json の rt（曲名の読み）・ra（歌手名の読み）・rs（出典の記事名）に書き込む。
"""
import json
import os
import re
import sys
import time
import unicodedata
import urllib.parse
import urllib.request

HITS = "apps/IntroDon/Resources/hits.json"
API = "https://ja.wikipedia.org/w/api.php"
UA = "IntroDonpisha/1.0 (https://github.com/yosiken-0421/DEMOApplication; readings for a quiz app)"
INTERVAL = 0.35
_last = 0.0


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


TITLE_SEPS = [" / ", "/", "〜", "~", " -", "(", "（", "【", " feat", " Feat"]
ARTIST_SEPS = [" feat", " Feat", " featuring", " with ", " With ", "&", "×", "、", ",", " and ", "/", " x ", " X "]


def core(t):
    return norm(cut(t, TITLE_SEPS)) or norm(t)


def is_kana_char(c):
    o = ord(c)
    return 0x3041 <= o <= 0x3096 or 0x30A1 <= o <= 0x30FA or c in "ー・ゝゞヽヾ 　ヴ゛゜"


def is_kana(s):
    s = s.strip()
    return bool(s) and all(is_kana_char(c) for c in s)


def hira(s):
    return "".join(chr(ord(c) - 0x60) if 0x30A1 <= ord(c) <= 0x30F6 else c for c in s)


def needs_reading(s):
    """かな以外（漢字・英字・数字）を含む名前だけ読みが要る"""
    s = nfkc(s)
    return any(not is_kana_char(c) and unicodedata.category(c)[0] in "LN" for c in s)


def kana_consistent(name, reading):
    """名前に含まれるかなが、同じ順番で読みに含まれるか"""
    want = [hira(c) for c in nfkc(name) if is_kana_char(c) and c not in "ー・ 　"]
    have = hira("".join(c for c in reading if c not in "ー・ 　"))
    i = 0
    for ch in have:
        if i < len(want) and ch == want[i]:
            i += 1
    return i == len(want)


def api(params):
    global _last
    params = dict(params, format="json", formatversion="2")
    url = API + "?" + urllib.parse.urlencode(params)
    for attempt in range(5):
        wait = INTERVAL - (time.time() - _last)
        if wait > 0:
            time.sleep(wait)
        _last = time.time()
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception:
            time.sleep(5 * (attempt + 1))
    return None


def intros(titles):
    """記事名 → 冒頭の文（リダイレクトをたどる）"""
    out = {}
    titles = [t for t in dict.fromkeys(titles) if t]
    for i in range(0, len(titles), 20):
        chunk = titles[i:i + 20]
        d = api({"action": "query", "prop": "extracts", "exintro": "1", "explaintext": "1",
                 "exlimit": "20", "redirects": "1", "titles": "|".join(chunk)})
        if not d:
            continue
        q = d.get("query", {})
        back = {}
        for r in q.get("normalized", []) + q.get("redirects", []):
            back.setdefault(r["to"], []).append(r["from"])
        for p in q.get("pages", []):
            if p.get("missing") or not p.get("extract"):
                continue
            names = {p["title"]}
            frontier = [p["title"]]
            while frontier:
                n = frontier.pop()
                for f in back.get(n, []):
                    if f not in names:
                        names.add(f)
                        frontier.append(f)
            for n in names:
                out[n] = (p["title"], p["extract"])
    return out


def search(q, limit=6):
    d = api({"action": "query", "list": "search", "srsearch": q, "srlimit": str(limit), "srnamespace": "0"})
    return [x["title"] for x in (d or {}).get("query", {}).get("search", [])]


LEAD_RE = re.compile(r"^\s*[「『]?(.+?)[」』]?\s*[（(]([^）)]*)[）)]")


def lead_reading(text, name, is_title):
    m = LEAD_RE.match(text or "")
    if not m:
        return None
    head, inner = m.group(1), m.group(2)
    same = core(head) == core(name) if is_title else norm(head) == norm(name)
    if not same:
        return None
    reading = re.split(r"[、,，;；]", inner)[0].strip()
    reading = reading.replace("　", " ")
    if not is_kana(reading) or not kana_consistent(name, reading):
        return None
    return reading


MUSIC_WORDS = ["歌手", "バンド", "グループ", "ミュージシャン", "アーティスト", "シンガー", "ユニット", "アイドル",
               "作曲家", "ラッパー", "演歌", "ボーカル", "ヴォーカル", "デュオ", "トリオ", "音楽", "俳優", "女優", "タレント",
               "声優", "合唱", "楽団"]


def song_reading(title, artist):
    base = cut(title, TITLE_SEPS) or title
    a = cut(artist, ARTIST_SEPS) or artist
    cands = [base, f"{base} ({a}の曲)", f"{base} ({a}のシングル)", f"{base} (曲)", f"{base} (シングル)",
             f"{base} ({a}の楽曲)"]
    tried = set()
    for round_ in range(2):
        got = intros([c for c in cands if c not in tried])
        tried.update(cands)
        for c in cands:
            if c not in got:
                continue
            page, text = got[c]
            lead = text[:400]
            if a and norm(a)[:6] not in norm(lead):
                continue
            r = lead_reading(text, title, True)
            if r:
                return r, page
        if round_ == 0:
            cands = [t for t in search(f"{base} {a}") if core(t) == core(title)]
            if not cands:
                break
    return None, None


def artist_reading(artist):
    a = artist.strip()
    cands = [a, f"{a} (歌手)", f"{a} (バンド)", f"{a} (音楽グループ)", f"{a} (歌手グループ)", f"{a} (ミュージシャン)",
             f"{a} (アイドルグループ)", f"{a} (ユニット)"]
    tried = set()
    for round_ in range(2):
        got = intros([c for c in cands if c not in tried])
        tried.update(cands)
        for c in cands:
            if c not in got:
                continue
            page, text = got[c]
            if not any(w in text[:300] for w in MUSIC_WORDS):
                continue
            r = lead_reading(text, a, False)
            if r:
                return r, page
        if round_ == 0:
            cands = [t for t in search(f"{a} 歌手") if norm(cut(t, ["(", "（"])) == norm(a)]
            if not cands:
                break
    return None, None


def main():
    hits = json.load(open(HITS, encoding="utf-8"))
    force = "--force" in sys.argv
    jp = [h for h in hits if h.get("w", 0) == 0]

    # 曲名
    n_t = ok_t = 0
    for h in jp:
        if not needs_reading(h["t"]) or (h.get("rt") and not force):
            continue
        artist = h.get("a") or h.get("aa") or ""
        n_t += 1
        r, page = song_reading(h["t"], artist)
        if r:
            ok_t += 1
            h["rt"] = r
            h["rs"] = page
        if n_t % 50 == 0:
            print(f"titles {n_t} (found {ok_t})", flush=True)

    # 歌手名（同じ歌手は1回だけ調べる）
    artists = {}
    for h in jp:
        a = h.get("a") or h.get("aa") or ""
        a = cut(a, ARTIST_SEPS) or a
        if a and needs_reading(a):
            artists.setdefault(a, [])
            artists[a].append(h)
    n_a = ok_a = 0
    for a, hs in artists.items():
        if all(x.get("ra") for x in hs) and not force:
            continue
        n_a += 1
        r, page = artist_reading(a)
        if r:
            ok_a += 1
            for x in hs:
                x["ra"] = r
                x["ras"] = page
        if n_a % 50 == 0:
            print(f"artists {n_a} (found {ok_a})", flush=True)

    json.dump(hits, open(HITS, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    summary = f"## 読みの収集\n- 曲名: {ok_t}/{n_t} 曲\n- 歌手名: {ok_a}/{n_a} 組\n"
    print(summary)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8").write(summary)


if __name__ == "__main__":
    main()
