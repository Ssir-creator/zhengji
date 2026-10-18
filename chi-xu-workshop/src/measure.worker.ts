import { Quaternion,Vector3 } from 'three';
import type { Poses,Vec3 } from './core';
self.onmessage=({data}:{data:{request:number;poses:Poses;samples:Record<string,Vec3[]>;pairs:[string,string][]}})=>{
 try{
 const transformed:Record<string,Vec3[]>={};
 for(const [id,samples] of Object.entries(data.samples)){const p=data.poses[id];transformed[id]=samples.map(s=>new Vector3(...s).applyQuaternion(new Quaternion(...p.quaternion)).add(new Vector3(...p.pivot)).add(new Vector3(...p.translation)).toArray() as Vec3);}
 const results=data.pairs.map(([a,b])=>{
  let min=Infinity;let endpoints:[Vec3,Vec3]|undefined;
  for(const p of transformed[a])for(const q of transformed[b]){const d=(p[0]-q[0])**2+(p[1]-q[1])**2+(p[2]-q[2])**2;if(d<min){min=d;endpoints=[p,q];}}
  if(!endpoints)throw Error('表面采样为空。');
  return{pair:[a,b],distance:Math.sqrt(min),endpoints,sample_count:transformed[a].length+transformed[b].length};
 });
 self.postMessage({request:data.request,results});
 }catch(e){self.postMessage({request:data.request,error:String(e)});}
};
