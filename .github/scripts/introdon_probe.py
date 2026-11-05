import urllib.request, re, sys
UA={"User-Agent":"Mozilla/5.0 (compatible; IntroDon-data/1.0)"}
for url in sys.argv[1:]:
    try:
        html=urllib.request.urlopen(urllib.request.Request(url,headers=UA),timeout=30).read().decode('utf-8','replace')
    except Exception as e:
        print("ERR",url,e); continue
    print("=====",url,len(html))
    i=html.find("rank")
    # print table-ish region around first ranking row
    for kw in ["musuc_title","music_title","artist_name","p_name","name-ranking","rank_num","class=\"rank"]:
        j=html.find(kw)
        if j>=0:
            print("--",kw,j); print(html[max(0,j-600):j+1400]); break
    else:
        print(html[:3000])
