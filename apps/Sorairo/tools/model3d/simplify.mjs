import fs from 'fs';
import { MeshoptSimplifier } from './simp.mjs';
await MeshoptSimplifier.ready;
const [dir,target]=process.argv.slice(2);
const P=new Float32Array(fs.readFileSync(`${dir}/pos.bin`).buffer.slice(0));
const I=new Uint32Array(fs.readFileSync(`${dir}/idx.bin`).buffer.slice(0));
const UV=new Float32Array(fs.readFileSync(`${dir}/uv.bin`).buffer.slice(0));
const nv=P.length/3;
console.log('in tris',I.length/3,'verts',nv, Object.keys(MeshoptSimplifier));
const t0=Date.now();
let res;
if(MeshoptSimplifier.simplifyWithAttributes){
  // UV も考慮して崩れにくく
  res=MeshoptSimplifier.simplifyWithAttributes(I,P,3,UV,2,[0.5,0.5],null,(+target)*3,0.2,[]);
} else res=MeshoptSimplifier.simplify(I,P,3,(+target)*3,0.05,[]);
const [out,err]=res; console.log('out tris',out.length/3,'err',err,'ms',Date.now()-t0);
fs.writeFileSync(`${dir}/idx_s.bin`,Buffer.from(out.buffer,out.byteOffset,out.byteLength));
