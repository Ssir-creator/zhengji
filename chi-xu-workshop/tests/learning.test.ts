import {it,expect} from 'vitest';
import {manifest} from './fixtures';
import {initialPoses,copy,zQuaternion} from '../src/core';
import {stageLearning} from '../src/learning';
import {layoutMarkers} from '../src/markers';
it('学习反馈计算实际位移与转角，不修改起点、终点或目标配置',()=>{
 const m=manifest(),before=initialPoses(m,Object.fromEntries(m.teeth.map(t=>[t.mesh_id,[0,0,0] as [number,number,number]]))),after=copy(before);
 after['4'].translation=[0,0,0];after['4'].quaternion=zQuaternion(0);
 const original=JSON.stringify({m,before,after}),feedback=stageLearning(m,2,before,after);
 expect(feedback.changes[0].position).toBeCloseTo(4);expect(feedback.changes[0].rotation).toBeCloseTo(18);expect(feedback.unchanged).toBe(true);
 expect(JSON.stringify({m,before,after})).toBe(original);
 after['7'].translation[0]=1;expect(stageLearning(m,2,before,after).unchanged).toBe(false);
});
it.each([[1440,836,1100],[1024,704,724],[390,420,378]])('标记在 %i 宽度聚集时不重叠且留在视口内', (width,height,right)=>{
 const points=['3','5','6','7'].map((id,i)=>({id,x:width*.4,y:180+i*4}));
 const labels=layoutMarkers(points,{left:width*.3,right:width*.8,top:80,bottom:600},width,height,right);
 for(let i=0;i<labels.length;i++){
  const a=labels[i];expect(a.left).toBeGreaterThanOrEqual(0);expect(a.top).toBeGreaterThanOrEqual(0);expect(a.left+a.width).toBeLessThanOrEqual(right);expect(a.top+a.height).toBeLessThanOrEqual(height);
  for(const b of labels.slice(i+1))expect(a.left+a.width<=b.left||b.left+b.width<=a.left||a.top+a.height<=b.top||b.top+b.height<=a.top).toBe(true);
 }
});
