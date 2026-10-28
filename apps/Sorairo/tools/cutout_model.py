import sys, numpy as np, onnxruntime as ort
from PIL import Image
M='/tmp/claude-0/-home-claude/f24af2c0-231c-5758-8b99-6db115bc0fd5/scratchpad/models/'
_s={}
def mask(img, model='isnet-anime'):
    if model not in _s: _s[model]=ort.InferenceSession(M+model+'.onnx', providers=['CPUExecutionProvider'])
    s=_s[model]
    x=np.asarray(img.convert('RGB').resize((1024,1024),Image.LANCZOS)).astype(np.float32)/255.
    x=(x-np.array([0.485,0.456,0.406]))/np.array([1.0,1.0,1.0])
    x=x.transpose(2,0,1)[None].astype(np.float32)
    o=s.run(None,{s.get_inputs()[0].name:x})[0][0,0]
    o=(o-o.min())/(o.max()-o.min()+1e-8)
    return Image.fromarray((o*255).astype(np.uint8)).resize(img.size,Image.LANCZOS)
if __name__=='__main__':
    im=Image.open('art/heroes.png').convert('RGB')
    out=Image.new('RGBA',(1536,1024),(40,60,40,255))
    for k in range(8):
        cx,cy=(k%4)*384,(k//4)*512
        card=im.crop((cx,cy,cx+384,cy+512))
        m=mask(card)
        rgba=card.copy(); rgba.putalpha(m)
        rgba.save(f'art/hero_cut_{k}.png')
        out.alpha_composite(rgba,(cx,cy))
    out.convert('RGB').resize((768,512)).save('shots/cut_heroes.png')
