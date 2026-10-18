/** Prepare display-only LODs from actual STL files. Originals, units and labels are never inferred or changed. */
import {readFile,readdir,mkdir,writeFile,copyFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {BufferGeometry,BufferAttribute,Vector3} from 'three';
import {STLLoader} from 'three/addons/loaders/STLLoader.js';
import {MeshoptSimplifier} from 'meshoptimizer';
import {defaultLevels} from '../src/core.ts';
const args=process.argv.slice(2);const arg=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d;
const source=path.resolve(arg('--source','local-assets/initial'));const output=path.resolve(arg('--out','public/cases/initial'));
const sha=b=>createHash('sha256').update(b).digest('hex');
await MeshoptSimplifier.ready;
const files=(await readdir(source)).filter(n=>/^[0-9]+\.stl$/i.test(n)).sort((a,b)=>Number.parseInt(a)-Number.parseInt(b));
if(files.length!==28||!['3.stl','4.stl','5.stl','6.stl','7.stl'].every(f=>files.includes(f)))throw Error('Need the 28 original numbered STL files; do not remap by array index.');
for(const folder of ['original','desktop','low'])await mkdir(path.join(output,folder),{recursive:true});
try{const previous=JSON.parse(await readFile(path.join(output,'manifest.json'),'utf8'));if(previous.generated_by!=='chi-xu-prepare-case-v1')throw Error('Refusing to replace an existing hand-authored manifest.');}catch(e){if(e.code!=='ENOENT')throw e;}
const samples={},prepared={},teeth=[],report=[];const bboxMin=[Infinity,Infinity,Infinity],bboxMax=[-Infinity,-Infinity,-Infinity];
function glb(id,positions,indices,pivot,checksum){
 const used=[...new Set(indices)],map=new Map(used.map((v,i)=>[v,i]));const compact=new Float32Array(used.flatMap(i=>Array.from(positions.subarray(i*3,i*3+3))));const index=new Uint32Array(Array.from(indices,i=>map.get(i)));
 const g=new BufferGeometry();g.setAttribute('position',new BufferAttribute(compact,3));g.setIndex(new BufferAttribute(index,1));g.computeVertexNormals();g.computeBoundingBox();const normals=g.getAttribute('normal').array;
 const buffers=[Buffer.from(compact.buffer),Buffer.from(normals.buffer),Buffer.from(index.buffer)];const bin=Buffer.concat(buffers);const offsets=[0,buffers[0].length,buffers[0].length+buffers[1].length];
 const json={asset:{version:'2.0',generator:'chi-xu-workshop / meshoptimizer 0.24 / original STL display derivative'},scene:0,scenes:[{nodes:[0]}],nodes:[{name:`DEN_tooth_mesh${id}`,mesh:0,translation:pivot,extras:{mesh_id:id,source_sha256:checksum,role:'display_only',unit:'u'}}],meshes:[{name:`DEN_tooth_mesh${id}`,primitives:[{attributes:{POSITION:0,NORMAL:1},indices:2,material:0}]}],materials:[{name:'DEN_natural_ivory',pbrMetallicRoughness:{baseColorFactor:[.95,.93,.87,1],metallicFactor:0,roughnessFactor:.32},doubleSided:true}],buffers:[{byteLength:bin.length}],bufferViews:buffers.map((b,i)=>({buffer:0,byteOffset:offsets[i],byteLength:b.length,target:i===2?34963:34962})),accessors:[{bufferView:0,componentType:5126,count:used.length,type:'VEC3',min:g.boundingBox.min.toArray(),max:g.boundingBox.max.toArray()},{bufferView:1,componentType:5126,count:used.length,type:'VEC3'},{bufferView:2,componentType:5125,count:index.length,type:'SCALAR'}]};
 const raw=Buffer.from(JSON.stringify(json));const padded=Buffer.alloc(Math.ceil(raw.length/4)*4,32);raw.copy(padded);const file=Buffer.alloc(12+8+padded.length+8+bin.length);file.writeUInt32LE(0x46546c67,0);file.writeUInt32LE(2,4);file.writeUInt32LE(file.length,8);file.writeUInt32LE(padded.length,12);file.writeUInt32LE(0x4e4f534a,16);padded.copy(file,20);const offset=20+padded.length;file.writeUInt32LE(bin.length,offset);file.writeUInt32LE(0x004e4942,offset+4);bin.copy(file,offset+8);g.dispose();return file;
}
for(const filename of files){
 const id=path.parse(filename).name;const bytes=await readFile(path.join(source,filename));const checksum=sha(bytes);const input=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);const g=new STLLoader().parse(input);g.computeBoundingBox();const pivot=g.boundingBox.getCenter(new Vector3()).toArray();const attribute=g.getAttribute('position');const all=attribute.array;const count=attribute.count/3;
 for(let i=0;i<3;i++){bboxMin[i]=Math.min(bboxMin[i],g.boundingBox.min.getComponent(i));bboxMax[i]=Math.max(bboxMax[i],g.boundingBox.max.getComponent(i));}
 // samples come exclusively from raw triangles, not the display LOD
 const rawSamples=[];for(let s=0;s<Math.min(count,256);s++){const face=Math.floor(s*count/Math.min(count,256));const p=[0,0,0];for(let k=0;k<3;k++)for(let axis=0;axis<3;axis++)p[axis]+=(all[face*9+k*3+axis]-pivot[axis])/3;rawSamples.push(p);}
 samples[id]={source_sha256:checksum,method:'original_STL_uniform_face_index_triangle_centroid',sample_count:rawSamples.length,points:rawSamples};
 // Exact coordinate welding; no rounding, no dental reconstruction, no hole filling.
 const unique=[],indices=[],map=new Map();for(let i=0;i<all.length;i+=3){const key=`${all[i]},${all[i+1]},${all[i+2]}`;let index=map.get(key);if(index===undefined){index=unique.length/3;map.set(key,index);unique.push(all[i]-pivot[0],all[i+1]-pivot[1],all[i+2]-pivot[2]);}indices.push(index);}
 const positions=new Float32Array(unique),index=new Uint32Array(indices);const scale=MeshoptSimplifier.getScale(positions,3);const variants={};
 for(const [name,target] of [['desktop',6000],['low',3000]]){
  const [reduced,error]=MeshoptSimplifier.simplify(index,positions,3,Math.min(index.length,target*3),.005,['LockBorder']);
  const data=glb(id,positions,reduced,pivot,checksum);const uri=`${name}/DEN_tooth_mesh${id}_${name==='desktop'?'LOD1':'LOD2'}.glb`;await writeFile(path.join(output,uri),data);
  variants[name]={uri,checksum:sha(data),triangles:reduced.length/3,bytes:data.length,relative_error:error,error_estimate_u:error*scale};
 }
 const dest=path.join(output,'original',filename);try{const old=await readFile(dest);if(sha(old)!==checksum)throw Error(`Refusing to overwrite different original ${filename}`);}catch(e){if(e.code!=='ENOENT')throw e;await copyFile(path.join(source,filename),dest);}
 prepared[id]={pivot,original_triangles:count,original_checksum:checksum,...variants};
 teeth.push({mesh_id:id,mesh_uri:`original/${filename}`,checksum,jaw_group:'unknown',FDI:null,origin:[0,0,0],source:'用户上传 initial.zip；保持原始文件编号；数据原始出处待项目方核对',usage_status:'用户提供用于本项目开发；后续发布使用范围待核对'});
 report.push({mesh_id:id,original_triangles:count,...variants});g.dispose();
 console.log(`${filename}: ${count} -> desktop ${variants.desktop.triangles}, low ${variants.low.triangles}`);
}
const sampleData=Buffer.from(JSON.stringify({schema_version:1,sampling_method:'original_STL_uniform_face_index_triangle_centroid',samples}));await writeFile(path.join(output,'surface-samples.json'),sampleData);
const center=bboxMin.map((v,i)=>(v+bboxMax[i])/2);const size=Math.hypot(...bboxMin.map((v,i)=>bboxMax[i]-v));const target=center;
const camera=(direction,up)=>({position:target.map((v,i)=>v+direction[i]*size),target:[...target],up});
const manifest={generated_by:'chi-xu-prepare-case-v1',case_id:'initial-uploaded-28',asset_version:'initial-0fbacc34-lod-v1',config_version:'prd-v1-provisional',unit:'u',unit_confirmed:false,scale:1,source:'用户于2026-10-18上传initial.zip；原始数据来源待核对',usage_status:'仅本项目开发；正式发布使用范围待核对',teaching_reviewed:false,adjacency_confirmed:false,adjacency:[],camera_reviewed:false,camera_labels:{overview:'整体斜视',occlusal:'坐标俯视 (+Z)',front:'坐标观察 (−X)',side:'坐标观察 (−Y)'},cameras:{overview:camera([-.75,-.4,.85],[0,0,1]),occlusal:camera([0,0,1.9],[1,0,0]),front:camera([-1.9,0,.1],[0,0,1]),side:camera([0,-1.9,.1],[0,0,1])},teeth,levels:defaultLevels(),prepared_assets:prepared,surface_samples:{uri:'surface-samples.json',checksum:sha(sampleData)}};
await writeFile(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
await mkdir('docs',{recursive:true});await writeFile('docs/lod-report.json',JSON.stringify({generator:'meshoptimizer 0.24.0',algorithm:'indexed QEM / exact coordinate weld / LockBorder',target_relative_error:.005,clinical_accuracy_validated:false,original_triangles:report.reduce((s,r)=>s+r.original_triangles,0),desktop_triangles:report.reduce((s,r)=>s+r.desktop.triangles,0),low_triangles:report.reduce((s,r)=>s+r.low.triangles,0),desktop_bytes:report.reduce((s,r)=>s+r.desktop.bytes,0),low_bytes:report.reduce((s,r)=>s+r.low.bytes,0),surface_sample_bytes:sampleData.length,meshes:report},null,2)+'\n');
console.log('Prepared all actual crowns. FDI, unit, adjacency, jaws and teaching approval remain unconfirmed.');
