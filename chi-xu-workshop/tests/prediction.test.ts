import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {Matrix4,Vector3,Quaternion} from 'three';
import type {Manifest} from '../src/core';
import {referenceCase,freshReference,validateReferenceProgress,referencePoses,referenceStageReady,setReferenceStep,saveReferenceStage,type Prediction} from '../src/prediction';
const m=JSON.parse(readFileSync('public/cases/initial/manifest.json','utf8')) as Manifest;
const source=JSON.parse(readFileSync('public/cases/initial/prediction/reference.json','utf8')) as Prediction;
const pivots=Object.fromEntries(Object.entries(m.prepared_assets!).map(([id,a])=>[id,a.pivot]));
const data=referenceCase(source,m,pivots);
it('28颗的固定枢轴位姿与用户4×4世界变换等价，不重造任何顶点',()=>{
 for(const [id,target] of Object.entries(data.target)){
  const matrix=new Matrix4().set(...source.matrices['Tooth-'+id].flat() as Parameters<Matrix4['set']>);
  const point=new Vector3(...pivots[id]).add(new Vector3(1.17,-2.53,3.81));
  const actual=point.clone().sub(new Vector3(...target.pivot)).applyQuaternion(new Quaternion(...target.quaternion)).add(new Vector3(...target.pivot)).add(new Vector3(...target.translation));
  expect(actual.distanceTo(point.clone().applyMatrix4(matrix))).toBeLessThan(1e-10);
  expect(data.original[id].translation).toEqual([0,0,0]);expect(data.original[id].quaternion).toEqual([0,0,0,1]);
 }
 expect(data.groups.map(g=>g.length)).toEqual([9,9,10]);expect(new Set(data.groups.flat()).size).toBe(28);
});
it('缺牙、错误原始校验值、缩放、镜像和非有限矩阵均不能作为参考',()=>{
 for(const change of [
  (p:Prediction)=>{delete p.matrices['Tooth-3'];},
  (p:Prediction)=>{p.source_checksums['3']='0'.repeat(64);},
  (p:Prediction)=>{p.matrices['Tooth-3'][0][0]*=2;},
  (p:Prediction)=>{p.matrices['Tooth-3'][0]=p.matrices['Tooth-3'][0].map(v=>-v);},
  (p:Prediction)=>{p.matrices['Tooth-3'][0][0]=NaN;}
 ]){const invalid=structuredClone(source);change(invalid);expect(()=>referenceCase(invalid,m,pivots)).toThrow();}
});
it('只调好两颗不能完成第一批，三批连续结束时全部28颗等于预测目标',()=>{
 let p=freshReference(data);p=setReferenceStep(data,p,'3',10);p=setReferenceStep(data,p,'5',10);
 expect(referenceStageReady(data,p)).toBe(false);expect(()=>saveReferenceStage(data,p)).toThrow();
 for(const group of data.groups){
  const before=referencePoses(data,p);
  for(const id of group)p=setReferenceStep(data,p,id,10);
  const after=referencePoses(data,p);
  for(const id of Object.keys(before).filter(id=>!group.includes(id)))expect(after[id]).toEqual(before[id]);
  expect(referenceStageReady(data,p)).toBe(true);p=saveReferenceStage(data,p);expect(validateReferenceProgress(p,data)).toEqual(p);
 }
 expect(p.completed).toHaveLength(3);expect(referencePoses(data,p)).toEqual(data.target);
 expect(()=>setReferenceStep(data,p,'3',0)).toThrow();
});
it('未完成当前批不能修改后批，篡改前批或目标版本的存档被拒绝',()=>{
 const p=freshReference(data),before=structuredClone(p);
 expect(()=>setReferenceStep(data,p,data.groups[1][0],10)).toThrow();expect(p).toEqual(before);
 p.steps[data.groups[1][0]]=1;expect(()=>validateReferenceProgress(p,data)).toThrow();p.steps[data.groups[1][0]]=0;
 p.reference_id='old reference';expect(()=>validateReferenceProgress(p,data)).toThrow();
});
