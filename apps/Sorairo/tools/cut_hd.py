"""art/hd/hero{k}_{n}.webp（1=正面 2=右 3=背面 4=左 5=構え 6=攻撃 7=決め）の白背景を切り抜き、
Resources/h{k}_{n-1}.webp と顔アイコン Resources/f{k}.webp を作る。
モデル isnet-general-use.onnx を tools/models/ に置いて実行（python3 tools/cut_hd.py）。"""
import os, numpy as np, onnxruntime as ort
from PIL import Image
from scipy import ndimage
HERE=os.path.dirname(os.path.abspath(__file__)); ROOT=os.path.dirname(HERE)
sess=ort.InferenceSession(os.path.join(HERE,'models','isnet-general-use.onnx'),providers=['CPUExecutionProvider'])
FLIP={(0,6)}          # 右を向いていないコマは左右反転
W,H=512,768; BASE=0.965
def model_mask(img):
    x=np.asarray(img.resize((1024,1024),Image.LANCZOS)).astype(np.float32)/255.
    x=(x-np.array([0.485,0.456,0.406])).transpose(2,0,1)[None].astype(np.float32)
    o=sess.run(None,{sess.get_inputs()[0].name:x})[0][0,0]; o=(o-o.min())/(o.max()-o.min()+1e-8)
    return np.asarray(Image.fromarray((o*255).astype(np.uint8)).resize(img.size,Image.LANCZOS)).astype(float)/255
def cut(path):
    img=Image.open(path).convert('RGB'); c=np.asarray(img).astype(float)
    m=np.clip((model_mask(img)-0.25)/0.35,0,1)
    d=(255-c.min(axis=2))/255; k=np.clip((d-0.05)/0.30,0,1)       # 白からの離れ具合（光や炎を残す）
    a=np.maximum(m,k)
    lab,n=ndimage.label(a>0.1)
    if n>1:
        sz=ndimage.sum(np.ones_like(a),lab,range(1,n+1)); keep=np.zeros(n+1,bool)
        for j,v in enumerate(sz,1): keep[j]=v>=sz.max()*0.002
        a=np.where(keep[lab],a,0)
    # 白のにじみを取る
    aa=np.clip(a,1e-3,1)[...,None]; col=np.where(aa<0.999,(c-(1-aa)*255)/aa,c); col=np.clip(col,0,255)
    rgba=np.dstack([col,a*255]).astype(np.uint8)
    return Image.fromarray(rgba,'RGBA')
for k in range(8):
    for n in range(1,8):
        im=cut(os.path.join(ROOT,'art','hd',f'hero{k}_{n}.webp'))
        if (k,n) in FLIP: im=im.transpose(Image.FLIP_LEFT_RIGHT)
        a=np.asarray(im)[:,:,3]; rows=np.where((a>60).sum(axis=1)>3)[0]; bottom=rows.max()
        # 足元を同じ高さにそろえる
        canvas=Image.new('RGBA',im.size,(0,0,0,0)); dy=int(BASE*im.height)-bottom
        canvas.alpha_composite(im,(0,dy))
        canvas.resize((W,H),Image.LANCZOS).save(os.path.join(ROOT,'Resources',f'h{k}_{n-1}.webp'),'WEBP',quality=82,method=6,exact=True)
        if n==1:
            a2=np.asarray(canvas)[:,:,3]; rows=np.where((a2>60).sum(axis=1)>3)[0]; top=rows.min(); hh=rows.max()-top
            band=a2[top:top+int(hh*.3)]; cols=np.where(band.sum(axis=0)>band.sum(axis=0).max()*.25)[0]; cx=(cols.min()+cols.max())//2
            s=int(hh*.36); y0=top+int(hh*.03)
            face=Image.new('RGBA',(s,s),(0,0,0,0)); face.alpha_composite(canvas.crop((cx-s//2,y0,cx+s//2,y0+s)),(0,0))
            face.resize((256,256),Image.LANCZOS).save(os.path.join(ROOT,'Resources',f'f{k}.webp'),'WEBP',quality=84,method=6,exact=True)
        print(k,n,flush=True)
