import numpy as np, json, base64, io
from PIL import Image
d=np.load('model_s.npz'); r=np.load('rig.npz'); rig=json.load(open('rig.json'))
P,UV,N,I=d['P'],d['UV'],d['N'],d['I'][r['keep']]
lo=P.min(0); hi=P.max(0); sc=(hi-lo)
q=np.round((P-lo)/sc*65535).astype('<u2')
n=N/np.linalg.norm(N,axis=1,keepdims=True); nq=np.round(n*127).astype('i1')
uvq=np.round(np.clip(UV,0,1)*65535).astype('<u2')
sw=np.round(r['SW']*255).astype(int)
# 合計を255に合わせる
sw[:,0]+=255-sw.sum(1); sw=sw.astype('u1')
b=lambda a: base64.b64encode(np.ascontiguousarray(a).tobytes()).decode()
img=Image.open('dec/img0.jpeg').convert('RGB').resize((1024,1024),Image.LANCZOS)
bio=io.BytesIO(); img.save(bio,'JPEG',quality=88); tex='data:image/jpeg;base64,'+base64.b64encode(bio.getvalue()).decode()
M={'name':'ユキナ','src':'Tripo (user supplied GLB), simplified 30k tris, auto-rig',
 'count':len(P),'lo':lo.tolist(),'sc':sc.tolist(),'pos':b(q),'nor':b(nq),'uv':b(uvq),'idx':b(I.astype('<u2')),
 'si':b(r['SI'].astype('u1')),'sw':b(sw),'bones':rig['order'],'parent':rig['parent'],'joints':rig['joints'],'tex':tex}
js='/* ユキナの3Dモデル（ユーザー提供のTripo GLBを軽量化し骨格を付けたもの） */\nwindow.SORAIRO_MODELS=window.SORAIRO_MODELS||{};\nwindow.SORAIRO_MODELS[1]='+json.dumps(M,ensure_ascii=False)+';\n'
open('/home/claude/demoapplication/apps/Sorairo/Resources/model_h1.js','w').write(js)
print(len(js)/1e6,'MB', len(I), len(P))
