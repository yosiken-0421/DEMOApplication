import urllib.request, re, sys, html as H
UA={"User-Agent":"Mozilla/5.0 (compatible; IntroDon-data/1.0)"}
for url in sys.argv[1:]:
    try:
        raw=urllib.request.urlopen(urllib.request.Request(url,headers=UA),timeout=30).read()
    except Exception as e:
        print("ERR",url,e); continue
    for enc in ("utf-8","shift_jis","cp932","euc-jp"):
        try: html=raw.decode(enc); break
        except: continue
    print("=====",url,len(html),enc)
    i=html.find("青春アミーゴ")
    print(html[max(0,i-1500):i+2500])
