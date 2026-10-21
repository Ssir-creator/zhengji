import {poseError,type Manifest,type Poses} from './core';
export const lessons=[
 {title:'位置改变了，方向不一定改变',text:'这一关只练习沿允许的方向平移两颗任务牙。对照起点，观察两颗牙之间的位置关系；没有任务的牙应保持原样。',question:'如果把牙齿移动到位，但方向仍歪着，下一步还要检查什么？',answer:'还要单独检查朝向。平移与旋转是两种不同操作，下一关会分别练习。'},
 {title:'把位置和方向分开检查',text:'先平移，再旋转：位置条达标不等于方向也达标。切换前后画面，看看同一颗牙的朝向变化，而不只是中心的位置。',question:'为什么位置已经正确，还可能不能过关？',answer:'因为位置误差与朝向误差分别判断。两项都到达本关目标，且其他牙保持原样，才能保存。'},
 {title:'局部调整也要保留前面的结果',text:'本关接着上一关的全部位姿继续。观察三颗任务牙的微调，同时核对固定牙和第二关结果仍被保留。',question:'只把本关三颗牙调好，其他牙动了，可以直接保存吗？',answer:'不可以。还要检查固定牙、其他非任务牙和上一关应保留的结果。'}
];
export function stageLearning(m:Manifest,level:number,before:Poses,after:Poses){
 const config=m.levels[level-1];
 const changes=config.allowed_teeth.map(id=>({id,...poseError(before[id],after[id])}));
 const unchanged=Object.keys(before).filter(id=>!config.allowed_teeth.includes(id)).every(id=>{const delta=poseError(before[id],after[id]);return delta.position<=config.tolerances.fixed_position+1e-12&&delta.rotation<=config.tolerances.fixed_rotation+1e-9;});
 return{...lessons[level-1],changes,unchanged};
}
