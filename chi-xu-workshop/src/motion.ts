import {Vector3,type Camera} from 'three';
import type {Axis,Tool} from './core';
export type MotionCue=ReturnType<typeof motionCue>;
/** Project the actual world axis; labels describe the current screen, never anatomy. */
export function motionCue(camera:Camera,origin:Vector3,radius:number,axis:Axis,sign:number,tool:Tool,width:number,height:number){
 const project=(v:Vector3)=>{const p=v.clone().project(camera);return{x:(p.x+1)*width/2,y:(1-p.y)*height/2};};
 const center=project(origin),normal=new Vector3().setComponent(['X','Y','Z'].indexOf(axis),1);
 let points:{x:number;y:number}[]=[],forward='',back='',symbol='',depth=false;
 if(tool==='translate'){
  const end=project(origin.clone().addScaledVector(normal,radius*sign));
  const dx=end.x-center.x,dy=end.y-center.y,length=Math.hypot(dx,dy);
  depth=length<8;
  if(depth){
   const toward=normal.clone().multiplyScalar(sign).dot(camera.getWorldDirection(new Vector3()))<0;
   forward=toward?'朝向你挪':'远离你挪';back=toward?'远离你挪':'朝向你挪';symbol=toward?'⊙':'⊗';
  }else{
   const horizontal=Math.abs(dx)/length>.38?(dx>0?'右':'左'):'';
   const vertical=Math.abs(dy)/length>.38?(dy>0?'下':'上'):'';
   const opposite=(s:string)=>({右:'左',左:'右',上:'下',下:'上'}[s]??'');
   forward=`向${horizontal}${vertical}挪`;back=`向${opposite(horizontal)}${opposite(vertical)}挪`;
   symbol=horizontal&&vertical?(dx>0?(dy>0?'↘':'↗'):(dy>0?'↙':'↖')):horizontal?(dx>0?'→':'←'):(dy>0?'↓':'↑');
   points=[{x:center.x+dx/length*28,y:center.y+dy/length*28},{x:center.x+dx/length*96,y:center.y+dy/length*96}];
  }
 }else{
  const radial=axis==='X'?new Vector3(0,1,0):new Vector3(1,0,0);
  points=Array.from({length:33},(_,i)=>project(origin.clone().addScaledVector(radial.clone().applyAxisAngle(normal,sign*i/32*Math.PI*1.35),radius)));
  const a=points[0],b=points[8],cross=(a.x-center.x)*(b.y-center.y)-(a.y-center.y)*(b.x-center.x);
  const edgeOn=Math.abs(cross)<30;
  forward=edgeOn?'沿弧线转':cross>0?'顺时针转':'逆时针转';back=edgeOn?'反着弧线转':cross>0?'逆时针转':'顺时针转';symbol=edgeOn?'⤾':cross>0?'↻':'↺';
 }
 const path=points.map((p,i)=>`${i?'L':'M'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
 return{center,points,path,forward,back,symbol,depth};
}
