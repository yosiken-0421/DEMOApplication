import urllib.request, urllib.parse, json, sys, re
UA={"User-Agent":"IntroDonpisha/1.0 (https://github.com/yosiken-0421/DEMOApplication)"}
for title in sys.argv[1:]:
    q=urllib.parse.urlencode({"action":"parse","page":title,"prop":"wikitext","format":"json","formatversion":"2"})
    d=json.load(urllib.request.urlopen(urllib.request.Request("https://ja.wikipedia.org/w/api.php?"+q,headers=UA),timeout=30))
    w=d["parse"]["wikitext"]
    print("=====",title,len(w))
    i=w.find("シングル")
    for m in re.finditer(r"==+[^=\n]*(年間|ランキング|チャート)[^=\n]*==+", w): print("HEAD",m.start(),m.group(0))
    j=w.find("=== 邦楽年間TOP50 ===")
    print(w[j:j+1500])
    j=w.find("== カラオケ年間50")
    print(w[j:j+1500])
