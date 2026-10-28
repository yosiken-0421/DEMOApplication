#!/usr/bin/env python3
"""イントロどんぴしゃ: ヒット曲リスト (hits.json) を Apple の曲データ (iTunes Search API) と照合する。

  lookup: hits.json の一部（shard）について、原曲の trackId / ジャンル / 発売年 / 長さ を調べて JSON に書き出す
  merge : shard の結果を hits.json に書き込み、集計を表示する

照合ルール（カバー・カラオケ・ライブ版などを避ける）
  - 曲名: 表記ゆれを除いて一致（サブタイトルは無視）
  - 歌手: 完全一致、または主要部分（feat. 等の前）が一致。3文字以上なら片方に含まれていれば可
  - ライブ・カラオケ・オルゴール・インスト・カバー・リミックス等の版は使わない（元の曲名に含まれる語は除く）
  - 候補が複数あれば、曲名が完全一致するもの → 発売日が古いもの（原曲）を優先
"""
import argparse
import json
import os
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request

HITS = "apps/IntroDon/Resources/hits.json"
INTERVAL = 3.2  # 秒（Apple の目安 1分20回 を超えないように）

_last = 0.0


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKC", s or "").lower()
    return "".join(ch for ch in s
                   if unicodedata.category(ch)[0] not in "PSZC" and ch not in "・〜~ー-‐―☆★♥♡")


def cut(s: str, seps) -> str:
    s = unicodedata.normalize("NFKC", s or "")
    for sep in seps:
        i = s.find(sep)
        if i > 0:
            s = s[:i]
    return s.strip()


TITLE_SEPS = [" / ", "/", "〜", "~", " -", "(", "（", "【", " feat", " Feat"]
SEARCH_SEPS = ["〜", "~", " -", "(", "（", "【", " feat", " Feat"]
ARTIST_SEPS = [" feat", " Feat", " featuring", " with ", " With ", "&", "×", "、", ",", " and ", "/", " x ", " X "]


def core(t: str) -> str:
    c = norm(cut(t, TITLE_SEPS))
    return c or norm(t)


def primary(a: str) -> str:
    return norm(cut(a, ARTIST_SEPS))


SEG_RE = re.compile(r"\s*(?:\bfeat\.?|\bfeaturing\b|\bft\.|\bwith\b|\band\b|&|×|、|,|/|\s x\s)\s*", re.I)


def segs(a: str):
    return {norm(x) for x in SEG_RE.split(unicodedata.normalize("NFKC", a or "")) if norm(x)}


def artist_score(hit_a: str, apple_a: str) -> int:
    """3 = 同じ名前 / 2 = 共演者が付いているだけ、または Apple 側の名前が短い（「宮史郎とぴんからトリオ」→「ぴんからトリオ」）
    トリビュートバンドなど、Apple 側の名前が長くなっているだけのものは一致にしない"""
    na, nb = norm(hit_a), norm(apple_a)
    if not na or not nb:
        return 0
    if na == nb:
        return 3
    sh, sa = segs(hit_a), segs(apple_a)
    if sh and sh == sa:
        return 3
    if sh and sa and (sh <= sa or sa <= sh):
        return 2
    if len(nb) >= 3 and nb in na:
        return 2
    return 0


BAD_WORDS = ["live", "instrumental", "inst", "karaoke", "off vocal", "music box", "acoustic", "remix",
             "cover", "tv size", "tv ver", "short ver", "piano ver", "a cappella", "orchestra",
             "demo", "8-bit", "8bit", "bossa", "english ver", "english version", "self cover",
             "first take", "unplugged", "medley", "lullaby ver", "orgel", "remake", "re-recorded",
             "re-recording", "rerecorded"]
BAD_JA = ["ライブ", "インスト", "カラオケ", "オフボーカル", "オルゴール", "アコースティック", "リミックス",
          "カバー", "tvサイズ", "ショート", "ピアノ", "アカペラ", "オーケストラ", "デモ", "ボサノバ",
          "英語版", "セルフカバー", "メドレー", "歌ってみた", "弾いてみた", "生演奏", "再録"]
