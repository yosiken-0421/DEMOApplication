import numpy as np, json, base64, io
from PIL import Image
d=np.load('model_s.npz'); P,UV,N,I=d['P'],d['UV'],d['N'],d['I']
tex=np.asarray(Image.open('dec/img0.jpeg').convert('RGB').resize((1024,1024)))
uvp=(np.clip(UV,0,1)*1023).astype(int); C=tex[uvp[:,1],uvp[:,0]].astype(float)/255
# 骨（モデルの関節位置。モデル座標：+z 正面、+y 上、+x はキャラの左）
J={'root':(0,0,0.3),'hips':(0,0.95,0.30),'spine':(0,1.12,0.30),'chest':(0,1.35,0.32),'neck':(0,1.60,0.30),'head':(0,1.70,0.28),
 'shoulderL':(0.12,1.55,0.32),'upperArmL':(0.25,1.55,0.36),'foreArmL':(0.41,1.47,0.55),'handL':(0.56,1.54,0.72),
 'shoulderR':(-0.12,1.55,0.32),'upperArmR':(-0.25,1.53,0.36),'foreArmR':(-0.43,1.33,0.45),'handR':(-0.56,1.15,0.60),
 'thighL':(0.12,0.90,0.30),'shinL':(0.10,0.50,0.40),'footL':(0.06,0.12,0.55),
 'thighR':(-0.12,0.90,0.30),'shinR':(-0.08,0.50,0.25),'footR':(-0.05,0.12,0.15)}
PAR={'root':None,'hips':'root','spine':'hips','chest':'spine','neck':'chest','head':'neck','shoulderL':'chest','upperArmL':'shoulderL','foreArmL':'upperArmL','handL':'foreArmL',
 'shoulderR':'chest','upperArmR':'shoulderR','foreArmR':'upperArmR','handR':'foreArmR','thighL':'hips','shinL':'thighL','footL':'shinL','thighR':'hips','shinR':'thighR','footR':'shinR'}
ORDER=list(J.keys()); BI={n:i for i,n in enumerate(ORDER)}
J={k:np.array(v,float) for k,v in J.items()}
END={'hips':J['spine'],'spine':J['chest'],'chest':J['neck'],'neck':J['head'],'head':J['head']+[0,0.8,0],
 'upperArmL':J['foreArmL'],'foreArmL':J['handL'],'handL':J['handL']+[0.06,-0.02,0.08],
 'upperArmR':J['foreArmR'],'foreArmR':J['handR'],'handR':J['handR']+[-0.05,-0.08,0.06],
 'thighL':J['shinL'],'shinL':J['footL'],'footL':J['footL']+[0,-0.1,0.15],'thighR':J['shinR'],'shinR':J['footR'],'footR':J['footR']+[0,-0.1,0.15]}
def segdist(p,a,b):
    ab=b-a; t=np.clip(((p-a)@ab)/max(ab@ab,1e-9),0,1); return np.linalg.norm(p-(a+t[:,None]*ab),axis=1)
names=list(END.keys())
D=np.stack([segdist(P,J[n],END[n]) for n in names],1)
W=1/(D**4+1e-6)
# 髪（薄いラベンダー色・彩度が低く明るい）と体の外側
r,g,b=C[:,0],C[:,1],C[:,2]; mx=C.max(1); mn=C.min(1); sat=(mx-mn)/(mx+1e-6)
hair=(mx>0.72)&(sat<0.22)&(b>=r-0.02)&((np.abs(P[:,0])>0.30)|(P[:,2]<0.15))&(P[:,1]>0.25)
# 槍（左手で持つ）：軸の直線の近く
A=np.array([0.28,0.11,0.86]); B=np.array([0.86,2.83,0.63])
ds=segdist(P,A,B); t=np.clip(((P-A)@(B-A))/((B-A)@(B-A)),0,1)
rad=np.where(P[:,1]>2.0,0.30,np.where(P[:,1]<0.75,0.12,0.075))
spear=(ds<rad)&~((P[:,1]>1.7)&(P[:,0]<0.50))
# 槍：つながりをたどって飾り（氷の結晶）まで広げる
Itri=d['I']
big=(ds<np.where(P[:,1]>1.75,0.36,0.13))&~((P[:,1]>1.65)&(P[:,0]<0.42))&~((P[:,1]<1.65)&(P[:,1]>1.2)&(P[:,0]<0.40))
for _ in range(30):
    m=spear[Itri].any(1); grow=np.zeros(len(P),bool); grow[Itri[m].ravel()]=True; grow&=big&~spear
    if not grow.any(): break
    spear|=grow
