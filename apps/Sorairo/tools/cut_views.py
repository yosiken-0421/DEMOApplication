import numpy as np
from PIL import Image
from scipy import ndimage
from seg import mask
im=Image.open('art/sheet2.png').convert('RGB')
ROW=[dict(view=(350,452),skill=(253,330)),dict(view=(860,980),skill=(762,838))]
VX=[(2,99),(98,194),(194,290),(288,382)]
SX=[(7,136),(139,257),(259,377)]
def cut(box,thr=.38):
    t=im.crop(box); big=t.resize((t.width*3,t.height*3),Image.LANCZOS)
    m=np.asarray(mask(big,'isnet-general-use')).astype(float)/255
    m=np.clip((m-thr)/0.3,0,1)
    h,w=m.shape; e=int(min(h,w)*.04); m[:e,:]=0; m[-e:,:]=0; m[:,:e]=0; m[:,-e:]=0
    lab,n=ndimage.label(m>.12)
    if n>1:
        sz=ndimage.sum(np.ones_like(m),lab,range(1,n+1)); keep=np.zeros(n+1,bool)
        for j,v in enumerate(sz,1): keep[j]=v>=sz.max()*0.06
        m=np.where(ndimage.binary_dilation(keep[lab],iterations=3),m,0)
    big.putalpha(Image.fromarray((m*255).astype(np.uint8)))
    return big.crop(big.getbbox())
out=Image.new('RGBA',(7*170,8*170),(60,90,60,255))
for k in range(8):
    ox=(k%4)*384; R=ROW[k//4]
    for j,(x0,x1) in enumerate(VX):
        c=cut((ox+x0,R['view'][0],ox+x1,R['view'][1])); s=320/c.height
        c.resize((round(c.width*s),320),Image.LANCZOS).save(f'art/view_{k}_{j}.png')
        t=c.copy(); t.thumbnail((165,165)); out.alpha_composite(t,(j*170,k*170))
    for j,(x0,x1) in enumerate(SX):
        c=cut((ox+x0,R['skill'][0],ox+x1,R['skill'][1])); s=300/max(c.size)
        c.resize((round(c.width*s),round(c.height*s)),Image.LANCZOS).save(f'art/skill_{k}_{j}.png')
        t=c.copy(); t.thumbnail((165,165)); out.alpha_composite(t,((4+j)*170,k*170))
out.save('shots/sheet3_cut.png')
