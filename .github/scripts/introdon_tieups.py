#!/usr/bin/env python3
"""イントロどんぴしゃ: アニメの曲の作品名（タイアップ）を日本語版 Wikipedia から集めて hits.json に書き込む。

調べ方（どちらも記事の本文に書かれていることだけを使う）
  1. 曲の記事：記事名が曲名と一致し、本文に歌手名がある記事で、
     「主題歌」「オープニングテーマ」などと『作品名』が同じ文にあるもの
  2. 作品の記事：「"曲名" 歌手名 主題歌」で検索して出てきたアニメ・漫画・映画などの記事で、
     本文の「曲名」の前後に歌手名と「オープニング」「エンディング」「主題歌」「挿入歌」などがあるもの
     （作品名はその記事名。「 (アニメ)」のような曖昧さ回避は外す）

結果は hits.json に
  tu: [[種類, 作品名], ...]   種類 = anime / movie / drama / cm / other
  ts: 出典の記事名
を書き込む。見つからない曲には何も書かない。
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
UA = "IntroDonpisha/1.0 (https://github.com/yosiken-0421/DEMOApplication; tie-ups for a quiz app)"
INTERVAL = 0.3
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
ANIME_GENRES = {"アニメ", "anime"}


def core(t):
    return norm(cut(t, TITLE_SEPS)) or norm(t)


def artist_of(h):
    return h.get("a") or h.get("aa") or ""


def primary(a):
    return norm(cut(a, ARTIST_SEPS))


def primary_display(a):
    return cut(a, ARTIST_SEPS)


def is_anime(h):
    return h.get("g") == "anime" or nfkc(h.get("ag") or "").lower() in ANIME_GENRES


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


def search(q, limit=8):
    d = api({"action": "query", "list": "search", "srsearch": q, "srlimit": limit})
    if not d:
        return []
    return [x["title"] for x in d.get("query", {}).get("search", [])]


_extract_cache = {}


def extract(page):
    if page in _extract_cache:
        return _extract_cache[page]
    d = api({"action": "query", "prop": "extracts", "explaintext": 1, "redirects": 1, "titles": page})
    text = None
    if d:
        pages = d.get("query", {}).get("pages", [])
        if pages:
            text = pages[0].get("extract")
    _extract_cache[page] = text
    return text


KEYWORDS = ["主題歌", "オープニングテーマ", "エンディングテーマ", "オープニング曲", "エンディング曲",
            "挿入歌", "イメージソング", "テーマソング", "CMソング", "タイアップ", "テーマ曲"]
NEAR_WORDS = ["オープニング", "エンディング", "主題歌", "挿入歌", "テーマ", "OP", "ED"]


def kind_from(before, sentence):
    if "アニメ" in before:
        return "anime"
    if "ドラマ" in before:
        return "drama"
    if "映画" in before:
        return "movie"
    if "CM" in before or "CMソング" in sentence:
        return "cm"
    if "アニメ" in sentence:
        return "anime"
    if "ドラマ" in sentence:
        return "drama"
    if "映画" in sentence:
        return "movie"
    return "other"


def parse_song_article(text):
    """アプリの TieUpLookup.parse と同じ判定"""
    out = []
    for s in re.split(r"[。\n]", text):
        if not any(k in s for k in KEYWORDS):
            continue
        for m in re.finditer(r"『([^『』]{1,40})』", s):
            name = m.group(1).strip()
            if not name:
                continue
            before = s[max(0, m.start() - 30):m.start()]
            t = [kind_from(before, s), name]
            if t not in out:
                out.append(t)
            if len(out) >= 3:
                break
        if len(out) >= 3:
            break
    order = ["anime", "movie", "drama", "cm", "other"]
    return sorted(out, key=lambda x: order.index(x[0]))


def page_base(p):
    return re.sub(r"\s*\([^()]*\)$", "", p).strip()


def from_song_article(h):
    title, artist = h["t"], artist_of(h)
    pa = primary(artist)
    if len(pa) < 2:
        pa = norm(artist)
    if not pa:
        return None, None
    pages = search(f"{cut(title, TITLE_SEPS)} {primary_display(artist)}")
    dbg("song search:", pages)
    cands = [p for p in pages if core(page_base(p)) == core(title)]
    for p in cands[:3]:
        text = extract(p)
        if not text or pa not in norm(text):
            continue
        found = parse_song_article(text)
        if found:
            return found, p
    return None, None


WORK_WORDS = ["アニメ", "漫画", "ライトノベル", "小説", "映画", "ドラマ", "ゲーム", "特撮", "作品"]
NOT_WORK = ["アルバム", "シングル", "楽曲", "歌手", "バンド", "ユニット", "グループ", "ディスコグラフィ", "声優", "作曲家", "作詞家"]


def first_sentence(text):
    return re.split(r"。", text, 1)[0][:300]


DEBUG = False


def dbg(*a):
    if DEBUG:
        print("   ", *a, flush=True)


def from_work_article(h):
    title, artist = h["t"], artist_of(h)
    tb = cut(title, TITLE_SEPS)
    pa = primary(artist)
    if not tb or len(pa) < 2:
        return None, None
    pages = search(f'"{tb}" {primary_display(artist)} 主題歌')
    pages += [p for p in search(f'"{tb}" {primary_display(artist)} アニメ') if p not in pages]
    results = []
    src = None
    dbg("work search:", pages)
    for p in pages[:10]:
        if "一覧" in p or "作品" in p and pa in norm(p):
            continue
        if pa in norm(p) or core(page_base(p)) == core(title):
            continue
        text = extract(p)
        dbg("page", p, "len", len(text or ""))
        if not text:
            continue
        lead = first_sentence(text)
        dbg("  lead:", lead[:120])
        if not any(w in lead for w in WORK_WORDS) or any(w in lead for w in NOT_WORK):
            continue
        nt = nfkc(text)
        ok = False
        for m in re.finditer("「" + re.escape(nfkc(tb)) + r"[」〜~\s(（]", nt):
            win = nt[max(0, m.start() - 250):m.end() + 250]
            if pa in norm(win) and any(w in win for w in NEAR_WORDS):
                ok = True
                break
        if not ok:
            continue
        if "アニメ" in lead:
            kind = "anime"
        elif "映画" in lead:
            kind = "movie"
        elif "ドラマ" in lead:
            kind = "drama"
        elif is_anime(h):
            # 漫画・ライトノベル・ゲームなどの記事で、アニメ化の主題歌として書かれているもの
            kind = "anime"
        else:
            kind = "other"
        name = page_base(p)
        if [kind, name] not in results:
            results.append([kind, name])
            src = src or p
        if len(results) >= 2:
            break
    return (results or None), src


def main():
    global DEBUG
    force = "--force" in sys.argv
    every = "--all" in sys.argv
    hits = json.load(open(HITS, encoding="utf-8"))
    if "--debug" in sys.argv:
        DEBUG = True
        names = sys.argv[sys.argv.index("--debug") + 1].split(";")
        for h in hits:
            if h["t"] in names:
                print("==", h["t"], artist_of(h))
                print(" song:", from_song_article(h))
                print(" work:", from_work_article(h))
                t = extract(h["t"])
                print(" direct extract of title:", (t or "")[:200])
        return
    targets = [h for h in hits if (every or is_anime(h)) and (force or "tu" not in h)]
    print(f"対象 {len(targets)} 曲")
    found = 0
    for i, h in enumerate(targets, 1):
        tu, src = from_song_article(h)
        if is_anime(h) and not (tu and any(k in ("anime", "movie") for k, _ in tu)):
            tu2, src2 = from_work_article(h)
            if tu2:
                tu = (tu or [])
                tu = [x for x in tu2 if x not in tu] + tu
                src = src2 if not src else src + " / " + src2
        if tu:
            h["tu"] = tu[:3]
            h["ts"] = src
            found += 1
        else:
            h.pop("tu", None)
            h.pop("ts", None)
        print(f"[{i}/{len(targets)}] {h['t']} / {artist_of(h)} → {h.get('tu')} ({h.get('ts')})", flush=True)
        if i % 50 == 0:
            json.dump(hits, open(HITS, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    json.dump(hits, open(HITS, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    anime = [h for h in hits if is_anime(h)]
    shown = sum(1 for h in anime if h.get("tu") or h.get("an"))
    summary = f"### 作品名の収集\n- 今回調べた曲: {len(targets)}、見つかった曲: {found}\n- アニメの曲 {len(anime)} 曲のうち作品名がある曲: {shown}\n"
    print(summary)
    missing = [f"- {h['t']} / {artist_of(h)}" for h in anime if not (h.get("tu") or h.get("an"))]
    summary += "\n#### 作品名が見つからなかったアニメの曲\n" + "\n".join(missing) + "\n"
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8").write(summary)


if __name__ == "__main__":
    main()
