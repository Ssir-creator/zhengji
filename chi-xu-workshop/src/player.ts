import {Quaternion,Vector3} from 'three';
import {evaluate,poseError,type Manifest,type Poses,type Tool,type Axis} from './core';
export const chapters=[
 {title:'腾出一点位置',short:'腾位置',objective:'把两颗标记牙挪到位，为下一步做好准备。',start:'先点①号任务牙，再按「顺着箭头」跟着绿色箭头慢慢挪。①完成后，换②。',reward:'第一步，完成！',next:'接下来，把那颗歪着的牙挪正。'},
 {title:'把这颗牙挪正',short:'挪正它',objective:'先把①挪到位，再转一转，让方向也对齐。',start:'先用「挪一挪」调整位置。位置好了，再切换「转一转」。',reward:'位置和方向，都好了！',next:'最后一起检查，再做一点小调整。'},
 {title:'一起检查一下',short:'一起看',objective:'调整①②③，带盾牌的那颗保持不动。',start:'先调整①和②，再把③挪正、转正。带盾牌的牙不用动。',reward:'三个小挑战，全完成！',next:'回看刚才的变化，或者再自由试一试。'}
];
export const circles=['①','②','③'];
export function taskName(m:Manifest,level:number,id:string){const i=m.levels[level-1].allowed_teeth.indexOf(id);return i<0?'这颗牙':`${circles[i]}号任务牙`;}
export function guidance(m:Manifest,level:number,poses:Poses,start:Poses,selected:string|null,tool:Tool,axis:Axis){
 const config=m.levels[level-1],goals=evaluate(poses,start,m,level),tasks=goals.filter(g=>config.allowed_teeth.includes(g.id));
 const ready=goals.every(g=>g.passed),active=tasks.find(g=>g.id===selected),nextId=tasks.find(g=>!g.passed)?.id??config.allowed_teeth[0];
 let sign:1|-1=1;
 if(selected&&config.target_pose[selected]){
  const target=config.target_pose[selected],p=poses[selected];const i=['X','Y','Z'].indexOf(axis);
  if(tool==='translate')sign=target.translation[i]-p.translation[i]<0?-1:1;
  else{const q=new Quaternion(...target.quaternion).multiply(new Quaternion(...p.quaternion).invert()).normalize();if(q.w<0)q.set(-q.x,-q.y,-q.z,-q.w);const direction=new Vector3(q.x,q.y,q.z).getComponent(i);sign=direction<0?-1:1;}
 }
 const name=selected?taskName(m,level,selected):'';
 let heading='',text='',action:'select'|'rotate'|'next'|'review'|'move'='move';
 if(ready){heading='都调整好了！';text='点击「检查一下」，保存这一关的结果。';action='review';}
 else if(!active){heading='这颗先不用动';text=`点一下「${taskName(m,level,nextId)}」，回到本关要调整的牙。`;action='select';}
 else if(active.passed){heading=`${name}，好了！`;const next=tasks.find(g=>!g.passed);text=next?`接着调整${taskName(m,level,next.id)}。`:'标记牙已到位，检查一下其他牙是否保持原样。';action=next?'next':'review';}
 else if(active.position_ok&&!active.rotation_ok&&tool==='translate'){heading='位置好了，再转一转';text='切换到「转一转」，继续按箭头微调方向。';action='rotate';}
 else if(!active.position_ok&&active.rotation_ok&&tool==='rotate'){heading='方向好了，再挪一点';text='切换到「挪一挪」，把位置也调整好。';action='move';}
 else{heading=`现在调整${name}`;text=tool==='translate'?'按「顺着箭头」跟着绿色箭头挪一点，观察位置条；挪过头了，可以反向或撤销。':'按「顺着箭头」跟着绿色箭头转一点，观察方向条；可以随时撤销。';}
 const progress=(id:string,kind:'position'|'rotation')=>{const g=tasks.find(g=>g.id===id)!;if(g[kind==='position'?'position_ok':'rotation_ok'])return 1;const original=poseError(start[id],{...config.target_pose[id],pivot:start[id].pivot})[kind];return Math.max(0,Math.min(.98,1-g[kind]/Math.max(original,config.tolerances[kind])));};
 return{tasks,ready,active,nextId,sign,heading,text,action,progress,completed:tasks.filter(g=>g.passed).length};
}
