import fs from 'fs';
import { MeshoptDecoder } from '/home/claude/zeux/meshoptimizer/js/meshopt_decoder.mjs';
await MeshoptDecoder.ready;
const [inp,outDir]=process.argv.slice(2);
const b=fs.readFileSync(inp);
const jl=b.readUInt32LE(12); const j=JSON.parse(b.subarray(20,20+jl).toString());
let off=20+jl; const bl=b.readUInt32LE(off); const bin=b.subarray(off+8,off+8+bl);
const views=j.bufferViews.map(v=>{
  const ext=v.extensions&&v.extensions.EXT_meshopt_compression;
  if(ext){ const src=bin.subarray(ext.byteOffset||0,(ext.byteOffset||0)+ext.byteLength); const dst=new Uint8Array(ext.count*ext.byteStride);
    MeshoptDecoder.decodeGltfBuffer(dst,ext.count,ext.byteStride,src,ext.mode,ext.filter); return Buffer.from(dst); }
  return bin.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength); });
fs.mkdirSync(outDir,{recursive:true});
const A=j.accessors, prim=j.meshes[0].primitives[0];
const dump=(name,ai)=>{ const a=A[ai], v=j.bufferViews[a.bufferView]; const buf=views[a.bufferView];
  fs.writeFileSync(`${outDir}/${name}.bin`, buf.subarray(a.byteOffset||0)); console.log(name,a.componentType,a.type,a.count,(v.byteStride||''),a.normalized||false); };
dump('pos',prim.attributes.POSITION); dump('nor',prim.attributes.NORMAL); dump('uv',prim.attributes.TEXCOORD_0); dump('idx',prim.indices);
j.images.forEach((im,i)=>{ fs.writeFileSync(`${outDir}/img${i}.${im.mimeType.split('/')[1]}`, views[im.bufferView]); });
console.log(JSON.stringify(j.nodes[0]));