cols={n:i for i,n in enumerate(names)}
def only(mask,allowed):
    keep=np.zeros(len(names),bool); keep[[cols[a] for a in allowed]]=True
    W[np.ix_(mask,~keep)]=0
# 髪：上は頭、下へいくほど胸→腰に追従（スカートとつながった部分が裂けないように）
hy=P[:,1]; hm=hair&(hy<1.75)
def lerpw(y,pts):
    ys=[p[0] for p in pts]; out=np.zeros((len(y),len(names)))
    for k,(y0,bone) in enumerate(pts):
        if k==0: continue
        y1,b1=pts[k-1]; seg=(y>=y0)&(y<y1) if k<len(pts)-1 else (y<y1)
        t=np.clip((y-y0)/(y1-y0),0,1)
        out[seg,cols[b1]]+=t[seg]; out[seg,cols[bone]]+=1-t[seg]
    return out
W[hm]=lerpw(hy[hm],[(1.75,'head'),(1.40,'chest'),(1.05,'spine'),(0.70,'hips')])
W[hm&(hy<0.70),:]=0; W[hm&(hy<0.70),cols['hips']]=1
# 頭（首より上）は頭の骨
headm=P[:,1]>1.74; only(headm&~spear,['head'])
# スカート・脚（腰より下、ブーツより上）
dL=np.minimum(segdist(P,J['thighL'],END['thighL']),segdist(P,J['shinL'],END['shinL']))
dR=np.minimum(segdist(P,J['thighR'],END['thighR']),segdist(P,J['shinR'],END['shinR']))
dl=np.minimum(dL,dR); leg=np.where(dL<dR,cols['thighL'],cols['thighR'])
legm=(dl<0.10)&(P[:,1]<0.95)&~spear&~hair
only(legm,['hips','thighL','thighR','shinL','shinR','footL','footR'])
skirt=(P[:,1]<1.0)&(P[:,1]>0.20)&~spear&~hair&~legm
# スカートは腰に固定。脚のすぐ外側だけ脚に少し追従
near=np.clip((0.18-dl)/0.08,0,1)*0.5
W[skirt]=0; W[skirt,cols['hips']]=1-near[skirt]; W[skirt,leg[skirt]]=near[skirt]
# 槍は左手に固定
W[spear]=0; W[spear,cols['handL']]=1
# 上位4本に絞って正規化
idx=np.argsort(-W,1)[:,:4]; w=np.take_along_axis(W,idx,1); w/=w.sum(1,keepdims=True)
w[w<0.02]=0; w/=w.sum(1,keepdims=True)
skinIndex=np.vectorize(lambda k:BI[names[k]])(idx).astype(np.uint8)
print('spear',spear.sum(),'hair',hair.sum(),'head',headm.sum(),'skirt',skirt.sum(),'leg',legm.sum())
mm=spear[Itri].sum(1); bridge=(mm>0)&(mm<3)
print('bridge',bridge.sum())
np.savez('rig.npz',SI=skinIndex,SW=w.astype(np.float32),spear=spear,hair=hair,keep=~bridge)
json.dump({'order':ORDER,'parent':PAR,'joints':{k:list(map(float,v)) for k,v in J.items()}},open('rig.json','w'))
# 見え方チェック用：骨ごとの色
pal=np.random.RandomState(3).rand(len(ORDER),3)
dom=skinIndex[:,0]; np.save('dom.npy',dom)
