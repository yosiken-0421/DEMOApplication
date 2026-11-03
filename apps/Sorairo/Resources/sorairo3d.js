/* =====================================================================
   そらいろ冒険隊 3D戦闘（試作）
   - three.js の SkinnedMesh＋Skeleton（骨格）でキャラ本体を動かす
   - 攻撃は AnimationClip / AnimationMixer（予備動作→踏み込み→命中→振り抜き→復帰）
   - ダメージ量はゲーム側で計算済みの値をそのまま使い、命中フレームで渡すだけ
     （アニメ中に次の攻撃が来たら、モーションは重ねずダメージだけ入れる）
   いまの対象：ユキナ（ユーザー提供の3Dモデル・槍）、モモ・ルル・ノクア（コードで組んだ簡易モデル）
   ===================================================================== */
(function(){
"use strict";
const T = window.THREE;
if(!T){ window.Sorairo3D = { available:false }; return; }
const D2R = Math.PI/180;

/* ---------- 見た目の設定（設定画の色・形に合わせる） ---------- */
const LOOK = {
  1: { name:'ユキナ', model:true, attack:'thrust', melee:true }, // ユーザー提供の3Dモデル（model_h1.js）
  7: { name:'モモ', skin:'#FFE2D2', hair:'#F7A0AC', hairD:'#D9707F', eye:'#E2452E',
       top:'#2A2228', top2:'#F2EEE6', jacket:'#F07A28', jacketD:'#B4501A', bottom:'#2A2228', frill:'#FFFFFF',
       sock:'#FFFFFF', boot:'#F07A28', bootD:'#2A2228', skirt:null, hairStyle:'buns', weapon:'gauntlet',
       wink:true, attack:'punch', melee:true },
  6: { name:'ルル', skin:'#FFE6DA', hair:'#AFC9F2', hairD:'#7B9BD6', eye:'#4A63D9',
       top:'#F4F6FF', top2:'#3F62C8', jacket:null, bottom:'#F4F6FF', frill:'#3F62C8',
       sock:'#FFFFFF', boot:'#F4F6FF', bootD:'#3F62C8', skirt:{len:.62, r:.70, col:'#F4F6FF', trim:'#3F62C8'},
       hairStyle:'longWavy', weapon:'staff', attack:'cast', melee:false },
  5: { name:'ノクア', skin:'#FFE6DA', hair:'#CBBDE6', hairD:'#9A86C8', eye:'#8E4FD9',
       top:'#241A30', top2:'#7A3FC0', jacket:null, bottom:'#241A30', frill:'#7A3FC0',
       sock:'#2A2030', boot:'#1E1828', bootD:'#7A3FC0', skirt:{len:.66, r:.78, col:'#2A1F38', trim:'#8A4FD0', jag:true},
       hairStyle:'longStraight', weapon:'scythe', attack:'sweep', melee:true, sleepy:true },
};

/* ---------- トゥーン調のマテリアル ---------- */
function gradientTex(){ const d=new Uint8Array([90,170,255]); const t=new T.DataTexture(d,3,1,T.RedFormat); t.minFilter=t.magFilter=T.NearestFilter; t.needsUpdate=true; return t; }
let GRAD=null;
function toon(opts){ if(!GRAD) GRAD=gradientTex(); return new T.MeshToonMaterial(Object.assign({gradientMap:GRAD},opts)); }
function outlineMat(width, skinned){
  const m=new T.MeshBasicMaterial({color:0x2A1F2E, side:T.BackSide});
  m.onBeforeCompile=sh=>{
    sh.vertexShader = skinned
      ? sh.vertexShader.replace('#include <skinning_vertex>','#include <skinning_vertex>\n transformed += normalize(objectNormal) * '+width.toFixed(4)+';')
      : sh.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n transformed += normalize(normal) * '+width.toFixed(4)+';');
  };
  if(skinned){ m.defines={}; }
  return m;
}
const col=(h)=>new T.Color(h);

/* ---------- 骨格 ---------- */
const BONES = [
  ['root',  null,       [0,0,0]],
  ['hips',  'root',     [0,0.95,0]],
  ['spine', 'hips',     [0,0.15,0]],
  ['chest', 'spine',    [0,0.25,0]],
  ['neck',  'chest',    [0,0.30,0]],
  ['head',  'neck',     [0,0.08,0]],
  ['shoulderL','chest', [0.24,0.22,0]],
  ['upperArmL','shoulderL',[0.10,0,0]],
  ['foreArmL','upperArmL',[0,-0.29,0]],
  ['handL', 'foreArmL', [0,-0.26,0]],
  ['shoulderR','chest', [-0.24,0.22,0]],
  ['upperArmR','shoulderR',[-0.10,0,0]],
  ['foreArmR','upperArmR',[0,-0.29,0]],
  ['handR', 'foreArmR', [0,-0.26,0]],
  ['thighL','hips',     [0.14,-0.05,0]],
  ['shinL', 'thighL',   [0,-0.42,0]],
  ['footL', 'shinL',    [0,-0.38,0]],
  ['thighR','hips',     [-0.14,-0.05,0]],
  ['shinR', 'thighR',   [0,-0.42,0]],
  ['footR', 'shinR',    [0,-0.38,0]],
];
function buildSkeleton(){
  const bones={}, list=[], world={};
  for(const [n,p,o] of BONES){ const b=new T.Bone(); b.name=n; b.position.set(o[0],o[1],o[2]); bones[n]=b; list.push(b);
    if(p) bones[p].add(b); world[n]= p? world[p].clone().add(new T.Vector3(...o)) : new T.Vector3(...o); }
  return {bones,list,world,index:Object.fromEntries(list.map((b,i)=>[b.name,i]))};
}

/* ---------- 体のメッシュを部品から組み立てる（各頂点に骨の重みをつける） ---------- */
function Builder(sk){ this.sk=sk; this.pos=[]; this.nor=[]; this.colr=[]; this.si=[]; this.sw=[]; this.idx=[]; }
Builder.prototype.add=function(geo, matrix, color, weightFn){
  const g=geo.index? geo.toNonIndexed() : geo; g.applyMatrix4(matrix); g.computeVertexNormals();
  const p=g.attributes.position, n=g.attributes.normal, c=col(color), base=this.pos.length/3;
  for(let i=0;i<p.count;i++){
    const x=p.getX(i), y=p.getY(i), z=p.getZ(i);
    this.pos.push(x,y,z); this.nor.push(n.getX(i),n.getY(i),n.getZ(i)); this.colr.push(c.r,c.g,c.b);
    const w=weightFn(x,y,z); // [[bone,weight],...]
    const a=[0,0,0,0], b=[0,0,0,0]; w.slice(0,4).forEach((e,k)=>{ a[k]=this.sk.index[e[0]]; b[k]=e[1]; });
    const s=b[0]+b[1]+b[2]+b[3]||1; this.si.push(...a); this.sw.push(b[0]/s,b[1]/s,b[2]/s,b[3]/s);
    this.idx.push(base+i);
  }
};
Builder.prototype.geometry=function(){
  const g=new T.BufferGeometry();
  g.setAttribute('position',new T.Float32BufferAttribute(this.pos,3));
  g.setAttribute('normal',new T.Float32BufferAttribute(this.nor,3));
  g.setAttribute('color',new T.Float32BufferAttribute(this.colr,3));
  g.setAttribute('skinIndex',new T.Uint16BufferAttribute(this.si,4));
  g.setAttribute('skinWeight',new T.Float32BufferAttribute(this.sw,4));
  return g;
};
const M=(x,y,z, rx=0,ry=0,rz=0, sx=1,sy=1,sz=1)=>new T.Matrix4().compose(new T.Vector3(x,y,z), new T.Quaternion().setFromEuler(new T.Euler(rx,ry,rz)), new T.Vector3(sx,sy,sz));
const rigid=(b)=>()=>[[b,1]];
// y方向に 2 本の骨をなめらかにつなぐ（関節まわりの皮膚がちぎれないように）
const blendY=(b0,b1,y0,y1)=>(x,y)=>{ const t=Math.min(1,Math.max(0,(y-y0)/(y1-y0))); return [[b0,1-t],[b1,t]]; };
const limb=(upper,lower,jointY,span,down=true)=>(x,y)=>{ const d=(down? jointY-y : y-jointY); const t=Math.min(1,Math.max(0,(d+span)/(2*span))); return [[upper,1-t],[lower,t]]; };

function buildBody(L, sk){
  const B=new Builder(sk), W=sk.world;
  const cyl=(rt,rb,h,seg=14)=>new T.CylinderGeometry(rt,rb,h,seg,4);
  const sph=(r,ws=14,hs=10)=>new T.SphereGeometry(r,ws,hs);
  const cap=(r,len)=>new T.CapsuleGeometry(r,len,4,12);
  // 胴体（胸→腰）
  B.add(cyl(0.21,0.18,0.42,16), M(0,1.32,0), L.top, blendY('spine','chest',1.16,1.40));
  B.add(sph(0.215,16,10), M(0,1.53,0, 0,0,0, 1,0.55,0.82), L.top, rigid('chest'));
  if(L.top2) B.add(cyl(0.215,0.19,0.10,16), M(0,1.36,0.005), L.top2, rigid('chest'));
  // ジャケット（モモ）
  if(L.jacket){ B.add(cyl(0.245,0.23,0.24,16,1), M(0,1.50,-0.01), L.jacket, rigid('chest'));
    B.add(new T.TorusGeometry(0.17,0.05,8,16), M(0,1.62,-0.04, Math.PI/2.4,0,0), L.jacketD, rigid('chest')); }
  // おなか・腰
  if(L.attack==='punch') B.add(cyl(0.18,0.19,0.16,16), M(0,1.12,0), L.skin, blendY('hips','spine',1.04,1.18));
  B.add(cyl(0.19,0.23,0.22,16), M(0,0.95,0), L.bottom, rigid('hips'));
  B.add(new T.TorusGeometry(0.205,0.025,6,20), M(0,1.06,0, Math.PI/2,0,0), L.attack==='punch'?'#E06A20':L.frill, rigid('hips'));
  if(L.attack==='punch') B.add(cyl(0.235,0.24,0.04,16), M(0,0.85,0), L.frill, rigid('hips'));
  // スカート
  if(L.skirt){ const s=L.skirt, g=new T.CylinderGeometry(0.22, s.r, s.len, 22, 4, true);
    if(s.jag){ const p=g.attributes.position; for(let i=0;i<p.count;i++){ const y=p.getY(i); if(y<-s.len/2+0.01){ const a=Math.atan2(p.getZ(i),p.getX(i)); p.setY(i,y-0.06*(Math.sin(a*7)*0.5+0.5)); } } }
    B.add(g, M(0,1.04-s.len/2,0), s.col, (x,y)=>[['hips',1]]);
    B.add(new T.TorusGeometry(s.r*0.99,0.03,6,26), M(0,1.04-s.len,0, Math.PI/2,0,0), s.trim, rigid('hips'));
    B.add(new T.CylinderGeometry(0.21,0.24,0.10,20,1,true), M(0,1.02,0), s.trim, rigid('hips')); }
  // 首
  B.add(cyl(0.07,0.08,0.14,10), M(0,1.70,0), L.skin, blendY('chest','neck',1.64,1.74));
  // 腕
  for(const [s,sx] of [['L',1],['R',-1]]){
    const sh=W['upperArm'+s];
    B.add(sph(0.11,12,8), M(sh.x,sh.y,0), L.jacket||L.top, rigid('upperArm'+s));                               // 肩
    B.add(cap(0.078,0.20), M(sh.x,sh.y-0.15,0), L.jacket&&false? L.jacket : L.skin, limb('upperArm'+s,'foreArm'+s, sh.y-0.29, 0.05));
    if(L.attack!=='punch'){ // ふくらんだ袖
      B.add(sph(0.12,12,8), M(sh.x,sh.y-0.07,0, 0,0,0, 1,1.15,1), L.top, rigid('upperArm'+s));
      B.add(new T.CylinderGeometry(0.075,0.11,0.12,12,1,true), M(sh.x,sh.y-0.46,0), L.frill==='#3F62C8'?'#F4F6FF':L.top, rigid('foreArm'+s)); }
    B.add(cap(0.07,0.18), M(sh.x,sh.y-0.42,0), L.skin, limb('foreArm'+s,'hand'+s, sh.y-0.55, 0.03));
    if(L.weapon!=='gauntlet') B.add(sph(0.075,10,8), M(sh.x,sh.y-0.59,0, 0,0,0, 0.9,1.1,0.9), L.skin, rigid('hand'+s));
  }
  // 脚
  for(const s of ['L','R']){ const th=W['thigh'+s], kn=W['shin'+s], ft=W['foot'+s];
    B.add(cap(0.10,0.30), M(th.x,th.y-0.22,0), L.skin, limb('thigh'+s,'shin'+s, kn.y, 0.05));
    B.add(cap(0.085,0.30), M(kn.x,kn.y-0.20,0), L.sock, limb('shin'+s,'foot'+s, ft.y+0.02, 0.03));
    // ブーツ
    B.add(cyl(0.11,0.12,0.30,14), M(kn.x,ft.y+0.17,0.0), L.boot, blendY('shin'+s,'foot'+s,ft.y+0.10,ft.y+0.20));
    B.add(new T.BoxGeometry(0.22,0.13,0.34,3,2,3), M(ft.x,ft.y+0.0,0.06), L.boot, rigid('foot'+s));
    B.add(new T.BoxGeometry(0.23,0.04,0.35), M(ft.x,ft.y-0.065,0.06), L.bootD, rigid('foot'+s));
    B.add(new T.TorusGeometry(0.115,0.022,6,16), M(kn.x,ft.y+0.30,0, Math.PI/2,0,0), L.bootD, rigid('shin'+s));
  }
  return B.geometry();
}

/* ---------- 顔（目・口を描いたテクスチャ） ---------- */
function faceTexture(L){
  const c=document.createElement('canvas'); c.width=1024; c.height=512; const g=c.getContext('2d');
  g.fillStyle=L.skin; g.fillRect(0,0,1024,512);
  const cx=256, cy=290; // u=0.25 が正面
  const eye=(x,flip,closed)=>{ g.save(); g.translate(x,cy); g.scale(flip,1);
    if(closed){ g.strokeStyle='#3A2028'; g.lineWidth=9; g.lineCap='round'; g.beginPath(); g.moveTo(-26,4); g.quadraticCurveTo(0,-18,26,4); g.stroke(); g.restore(); return; }
    g.fillStyle='#fff'; g.beginPath(); g.ellipse(0,0,27,L.sleepy?27:34,0,0,7); g.fill();
    const gr=g.createLinearGradient(0,-30,0,30); gr.addColorStop(0,'#1E1420'); gr.addColorStop(.45,L.eye); gr.addColorStop(1,'#FFFFFF');
    g.fillStyle=gr; g.beginPath(); g.ellipse(0,4,21,L.sleepy?22:28,0,0,7); g.fill();
    g.fillStyle='#160E18'; g.beginPath(); g.ellipse(0,4,9,14,0,0,7); g.fill();
    g.fillStyle='#fff'; g.beginPath(); g.ellipse(-8,-9,8,10,0,0,7); g.fill(); g.beginPath(); g.arc(9,16,4,0,7); g.fill();
    g.fillStyle='#2E1F2C'; g.beginPath(); g.moveTo(-32,L.sleepy?-6:-12); g.quadraticCurveTo(0,L.sleepy?-34:-46,34,L.sleepy?-14:-20); g.lineTo(36,L.sleepy?-6:-12); g.quadraticCurveTo(0,L.sleepy?-24:-34,-30,L.sleepy?0:-4); g.fill();
    if(L.sleepy){ g.fillStyle=L.skin; g.fillRect(-32,-40,66,26); g.strokeStyle='#2E1F2C'; g.lineWidth=6; g.beginPath(); g.moveTo(-30,-14); g.quadraticCurveTo(0,-22,32,-14); g.stroke(); }
    g.restore(); };
  eye(cx-58,1,false); eye(cx+58,-1,!!L.wink);
  // ほお
  g.fillStyle='rgba(255,120,140,.35)'; g.beginPath(); g.ellipse(cx-92,cy+44,26,12,0,0,7); g.fill(); g.beginPath(); g.ellipse(cx+92,cy+44,26,12,0,0,7); g.fill();
  // 口
  g.fillStyle='#C2405A';
  if(L.attack==='punch'){ g.beginPath(); g.moveTo(cx-18,cy+58); g.quadraticCurveTo(cx,cy+92,cx+18,cy+58); g.closePath(); g.fill(); g.fillStyle='#fff'; g.beginPath(); g.moveTo(cx+4,cy+59); g.lineTo(cx+10,cy+59); g.lineTo(cx+7,cy+67); g.fill(); }
  else if(L.sleepy){ g.strokeStyle='#A04060'; g.lineWidth=5; g.beginPath(); g.moveTo(cx-8,cy+66); g.lineTo(cx+8,cy+66); g.stroke(); }
  else { g.strokeStyle='#B04060'; g.lineWidth=5; g.lineCap='round'; g.beginPath(); g.moveTo(cx-12,cy+62); g.quadraticCurveTo(cx,cy+72,cx+12,cy+62); g.stroke(); }
  const t=new T.CanvasTexture(c); t.colorSpace=T.SRGBColorSpace; t.anisotropy=4; return t;
}

/* ---------- 頭・髪（頭の骨に固定） ---------- */
function buildHead(L, sk, group){
  const head=sk.bones.head, R=0.56;
  const OL=0.022;
  const addRigid=(geo,mat,parent,m,outline=true)=>{ const mesh=new T.Mesh(geo,mat); mesh.applyMatrix4(m); parent.add(mesh);
    if(outline){ const o=new T.Mesh(geo,outlineMat(OL,false)); o.applyMatrix4(m); parent.add(o); } return mesh; };
  const faceMat=toon({map:faceTexture(L)});
  addRigid(new T.SphereGeometry(R,32,24), faceMat, head, M(0,0.47,0.02, 0,0,0, 1,0.94,0.96));
  // 耳（ルル・ノクアは少しとがる）
  const hairMat=toon({color:col(L.hair)}), hairD=toon({color:col(L.hairD)});
  // 髪のかぶり（後ろと上）
  addRigid(new T.SphereGeometry(R*1.06,32,20,0,Math.PI*2,0,Math.PI*0.40), hairMat, head, M(0,0.49,-0.015, -0.55,0,0, 1.04,1.0,1.05));
  addRigid(new T.SphereGeometry(R*1.055,24,16,Math.PI*1.05,Math.PI*0.9,0,Math.PI*0.80), hairMat, head, M(0,0.49,-0.02, 0,0,0, 1.04,1.0,1.05));
  // 前髪（くさび形を並べる）
  const bang=new T.ConeGeometry(0.10,0.24,6,1);
  for(let k=-3;k<=3;k++){ const a=k*0.24; const x=Math.sin(a)*R*0.98, z=Math.cos(a)*R*0.98;
    addRigid(bang, hairMat, head, M(x*1.03,0.73-Math.abs(k)*0.02,z*1.0, Math.PI-0.55,a,0, 1,1,0.5), false); }
  // サイドの髪
  for(const s of [-1,1]) addRigid(new T.CapsuleGeometry(0.09,0.40,4,8), hairMat, head, M(s*R*0.86,0.20,0.12, 0.1,0,s*0.12), true);
  if(L.hairStyle==='buns'){
    for(const s of [-1,1]){ addRigid(new T.SphereGeometry(0.24,20,14), hairMat, head, M(s*0.40,0.98,-0.06));
      addRigid(new T.TorusGeometry(0.15,0.03,6,16), hairD, head, M(s*0.40,0.98,-0.06, 0,0,s*0.6), false); }
    // ゴーグル
    const gm=toon({color:col('#5A3A22')}), gl=new T.MeshStandardMaterial({color:'#FFB640',emissive:'#FF8A20',emissiveIntensity:0.6,metalness:0.3,roughness:0.3});
    addRigid(new T.TorusGeometry(R*1.02,0.04,8,40,Math.PI*1.1), gm, head, M(0,0.72,0, -0.25,0,Math.PI*-0.05));
    for(const s of [-1,1]){ addRigid(new T.CylinderGeometry(0.12,0.12,0.07,18), gm, head, M(s*0.18,0.86,0.45, Math.PI/2-0.6,0,0));
      addRigid(new T.CircleGeometry(0.095,18), gl, head, M(s*0.18,0.88,0.49, -0.6,0,0), false); }
    addRigid(new T.ConeGeometry(0.035,0.32,5), hairMat, head, M(0.02,1.12,0.10, -0.5,0,-0.3), false); // アホ毛
  }
  if(L.hairStyle==='longWavy' || L.hairStyle==='longStraight'){
    const back=new T.CapsuleGeometry(0.42,0.9,6,16); const p=back.attributes.position;
    if(L.hairStyle==='longWavy') for(let i=0;i<p.count;i++){ const y=p.getY(i), x=p.getX(i); p.setX(i,x*(1+0.12*Math.sin(y*9))); p.setZ(i,p.getZ(i)*0.6); }
    else for(let i=0;i<p.count;i++) p.setZ(i,p.getZ(i)*0.55);
    back.computeVertexNormals();
    const bh=new T.Group(); bh.name='hairBack'; bh.position.set(0,0.55,-0.22); head.add(bh);
    addRigid(back, hairMat, bh, M(0,-0.62,-0.06, 0.12,0,0, L.hairStyle==='longWavy'?1.25:1.05,1,1));
    for(const s of [-1,1]) addRigid(new T.CapsuleGeometry(0.11,0.85,4,10), hairMat, bh, M(s*0.40,-0.62,0.18, 0.05,0,s*0.10));
    group.userData.hairBack=bh;
    if(L.hairStyle==='longWavy'){ // ティアラと花
      const gold=new T.MeshStandardMaterial({color:'#E8C26A',metalness:0.7,roughness:0.3,emissive:'#5A4010',emissiveIntensity:0.3});
      addRigid(new T.TorusGeometry(R*0.98,0.03,6,40,Math.PI*0.9), gold, head, M(0,0.86,0.04, -0.55,0,Math.PI*0.05), false);
      addRigid(new T.OctahedronGeometry(0.08), new T.MeshStandardMaterial({color:'#3F7BFF',emissive:'#2050FF',emissiveIntensity:0.5}), head, M(0,1.06,0.32,0,0,0,1,1.5,0.6), false);
      for(const s of [-1,1]) addRigid(new T.SphereGeometry(0.11,12,8), toon({color:col('#FFFFFF')}), head, M(s*0.48,0.80,0.10,0,0,0,1,1,0.5)); }
    else { // 黒いヘッドドレスと紫のバラ
      const hd=toon({color:col('#1E1828')});
      addRigid(new T.TorusGeometry(R*1.0,0.07,8,40,Math.PI*1.05), hd, head, M(0,0.80,-0.02, -0.35,0,Math.PI*-0.025));
      for(const s of [-1,1]) addRigid(new T.SphereGeometry(0.12,12,10), toon({color:col('#8A4FD0')}), head, M(s*0.46,0.88,0.12, 0,0,0, 1,0.8,0.8)); }
  }
}

/* ---------- 武器（手の骨にソケットとして固定） ---------- */
function buildWeapon(L, sk, group){
  const OL=0.02;
  const add=(geo,mat,parent,m,ol=true)=>{ const mesh=new T.Mesh(geo,mat); mesh.applyMatrix4(m); parent.add(mesh);
    if(ol){ const o=new T.Mesh(geo,outlineMat(OL,false)); o.applyMatrix4(m); parent.add(o); } return mesh; };
  const sock=(bone)=>{ const s=new T.Group(); s.name='socket_'+bone; sk.bones[bone].add(s); return s; };
  if(L.weapon==='gauntlet'){
    const orange=toon({color:col('#F07A28')}), dark=toon({color:col('#2E2420')}), bronze=new T.MeshStandardMaterial({color:'#C8903A',metalness:0.8,roughness:0.35});
    const glow=new T.MeshStandardMaterial({color:'#FFB040',emissive:'#FF7A10',emissiveIntensity:1.0});
    for(const s of ['L','R']){ const k=sock('hand'+s); const sx=s==='L'?1:-1;
      add(new T.CylinderGeometry(0.17,0.20,0.32,14), orange, k, M(0,0.06,0));                    // 前腕のよろい
      add(new T.BoxGeometry(0.42,0.40,0.40,2,2,2), orange, k, M(0,-0.22,0.02));                  // こぶし
      for(let f=0;f<4;f++) add(new T.BoxGeometry(0.09,0.12,0.12), dark, k, M(-0.15+f*0.10,-0.40,0.15), false);
      add(new T.TorusGeometry(0.14,0.035,8,20), bronze, k, M(sx*0.215,-0.18,0.02, 0,Math.PI/2,0), false);
      add(new T.CircleGeometry(0.10,18), glow, k, M(sx*0.222,-0.18,0.02, 0,sx*Math.PI/2,0), false);
      const tip=new T.Object3D(); tip.position.set(0,-0.45,0.1); k.add(tip); if(s==='R') group.userData.tip=tip; }
  }
  if(L.weapon==='staff'){
    const k=sock('handR'); const gold=new T.MeshStandardMaterial({color:'#D9AE5A',metalness:0.75,roughness:0.3});
    const orb=new T.MeshStandardMaterial({color:'#5A8CFF',emissive:'#2A60FF',emissiveIntensity:0.9,transparent:true,opacity:0.92});
    const st=new T.Group(); st.position.set(0,-0.02,0.02); k.add(st);
    add(new T.CylinderGeometry(0.03,0.03,1.55,10), gold, st, M(0,0.30,0));
    add(new T.TorusGeometry(0.17,0.035,8,24,Math.PI*1.6), gold, st, M(0,1.20,0, 0,0,-Math.PI*0.3));
    group.userData.orb=add(new T.SphereGeometry(0.13,18,14), orb, st, M(0,1.20,0), false);
    add(new T.OctahedronGeometry(0.07), orb, st, M(0,-0.52,0,0,0,0,1,1.8,1), false);
    for(const s of [-1,1]) add(new T.BoxGeometry(0.16,0.05,0.02), toon({color:col('#3F62C8')}), st, M(s*0.09,0.98,0,0,0,s*0.5), false);
    const tip=new T.Object3D(); tip.position.set(0,1.20,0); st.add(tip); group.userData.tip=tip;
  }
  if(L.weapon==='scythe'){
    const k=sock('handR'); const dark=toon({color:col('#2A2230')});
    const bladeMat=new T.MeshStandardMaterial({color:'#B07CFF',emissive:'#7A30FF',emissiveIntensity:0.55,metalness:0.4,roughness:0.25,side:T.DoubleSide});
    const st=new T.Group(); st.position.set(0,0,0.02); k.add(st);
    add(new T.CylinderGeometry(0.035,0.035,2.3,10), dark, st, M(0,0.55,0));
    const sh=new T.Shape(); sh.moveTo(0,0); sh.quadraticCurveTo(0.65,0.30,1.25,-0.32); sh.quadraticCurveTo(0.70,0.04,0,-0.20); sh.lineTo(0,0);
    const blade=new T.ExtrudeGeometry(sh,{depth:0.03,bevelEnabled:true,bevelThickness:0.012,bevelSize:0.012,bevelSegments:1,curveSegments:16});
    blade.translate(0,0,-0.015);
    add(blade, bladeMat, st, M(0.0,1.68,0, 0,Math.PI/2,0));
    add(new T.TorusGeometry(0.12,0.03,6,16), dark, st, M(0,1.62,0, 0,Math.PI/2,0));
    add(new T.OctahedronGeometry(0.07), bladeMat, st, M(0,1.62,0), false);
    const tip=new T.Object3D(); tip.position.set(0,1.45,1.05); st.add(tip); group.userData.tip=tip;
  }
}

/* ---------- アニメーション（骨ごとのキーフレーム） ---------- */
function clip(name, dur, keys, base, hb){
  hb=hb||[0,0.95,0];
  const tracks=[];
  const names=new Set([...Object.keys(base||{}), ...Object.keys(keys)]);
  for(const n of names){
    if(n==='hips.pos'){ const k=keys[n]||[[0,0,0,0],[dur,0,0,0]];
      tracks.push(new T.VectorKeyframeTrack('hips.position', k.map(e=>e[0]), k.flatMap(e=>[hb[0]+e[1],hb[1]+e[2],hb[2]+e[3]]))); continue; }
    const k=keys[n] || [[0,...base[n]],[dur,...base[n]]];
    const times=k.map(e=>e[0]), vals=[];
    for(const e of k){ const q=new T.Quaternion().setFromEuler(new T.Euler(e[1]*D2R,e[2]*D2R,e[3]*D2R,'YXZ')); vals.push(q.x,q.y,q.z,q.w); }
    tracks.push(new T.QuaternionKeyframeTrack(n+'.quaternion', times, vals));
  }
  return new T.AnimationClip(name, dur, tracks);
}
// 時間の目安：予備0–0.16 踏み込み0.16–0.32 命中0.32–0.43 振り抜き0.43–0.60 復帰0.60–0.86
function makeClips(L){
  const g=L.weapon;
  const idleArm = g==='gauntlet' ? {upperArmL:[-15,0,28],upperArmR:[-15,0,-28],foreArmL:[-35,0,0],foreArmR:[-35,0,0]}
               : g==='staff' ? {upperArmL:[0,0,12],upperArmR:[-28,0,-14],foreArmL:[-10,0,0],foreArmR:[-62,0,8],handR:[90,0,0]}
               : {upperArmL:[-30,0,18],upperArmR:[-32,0,-16],foreArmL:[-60,0,-20],foreArmR:[-58,0,0],handR:[80,0,10]};
  const base=Object.assign({spine:[0,0,0],chest:[0,0,0],neck:[0,0,0],head:[0,0,0],thighL:[0,0,0],thighR:[0,0,0],shinL:[0,0,0],shinR:[0,0,0],footL:[0,0,0],footR:[0,0,0],
    shoulderL:[0,0,0],shoulderR:[0,0,0],handL:[0,0,0],handR:[0,0,0]}, idleArm);
  const bA=(n,d=0)=>base[n].map((v,i)=>v+(i===0?d:0));
  const idle=clip('idle',1.6,{
    chest:[[0,3,0,0],[0.8,-1,0,0],[1.6,3,0,0]], head:[[0,0,0,-2],[0.8,3,0,2],[1.6,0,0,-2]],
    upperArmL:[[0,...bA('upperArmL')],[0.8,...bA('upperArmL',-5)],[1.6,...bA('upperArmL')]],
    upperArmR:[[0,...bA('upperArmR')],[0.8,...bA('upperArmR',-5)],[1.6,...bA('upperArmR')]],
    thighL:[[0,-6,0,2],[1.6,-6,0,2]], thighR:[[0,4,0,-2],[1.6,4,0,-2]], shinL:[[0,10,0,0],[1.6,10,0,0]],
    'hips.pos':[[0,0,0,0],[0.8,0,-0.025,0],[1.6,0,0,0]] }, base);
  const run=clip('run',0.42,{
    thighL:[[0,-42,0,0],[0.21,30,0,0],[0.42,-42,0,0]], thighR:[[0,30,0,0],[0.21,-42,0,0],[0.42,30,0,0]],
    shinL:[[0,30,0,0],[0.1,70,0,0],[0.21,15,0,0],[0.42,30,0,0]], shinR:[[0,15,0,0],[0.21,30,0,0],[0.31,70,0,0],[0.42,15,0,0]],
    upperArmL:[[0,35,0,20],[0.21,-45,0,20],[0.42,35,0,20]], upperArmR:[[0,-45,0,-20],[0.21,35,0,-20],[0.42,-45,0,-20]],
    chest:[[0,-12,6,0],[0.21,-12,-6,0],[0.42,-12,6,0]], spine:[[0,-6,0,0],[0.42,-6,0,0]],
    'hips.pos':[[0,0,0,0],[0.1,0,0.06,0],[0.21,0,0,0],[0.31,0,0.06,0],[0.42,0,0,0]] }, base);
  let attack, hitT;
  if(L.attack==='punch'){ hitT=0.36; // モモ：腰→肩→肘→拳の順に動く重いストレート
    attack=clip('attack',0.86,{
      'hips.pos':[[0,0,0,0],[0.16,0,-0.10,-0.10],[0.32,0,-0.06,0.22],[0.43,0,-0.05,0.30],[0.60,0,-0.04,0.26],[0.86,0,0,0]],
      spine:   [[0,0,0,0],[0.16,0,35,0],[0.30,-6,-10,0],[0.40,-10,-38,0],[0.60,-8,-34,0],[0.86,0,0,0]],
      chest:   [[0,3,0,0],[0.16,4,25,0],[0.32,-6,-12,0],[0.43,-12,-30,0],[0.60,-8,-25,0],[0.86,3,0,0]],
      head:    [[0,0,0,0],[0.16,4,-30,0],[0.36,-6,40,0],[0.60,-4,45,0],[0.86,0,0,0]],
      upperArmR:[[0,...base.upperArmR],[0.16,40,-20,-40],[0.30,-40,-10,-30],[0.38,-88,0,-12],[0.43,-90,0,-10],[0.60,-85,0,-14],[0.86,...base.upperArmR]],
      foreArmR:[[0,...base.foreArmR],[0.16,-110,0,0],[0.30,-70,0,0],[0.38,-8,0,0],[0.60,-12,0,0],[0.86,...base.foreArmR]],
      upperArmL:[[0,...base.upperArmL],[0.16,-70,0,15],[0.40,-30,0,45],[0.60,-30,0,40],[0.86,...base.upperArmL]],
      foreArmL:[[0,...base.foreArmL],[0.16,-80,0,0],[0.40,-70,0,0],[0.86,...base.foreArmL]],
      thighL:  [[0,-6,0,2],[0.16,-10,0,4],[0.30,-45,0,6],[0.43,-48,0,6],[0.60,-44,0,6],[0.86,-6,0,2]],
      shinL:   [[0,10,0,0],[0.16,30,0,0],[0.30,40,0,0],[0.43,45,0,0],[0.86,10,0,0]],
      thighR:  [[0,4,0,-2],[0.16,-20,0,-4],[0.32,25,0,-4],[0.43,32,0,-4],[0.60,30,0,-4],[0.86,4,0,-2]],
      shinR:   [[0,0,0,0],[0.16,50,0,0],[0.32,20,0,0],[0.43,15,0,0],[0.86,0,0,0]],
      footL:[[0,0,0,0],[0.30,15,0,0],[0.86,0,0,0]], footR:[[0,0,0,0],[0.32,-20,0,0],[0.86,0,0,0]] }, base);
  }
  if(L.attack==='cast'){ hitT=0.40; // ルル：杖を振りかぶって前へ振り、杖先から水の弾
    attack=clip('attack',0.86,{
      'hips.pos':[[0,0,0,0],[0.16,0,-0.06,-0.06],[0.32,0,-0.04,0.10],[0.43,0,-0.03,0.14],[0.86,0,0,0]],
      spine:[[0,0,0,0],[0.16,4,30,0],[0.32,-4,-6,0],[0.43,-8,-24,0],[0.60,-6,-20,0],[0.86,0,0,0]],
      chest:[[0,3,0,0],[0.16,8,20,0],[0.32,-4,-8,0],[0.43,-10,-18,0],[0.86,3,0,0]],
      head:[[0,0,0,0],[0.16,-6,-15,0],[0.43,-4,25,0],[0.86,0,0,0]],
      upperArmR:[[0,...base.upperArmR],[0.16,150,0,-20],[0.28,-165,0,-14],[0.35,-115,0,-8],[0.40,-82,0,-6],[0.60,-78,0,-10],[0.86,...base.upperArmR]],
      foreArmR:[[0,...base.foreArmR],[0.16,-30,0,0],[0.40,-8,0,0],[0.60,-12,0,0],[0.86,...base.foreArmR]],
      handR:[[0,...base.handR],[0.16,90,0,0],[0.30,130,0,0],[0.40,150,0,0],[0.60,148,0,0],[0.86,...base.handR]],
      upperArmL:[[0,...base.upperArmL],[0.16,-40,0,30],[0.43,-20,0,55],[0.86,...base.upperArmL]],
      thighL:[[0,-6,0,2],[0.16,-4,0,2],[0.32,-30,0,4],[0.60,-30,0,4],[0.86,-6,0,2]], shinL:[[0,10,0,0],[0.32,25,0,0],[0.86,10,0,0]],
      thighR:[[0,4,0,-2],[0.16,-10,0,-2],[0.32,18,0,-2],[0.60,18,0,-2],[0.86,4,0,-2]], shinR:[[0,0,0,0],[0.16,30,0,0],[0.32,8,0,0],[0.86,0,0,0]] }, base);
  }
  if(L.attack==='sweep'){ hitT=0.40; // ノクア：骨盤→胸→肩の順に回して大きな円弧
    attack=clip('attack',0.86,{
      'hips.pos':[[0,0,0,0],[0.16,0,-0.12,-0.08],[0.32,0,-0.10,0.12],[0.43,0,-0.10,0.16],[0.60,0,-0.08,0.12],[0.86,0,0,0]],
      spine:[[0,0,0,0],[0.16,0,55,0],[0.30,-4,10,0],[0.40,-10,-45,0],[0.55,-8,-70,0],[0.86,0,0,0]],
      chest:[[0,3,0,0],[0.16,5,40,-6],[0.30,0,5,0],[0.42,-10,-35,4],[0.58,-8,-45,4],[0.86,3,0,0]],
      head:[[0,0,0,0],[0.16,0,-40,0],[0.42,-4,40,0],[0.60,0,55,0],[0.86,0,0,0]],
      upperArmR:[[0,...base.upperArmR],[0.16,115,0,-30],[0.28,170,0,-25],[0.35,-130,0,-20],[0.42,-75,0,-15],[0.58,-35,0,-5],[0.86,...base.upperArmR]],
      foreArmR:[[0,...base.foreArmR],[0.16,-40,0,0],[0.42,-10,0,0],[0.60,-25,0,0],[0.86,...base.foreArmR]],
      handR:[[0,...base.handR],[0.16,70,0,20],[0.42,85,0,-10],[0.60,80,0,-20],[0.86,...base.handR]],
      upperArmL:[[0,...base.upperArmL],[0.16,105,0,35],[0.28,165,0,25],[0.35,-130,0,20],[0.42,-70,0,20],[0.58,-35,0,10],[0.86,...base.upperArmL]],
      foreArmL:[[0,...base.foreArmL],[0.16,-50,0,0],[0.42,-25,0,0],[0.86,...base.foreArmL]],
      thighL:[[0,-6,0,2],[0.16,-10,0,8],[0.32,-40,0,10],[0.60,-40,0,10],[0.86,-6,0,2]], shinL:[[0,10,0,0],[0.16,35,0,0],[0.32,40,0,0],[0.86,10,0,0]],
      thighR:[[0,4,0,-2],[0.16,-25,0,-8],[0.32,28,0,-8],[0.60,30,0,-8],[0.86,4,0,-2]], shinR:[[0,0,0,0],[0.16,55,0,0],[0.32,25,0,0],[0.86,0,0,0]] }, base);
  }
  return {idle, run, attack, hitT};
}

/* ---------- 3Dモデル（model_h*.js）から骨格つきキャラをつくる ---------- */
function b64(s, Ctor){ const bin=atob(s); const u=new Uint8Array(bin.length); for(let k=0;k<bin.length;k++) u[k]=bin.charCodeAt(k); return new Ctor(u.buffer); }
function buildModelSkeleton(M){
  const bones={}, list=[];
  for(const n of M.bones){ const b=new T.Bone(); b.name=n; const j=M.joints[n], p=M.parent[n];
    const pj=p? M.joints[p] : [0,0,0]; b.position.set(j[0]-pj[0], j[1]-pj[1], j[2]-pj[2]);
    if(n==='root') b.position.set(0,0,0);
    bones[n]=b; list.push(b); if(p) bones[p].add(b); }
  return {bones, list};
}
// 槍の時間配分：構え0–0.16 踏み込み0.16–0.32 突き（命中）0.32–0.43 振り抜き0.43–0.60 復帰0.60–0.86
function makeModelClips(M){
  const hj=M.joints.hips, hb=[hj[0]-M.joints.root[0]*0, hj[1], hj[2]];
  const base={spine:[0,0,0],chest:[0,0,0],neck:[0,0,0],head:[0,0,0],upperArmL:[0,0,0],foreArmL:[0,0,0],handL:[0,0,0],
    upperArmR:[0,0,0],foreArmR:[0,0,0],handR:[0,0,0],thighL:[0,0,0],thighR:[0,0,0],shinL:[0,0,0],shinR:[0,0,0],footL:[0,0,0],footR:[0,0,0]};
  const idle=clip('idle',1.8,{
    chest:[[0,2,0,0],[0.9,-1,0,0],[1.8,2,0,0]], head:[[0,0,0,-2],[0.9,2,0,1.5],[1.8,0,0,-2]],
    upperArmL:[[0,0,0,0],[0.9,0,0,3],[1.8,0,0,0]], upperArmR:[[0,0,0,0],[0.9,-3,0,0],[1.8,0,0,0]],
    'hips.pos':[[0,0,0,0],[0.9,0,-0.02,0],[1.8,0,0,0]] }, base, hb);
  const run=clip('run',0.44,{
    thighL:[[0,-28,0,0],[0.22,22,0,0],[0.44,-28,0,0]], thighR:[[0,22,0,0],[0.22,-28,0,0],[0.44,22,0,0]],
    shinL:[[0,20,0,0],[0.11,45,0,0],[0.22,8,0,0],[0.44,20,0,0]], shinR:[[0,8,0,0],[0.22,20,0,0],[0.33,45,0,0],[0.44,8,0,0]],
    upperArmR:[[0,-30,0,0],[0.22,25,0,0],[0.44,-30,0,0]],
    chest:[[0,-10,5,0],[0.22,-10,-5,0],[0.44,-10,5,0]], spine:[[0,-5,0,0],[0.44,-5,0,0]], handL:[[0,40,0,0],[0.44,40,0,0]],
    'hips.pos':[[0,0,0,0],[0.11,0,0.05,0],[0.22,0,0,0],[0.33,0,0.05,0],[0.44,0,0,0]] }, base, hb);
  const A=window.SORAIRO_THRUST || {
    'hips.pos':[[0,0,0,0],[0.16,0,-0.07,-0.12],[0.32,0,-0.08,0.18],[0.40,0,-0.08,0.28],[0.60,0,-0.06,0.24],[0.86,0,0,0]],
    spine:  [[0,0,0,0],[0.16,6,-22,0],[0.32,-4,6,0],[0.40,-10,20,0],[0.60,-8,16,0],[0.86,0,0,0]],
    chest:  [[0,0,0,0],[0.16,4,-14,0],[0.32,-4,6,0],[0.40,-8,14,0],[0.60,-6,12,0],[0.86,0,0,0]],
    head:   [[0,0,0,0],[0.16,0,10,0],[0.40,4,-12,0],[0.60,2,-10,0],[0.86,0,0,0]],
    upperArmL:[[0,0,0,0],[0.16,-8,22,0],[0.30,-4,-10,0],[0.38,0,-38,0],[0.60,0,-32,0],[0.86,0,0,0]],
    handL:  [[0,0,0,0],[0.10,40,0,10],[0.16,78,-18,14],[0.30,90,8,14],[0.38,94,36,14],[0.60,92,30,14],[0.72,40,10,8],[0.86,0,0,0]],
    upperArmR:[[0,0,0,0],[0.16,-20,0,-15],[0.38,20,0,-30],[0.60,16,0,-25],[0.86,0,0,0]],
    thighL: [[0,0,0,0],[0.16,-6,0,0],[0.32,-26,0,0],[0.40,-30,0,0],[0.60,-27,0,0],[0.86,0,0,0]],
    shinL:  [[0,0,0,0],[0.16,12,0,0],[0.32,22,0,0],[0.40,24,0,0],[0.86,0,0,0]],
    thighR: [[0,0,0,0],[0.16,-10,0,0],[0.32,16,0,0],[0.40,20,0,0],[0.60,18,0,0],[0.86,0,0,0]],
    shinR:  [[0,0,0,0],[0.16,22,0,0],[0.32,10,0,0],[0.40,8,0,0],[0.86,0,0,0]] };
  const attack=clip('attack',0.86,A,base,hb);
  return {idle, run, attack, hitT:0.38};
}
function buildModelCharacter(i, M){
  const L=LOOK[i]; const sk=buildModelSkeleton(M);
  const n=M.count, q=b64(M.pos,Uint16Array), nn=b64(M.nor,Int8Array), uq=b64(M.uv,Uint16Array);
  const pos=new Float32Array(n*3), nor=new Float32Array(n*3), uv=new Float32Array(n*2);
  for(let k=0;k<n;k++){ for(let a=0;a<3;a++){ pos[k*3+a]=M.lo[a]+q[k*3+a]/65535*M.sc[a]; nor[k*3+a]=nn[k*3+a]/127; }
    uv[k*2]=uq[k*2]/65535; uv[k*2+1]=uq[k*2+1]/65535; }
  const si=b64(M.si,Uint8Array), sw=b64(M.sw,Uint8Array), swf=new Float32Array(sw.length); for(let k=0;k<sw.length;k++) swf[k]=sw[k]/255;
  const geo=new T.BufferGeometry();
  geo.setAttribute('position',new T.BufferAttribute(pos,3)); geo.setAttribute('normal',new T.BufferAttribute(nor,3));
  geo.setAttribute('uv',new T.BufferAttribute(uv,2));
  geo.setAttribute('skinIndex',new T.Uint16BufferAttribute(Array.from(si),4)); geo.setAttribute('skinWeight',new T.BufferAttribute(swf,4));
  geo.setIndex(new T.BufferAttribute(b64(M.idx,Uint16Array),1));
  const img=new Image(); const tex=new T.Texture(img); tex.flipY=false; tex.colorSpace=T.SRGBColorSpace; tex.anisotropy=4;
  img.onload=()=>{ tex.needsUpdate=true; }; img.src=M.tex;
  if(!GRAD) GRAD=gradientTex();
  const mat=new T.MeshToonMaterial({map:tex, gradientMap:GRAD});
  const body=new T.SkinnedMesh(geo, mat); body.name='body';
  // 線画はテクスチャに入っているので、輪郭用の拡大メッシュは使わない（薄い布が黒く割れて見えるため）
  const group=new T.Group(); group.name='hero'+i;
  body.add(sk.bones.root);
  const skeleton=new T.Skeleton(sk.list); body.bind(skeleton);
  body.frustumCulled=false; group.add(body);
  // 槍の穂先（命中位置）を左手の骨につける
  const hj=M.joints.handL, tip=new T.Object3D(); tip.position.set(0.86-hj[0], 2.83-hj[1], 0.63-hj[2]); sk.bones.handL.add(tip); group.userData.tip=tip;
  const mixer=new T.AnimationMixer(sk.bones.root); const C=makeModelClips(M);
  const acts={ idle:mixer.clipAction(C.idle), run:mixer.clipAction(C.run), attack:mixer.clipAction(C.attack) };
  acts.attack.setLoop(T.LoopOnce,1); acts.attack.clampWhenFinished=true; acts.idle.play();
  return {i, L, group, body, skeleton, bones:sk.bones, mixer, acts, hitT:C.hitT, state:'idle', cur:acts.idle};
}

/* ---------- キャラ1体をつくる ---------- */
function buildCharacter(i){
  const M=window.SORAIRO_MODELS && window.SORAIRO_MODELS[i]; if(M) return buildModelCharacter(i, M);
  const L=LOOK[i]; const sk=buildSkeleton();
  const group=new T.Group(); group.name='hero'+i;
  const geo=buildBody(L, sk);
  const mat=toon({vertexColors:true});
  const body=new T.SkinnedMesh(geo, mat); body.name='body';
  const outline=new T.SkinnedMesh(geo, outlineMat(0.022,true)); outline.name='bodyOutline';
  const root=sk.bones.root; body.add(root);
  const skeleton=new T.Skeleton(sk.list);
  body.bind(skeleton); outline.bind(skeleton, body.bindMatrix);
  body.frustumCulled=false; outline.frustumCulled=false;
  group.add(body); group.add(outline);
  buildHead(L, sk, group); buildWeapon(L, sk, group);
  const mixer=new T.AnimationMixer(root);
  const C=makeClips(L);
  const acts={ idle:mixer.clipAction(C.idle), run:mixer.clipAction(C.run), attack:mixer.clipAction(C.attack) };
  acts.attack.setLoop(T.LoopOnce,1); acts.attack.clampWhenFinished=true;
  acts.idle.play();
  return {i, L, group, body, skeleton, bones:sk.bones, mixer, acts, hitT:C.hitT, state:'idle', cur:acts.idle};
}

/* =====================================================================
   画面への組み込み
   ===================================================================== */
let renderer=null, scene=null, cam=null, canvas=null, chars={}, game=null, enabled=false, lastT=0, raf=0, W=0, H=0;
const stat={frames:0, ms:0, attacks:0, hits:0, damageOnly:0};
function ensure(){
  if(renderer) return true;
  try{
    canvas=document.createElement('canvas'); canvas.id='scene3d';
    canvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:3';
    document.getElementById('battle').appendChild(canvas);
    renderer=new T.WebGLRenderer({canvas, antialias:true, alpha:true, powerPreference:'low-power'});
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio||1));
    renderer.outputColorSpace=T.SRGBColorSpace;
    GRAD=gradientTex();
    scene=new T.Scene();
    scene.add(new T.HemisphereLight(0xFFF4E8, 0x5A4A70, 1.6));
    const sun=new T.DirectionalLight(0xFFFFFF, 1.8); sun.position.set(-200,400,500); scene.add(sun);
    const rim=new T.DirectionalLight(0xC8B8FF, 0.9); rim.position.set(300,200,-400); scene.add(rim);
    cam=new T.OrthographicCamera(-1,1,1,-1,-3000,3000); cam.position.set(0,0,1000);
    resize();
    window.addEventListener('resize', resize);
    return true;
  }catch(e){ console.warn('3D init failed', e); renderer=null; return false; }
}
function resize(){ if(!renderer) return; const r=document.getElementById('battle').getBoundingClientRect(); W=r.width; H=r.height;
  renderer.setSize(W,H,false); cam.left=-W/2; cam.right=W/2; cam.top=H/2; cam.bottom=-H/2; cam.updateProjectionMatrix(); }
