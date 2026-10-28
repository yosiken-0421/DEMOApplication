"""art/ の2枚の絵から、ゲームで使う画像を切り出して Resources/index.html に埋め込む。
使い方: python3 tools/build_assets.py  （apps/Sorairo で実行）"""
import base64, io, json, re, sys
from PIL import Image, ImageFilter

HERO_FACE = [(212,114),(572,106),(926,112),(1332,106),(212,610),(602,600),(966,598),(1332,600)]
MON_X = [0,154,308,461,615,768,922,1075,1229,1382,1536]
MON_Y = [66,247,437,629,822]

def uri(img, q=80):
    b = io.BytesIO(); img.save(b, 'WEBP', quality=q, method=6, exact=True)
    return 'data:image/webp;base64,' + base64.b64encode(b.getvalue()).decode()

def main():
    heroes = Image.open('art/heroes.png').convert('RGB')
    mons = Image.open('art/monsters.png').convert('RGB')
    A = {'face': [], 'bust': [], 'card': [], 'mon': [], 'mini': [], 'monCut': [], 'head': [], 'fig': [], 'pose': []}
    for k, (x, y) in enumerate(HERO_FACE):
        A['face'].append(uri(heroes.crop((x-72, y-72, x+72, y+72)).resize((168, 168), Image.LANCZOS), 82))
        cx0, cy0 = (k % 4) * 384, (k // 4) * 512
        bx0 = max(cx0, min(cx0+384-170, x-85)); by0 = max(cy0, y-92)
        A['bust'].append(uri(heroes.crop((bx0, by0, bx0+170, by0+212)).resize((176, 220), Image.LANCZOS), 80))
        A['card'].append(uri(heroes.crop((cx0, cy0, cx0+384, cy0+512)), 76))
    for r in range(5):
        for c in range(10):
            t = mons.crop((MON_X[c]+4, MON_Y[r]+3, MON_X[c+1]-3, MON_Y[r]+126))
            t = t.resize((t.width*2, t.height*2), Image.LANCZOS).filter(ImageFilter.UnsharpMask(radius=1.6, percent=70, threshold=2))
            A['mon'].append(uri(t, 74))
    # 切り抜き済みのミニチュア（art/cut/ は tools/cutout.py で作成）
    for k in range(8):
        A['mini'].append(uri(Image.open(f'art/cut/hero_{k}.webp'), 84))
    # フィギュア（art/figures.png）：顔アイコン・一覧用の胸から上・カード・台座つきの切り抜き
    FIG_FACE=[(202,136),(532,118),(922,130),(1285,124),(165,625),(537,631),(922,640),(1295,631)]
    figs=Image.open('art/figures.png').convert('RGB')
    A['face']=[]; A['bust']=[]; A['card']=[]
    for k,(x,y) in enumerate(FIG_FACE):
        A['face'].append(uri(figs.crop((x-62,y-62,x+62,y+62)).resize((168,168),Image.LANCZOS),84))
        cx0,cy0=(k%4)*384,(k//4)*512
        bx0=max(cx0,min(cx0+384-180,x-90)); by0=max(cy0,y-80)
        A['bust'].append(uri(figs.crop((bx0,by0,bx0+180,by0+225)).resize((176,220),Image.LANCZOS),82))
        A['card'].append(uri(figs.crop((cx0,cy0,cx0+384,cy0+512)),78))
        A['fig'].append(uri(Image.open(f'art/cut/fig_{k}.webp'),86))
    # 攻撃ポーズ（art/sheet.png のポーズ例を切り抜いたもの。構え→攻撃→決め）
    import glob
    for k in range(8):
        A['pose'].append([uri(Image.open(f),86) for f in sorted(glob.glob(f'art/cut/pose_{k}_*.webp'))])
    for k in range(8):
        A['head'].append(uri(Image.open(f'art/cut/head_{k}.webp'), 88))
    for m in range(50):
        try: A['monCut'].append(uri(Image.open(f'art/cut/mon_{m}.webp'), 82))
        except FileNotFoundError: A['monCut'].append(None)
    js = 'window.ART=' + json.dumps(A, separators=(',', ':')) + ';'
    p = 'Resources/index.html'
    s = open(p, encoding='utf-8').read()
    block = '<script id="art">' + js + '</script>'
    if '<script id="art">' in s:
        s = re.sub(r'<script id="art">.*?</script>', lambda m: block, s, count=1, flags=re.S)
    else:
        s = s.replace('<script>\n"use strict";', block + '\n<script>\n"use strict";', 1)
    open(p, 'w', encoding='utf-8').write(s)
    print('art bytes', len(js))

if __name__ == '__main__':
    main()
