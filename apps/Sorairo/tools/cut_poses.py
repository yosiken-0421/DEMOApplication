import numpy as np
from PIL import Image
from scipy import ndimage
from seg import mask
im=Image.open('art/sheet.png').convert('RGB')
ROW=[dict(pose=(354,457),px=[(10,131),(136,255),(259,376)]),dict(pose=(864,1016),px=[(12,139),(144,267),(272,376)])]
def cut(box):
    t=im.crop(box); big=t.resize((t.width*3,t.height*3),Image.LANCZOS)
    m=np.asarray(mask(big,'isnet-general-use')).astype(float)/255
    m=np.clip((m-0.38)/0.3,0,1)
    # 枠の縁 6% は消す
    h,w=m.shape; e=int(min(h,w)*.045); m[:e,:]=0; m[-e:,:]=0; m[:,:e]=0; m[:,-e:]=0
    lab,n=ndimage.label(m>.12)
    if n>1:
        sz=ndimage.sum(np.ones_like(m),lab,range(1,n+1)); keep=np.zeros(n+1,bool)
        for j,v in enumerate(sz,1): keep[j]=v>=sz.max()*0.05
        m=np.where(ndimage.binary_dilation(keep[lab],iterations=3),m,0)
    big.putalpha(Image.fromarray((m*255).astype(np.uint8)))
    return big.crop(big.getbbox())
out=Image.new('RGBA',(3*200,8*190),(60,90,60,255))
for k in range(8):
    col,row=k%4,k//4; ox=col*384; R=ROW[row]
    for j,(x0,x1) in enumerate(R['px']):
        c=cut((ox+x0,R['pose'][0],ox+x1,R['pose'][1]))
        s=300/c.height; c.resize((round(c.width*s),300),Image.LANCZOS).save(f'art/pose_{k}_{j}.png')
        t=c.copy(); t.thumbnail((195,185)); out.alpha_composite(t,(j*200,k*190))
out.save('shots/pose_cut.png')