function toWorld(px,py){ return new T.Vector3(px-W/2, H/2-py, 0); }
function toScreen(v){ const p=v.clone().project(cam); return {x:(p.x+1)/2*W, y:(1-p.y)/2*H}; }

function attach(i){
  if(chars[i]) return chars[i];
  const c=buildCharacter(i);
  const tilt=new T.Group(); tilt.rotation.x=0.30; // 少し上から見下ろす角度
  const face=new T.Group(); face.add(c.group); tilt.add(face);
  c.tilt=tilt; c.face=face; c.yaw=0.85; face.rotation.y=c.yaw;
  scene.add(tilt); chars[i]=c; return c;
}
function syncParty(){
  if(!enabled) return;
  const els=[...document.querySelectorAll('#party .mini')];
  const want=new Set();
  for(const el of els){ const i=+el.dataset.heroTap; if(!window.Sorairo3D.has(i)) continue; want.add(i);
    el.classList.add('mini3d'); const c=attach(i); c.el=el; c.tilt.visible=true; }
  for(const k in chars) if(!want.has(+k)) chars[k].tilt.visible=false;
}
function setAct(c,name,fade=0.12){ const a=c.acts[name]; if(c.cur===a) return; a.reset(); a.enabled=true; a.setEffectiveWeight(1); a.play(); c.cur.crossFadeTo(a,fade,false); c.cur=a; }
function place(c,dt){
  const el=c.el; if(!el||!el.isConnected){ c.tilt.visible=false; return; }
  const br=document.getElementById('battle').getBoundingClientRect(), fr=el.querySelector('.floor').getBoundingClientRect(), mr=el.getBoundingClientRect();
  const fx=fr.left-br.left+fr.width/2, fy=fr.top-br.top+fr.height*0.45;
  const scale=(mr.width*1.08)/2.85;
  const p=toWorld(fx,fy); const z=fy; // 手前ほど前に
  if(c.prevX!==undefined){ const vx=(fx-c.prevX)/Math.max(dt,1e-3);
    if(c.state!=='attack'){ const moving=Math.abs(vx)>25; setAct(c, moving?'run':'idle', 0.1);
      if(moving) c.yawT = vx>0? 0.95 : -0.95; else if(!c.el._busy) c.yawT=0.85; } }
  c.prevX=fx;
  if(c.state==='attack') c.yawT=1.30;
  c.yaw += ((c.yawT??0.85)-c.yaw)*Math.min(1,dt*12); c.face.rotation.y=c.yaw;
  c.tilt.position.set(p.x,p.y,z); c.tilt.scale.setScalar(scale);
  // 髪の揺れ（二次的な動き）
  const hb=c.group.userData.hairBack; if(hb){ const v=c.state==='attack'?0.25:0.08; hb.rotation.x = 0.08 + Math.sin(performance.now()/420)*v*0.4 + (c.state==='attack'?0.18:0); }
  const orb=c.group.userData.orb; if(orb){ orb.material.emissiveIntensity = 0.8 + Math.sin(performance.now()/260)*0.25 + (c.state==='attack'?0.6:0); }
}
function loop(t){
  raf=requestAnimationFrame(loop);
  if(!enabled || document.hidden) { lastT=t; return; }
  const dt=Math.min(0.05,(t-lastT)/1000||0.016); lastT=t;
  const r=document.getElementById('battle').getBoundingClientRect(); if(Math.abs(r.width-W)>1||Math.abs(r.height-H)>1) resize();
  for(const k in chars){ const c=chars[k]; if(!c.tilt.visible) continue;
    const before=c.acts.attack.time;
    c.mixer.update(c.hitStop>0? 0 : dt); if(c.hitStop>0) c.hitStop-=dt;
    if(c.state==='attack'){
      const a=c.acts.attack;
      if(!c.hitDone && a.time>=c.hitT){ c.hitDone=true; onHit(c); }
      if(a.time>=a.getClip().duration-1e-3 || !a.isRunning()){ c.state='idle'; setAct(c,'idle',0.18); c.onEnd&&c.onEnd(); c.onEnd=null; }
    }
    place(c,dt);
  }
  const t0=performance.now(); renderer.render(scene,cam); stat.ms+=performance.now()-t0; stat.frames++;
}
function tipScreen(c){ const tp=c.group.userData.tip; if(!tp) return null; const v=new T.Vector3(); tp.getWorldPosition(v); return toScreen(v); }
function onHit(c){
  stat.hits++;
  const g=game, tip=tipScreen(c)||{x:W*.6,y:H*.5};
  if(c.pending){ const d=c.pending; c.pending=null;
    if(c.L.attack==='cast') g.shoot(c.i, d, tip, 'water');              // 弾が届いた時に命中
    else { g.strike(c.i, d, tip, c.L.attack==='punch'?'punch':c.L.attack==='thrust'?'spear':'scythe'); c.hitStop=0.06; } }
}
/* 攻撃（ゲーム側から呼ばれる）。モーション中ならダメージだけ入れる */
function attack(i, dmg){
  const c=chars[i]; if(!enabled||!c||!c.el||!c.tilt.visible) return false;
  const el=c.el;
  if(el._busy || c.state==='attack'){ stat.damageOnly++; game.quick(i,dmg); return true; }
  el._busy=true; stat.attacks++;
  const start=()=>{ c.state='attack'; c.hitDone=false; c.pending=dmg; setAct(c,'attack',0.08); };
  if(c.L.melee){
    const br=document.getElementById('battle').getBoundingClientRect(), er=document.getElementById('enemy').getBoundingClientRect(), fr=el.querySelector('.floor').getBoundingClientRect();
    const mv=el.querySelector('.mover'); const cur=game.curPos(mv);
    const reach = c.L.attack==='sweep'? 0.42 : c.L.attack==='thrust'? 0.10 : 0.30; // 武器の長さに合わせて止まる位置を変える
    // 槍は長いので、穂先が敵に届く距離（槍の長さぶん手前）で止まる
    const stopX = c.L.attack==='thrust' ? er.left-br.left+er.width*0.12-(el.getBoundingClientRect().width*1.08/2.85)*1.15 : er.left-br.left+er.width*reach;
    const tx=stopX-(fr.left-br.left+fr.width/2)+cur[0];
    const ty=((er.bottom-br.top-er.height*0.12)-(fr.top-br.top))*0.5+cur[1];
    game.moveMini(el,tx,ty,260,()=>{ start(); c.onEnd=()=>{ game.moveMini(el,0,0,340,()=>{ el._busy=false; }); }; });
  } else { start(); c.onEnd=()=>{ el._busy=false; }; }
  return true;
}
window.Sorairo3D={
  available:true, chars, stat, LOOK,
  has:(i)=>!!LOOK[i] && (!LOOK[i].model || !!(window.SORAIRO_MODELS&&window.SORAIRO_MODELS[i])),
  enabled:()=>enabled,
  enable(on, api){ game=api||game; if(on){ if(!ensure()) return false; enabled=true; document.body.classList.add('use3d'); if(!raf) raf=requestAnimationFrame(loop); syncParty(); }
    else { enabled=false; document.body.classList.remove('use3d'); document.querySelectorAll('.mini3d').forEach(e=>e.classList.remove('mini3d')); for(const k in chars) chars[k].tilt.visible=false; if(renderer) renderer.clear(); }
    return true; },
  syncParty, attack,
  /* テスト用：骨と輪郭の確認 */
  _debug:{ T, buildCharacter, makeModelClips, scene:()=>scene, cam:()=>cam, renderer:()=>renderer },
};
})();
