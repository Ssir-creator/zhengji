import { Box3, BufferGeometry, Vector3, Mesh, Quaternion } from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { validateManifest, type Manifest, type Vec3 } from './core';
export type Asset = {id:string;geometry:BufferGeometry;lowGeometry?:BufferGeometry;pivot:Vec3;samples:Vec3[];triangles:number;checksum:string};
export type CaseAssets={manifest:Manifest;assets:Asset[];signature:string;bundleBase?:string};
export async function loadCase(files:File[],progress:(text:string)=>void):Promise<CaseAssets>{
 const manifests=files.filter(f=>f.name.endsWith('.json'));
 if(manifests.length!==1)throw Error('请选择一个已填写的病例 JSON 和对应的 28 个 STL 文件。');
 const m=JSON.parse(await manifests[0].text()) as Manifest;validateManifest(m);
 const loaded:Asset[]=[];
 try{
 for(const [i,t] of m.teeth.entries()){
  progress(`核验并加载牙冠 ${i+1}/${m.teeth.length} · 模型 ${t.mesh_id}`);
  const matches=files.filter(f=>f.name===t.mesh_uri.split(/[\\/]/).pop());
  if(matches.length!==1)throw Error(`模型 ${t.mesh_id}：文件 ${t.mesh_uri} 缺失或重名。`);
  const f=matches[0];if(f.size>64*1024*1024)throw Error('单牙文件超过 64MB，请先检查资产。');
  const buffer=await f.arrayBuffer();const hash=await sha256(buffer);
  if(hash!==t.checksum.toLowerCase())throw Error(`模型 ${t.mesh_id} 的 SHA-256 与清单不一致，已停止加载。`);
  const geometry=new STLLoader().parse(buffer);const pos=geometry.getAttribute('position');
  if(!pos||pos.count<3||pos.count%3!==0||pos.count>6_000_000)throw Error(`模型 ${t.mesh_id} 的三角网格无效或超出导入上限。`);
  for(let n=0;n<pos.array.length;n++)if(!Number.isFinite(pos.array[n]))throw Error(`模型 ${t.mesh_id} 存在非有限坐标。`);
  geometry.computeBoundingBox();const box=geometry.boundingBox!;if(box.isEmpty()||box.getSize(new Vector3()).length()<1e-9)throw Error(`模型 ${t.mesh_id} 的几何为空。`);
  const pivot=box.getCenter(new Vector3());geometry.translate(-pivot.x,-pivot.y,-pivot.z);geometry.computeVertexNormals();geometry.computeBoundingSphere();
  const samples:Vec3[]=[];const count=pos.count/3;const take=Math.min(count,256);
  for(let n=0;n<take;n++){const tri=Math.floor(n*count/take)*3;const v=new Vector3();for(let k=0;k<3;k++)v.add(new Vector3().fromBufferAttribute(pos,tri+k));samples.push(v.multiplyScalar(1/3).toArray() as Vec3);}
  loaded.push({id:t.mesh_id,geometry,pivot:pivot.toArray() as Vec3,samples,triangles:count,checksum:hash});
  await new Promise(resolve=>setTimeout(resolve,0));
 }
 const box=new Box3();for(const a of loaded){const local=a.geometry.boundingBox!.clone().translate(new Vector3(...a.pivot));box.union(local);}if(box.getSize(new Vector3()).length()>1e7)throw Error('病例坐标范围异常，请核对坐标。');
 return{manifest:m,assets:loaded,signature:await sha256(new TextEncoder().encode(JSON.stringify(m)))};
 }catch(e){loaded.forEach(a=>a.geometry.dispose());throw e;}
}
async function sha256(bytes:BufferSource){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');}

/** Load verified display derivatives of the user-supplied STL case; source samples stay tied to original checksums. */
export async function loadBundledCase(progress:(text:string)=>void):Promise<CaseAssets>{
 const base='/cases/initial/';
 const response=await fetch(base+'manifest.json');if(!response.ok)throw Error('内置病例暂不可用；可以重试或选择本机 STL。');
 const manifest=await response.json() as Manifest;validateManifest(manifest);
 if(!manifest.prepared_assets||!manifest.surface_samples)throw Error('内置病例缺少已校验显示资源或原始表面采样。');
 const sampleBytes=await verifiedFetch(base,manifest.surface_samples.uri,manifest.surface_samples.checksum);
 const sampleData=JSON.parse(new TextDecoder().decode(sampleBytes));
 const loaded:Asset[]=[];
 try{
  for(const [i,tooth] of manifest.teeth.entries()){
   progress(`加载真实牙冠 ${i+1}/28 · 模型 ${tooth.mesh_id}`);
   const prepared=manifest.prepared_assets[tooth.mesh_id];if(!prepared||prepared.original_checksum!==tooth.checksum)throw Error('显示资产与原始网格校验值不一致。');
   const data=sampleData.samples?.[tooth.mesh_id];
   if(!data||data.source_sha256!==tooth.checksum||data.method!=='original_STL_uniform_face_index_triangle_centroid'||!Array.isArray(data.points)||data.points.length!==data.sample_count||data.points.length<1||data.points.length>256||data.points.some((p:unknown)=>!Array.isArray(p)||p.length!==3||p.some(v=>typeof v!=='number'||!Number.isFinite(v))))throw Error(`模型 ${tooth.mesh_id} 的原始表面采样无效。`);
   const geometry=await preparedGeometry(base,prepared.desktop,prepared.pivot,tooth.checksum);
   loaded.push({id:tooth.mesh_id,geometry,pivot:prepared.pivot,samples:data.points,triangles:prepared.original_triangles,checksum:tooth.checksum});
  }
  return{manifest,assets:loaded,signature:await sha256(new TextEncoder().encode(JSON.stringify(manifest))),bundleBase:base};
 }catch(e){loaded.forEach(a=>a.geometry.dispose());throw e;}
}
export async function loadLowVariants(data:CaseAssets,progress:(text:string)=>void){
 if(!data.bundleBase||!data.manifest.prepared_assets)return;
 for(const [i,a] of data.assets.entries()){
  if(a.lowGeometry)continue;progress(`加载轻量牙冠 ${i+1}/28`);
  const info=data.manifest.prepared_assets[a.id];a.lowGeometry=await preparedGeometry(data.bundleBase,info.low,info.pivot,a.checksum);
 }
}
export function disposeCase(data:CaseAssets){for(const a of data.assets){a.geometry.dispose();a.lowGeometry?.dispose();}}
async function verifiedFetch(base:string,uri:string,checksum:string){
 const root=new URL(base,location.href);const url=new URL(uri,root);
 if(url.origin!==location.origin||!url.pathname.startsWith(root.pathname)||!url.pathname.startsWith('/cases/'))throw Error('内置病例资源路径无效。');
 const response=await fetch(url);if(!response.ok)throw Error(`资源加载失败：${uri} (${response.status})`);
 const data=await response.arrayBuffer();if(await sha256(data)!==checksum.toLowerCase())throw Error(`内置资源 SHA-256 校验失败：${uri}`);return data;
}
async function preparedGeometry(base:string,variant:{uri:string;checksum:string;triangles:number},pivot:Vec3,originalChecksum:string){
 const buffer=await verifiedFetch(base,variant.uri,variant.checksum);
 const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
 const gltf=await new GLTFLoader().parseAsync(buffer,base);
 const meshes:InstanceType<typeof Mesh>[]=[];gltf.scene.traverse(o=>{if(o instanceof Mesh)meshes.push(o);});
 if(meshes.length!==1)throw Error('逐牙 GLB 必须有唯一网格。');
 const mesh=meshes[0];const geometry=mesh.geometry;
 const count=(geometry.index?.count??geometry.getAttribute('position').count)/3;
 if(count!==variant.triangles||mesh.userData.source_sha256!==originalChecksum||mesh.position.toArray().some((x,i)=>Math.abs(x-pivot[i])>1e-6)||mesh.quaternion.angleTo(new Quaternion())>1e-9||mesh.scale.toArray().some(x=>x!==1))throw Error('显示 GLB 的计数、来源或枢轴变换不一致。');
 const pos=geometry.getAttribute('position');for(const v of pos.array)if(!Number.isFinite(v))throw Error('显示网格存在无效坐标。');
 const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];materials.forEach(m=>m.dispose());
 geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
}