BAD_ARTIST = ["karaoke", "カラオケ", "orgel", "オルゴール", "α波", "music box", "lullaby", "kidz",
              "cover", "カバー", "tribute", "トリビュート", "piano", "ピアノ", "sound factory",
              "the hit crew", "eximo", "relaxing", "mood"]


def penalty(track: dict, hit_title: str) -> int:
    ht = unicodedata.normalize("NFKC", hit_title).lower()
    text = unicodedata.normalize("NFKC", (track.get("trackName") or "") + " " +
                                 (track.get("collectionName") or "")).lower()
    p = 0
    for w in BAD_WORDS:
        if w in ht:
            continue
        if re.search(r"(?<![a-z])" + re.escape(w) + r"(?![a-z])", text):
            p += 1
    for w in BAD_JA:
        if w.lower() not in ht and w.lower() in text:
            p += 1
    art = unicodedata.normalize("NFKC", track.get("artistName") or "").lower()
    for w in BAD_ARTIST:
        if w in art and w not in norm(hit_title):
            p += 1
    return p


def fetch(url: str):
    global _last
    for attempt in range(6):
        wait = INTERVAL - (time.time() - _last)
        if wait > 0:
            time.sleep(wait)
        _last = time.time()
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "IntroDon-enrich/1.0"}),
                                        timeout=25) as r:
                return json.loads(r.read().decode("utf-8")).get("results", [])
        except urllib.error.HTTPError as e:
            if e.code in (403, 429, 500, 502, 503, 504):
                time.sleep(20 * (attempt + 1))
                continue
            return []
        except Exception:
            time.sleep(10 * (attempt + 1))
    return None  # 取得できなかった


def search(term: str, lang: str, limit: int = 25, country: str = "JP"):
    q = urllib.parse.urlencode({"term": term, "country": country, "media": "music", "entity": "song",
                                "limit": str(limit), "lang": lang})
    return fetch("https://itunes.apple.com/search?" + q)


def lookup_jp(ids):
    q = urllib.parse.urlencode({"id": ",".join(str(i) for i in ids), "country": "JP", "lang": "ja_jp"})
    res = fetch("https://itunes.apple.com/lookup?" + q)
    return {r["trackId"]: r for r in (res or []) if r.get("trackId") and r.get("kind") in (None, "song")}


ANIME_GENRES = {"anime", "アニメ"}


def pick(results, hit):
    r = ranked(results, hit)
    return r[0] if r else None


def ranked(results, hit):
    t, a = hit["t"], hit.get("a", "")
    want_core, want_full = core(t), norm(t)
    out = []
    for r in results or []:
        if r.get("kind") not in (None, "song") or not r.get("trackId"):
            continue
        tn = r.get("trackName") or ""
        if core(tn) != want_core and norm(tn) != want_full:
            continue
        if a:
            s = artist_score(a, r.get("artistName") or "")
            if s == 0:
                continue
        else:
            if (r.get("primaryGenreName") or "").strip().lower() not in ANIME_GENRES:
                continue
            s = 1
        if penalty(r, t) > 0:
            continue
        exact = 1 if norm(tn) == want_full else 0
        rd = r.get("releaseDate") or "9999"
        out.append(((-s, -exact, rd), r))
    out.sort(key=lambda x: x[0])
    return [r for _, r in out]


def lookup_western(hit):
    """洋楽: 日本のストアは歌手名がカタカナになることがあるので、米国ストアで原曲を特定してから日本で配信があるか確認"""
    t, a = hit["t"], hit.get("a", "")
    st1 = cut(t, SEARCH_SEPS) or t
    at = cut(a, ARTIST_SEPS)
    net = False
    for term, limit in ((st1 + " " + at, 25), (st1, 50)):
        res = search(term.strip(), "en_us", limit=limit, country="US")
        if res is None:
            net = True
            continue
        cands = ranked(res, hit)[:6]
        if not cands:
            continue
        jp = lookup_jp([c["trackId"] for c in cands])
        for c in cands:
            if c["trackId"] in jp:
                j = jp[c["trackId"]]
                j.setdefault("releaseDate", c.get("releaseDate"))
                return j, "en_us"
    return None, ("network" if net else None)


