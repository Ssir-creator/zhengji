import { Quaternion, Vector3 } from 'three';
export type Vec3 = [number,number,number];
export type Quat = [number,number,number,number];
export type Pose = { translation:Vec3; quaternion:Quat; pivot:Vec3 };
export type Poses = Record<string,Pose>;
export type Axis = 'X'|'Y'|'Z';
export type Tool = 'translate'|'rotate';
export type Tooth = {mesh_id:string; mesh_uri:string; checksum:string; jaw_group:'upper'|'lower'|'unknown'; FDI:string|null; origin:Vec3; source:string; usage_status:string};
export type Level = { level_id:number; name:string; allowed_teeth:string[]; allowed_axes:Record<string,Record<Tool,Axis[]>>; target_pose:Record<string,{translation:Vec3;quaternion:Quat}>; bounds?:Record<string,Partial<Record<Tool,Partial<Record<Axis,[number,number]>>>>>; tolerances:{position:number;rotation:number;fixed_position:number;fixed_rotation:number}; required_checks:string[] };
export type PreparedVariant={uri:string;checksum:string;triangles:number;bytes:number;relative_error:number;error_estimate_u:number};
export type PreparedTooth={pivot:Vec3;original_triangles:number;original_checksum:string;desktop:PreparedVariant;low:PreparedVariant};
export type Manifest = {camera_reviewed?:boolean;camera_labels?:Record<string,string>;prepared_assets?:Record<string,PreparedTooth>;surface_samples?:{uri:string;checksum:string};case_id:string;asset_version:string;config_version:string;unit:'u'|'mm';unit_confirmed:boolean;scale:number;source:string;usage_status:string;teaching_reviewed:boolean;teeth:Tooth[];adjacency_confirmed:boolean;adjacency:[string,string][]; cameras?:Record<string,{position:Vec3;target:Vec3;up:Vec3}>;levels:Level[]};
export type Check = {check_id:string;status:'completed'|'not_computed'|'failed'|'not_applicable';method:string;value:number|null;unit:string;sample_count:number;reason:string;computed_at:string;asset_version:string;endpoints?:[Vec3,Vec3]};
export type Command = {command_id:string;type:Tool;mesh_id:string;before_pose:Pose;after_pose:Pose;time:string;stage:number;hint_level:number};
export type Snapshot = {schema_version:1;level_id:number;all_poses:Poses;goals:Goal[];check_results:Check[];completed_at:string;config_version:string;asset_version:string;unit:string;operations:number;hint_level:number};
export type Session = {schema_version:1;session_id:string;case_id:string;asset_version:string;config_version:string;current_level:number;mode:'challenge';initial:Poses;saved_snapshots:Snapshot[];command_log:Command[];events:{type:string;time:string;detail?:string}[];local_save_status:string};
export type Goal = {id:string;position:number;rotation:number;position_ok:boolean;rotation_ok:boolean;fixed:boolean;passed:boolean};
export const copy = <T>(a:T):T=>structuredClone(a);
const finiteArray=(a:unknown,n:number):a is number[]=>Array.isArray(a)&&a.length===n&&a.every(x=>typeof x==='number'&&Number.isFinite(x));
export const identity=(pivot:Vec3=[0,0,0]):Pose=>({translation:[0,0,0],quaternion:[0,0,0,1],pivot:[...pivot]});
export const zQuaternion=(degrees:number):Quat=>new Quaternion().setFromAxisAngle(new Vector3(0,0,1),degrees*Math.PI/180).toArray() as Quat;
export const unitLabel=(m:Manifest)=>m.unit==='mm'&&m.unit_confirmed?'mm':'u';
export const poseError=(a:Pose,b:Pose)=>({position:new Vector3(...a.translation).distanceTo(new Vector3(...b.translation)),rotation:new Quaternion(...a.quaternion).angleTo(new Quaternion(...b.quaternion))*180/Math.PI});
const tol={position:.35,rotation:3,fixed_position:.00001,fixed_rotation:.001};
export function defaultLevels():Level[]{
 const p=(x=0,y=0):{translation:Vec3;quaternion:Quat}=>({translation:[x,y,0],quaternion:[0,0,0,1]});
 const axes=(ids:string[],t:Axis[],r:Axis[])=>Object.fromEntries(ids.map(id=>[id,{translate:t,rotate:r}]));
 return [
 {level_id:1,name:'创造空间',allowed_teeth:['3','5'],allowed_axes:axes(['3','5'],['X'],[]),target_pose:{'3':p(1.5),'5':p(-1.5)},tolerances:{...tol},required_checks:['pose','fixed']},
 {level_id:2,name:'排齐错位牙',allowed_teeth:['4'],allowed_axes:axes(['4'],['Y'],['Z']),target_pose:{'4':p()},tolerances:{...tol},required_checks:['pose','fixed']},
 {level_id:3,name:'整体协调',allowed_teeth:['3','5','6'],allowed_axes:{...axes(['3','5'],['X'],[]),...axes(['6'],['Y'],['Z'])},target_pose:{'3':p(1),'5':p(-1),'6':p()},tolerances:{...tol},required_checks:['pose','fixed','stage2']}
 ];
}
export function validateManifest(m:Manifest):void{
 if(!m||!m.case_id||!m.asset_version||!m.config_version||!m.source||!m.usage_status)throw Error('病例、版本、来源和使用状态不能为空。');
 if(m.scale!==1)throw Error('当前导入器只接受保留原始坐标的 scale=1；请先核对缩放，不会自动归一化。');
 if(!['u','mm'].includes(m.unit)||typeof m.unit_confirmed!=='boolean'||typeof m.teaching_reviewed!=='boolean')throw Error('缺少单位或教学审核状态。');
 if(m.unit==='mm'&&!m.unit_confirmed)throw Error('毫米必须先核对原始单位；未核对请使用 u。');
 if(!Array.isArray(m.teeth)||m.teeth.length!==28)throw Error('该 PRD 病例必须包含 28 个独立牙冠；不补造缺失牙冠。');
 const ids=m.teeth.map(t=>t.mesh_id);
 if(ids.some(x=>typeof x!=='string'||!x)||new Set(ids).size!==28||['3','4','5','6','7'].some(id=>!ids.includes(id)))throw Error('请明确提供 28 个唯一模型编号，必须包括 3、4、5、6、7；编号不能由数组次序猜测。');
 if(new Set(m.teeth.map(t=>t.mesh_uri)).size!==28)throw Error('每颗牙须对应独立文件。');
 for(const t of m.teeth){if(!t.mesh_uri||!finiteArray(t.origin,3)||!['upper','lower','unknown'].includes(t.jaw_group)||!t.source||!t.usage_status||!/^([0-9a-f]{64})$/i.test(t.checksum))throw Error(`模型 ${t.mesh_id} 的文件、原点、来源、上下颌或 SHA-256 信息不完整。`);}
 if(!Array.isArray(m.adjacency)||typeof m.adjacency_confirmed!=='boolean'||m.adjacency.some(p=>!Array.isArray(p)||p.length!==2||p[0]===p[1]||p.some(id=>!ids.includes(id))))throw Error('邻接清单无效。');
 if(!Array.isArray(m.levels)||m.levels.length!==3)throw Error('必须配置连续三关。');
 const expected=[['3','5'],['4'],['3','5','6']];
 for(const [i,l] of m.levels.entries()){
  if(l.level_id!==i+1||!l.name||JSON.stringify([...l.allowed_teeth].sort())!==JSON.stringify(expected[i]))throw Error('关卡编号和任务牙必须遵循 PRD。');
  if(Object.keys(l.target_pose).sort().join(',')!==[...expected[i]].sort().join(','))throw Error('目标必须覆盖全部任务牙。');
  for(const id of l.allowed_teeth){
   const a=l.allowed_axes[id],p=l.target_pose[id];
   if(!a||!['translate','rotate'].every(k=>Array.isArray(a[k as Tool])&&a[k as Tool].every(x=>['X','Y','Z'].includes(x))))throw Error('允许轴配置无效。');
   if(!p||!finiteArray(p.translation,3)||!finiteArray(p.quaternion,4)||Math.abs(Math.hypot(...p.quaternion)-1)>1e-6)throw Error('目标位姿必须有限且使用单位四元数。');
  }
  if(!l.tolerances||Object.values(l.tolerances).some(v=>!Number.isFinite(v)||v<0)||Object.keys(tol).some(k=>!(k in l.tolerances)))throw Error('容差无效。');
  if(!Array.isArray(l.required_checks)||!l.required_checks.includes('pose')||!l.required_checks.includes('fixed')||l.required_checks.some(x=>!['pose','fixed','stage2','distance'].includes(x))||i===2&&!l.required_checks.includes('stage2'))throw Error('关键检查配置无效。');
  for(const toothBounds of Object.values(l.bounds??{}))for(const toolBounds of Object.values(toothBounds))for(const range of Object.values(toolBounds??{}))if(!finiteArray(range,2)||range[0]>range[1])throw Error('教学边界范围无效。');
 }
 if(m.cameras)for(const c of Object.values(m.cameras)){if(!finiteArray(c.position,3)||!finiteArray(c.target,3)||!finiteArray(c.up,3)||new Vector3(...c.up).length()<1e-9||new Vector3(...c.position).distanceTo(new Vector3(...c.target))<1e-9)throw Error('相机配置无效。');}
}
export function initialPoses(m:Manifest,pivots:Record<string,Vec3>):Poses{
 const poses=Object.fromEntries(m.teeth.map(t=>[t.mesh_id,identity(pivots[t.mesh_id])]));
 poses['4'].translation=[0,4,0];poses['4'].quaternion=zQuaternion(18);
 poses['6'].translation=[0,-1.5,0];poses['6'].quaternion=zQuaternion(-6);
 return poses;
}
export function newSession(m:Manifest,poses:Poses):Session{return{schema_version:1,session_id:crypto.randomUUID(),case_id:m.case_id,asset_version:m.asset_version,config_version:m.config_version,current_level:1,mode:'challenge',initial:copy(poses),saved_snapshots:[],command_log:[],events:[],local_save_status:'未保存'};}
export function stageStart(s:Session,level:number):Poses{
 if(level<1||level>3||level>s.saved_snapshots.length+1)throw Error('请先保存上一阶段。');
 return copy(level===1?s.initial:s.saved_snapshots[level-2].all_poses);
}
export function evaluate(poses:Poses,start:Poses,m:Manifest,level:number):Goal[]{
 const l=m.levels[level-1];
 const result=Object.keys(poses).map(id=>{
  const target=l.target_pose[id];const fixed=!l.allowed_teeth.includes(id);
  const e=poseError(poses[id],target?{...target,pivot:poses[id].pivot}:start[id]);
  const position_ok=e.position<=(fixed?l.tolerances.fixed_position:l.tolerances.position)+1e-12;
  const rotation_ok=e.rotation<=(fixed?l.tolerances.fixed_rotation:l.tolerances.rotation)+1e-9;
  return{id,...e,position_ok,rotation_ok,fixed,passed:position_ok&&rotation_ok};
 });
 if(level===3){const p=m.levels[1].target_pose['4'];const e=poseError(poses['4'],{...p,pivot:poses['4'].pivot});result.push({id:'4 · 第二关保留',...e,position_ok:e.position<=m.levels[1].tolerances.position+1e-12,rotation_ok:e.rotation<=m.levels[1].tolerances.rotation+1e-9,fixed:false,passed:e.position<=m.levels[1].tolerances.position+1e-12&&e.rotation<=m.levels[1].tolerances.rotation+1e-9});}
 return result;
}
export function canSave(goals:Goal[],checks:Check[],l:Level){return goals.every(g=>g.passed)&&(!l.required_checks.includes('distance')||checks.some(c=>c.check_id==='surface'&&c.status==='completed'));}
export function commitStage(s:Session,m:Manifest,level:number,poses:Poses,checks:Check[],operations:number,hint:number):Session{
 const start=stageStart(s,level);validatePoses(poses,m,s.initial);const goals=evaluate(poses,start,m,level);
 if(!canSave(goals,checks,m.levels[level-1]))throw Error('教学位姿、保留条件或关键检查尚未通过。');
 const next=copy(s);next.saved_snapshots=next.saved_snapshots.slice(0,level-1);
 next.saved_snapshots.push({schema_version:1,level_id:level,all_poses:copy(poses),goals,check_results:copy(checks),completed_at:new Date().toISOString(),config_version:m.config_version,asset_version:m.asset_version,unit:unitLabel(m),operations,hint_level:hint});
 next.current_level=Math.min(3,level+1);next.local_save_status='已保存';return next;
}
export function validatePoses(p:Poses,m:Manifest,reference?:Poses){
 if(!p||Object.keys(p).sort().join('|')!==m.teeth.map(t=>t.mesh_id).sort().join('|'))throw Error('存档牙齿 ID 全集不一致。');
 for(const [id,v] of Object.entries(p)){
 if(!v||!finiteArray(v.translation,3)||!finiteArray(v.pivot,3)||!finiteArray(v.quaternion,4)||Math.abs(Math.hypot(...v.quaternion)-1)>1e-6)throw Error(`模型 ${id} 位姿损坏。`);
 if(reference&&v.pivot.some((x,i)=>Math.abs(x-reference[id].pivot[i])>1e-9))throw Error(`模型 ${id} 固定枢轴不一致。`);
 }
}
export function validateSession(raw:unknown,m:Manifest,reference:Poses):Session{
 const s=raw as Session;
 if(!s||s.schema_version!==1||s.mode!=='challenge'||s.case_id!==m.case_id||s.asset_version!==m.asset_version||s.config_version!==m.config_version||typeof s.session_id!=='string'||!Array.isArray(s.saved_snapshots)||s.saved_snapshots.length>3||!Number.isInteger(s.current_level)||s.current_level<1||s.current_level>Math.min(3,s.saved_snapshots.length+1)||!Array.isArray(s.command_log)||!Array.isArray(s.events))throw Error('存档版本、病例或进度不兼容；旧记录仍保留，可导出。');
 validatePoses(s.initial,m,reference);
 if(JSON.stringify(s.initial)!==JSON.stringify(reference))throw Error('存档初始位姿与当前病例不一致。');
 for(const [i,snap] of s.saved_snapshots.entries()){
  if(snap.schema_version!==1||snap.level_id!==i+1||snap.asset_version!==m.asset_version||snap.config_version!==m.config_version||snap.unit!==unitLabel(m)||!Array.isArray(snap.check_results))throw Error('阶段快照版本无效。');
  validatePoses(snap.all_poses,m,reference);
  if(!canSave(evaluate(snap.all_poses,i===0?s.initial:s.saved_snapshots[i-1].all_poses,m,i+1),snap.check_results,m.levels[i]))throw Error('已保存阶段未满足教学条件。');
 }
 for(const c of s.command_log){if(!m.teeth.some(t=>t.mesh_id===c.mesh_id)||!['translate','rotate'].includes(c.type)||!Number.isInteger(c.stage)||c.stage<1||c.stage>3||!Number.isInteger(c.hint_level)||c.hint_level<0||c.hint_level>3)throw Error('操作日志无效。');for(const pose of [c.before_pose,c.after_pose]){if(!pose||!finiteArray(pose.translation,3)||!finiteArray(pose.quaternion,4)||!finiteArray(pose.pivot,3)||Math.abs(Math.hypot(...pose.quaternion)-1)>1e-6)throw Error('操作日志位姿损坏。');}}
 return copy(s);
}
export class History{
 undoStack:Command[]=[];redoStack:Command[]=[];
 commit(command:Command){if(poseError(command.before_pose,command.after_pose).position<1e-12&&poseError(command.before_pose,command.after_pose).rotation<1e-8)return false;this.undoStack.push(copy(command));this.redoStack=[];return true;}
 undo(poses:Poses){const c=this.undoStack.pop();if(c){poses[c.mesh_id]=copy(c.before_pose);this.redoStack.push(c);}return c;}
 redo(poses:Poses){const c=this.redoStack.pop();if(c){poses[c.mesh_id]=copy(c.after_pose);this.undoStack.push(c);}return c;}
}
export function interpolate(a:Poses,b:Poses,t:number):Poses{return Object.fromEntries(Object.keys(a).map(id=>[id,{pivot:[...a[id].pivot],translation:new Vector3(...a[id].translation).lerp(new Vector3(...b[id].translation),t).toArray() as Vec3,quaternion:new Quaternion(...a[id].quaternion).slerp(new Quaternion(...b[id].quaternion),t).toArray() as Quat} as Pose]));}
