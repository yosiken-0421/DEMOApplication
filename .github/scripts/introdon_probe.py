import urllib.request, re, sys, html as H
UA={"User-Agent":"Mozilla/5.0 (compatible; IntroDon-data/1.0)"}
for url in sys.argv[1:]:
    try:
        html=urllib.request.urlopen(urllib.request.Request(url,headers=UA),timeout=30).read().decode('utf-8','replace')
    except Exception as e:
        print("ERR",url,e); continue
    print("=====",url,len(html))
    if "billboard" in url:
        rows=re.findall(r'<p class="rank">\s*(\d+)\s*</p>.*?<p class="musuc_title">\s*(.*?)\s*</p>\s*<p class="artist_name">(.*?)</p>', html, re.S)
        print("rows",len(rows), rows[:3], rows[-2:])
    else:
        t=re.sub(r'<[^>]+>',' ',html); t=H.unescape(re.sub(r'\s+',' ',t))
        for m in re.finditer(r'年間', t):
            pass
        i=t.find('年間シングル')
        print(t[i-200:i+4000] if i>=0 else t[:2000])
