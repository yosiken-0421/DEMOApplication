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


def extract_page(page):
    """(本文, リダイレクト後の記事名)"""
    if page in _extract_cache:
        return _extract_cache[page]
    d = api({"action": "query", "prop": "extracts", "explaintext": 1, "redirects": 1, "titles": page})
    res = (None, page)
    if d:
        pages = d.get("query", {}).get("pages", [])
        if pages and not pages[0].get("missing"):
            res = (pages[0].get("extract"), pages[0].get("title", page))
    _extract_cache[page] = res
    return res


def extract(page):
    return extract_page(page)[0]


KEYWORDS = ["主題歌", "オープニングテーマ", "エンディングテーマ", "オープニング曲", "エンディング曲",
            "挿入歌", "挿入曲", "劇中歌", "イメージソング", "テーマソング", "CMソング", "タイアップ", "テーマ曲",
            "OPテーマ", "EDテーマ", "主題曲"]
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


ORDER = ["anime", "movie", "drama", "cm", "other"]


def clean_name(name):
    name = re.split(r"[（(]以下", name)[0].strip()
    return name


def sentences(text):
    """「。」で文に分ける（『君の名は。』のようにかっこの中の「。」では分けない）"""
    out, buf, depth = [], [], 0
    for c in text:
        if c in "『「（(":
            depth += 1
        elif c in "』」）)":
            depth = max(0, depth - 1)
        if c == "\n" or (c == "。" and depth == 0):
            out.append("".join(buf))
            buf, depth = [], 0
        else:
            buf.append(c)
    out.append("".join(buf))
    return out


DIRECT_WORDS = ["アニメ", "映画", "劇場版", "ドラマ"]


def parse_song_article(text, title="", artist=""):
    """アプリの TieUpLookup.parse と同じ判定：
    『作品名』（または「アニメ「作品名」」「映画「作品名」」）のすぐ後ろ（20文字以内）か、
    すぐ前（20文字以内）に「主題歌」「オープニングテーマ」などがあるものだけ。
    すぐ前に「アニメ」「映画」などと書かれている作品名を先にする"""
    found = []
    pa = primary(artist)
    for s in sentences(text):
        if not any(k in s for k in KEYWORDS):
            continue
        for m in re.finditer(r"『([^『』]{1,40})』|(アニメ|映画|ドラマ|劇場版)\s*「([^「」]{1,40})」", s):
            name = clean_name(m.group(1) or m.group(3))
            start = m.start() if m.group(1) else m.start(3) - 1
            if not name or (len(pa) >= 2 and pa in norm(name)):
                continue
            before = s[max(0, start - 30):start]
            # 「第2期「○○編」の」「（2016年公開）の」などは飛ばして見る
            after = re.sub(r"「[^「」]*」|（[^（）]*）|\([^()]*\)", "", s[m.end():m.end() + 60])[:20]
            near_before = before[-20:]
            if not (any(k in after for k in KEYWORDS) or (any(k in near_before for k in KEYWORDS) and "『" not in near_before)):
                continue
            score = 0 if any(w in before[-12:] for w in DIRECT_WORDS) else 1
            if not any(norm(x[1]) == norm(name) for _, x in found):
                found.append((score, [kind_from(before, s), name]))
            if len(found) >= 5:
                break
        if len(found) >= 5:
            break
    found.sort(key=lambda x: x[0])
    return [x for _, x in found][:3]


def page_base(p):
    return re.sub(r"\s*\([^()]*\)$", "", p).strip()


SONG_LEAD = ["楽曲", "シングル", "曲", "EP", "アルバム", "主題歌", "テーマ"]


def from_song_article(h):
    title, artist = h["t"], artist_of(h)
    tb = cut(title, TITLE_SEPS)
    pa = primary(artist)
    if len(pa) < 2:
        pa = norm(artist)
    if not pa or not tb:
        return None, None
    ad = primary_display(artist)
    cands = [f"{tb} ({ad}の曲)", f"{tb} (曲)", tb]
    pages = search(f"{tb} {ad}")
    dbg("song search:", pages)
    cands += [p for p in pages if core(page_base(p)) == core(title) and p not in cands]
    seen = set()
    for p in cands[:6]:
        text, resolved = extract_page(p)
        if not text or resolved in seen:
            continue
        seen.add(resolved)
        # リダイレクトで別の記事（アルバムなど）に飛んだものは使わない
        fs = first_sentence(text)
        if core(page_base(resolved)) != core(tb) and core(page_base(resolved).split("/")[0]) != core(tb):
            # シングルの記事（曲名とは別の記事名）に飛んだときだけ使う。アルバムは使わない
            if not ("シングル" in fs and "アルバム" not in fs and "「" + nfkc(tb) in nfkc(text)):
                dbg("skip redirect", p, "->", resolved)
                continue
        if pa not in norm(text) or not any(w in fs for w in SONG_LEAD):
            dbg("skip lead", resolved, fs[:80])
            continue
        found = parse_song_article(text, title, artist)
        dbg("song page", resolved, found)
        if found:
            return found, resolved
    return None, None


WORK_WORDS = ["アニメ", "漫画", "ライトノベル", "小説", "映画", "ドラマ", "ゲーム", "特撮", "作品"]
NOT_WORK = ["アルバム", "シングル", "楽曲", "歌手", "バンド", "ユニット", "グループ", "ディスコグラフィ", "声優", "作曲家", "作詞家",
            "音楽", "ビデオ", "チャート", "監督", "演出家", "アニメーター", "脚本家", "漫画家", "作家", "俳優", "タレント",
            "番組", "ラジオ", "生まれ", "会社", "言葉", "総称"]


def first_sentence(text):
    return re.split(r"。", text, maxsplit=1)[0][:300]


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
        if pa in norm(p):
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
        try:
            tu, src = from_song_article(h)
        except Exception as e:
            print("  error", e)
            tu, src = None, None
        if is_anime(h) and not (tu and any(k in ("anime", "movie") for k, _ in tu)):
            try:
                tu2, src2 = from_work_article(h)
            except Exception as e:
                print("  error", e)
                tu2, src2 = None, None
            if tu2:
                tu = (tu or [])
                tu = [x for x in tu2 if x not in tu] + tu
                src = src2 if not src else src + " / " + src2
        if tu:
            uniq = []
            for x in tu:
                if not any(norm(u[1]) == norm(x[1]) for u in uniq):
                    uniq.append(x)
            tu = uniq
            if is_anime(h) and any(k in ("anime", "movie") for k, _ in tu):
                # いちばん確かな1つだけ（記事の中で別の曲のタイアップを拾わないため）
                tu = [x for x in tu if x[0] in ("anime", "movie")][:1]
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