def lookup_one(hit):
    if hit.get("w") == 1:
        return lookup_western(hit)
    t, a = hit["t"], hit.get("a", "")
    st1 = cut(t, SEARCH_SEPS) or t
    titles = [st1]
    st2 = cut(t, TITLE_SEPS)
    if st2 and st2 != st1:
        titles.append(st2)
    at = cut(a, ARTIST_SEPS) if a else ""
    langs = ["en_us", "ja_jp"] if hit.get("w") == 1 else ["ja_jp", "en_us"]
    failed_network = False
    for lang in langs:
        for st in titles:
            res = search((st + " " + at).strip(), lang)
            if res is None:
                failed_network = True
                continue
            b = pick(res, hit)
            if b:
                return b, lang
        if not a:
            break
    if a:
        res = search(titles[0], langs[0], limit=50)
        if res is None:
            failed_network = True
        else:
            b = pick(res, hit)
            if b:
                return b, langs[0]
    return None, ("network" if failed_network else None)


def hit_key(h):
    return f'{h["t"]}\u0001{h.get("a", "")}\u0001{h.get("y", 0)}\u0001{h.get("w", 0)}'


def cmd_lookup(args):
    hits = json.load(open(HITS, encoding="utf-8"))
    out = {}
    mine = [h for i, h in enumerate(hits) if i % args.shards == args.shard]
    print(f"shard {args.shard}: {len(mine)} songs", flush=True)
    ok = 0
    for n, h in enumerate(mine, 1):
        r, lang = lookup_one(h)
        if r:
            ok += 1
            year = (r.get("releaseDate") or "")[:4]
            out[hit_key(h)] = {
                "id": r["trackId"],
                "ag": r.get("primaryGenreName") or "",
                "aa": r.get("artistName") or "",
                "ry": int(year) if year.isdigit() else 0,
                "ms": int(r.get("trackTimeMillis") or 0),
            }
        elif lang == "network":
            out[hit_key(h)] = {"err": "network"}
        if n % 25 == 0:
            print(f"  {n}/{len(mine)} (found {ok})", flush=True)
    json.dump(out, open(args.out, "w", encoding="utf-8"), ensure_ascii=False)
    print(f"shard {args.shard}: found {ok}/{len(mine)}")


def cmd_merge(args):
    hits = json.load(open(HITS, encoding="utf-8"))
    found = {}
    for fn in sorted(os.listdir(args.shards_dir)):
        if fn.endswith(".json"):
            found.update(json.load(open(os.path.join(args.shards_dir, fn), encoding="utf-8")))
    n_ok = n_net = 0
    for h in hits:
        for k in ("id", "ag", "aa", "ry", "ms"):
            h.pop(k, None)
        f = found.get(hit_key(h))
        if not f:
            continue
        if f.get("err"):
            n_net += 1
            continue
        h.update(f)
        n_ok += 1
    json.dump(hits, open(HITS, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    from collections import Counter
    g = Counter((h.get("ag") or "（未照合）") for h in hits)
    lines = [f"## 照合結果: {n_ok}/{len(hits)} 曲（通信エラー {n_net}）", "", "| Appleのジャンル | 曲数 |", "|---|---|"]
    lines += [f"| {k} | {v} |" for k, v in g.most_common()]
    text = "\n".join(lines)
    print(text)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8").write(text + "\n")


def main():
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("lookup")
    a.add_argument("--shard", type=int, required=True)
    a.add_argument("--shards", type=int, required=True)
    a.add_argument("--out", required=True)
    m = sub.add_parser("merge")
    m.add_argument("--shards-dir", required=True)
    args = p.parse_args()
    {"lookup": cmd_lookup, "merge": cmd_merge}[args.cmd](args)


if __name__ == "__main__":
    sys.exit(main())
