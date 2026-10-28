import numpy as np
from PIL import Image
FACE=[(212,114),(572,106),(926,112),(1332,106),(212,610),(602,600),(966,598),(1332,600)]
MODEL=[1,0,1,0,1,0,0,1]
# 顔ごとの調整: (あごの位置, 横の半径, 中心ずらしx, 中心ずらしy)
ADJ=[(50,84,0,-6),(50,80,4,-8),(52,78,10,-6),(50,80,0,-6),(50,84,0,-8),(50,76,-6,-8),(58,82,0,-8),(58,84,0,-6)]
heads=[]; META=[]
for k,(gx,gy) in enumerate(FACE):
    cx,cy=gx-(k%4)*384, gy-(k//4)*512
    chin,rx,dx,dy=ADJ[k]
    cut=Image.open(f'art/hero_cut_{k}_{MODEL[k]}.png').convert('RGBA')
    S=200; x0,y0=cx+dx-S//2,cy+dy-120
    crop=Image.new("RGBA",(S,200),(0,0,0,0)); crop.paste(cut.crop((x0,y0,x0+S,y0+200)),(0,0))
    a=np.asarray(crop)[:,:,3].astype(float)/255
    yy,xx=np.mgrid[0:200,0:S]
    e=((xx-S/2)/rx)**2+((yy-104)/98)**2
    m=np.clip((1.0-e)/0.14,0,1)
    cy_l=120-dy+chin
    m*=np.clip((cy_l-yy)/7,0,1)
    if k==5: m[:, 138:]=0
    a=np.where(a*m>0.05,a*m,0)
    crop.putalpha(Image.fromarray((a*255).astype(np.uint8)))
    bb=crop.getbbox(); crop=crop.crop(bb); META.append([crop.width,crop.height,S/2-bb[0],min(crop.height,120-dy+chin-bb[1])])
    crop.save(f'art/head_{k}.png'); heads.append(crop)
out=Image.new('RGBA',(8*210,200),(70,90,70,255))
for k,h in enumerate(heads): out.alpha_composite(h,(k*210,5))
out.save('shots/heads.png')
print([h.size for h in heads])
print('META',META)
