import {Matrix4,Quaternion,Vector3} from 'three';
import {identity,poseError,type Manifest,type Pose,type Poses,type Vec3,type Quat} from './core';
export const PREDICTION_KEY='chi-xu-workshop:prediction:v1';
export type Prediction={schema_version:1;reference_id:string;source:string;archive_sha256:string;source_checksums:Record<string,string>;matrices:Record<string,number[][]>;clinical_reviewed:false};
export type ReferenceCase={reference:Prediction;original:Poses;target:Poses;groups:string[][]};
export type ReferenceProgress={schema:1;reference_id:string;stage:number;completed:string[];steps:Record<string,number>};
export function referenceCase(reference:Prediction,m:Manifest,pivots:Record<string,Vec3>):ReferenceCase{
 const ids=m.teeth.map(t=>t.mesh_id).sort((a,b)=>Number(a)-Number(b));
 if(reference.schema_version!==1||!reference.reference_id||reference.clinical_reviewed!==false||!/^[a-f0-9]{64}$/.test(reference.archive_sha256)||Object.keys(reference.matrices).sort().join('|')!==ids.map(id=>'Tooth-'+id).sort().join('|')||Object.keys(reference.source_checksums).sort().join('|')!==[...ids].sort().join('|'))throw Error('预测参考的版本或牙齿清单不完整。');
 const original:Poses={},target:Poses={};
 for(const tooth of m.teeth){
  const id=tooth.mesh_id,rows=reference.matrices['Tooth-'+id];
  if(reference.source_checksums[id]!==tooth.checksum||!pivots[id])throw Error('预测参考与原始牙模不匹配。');
  if(!Array.isArray(rows)||rows.length!==4||rows.some(row=>!Array.isArray(row)||row.length!==4||row.some(v=>!Number.isFinite(v)))||rows[3].some((v,i)=>Math.abs(v-(i===3?1:0))>1e-9))throw Error('预测变换矩阵无效。');
  for(let a=0;a<3;a++)for(let b=0;b<3;b++)if(Math.abs(rows[a].slice(0,3).reduce((sum,v,i)=>sum+v*rows[b][i],0)-(a===b?1:0))>1e-8)throw Error('预测变换包含缩放或形变。');
  const matrix=new Matrix4().set(...rows.flat() as Parameters<Matrix4['set']>);
  if(Math.abs(matrix.determinant()-1)>1e-8)throw Error('预测变换包含镜像或缩放。');
  const pivot=pivots[id];original[id]=identity(pivot);
  target[id]={pivot:[...pivot],translation:new Vector3(...pivot).applyMatrix4(matrix).sub(new Vector3(...pivot)).toArray() as Vec3,quaternion:new Quaternion().setFromRotationMatrix(matrix).normalize().toArray() as Quat};
 }
 return{reference,original,target,groups:[ids.slice(0,9),ids.slice(9,18),ids.slice(18)]};
}
export function freshReference(data:ReferenceCase):ReferenceProgress{return{schema:1,reference_id:data.reference.reference_id,stage:1,completed:[],steps:Object.fromEntries(Object.keys(data.original).map(id=>[id,0]))};}
export function validateReferenceProgress(value:unknown,data:ReferenceCase):ReferenceProgress{
 const p=value as ReferenceProgress,ids=Object.keys(data.original);
 if(!p||p.schema!==1||p.reference_id!==data.reference.reference_id||!Number.isInteger(p.stage)||p.stage<1||p.stage>3||!Array.isArray(p.completed)||p.completed.length>3||p.stage!==Math.min(3,p.completed.length+1)||p.completed.some(t=>typeof t!=='string'||!Number.isFinite(Date.parse(t)))||!p.steps||Object.keys(p.steps).sort().join('|')!==ids.sort().join('|'))throw Error('参考练习记录不兼容，原记录已保留。');
 for(const [i,group] of data.groups.entries())for(const id of group){const n=p.steps[id];if(!Number.isInteger(n)||n<0||n>10||(i<p.completed.length&&n!==10)||(i>p.stage-1&&n!==0))throw Error('参考练习包含越关或损坏的进度，原记录已保留。');}
 return structuredClone(p);
}
export function referencePoses(data:ReferenceCase,p:ReferenceProgress):Poses{
 return Object.fromEntries(Object.keys(data.original).map(id=>{
  const a=data.original[id],b=data.target[id],t=p.steps[id]/10;
  const pose:Pose=t===1?structuredClone(b):t===0?structuredClone(a):{pivot:[...a.pivot],translation:new Vector3(...b.translation).multiplyScalar(t).toArray() as Vec3,quaternion:new Quaternion(...a.quaternion).slerp(new Quaternion(...b.quaternion),t).normalize().toArray() as Quat};
  return[id,pose];
 }));
}
export function referenceStageReady(data:ReferenceCase,p:ReferenceProgress){
 const poses=referencePoses(data,p);
 return Object.keys(poses).every(id=>{
  const group=data.groups.findIndex(g=>g.includes(id)),target=group<=p.stage-1?data.target[id]:data.original[id],error=poseError(poses[id],target);
  return error.position<1e-8&&error.rotation<1e-5&&p.steps[id]===(group<=p.stage-1?10:0);
 });
}
export function setReferenceStep(data:ReferenceCase,p:ReferenceProgress,id:string,step:number){
 if(p.completed.length===3||!data.groups[p.stage-1].includes(id)||!Number.isInteger(step)||step<0||step>10)throw Error('本批只允许调整当前任务牙。');
 const next=structuredClone(p);next.steps[id]=step;return next;
}
export function saveReferenceStage(data:ReferenceCase,p:ReferenceProgress){
 if(p.completed.length===3||!referenceStageReady(data,p))throw Error('本批任务或已完成的参考位姿尚未满足。');
 const next=structuredClone(p);next.completed.push(new Date().toISOString());next.stage=Math.min(3,next.stage+1);return next;
}
