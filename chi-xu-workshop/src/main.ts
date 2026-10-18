import './style.css';
import { Quaternion,Vector3 } from 'three';
import { loadCase,loadBundledCase,loadLowVariants,disposeCase,type CaseAssets } from './assets';
import { WorkshopScene } from './scene';
import { copy,defaultLevels,initialPoses,newSession,stageStart,evaluate,canSave,commitStage,validateSession,validatePoses,History,interpolate,unitLabel,poseError,type Manifest,type Session,type Poses,type Pose,type Tool,type Axis,type Check,type Command,type Vec3 } from './core';
const app=document.querySelector<HTMLDivElement>('#app')!;
type Screen='home'|'levels'|'play'|'review'|'finish';
const KEY='chi-xu-workshop:challenge:v1';
let assets:CaseAssets|null=null,session:Session|null=null,poses:Poses={},start:Poses={},history=new History(),scene:WorkshopScene|null=null;
let challengeActivated=false,loadingBuiltIn=false;
let screen:Screen='home',level=1,selected:string|null=null,tool:Tool='translate',axis:Axis='X',hint=0,outline=false,initialOutline=false,practice=false,checks:Check[]=[],intro=0,operationCount=0;
let returnChallenge:{poses:Poses;start:Poses;level:number;history:History;hint:number;operations:number;checks:Check[]}|null=null;
let practiceLog:Command[]=[];let fineStep=false;let low=false,reduced=matchMedia('(prefers-reduced-motion: reduce)').matches,showBase=true;
let warning='',saveStatus='未保存',replaying=false,replayPlaying=false,replayTime=0,replayFrames:Poses[]=[],replayOriginal:Poses|null=null,replayPrevious=0,replayMode='stages';
let measureWorker:Worker|null=null,measureRequest=0,measurePending=false;
const esc=(v:unknown)=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const $=<T extends HTMLElement=HTMLElement>(selector:string)=>document.querySelector<T>(selector);
const iconMap:Record<string,string>={'tool-translate':'move','tool-rotate':'rotate',measure:'measure',undo:'undo',redo:'redo',replay:'play',export:'export',hint:'hint','zoom-in':'zoom-in','zoom-out':'zoom-out'};
const btn=(text:string,action:string,primary=false,disabled=false,extra='')=>`<button data-action="${action}" class="${primary?'primary':''}" ${disabled?'disabled':''} ${extra}>${iconMap[action]?`<img class="button-icon" src="/icons/${iconMap[action]}.svg" alt="">`:''}${text}</button>`;
const m=()=>assets!.manifest;
const unit=()=>assets?unitLabel(m()):'u';
const current=()=>m().levels[level-1];
const allowed=()=>practice?['X','Y','Z'] as Axis[]:selected?current().allowed_axes[selected]?.[tool]??[]:[];
const editable=()=>!!selected&&!replaying&&screen==='play'&&(practice||current().allowed_teeth.includes(selected));
function event(type:string,detail?:string){if(!practice&&session)session.events.push({type,time:new Date().toISOString(),detail});}
function rawSave(){try{return localStorage.getItem(KEY);}catch{return null;}}
function hasSave(){return !!rawSave();}
function exportData(data:unknown,name='齿序工坊_记录.json'){const b=new Blob([typeof data==='string'?data:JSON.stringify(data,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
function exportCurrent(){event('export');exportData(assets?{schema_version:1,manifest:m(),asset_signature:assets.signature,mode:practice?'practice':'challenge',session:practice?null:session,poses,command_log:practice?practiceLog:session?.command_log,check_results:checks}:rawSave()??{message:'尚无病例或进度'});}
function toast(text:string){const el=$('#notice');if(el){el.textContent=text;el.classList.add('visible');setTimeout(()=>el.classList.remove('visible'),5500);}}
function preserve(){if(practice||!session||!assets||!challengeActivated)return true;try{
 const next={signature:assets.signature,session,working:{level,poses,history:history.undoStack,redo:history.redoStack,hint,operations:operationCount}};
 const text=JSON.stringify(next);JSON.parse(text);localStorage.setItem(KEY,text);saveStatus='已保存至本机';if(warning.startsWith('本地进度保存失败'))warning='';return true;
 }catch{saveStatus='未保存';warning='本地进度保存失败。当前操作仍保留，请先导出记录。';toast(warning);return false;}}
function persistCandidate(next:Session){if(!assets)return false;try{const text=JSON.stringify({signature:assets.signature,session:next});validateSession(JSON.parse(text).session,m(),session!.initial);localStorage.setItem(KEY,text);saveStatus='已保存至本机';if(warning.startsWith('本地进度保存失败'))warning='';return true;}catch(e){saveStatus='未保存';warning=`本地进度保存失败。当前操作仍保留，请先导出记录。${String(e)}`;toast(warning);return false;}}
function baseChecks():Check[]{const stamp={computed_at:new Date().toISOString(),asset_version:m().asset_version,method:'',value:null,unit:unit(),sample_count:0};return[
 {...stamp,check_id:'surface',status:'not_computed',reason:!m().adjacency_confirmed?'缺少已确认的邻接牙对。':!m().adjacency.length?'已确认邻接清单为空。':'尚未计算；请点击表面距离。'},
 {...stamp,check_id:'penetration',status:'not_computed',reason:'尚未实现可靠网格相交或有符号距离；非负表面距离不能证明无穿透。'}
 ];}
function invalidate(){measureRequest++;measurePending=false;checks=baseChecks();scene?.clearLines();}
function allowedLabel(){return allowed().join(' / ')||'当前工具无可用方向';}
function select(id:string){selected=id;if(!allowed().includes(axis))axis=allowed()[0]??'X';event('select',id);if(!editable())toast('这颗牙在本阶段保持固定。请选择标记为可调整的牙。');updateTool();updateHUD();}
function updateTool(){scene?.select(selected,editable(),tool,allowed());}
function record(id:string,before:Pose,after:Pose){
 if(!editable()||id!==selected)return;
 const command:Command={command_id:crypto.randomUUID(),type:tool,mesh_id:id,before_pose:copy(before),after_pose:copy(after),time:new Date().toISOString(),stage:level,hint_level:hint};
 poses[id]=copy(after);if(history.commit(command)){operationCount++;if(practice)practiceLog.push(command);else session!.command_log.push(command);event('command',command.command_id);invalidate();preserve();}scene?.apply(poses);updateHUD();
}
function constrain(id:string,p:Pose):Pose{
 const before=poses[id];const axes=allowed();const next=copy(p);
 if(tool==='translate'){for(let i=0;i<3;i++)if(!axes.includes((['X','Y','Z'] as Axis[])[i]))next.translation[i]=before.translation[i];
  for(const a of axes){const range=!practice?current().bounds?.[id]?.translate?.[a]:undefined;if(range){const i=['X','Y','Z'].indexOf(a);next.translation[i]=Math.max(range[0],Math.min(range[1],next.translation[i]));}}
 }
 if(tool==='rotate'&&!practice){const a=axes[0];const range=current().bounds?.[id]?.rotate?.[a];if(range){const i=['X','Y','Z'].indexOf(a);const v=new Vector3(...([i===0?1:0,i===1?1:0,i===2?1:0] as Vec3));const q=new Quaternion(...next.quaternion);const deg=2*Math.atan2(new Vector3(q.x,q.y,q.z).dot(v),q.w)*180/Math.PI;next.quaternion=new Quaternion().setFromAxisAngle(v,Math.max(range[0],Math.min(range[1],deg))*Math.PI/180).toArray() as Pose['quaternion'];}}
 return next;
}
function nudge(sign:number){if(!editable()||!allowed().includes(axis))return;const before=copy(poses[selected!]),after=copy(before);const idx=['X','Y','Z'].indexOf(axis);const fine=fineStep;const step=tool==='translate'?(fine?.05:.25):(fine?.5:2);
 if(tool==='translate')after.translation[idx]+=step*sign;else{const v=new Vector3();v.setComponent(idx,1);after.quaternion=new Quaternion().setFromAxisAngle(v,step*sign*Math.PI/180).multiply(new Quaternion(...after.quaternion)).normalize().toArray() as Pose['quaternion'];}
 record(selected!,before,constrain(selected!,after));
}
function showGhosts(){if(!scene||!assets)return;if(initialOutline)scene.ghostsAt(start,true);else if(outline||hint===3){const targets:Poses={};if(!practice)for(const [id,p] of Object.entries(current().target_pose))targets[id]={...copy(p),pivot:poses[id].pivot};scene.ghostsAt(targets);}else scene.ghostsAt(null);}
function enterStage(n:number){if(!session||!assets)return;try{scene?.cancelDrag();level=n;poses=stageStart(session,n);start=copy(poses);history=new History();hint=0;operationCount=0;intro=n===1?1:0;selected=current().allowed_teeth[0];tool='translate';axis=current().allowed_axes[selected]?.translate[0]??'X';outline=initialOutline=false;checks=baseChecks();session.current_level=n;screen='play';event('enter_stage',String(n));preserve();render();}catch(e){toast(String(e));}}
function startPractice(){if(!assets)return loadBuiltIn('practice');if(practice)return;returnChallenge={poses:copy(poses),start:copy(start),level,history,hint,operations:operationCount,checks:copy(checks)};practice=true;poses=copy(session!.initial);start=copy(poses);history=new History();practiceLog=[];operationCount=0;hint=0;intro=0;selected=m().teeth[0].mesh_id;tool='translate';axis='X';checks=baseChecks();outline=initialOutline=false;screen='play';render();}
function exitPractice(){if(returnChallenge){poses=returnChallenge.poses;start=returnChallenge.start;level=returnChallenge.level;history=returnChallenge.history;hint=returnChallenge.hint;operationCount=returnChallenge.operations;checks=returnChallenge.checks;}practice=false;returnChallenge=null;screen='levels';render();}
function newChallenge(){if(!assets)return loadBuiltIn('new');if(hasSave()&&!confirm('新挑战会覆盖现有挑战记录。是否继续？'))return;session=newSession(m(),initialPoses(m(),Object.fromEntries(assets.assets.map(a=>[a.id,a.pivot]))));challengeActivated=true;enterStage(1);}
function resume(){if(!assets)return loadBuiltIn('continue');try{
 const raw=rawSave();if(!raw)throw Error('没有可恢复的进度。');const record=JSON.parse(raw);if(record.signature!==assets.signature)throw Error('资产或教学配置内容不匹配。旧记录已保留，可导出。');
 const initial=initialPoses(m(),Object.fromEntries(assets.assets.map(a=>[a.id,a.pivot])));const valid=validateSession(record.session,m(),initial);
 let working=stageStart(valid,valid.current_level),workingLevel=valid.current_level;
 if(record.working){const w=record.working;if(!Number.isInteger(w.level)||w.level<1||w.level>Math.min(3,valid.saved_snapshots.length+1)||!Number.isInteger(w.operations)||w.operations<0||!Number.isInteger(w.hint)||w.hint<0||w.hint>3)throw Error('编辑进度损坏。');validatePoses(w.poses,m(),initial);const start=stageStart(valid,w.level);const locked=evaluate(w.poses,start,m(),w.level).filter(g=>g.fixed);if(locked.some(g=>!g.passed))throw Error('编辑进度中的固定牙不一致。');working=copy(w.poses);workingLevel=w.level;}
 session=valid;level=workingLevel;poses=working;start=stageStart(valid,level);history=new History();if(record.working){for(const key of ['history','redo']){const commands=record.working[key]??[];validateSession({...valid,command_log:commands},m(),initial);if(key==='history')history.undoStack=copy(commands);else history.redoStack=copy(commands);}}operationCount=record.working?.operations??0;hint=record.working?.hint??0;selected=current().allowed_teeth[0];checks=baseChecks();screen='play';challengeActivated=true;event('continue');warning='';render();
 }catch(e){warning=String(e);render();toast(warning);}}
function beginReplay(){if(!session?.saved_snapshots.length)return;scene?.cancelDrag();replaying=true;replayOriginal=copy(poses);replayTime=0;replayPlaying=true;replayPrevious=0;prepareReplay();event('replay');updateTool();updateHUD();requestAnimationFrame(replayTick);}
function prepareReplay(){if(!session)return;if(replayMode==='operations'){let p=copy(session.initial);replayFrames=[copy(p)];for(const c of session.command_log){p[c.mesh_id]=copy(c.after_pose);replayFrames.push(copy(p));}}else replayFrames=[session.initial,...session.saved_snapshots.map(s=>s.all_poses)];}
function applyReplay(){const max=replayFrames.length-1;const t=Math.min(max,Math.max(0,replayTime));const i=Math.min(Math.floor(t),Math.max(0,max-1));const value=interpolate(replayFrames[i],replayFrames[Math.min(i+1,max)],t-i);scene?.apply(value);const slider=$<HTMLInputElement>('#timeline');if(slider)slider.value=String(t);const text=$('#replay-position');if(text)text.textContent=replayMode==='stages'?`初始 → S${Math.min(max,Math.ceil(t))}`:`操作 ${Math.ceil(t)} / ${max}`;}
function replayTick(now:number){if(!replaying)return;if(replayPlaying&&replayPrevious){replayTime+=(now-replayPrevious)/1800;if(replayTime>=replayFrames.length-1){replayTime=replayFrames.length-1;replayPlaying=false;const b=$('[data-action="pause"]');if(b)b.textContent='播放';}}replayPrevious=now;applyReplay();requestAnimationFrame(replayTick);}
function exitReplay(){replaying=false;replayPlaying=false;if(replayOriginal){poses=copy(replayOriginal);scene?.apply(poses);}replayOriginal=null;updateTool();updateHUD();}
function measure(){if(!assets||measurePending||replaying)return;
 if(!m().adjacency_confirmed||!m().adjacency.length){checks=baseChecks();updateHUD();toast(checks[0].reason);return;}
 measureWorker?.terminate();measureWorker=new Worker(new URL('./measure.worker.ts',import.meta.url),{type:'module'});const request=++measureRequest;measurePending=true;updateHUD();
 measureWorker.onmessage=({data})=>{if(data.request!==measureRequest)return;measurePending=false;
 if(data.error){checks=[{...baseChecks()[0],status:'failed',reason:data.error},baseChecks()[1]];}else{scene?.clearLines();checks=data.results.map((r:{pair:string[];distance:number;sample_count:number;endpoints:[Vec3,Vec3]})=>({check_id:'surface',status:'completed',method:`模型 ${r.pair.join('—')} · 原始 STL 确定性均匀面序三角形重心采样近似`,value:r.distance,unit:unit(),sample_count:r.sample_count,reason:'非负采样距离不能判断穿透。',computed_at:new Date().toISOString(),asset_version:m().asset_version,endpoints:r.endpoints} satisfies Check));checks.push(baseChecks()[1]);for(const c of checks)if(c.endpoints)scene?.line(c.endpoints,c.method);}
 updateHUD();};measureWorker.onerror=()=>{measurePending=false;checks=[{...baseChecks()[0],status:'failed',reason:'测量 Worker 执行失败，请重试。'},baseChecks()[1]];updateHUD();};
 measureWorker.postMessage({request,poses:copy(poses),pairs:m().adjacency,samples:Object.fromEntries(assets.assets.map(a=>[a.id,a.samples]))});}
function saveStage(){if(!session)return;scene?.cancelDrag();const goals=evaluate(poses,start,m(),level);if(!canSave(goals,checks,current()))return toast('仍有教学目标或关键检查未通过。');if(session.saved_snapshots.length>=level&&!confirm('保存此阶段将清除其后阶段记录。是否继续？'))return;try{const next=commitStage(session,m(),level,poses,checks,operationCount,hint);if(!persistCandidate(next))return;session=next;event('save_stage',String(level));screen='finish';render();}catch(e){toast(String(e));}}
function render(){scene?.dispose();scene=null;replaying=false;measureRequest++;measurePending=false;measureWorker?.terminate();measureWorker=null;
 app.innerHTML=`<header><button class="brand" data-action="home"><span class="brand-mark">齿</span><span>齿序工坊<small>CHI XU WORKSHOP</small></span></button><nav>${btn('关卡手册','levels')}${btn('病例资源','assets')}${btn('设置','settings')}</nav></header><main id="main"></main><footer><span>同一个病例 · 三个连续阶段</span><span>教学几何练习 · 不对应真实治疗方案</span></footer><div id="notice" role="status" aria-live="polite"></div><dialog id="modal"></dialog>`;
 const main=$('#main')!;
 if(screen==='home'){
 main.innerHTML=`<section class="home"><div class="home-copy"><div class="eyebrow">一间关于观察、尝试与调整的工作室</div><h1>亲手调整牙模<br>理解每一步<span>改变。</span></h1><p class="lead">创造空间 / 排齐错位牙 / 整体协调</p><article class="home-card"><h2>同一个病例，逐步完成</h2><p>真实牙冠网格与自由观察<br>移动、旋转、复查与回放</p>${btn('开始新的挑战　↗','new',true)}${hasSave()?btn('继续上次进度','continue'):''}${btn('进入自由练习','practice')}</article><p class="asset-status"><i></i>${assets?'真实病例已导入 · '+esc(m().case_id):'已内置 28 颗真实牙冠 · 点击开始加载'}</p></div><figure class="hero"><img src="/design/workbench.png" alt="PDF 提供的微缩工作台视觉概念图，非运行中的游戏牙模"><figcaption>视觉概念参考 / 非实际病例与运行画面</figcaption><div class="hero-note"><span>01 — 03</span><strong>观察空间<br>让每一次调整都有依据</strong></div></figure></section>${warning?`<div class="warning">${esc(warning)}${btn('导出原记录','export-raw')}</div>`:''}<section class="steps">${['创造空间','排齐错位牙','整体协调'].map((n,i)=>`<div><span>0${i+1}</span><strong>${n}</strong><small>${['安排操作空间','兼顾位置与方向','复查目标与固定条件'][i]}</small></div>`).join('')}</section>`;
 }else if(screen==='levels'){
 main.innerHTML=`<section class="page-heading"><div class="eyebrow">病例连续工作簿</div><h1>一个病例，三个阶段</h1><p>保存上一阶段的结果，再进入下一阶段。</p></section><section class="level-grid">${['创造空间','排齐错位牙','整体协调'].map((n,i)=>{const count=session?.saved_snapshots.length??0;const locked=i>count;return `<article class="level-card ${locked?'locked':''}"><span class="level-number">0${i+1}</span><span class="pill">${locked?'锁定':i<count?'可重玩 · 已完成':'当前阶段'}</span><div class="stage-symbol">${['↔','↻','◇'][i]}</div><h2>${n}</h2><p>${['目标牙暂时固定，调整两颗允许移动的牙。','保留第一关结果，调整位置与方向。','协调三颗指定牙，并复查固定条件。'][i]}</p><small>${['模型 3 / 5 · 平移','模型 4 · 平移与旋转','模型 3 / 5 / 6 · 模型 7 固定'][i]}</small>${btn(locked?'请先完成上一阶段':i<count?'重新进入阶段':'进入阶段',`stage-${i+1}`,!locked,locked)}</article>`;}).join('')}</section><p class="muted">重新保存较早阶段会清除后续记录；重玩未提交时，旧记录保持有效。</p>`;
 }else{
 const title=practice?'自由练习':current().name;
 main.innerHTML=`<div class="play-heading"><div><span class="eyebrow">${practice?'独立练习 / 不改变挑战记录':`连续挑战 / 第 ${level} 阶段`}</span><h2>${esc(title)}</h2>${!m().teaching_reviewed?'<small class="case-caveat">原型位姿练习 · 文件编号 · 单位 u · 教学角色待核对</small>':''}</div><div class="heading-actions"><span id="save-label">${practice?'独立会话':saveStatus}</span>${btn('导出记录','export')}${btn(practice?'退出练习':'返回关卡',practice?'exit-practice':'levels')}</div></div><section class="workspace"><div class="viewport-shell"><div class="viewbar">${btn('整体斜视','view-overview')}${['occlusal','front','side'].map((n,i)=>btn(m().camera_labels?.[n]??['咬合面','正面','侧面'][i],`view-${n}`,false,!m().cameras?.[n],`title="${m().cameras?.[n]?'病例相机预设':'需先提供与病例坐标核对的相机预设'}"`)).join('')}<select id="jaw" aria-label="牙列显示"><option value="all">全部牙列</option>${['upper','lower'].map(j=>`<option value="${j}" ${m().teeth.some(t=>t.jaw_group===j)?'':'disabled'}>${j==='upper'?'上颌':'下颌'}（已确认分组）</option>`).join('')}</select></div><div id="viewport"><div id="marker-layer"></div><div id="geometry-error" class="geometry-error" hidden></div></div><div class="view-meta"><span>X / Y / Z · 模型坐标</span><span id="stats">真实网格 · 不生成牙冠</span><div>${btn('−','zoom-out')}${btn('＋','zoom-in')}</div></div><div id="pose-hud" class="pose-hud"></div></div><aside id="sidebar"></aside></section><div id="toolbar"></div>`;
 try{scene=new WorkshopScene($('#viewport')!);scene.load(assets!,poses);scene.setLow(low);scene.reduced=reduced;scene.furniture.visible=showBase;scene.onSelect=select;scene.onFailure=message=>{const el=$('#geometry-error')!;el.hidden=false;el.innerHTML=`<h3>三维显示暂不可用</h3><p>${esc(message)}</p>${btn('重试','retry')}${btn('导出记录','export')}`;};
 scene.onPreview=(id,p)=>{const next=constrain(id,p);scene!.apply({[id]:next});invalidate();updateHUD({...poses,[id]:next});updatePoseHUD(next);};scene.onCommit=(id,b,a)=>record(id,b,constrain(id,a));updateTool();showGhosts();
 }catch(e){$('#geometry-error')!.hidden=false;$('#geometry-error')!.innerHTML=`<h3>无法启动 WebGL</h3><p>${esc(e)}</p>${btn('重试','retry')}${btn('导出记录','export')}`;}
 updateHUD();
 }
 document.documentElement.dataset.reduced=String(reduced);
}
function updatePoseHUD(preview?:Pose){const node=$('#pose-hud');if(!node)return;const p=preview??(selected?poses[selected]:null);const q=p?new Quaternion(...p.quaternion):null;const angle=q?2*Math.acos(Math.min(1,Math.abs(q.w)))*180/Math.PI:0;node.innerHTML=p?`<strong>模型 ${esc(selected)}</strong><span>${editable()?'可调整':'▣ 固定 / 仅查看'}</span><span>${tool==='translate'?'平移':'旋转'} · ${esc(allowedLabel())}</span><span>Δ ${p.translation.map(v=>v.toFixed(2)).join(' / ')} ${unit()}</span><span>相对原始朝向 ${angle.toFixed(2)}°${scene?.before?` · 本次 Δ ${poseError(scene.before,p).rotation.toFixed(2)}°`:""}</span>`:'点击牙冠，或从任务卡选择模型';}
function checkHTML(){return checks.map(c=>`<div class="check ${c.status}"><strong>${c.check_id==='surface'?'表面采样距离':'穿透检查'} · ${({'completed':'已完成','not_computed':'未计算','failed':'失败','not_applicable':'不适用'})[c.status]}</strong>${c.value!==null?`<b>${c.value.toFixed(3)} ${unit()}</b><small>${esc(c.method)} · ${c.sample_count} 点</small>`:''}<small>${esc(c.reason)}</small></div>`).join('');}
function updateHUD(displayPoses:Poses=poses){
 if(!assets||!['play','review','finish'].includes(screen))return;
 const goals=evaluate(displayPoses,start,m(),level);const taskGoals=goals.filter(g=>!g.fixed);const sidebar=$('#sidebar')!;
 if(replaying){sidebar.innerHTML=`<span class="eyebrow">阶段记录</span><h2>回看亲手完成的改变</h2><p>此动画为几何变化示意。</p><select id="replay-mode" aria-label="回放内容"><option value="stages" ${replayMode==='stages'?'selected':''}>初始 / S1 / S2 / S3</option><option value="operations" ${replayMode==='operations'?'selected':''}>有效操作记录</option></select><p id="replay-position"></p><input id="timeline" aria-label="回放时间轴" type="range" min="0" max="${replayFrames.length-1}" step="0.001" value="${replayTime}"><div class="timeline-nodes">${replayMode==='stages'?replayFrames.map((_,i)=>`<span>${i===0?'初始':'S'+i}</span>`).join(''):''}</div><div class="button-row">${btn(replayPlaying?'暂停':'播放','pause')}${btn('退出回放','exit-replay')}</div><p class="muted">观察相机保持可用；编辑和进度写入已暂停。</p>`;
 }else if(screen==='finish'){
 sidebar.innerHTML=`<div class="badge"><img src="/icons/badge-${['space','alignment','coordination'][level-1]}-64.svg" width="64" height="64" alt="阶段完成徽章"></div><span class="eyebrow">教学目标已完成</span><h2>${['空间规划','排齐练习','协调复查'][level-1]}</h2><p>${session!.saved_snapshots.length===3?'三个连续阶段已完成。':'阶段结果已保存，下一阶段继承全部牙位姿。'}</p><ol class="snapshot-list">${session!.saved_snapshots.map(s=>`<li>S${s.level_id} · ${esc(m().levels[s.level_id-1].name)}<small>${s.operations} 次操作 · 提示等级 ${s.hint_level}</small></li>`).join('')}</ol><p class="muted">${checks.some(c=>c.check_id==='surface'&&c.status==='completed')?'表面采样已完成；穿透仍未计算。':'位姿练习完成；未授予几何核对标记。'}</p>${level<3?btn('保存结果已就绪 · 进入下一关','next',true):''}${btn('播放阶段记录','replay')}${btn('导出操作记录','export')}${btn('进入自由练习','practice')}${btn('返回关卡','levels')}`;
 }else if(screen==='review'){
 sidebar.innerHTML=`<span class="eyebrow">阶段复查</span><h2>检查你的调整结果</h2><div class="goals">${goals.filter(g=>!g.fixed||!g.passed||g.id==='7').map(g=>goalHTML(g)).join('')}</div><div class="check ${goals.filter(g=>g.fixed).every(g=>g.passed)?'completed':'failed'}"><strong>固定与保留条件</strong><small>${goals.filter(g=>g.fixed).every(g=>g.passed)?'已完成 · 所有非任务牙保持阶段初始位姿':'失败 · 存在固定漂移'}</small></div>${checkHTML()}${btn(measurePending?'计算中…':'计算表面距离','measure',false,measurePending)}${btn('返回继续调整','adjust')}${btn('保存并完成阶段','save-stage',true,!canSave(goals,checks,current()))}<p class="muted">可选测量缺失允许位姿练习通关，不代表几何核对通过。</p>`;
 }else if(practice){sidebar.innerHTML=`<span class="eyebrow">自由练习 · 独立会话</span><h2>自由观察与调整</h2><p>所有牙冠可独立操作，不修改挑战快照、进度或奖励。</p><label>选择模型<select id="tooth-list">${m().teeth.map(t=>`<option value="${esc(t.mesh_id)}" ${selected===t.mesh_id?'selected':''}>模型 ${esc(t.mesh_id)}</option>`).join('')}</select></label>${checkHTML()}${btn(measurePending?'计算中…':'表面距离','measure',false,measurePending)}${btn('重置自由练习','reset-practice')}${btn('导出练习记录','export')}`;
 }else{
 sidebar.innerHTML=`<span class="eyebrow">第 0${level} 关 / 03</span><h2>本阶段任务</h2><div class="goals">${taskGoals.map(goalHTML).join('')}</div>${level===3?`<div class="fixed-note">▣ 模型 7 · 固定示意<br><small>相对 S2 保持不变</small></div>`:''}<div class="hint-box"><strong>提示 ${hint} / 3</strong><p>${['先观察任务牙，再选择操作工具。','已在任务卡标出可调整牙；点击卡片定位。',`允许方向由配置决定：${current().allowed_teeth.map(id=>`模型 ${id}：平移 ${current().allowed_axes[id].translate.join('/')||'禁用'}；旋转 ${current().allowed_axes[id].rotate.join('/')||'禁用'}`).join('；')}`,'浅蓝目标轮廓已显示，不会自动吸附。'][hint]}</p><div class="button-row">${btn('查看提示','hint',false,hint===3)}${btn('关闭提示','hint-off',false,hint===0)}</div></div><label class="toggle"><input id="target-outline" type="checkbox" ${outline?'checked':''}>教学目标轮廓</label><label class="toggle"><input id="initial-outline" type="checkbox" ${initialOutline?'checked':''}>阶段初始轮廓</label>${btn(measurePending?'计算中…':'表面距离','measure',false,measurePending)}${btn('进行阶段复查','review',true)}<div class="compact-checks">${checkHTML()}</div>${intro?`<div class="intro"><strong>操作引导 ${intro}/4</strong><p>${['点击可见牙冠或任务卡选牙。','拖动带轴标签的手柄，或使用微调按钮。','切换旋转工具；不可用方向会灰显。','提交阶段复查，查看具体误差。'][intro-1]}</p>${btn(intro===4?'完成引导':'下一步','intro-next')}${btn('跳过','intro-skip')}</div>`:''}`;
 }
 const toolbar=$('#toolbar')!;toolbar.innerHTML=`<div class="toolbar"><div class="tool-group">${btn('移动','tool-translate',tool==='translate',screen!=='play'||replaying)}${btn('旋转','tool-rotate',tool==='rotate',screen!=='play'||replaying)}${btn('撤销','undo',false,!history.undoStack.length||screen!=='play'||replaying)}${btn('重做','redo',false,!history.redoStack.length||screen!=='play'||replaying)}</div><div class="tool-group">${(['X','Y','Z'] as Axis[]).map(a=>btn(a,`axis-${a}`,axis===a,!editable()||!allowed().includes(a),`title="${allowed().includes(a)?'允许方向':'本阶段教学配置未开放此方向'}"`)).join('')}${btn('− 微调','minus',false,!editable()||!allowed().includes(axis))}${btn('＋ 微调','plus',false,!editable()||!allowed().includes(axis))}<label class="toggle"><input id="fine" type="checkbox" ${fineStep?'checked':''}>精细步长</label></div><small>默认 0.25${unit()} / 2° · 精细 0.05${unit()} / 0.5°</small></div>`;
 updatePoseHUD();const save=$('#save-label');if(save)save.textContent=practice?'独立会话':saveStatus;
 if(warning)toast(warning);
}
function goalHTML(g:ReturnType<typeof evaluate>[number]){return `<button class="goal ${g.passed?'passed':''} ${hint&&current().allowed_teeth.includes(g.id)?'hinted':''}" data-action="select-${esc(g.id.split(' · ')[0])}"><span class="goal-icon">${g.passed?'✓':'○'}</span><span><strong>模型 ${esc(g.id)}${g.fixed?' · 固定':''}</strong><small>${g.position_ok?'✓':'○'} 位置 ${g.position.toFixed(3)}${unit()}　${g.rotation_ok?'✓':'○'} 朝向 ${g.rotation.toFixed(2)}°</small></span></button>`;}

function installCase(next:CaseAssets){
 scene?.cancelDrag();scene?.dispose();scene=null;if(assets)disposeCase(assets);assets=next;
 const initial=initialPoses(m(),Object.fromEntries(next.assets.map(a=>[a.id,a.pivot])));
 session=newSession(m(),initial);challengeActivated=false;poses=copy(initial);start=copy(initial);history=new History();practice=false;returnChallenge=null;practiceLog=[];level=1;selected=null;hint=0;operationCount=0;checks=baseChecks();low=false;
 warning=m().teaching_reviewed?'':'教学配置未审核：当前仅为 PRD 原型位姿练习。';
}
async function loadBuiltIn(after=''){
 if(loadingBuiltIn)return;
 loadingBuiltIn=true;openAssets(after);const input=$<HTMLInputElement>('#case-files');if(input)input.disabled=true;
 const status=$('#load-state');if(status)status.textContent='正在校验内置病例清单…';
 try{
  const next=await loadBundledCase(text=>{const label=$('#load-state');if(label)label.textContent=text;});
  installCase(next);$<HTMLDialogElement>('#modal')?.close();screen='home';render();
  if(after==='new')newChallenge();else if(after==='continue')resume();else if(after==='practice')startPractice();
 }catch(err){const label=$('#load-state');if(label){label.textContent=String(err);label.classList.add('error');}else toast(String(err));}
 finally{loadingBuiltIn=false;const f=$<HTMLInputElement>('#case-files');if(f)f.disabled=false;const b=$<HTMLButtonElement>('[data-action="load-built-in"]');if(b){b.disabled=false;b.textContent='重试加载内置病例';}}
}

let requestedAfterLoad='';
function openAssets(after=''){requestedAfterLoad=after;const d=$<HTMLDialogElement>('#modal')!;d.innerHTML=`<div class="dialog-heading"><div><span class="eyebrow">病例资源 / 本机读取</span><h2>接入真实牙冠</h2></div>${btn('关闭','close-modal')}</div><p>已收到用户上传的 28 个真实 STL，可直接加载内置病例。若要更换病例，也可选择本机文件。Windows 原路径 <code>D:\\论文复现\\CLIK-Diffusion-main\\Data\\256_crown\\initial\\</code> 未直接挂载；可以选择 28 个 STL 和已填写的病例 JSON。文件仅在浏览器内解析，不上传服务器。</p><div class="warning">真实网格已接入；单位、上下颌、FDI、邻接与教学角色仍待核对。编号直接沿用 STL 文件名，不自动转换牙位。</div><ol><li>在 Windows 工作目录运行 <code>node scripts/inspect-assets.mjs --source "D:\\论文复现\\CLIK-Diffusion-main\\Data\\256_crown\\initial" --out case.draft.json</code>。</li><li>核对草稿中的模型编号、上下颌、来源、单位、相机与教学轴。未知 FDI 保持 null，未知单位使用 u。</li><li>将文件改名为 case.json，与原始 STL 一起选择。不会根据文件顺序自动映射牙位。</li></ol><label class="file-drop">选择病例 JSON 和 28 个 STL<input id="case-files" type="file" accept=".json,.stl,.STL" multiple></label><p id="load-state" role="status">${assets?`已载入：${esc(m().case_id)} · ${assets.assets.length} 颗牙冠 · ${assets.assets.reduce((s,a)=>s+a.triangles,0).toLocaleString()} 三角形`:'尚未载入病例'}</p><div class="button-row">${btn(loadingBuiltIn?'正在加载真实病例…':'加载已上传的真实病例','load-built-in',true,loadingBuiltIn)}${btn('下载参数模板','template')}${btn('导出旧存档','export-raw')}</div><p class="muted">单位、牙位和教学角色未审核时只能标为原型位姿练习。真实网格、来源审核与性能实测完成前不视为正式交付。</p>`;d.showModal();}
function template(){exportData({case_id:'请填写匿名病例ID',asset_version:'待核对-v1',config_version:'prd-v1-provisional',unit:'u',unit_confirmed:false,scale:1,source:'待核对',usage_status:'待核对',teaching_reviewed:false,adjacency_confirmed:false,adjacency:[],teeth:Array.from({length:28},(_,i)=>({mesh_id:String(i+1),mesh_uri:'请填写对应原始文件名-'+(i+1)+'.stl',checksum:'请填写实际SHA256',jaw_group:'unknown',FDI:null,origin:[0,0,0],source:'待核对',usage_status:'待核对'})),levels:defaultLevels()},'case.template.json');}
function openSettings(){const d=$<HTMLDialogElement>('#modal')!;d.innerHTML=`<div class="dialog-heading"><h2>工作室设置</h2>${btn('关闭','close-modal')}</div><label class="setting"><input id="low-mode" type="checkbox" ${low?'checked':''}>低性能渲染（轻量 LOD、1×像素、关闭实时阴影）</label><label class="setting"><input id="reduce-motion" type="checkbox" ${reduced?'checked':''}>减少动态效果</label><label class="setting"><input id="show-base" type="checkbox" ${showBase?'checked':''}>显示非解剖工作台与展示底座</label><div class="status-legend">${['normal','hover','selected','fixed','target'].map((n,i)=>`<span><img src="/icons/status-${n}.svg" alt="">${['正常牙白','悬停轮廓','选中 / 当前工具','固定 / 仅查看','目标 / 非实体'][i]}</span>`).join('')}</div><p>音效资源尚未提供；当前无音效。触屏仅开放单点选牙和按钮微调，手柄和双指观察待实测。</p><p class="muted">表面距离使用原始 STL 采样；拾取代理不参与测量。未经核对的单位显示 u，模型编号不会转换成 FDI。</p>`;d.showModal();}
app.addEventListener('click',e=>{const b=(e.target as HTMLElement).closest<HTMLButtonElement>('[data-action]');if(!b||b.disabled)return;const a=b.dataset.action!;
 if(a.startsWith('stage-'))return assets?(challengeActivated?enterStage(Number(a.slice(6))):newChallenge()):loadBuiltIn('new');
 if(a.startsWith('select-'))return select(a.slice(7));
 if(a.startsWith('view-')){scene?.view(a.slice(5),m());return;}
 if(a.startsWith('tool-')){tool=a.slice(5) as Tool;axis=allowed()[0]??'X';event('tool',tool);updateTool();updateHUD();return;}
 if(a.startsWith('axis-')){axis=a.slice(5) as Axis;updateHUD();return;}
 switch(a){
 case 'home':if(practice)exitPractice();if(replaying)exitReplay();preserve();screen='home';render();break;
 case 'levels':if(practice)exitPractice();else{scene?.cancelDrag();if(replaying)exitReplay();preserve();screen='levels';render();}break;
 case 'assets':openAssets();break;case 'load-built-in':loadBuiltIn(requestedAfterLoad);break;case 'settings':openSettings();break;case 'close-modal':$<HTMLDialogElement>('#modal')!.close();break;
 case 'new':newChallenge();break;case 'continue':resume();break;case 'practice':startPractice();break;case 'exit-practice':exitPractice();break;
 case 'plus':nudge(1);break;case 'minus':nudge(-1);break;
 case 'undo':case 'redo':{scene?.cancelDrag();const c=a==='undo'?history.undo(poses):history.redo(poses);if(c){event(a,c.command_id);const log={...copy(c),command_id:crypto.randomUUID(),before_pose:a==='undo'?copy(c.after_pose):copy(c.before_pose),after_pose:a==='undo'?copy(c.before_pose):copy(c.after_pose),time:new Date().toISOString()};if(practice)practiceLog.push(log);else session!.command_log.push(log);scene?.apply(poses);invalidate();preserve();updateHUD();}break;}
 case 'hint':hint=Math.min(3,hint+1);event('hint',String(hint));showGhosts();preserve();updateHUD();break;case 'hint-off':hint=0;showGhosts();updateHUD();break;
 case 'intro-next':intro=intro===4?0:intro+1;updateHUD();break;case 'intro-skip':intro=0;updateHUD();break;
 case 'review':scene?.cancelDrag();screen='review';event('review');render();break;case 'adjust':screen='play';render();break;
 case 'measure':measure();break;case 'save-stage':saveStage();break;case 'next':enterStage(level+1);break;
 case 'replay':beginReplay();break;case 'pause':replayPlaying=!replayPlaying;replayPrevious=0;updateHUD();break;case 'exit-replay':exitReplay();break;
 case 'zoom-in':scene?.zoom(.85);break;case 'zoom-out':scene?.zoom(1.18);break;
 case 'export':exportCurrent();break;case 'export-raw':exportData(rawSave()??{message:'没有旧存档'},'齿序工坊_原始存档.json');break;
 case 'template':template();break;case 'retry':render();break;
 case 'reset-practice':if(confirm('重置本次自由练习？挑战记录保持不变。')){poses=copy(start);history=new History();practiceLog=[];operationCount=0;invalidate();scene?.apply(poses);updateHUD();}break;
 }
});
app.addEventListener('change',async e=>{const input=e.target as HTMLInputElement;
 if(input.id==='case-files'){
  const status=$('#load-state')!;input.disabled=true;
  try{const next=await loadCase(Array.from(input.files??[]),text=>status.textContent=text);installCase(next);const after=requestedAfterLoad;$<HTMLDialogElement>('#modal')!.close();screen='home';render();if(after==='new')newChallenge();if(after==='continue')resume();if(after==='practice')startPractice();toast(`已核验并载入 28 个真实 STL。${warning}`);
  }catch(err){status.textContent=String(err);status.classList.add('error');input.disabled=false;}return;
 }
 switch(input.id){
 case 'target-outline':outline=input.checked;initialOutline=false;hint=hint===3?0:hint;showGhosts();updateHUD();break;
 case 'initial-outline':initialOutline=input.checked;outline=false;hint=hint===3?0:hint;showGhosts();updateHUD();break;
 case 'tooth-list':select(input.value);break;
 case 'jaw':scene?.showJaw(input.value,m());selected=null;outline=initialOutline=false;updateTool();updateHUD();break;
 case 'fine':fineStep=input.checked;break;
 case 'low-mode':{const requested=input.checked;input.disabled=true;try{if(requested&&assets)await loadLowVariants(assets,text=>toast(text));low=requested;scene?.setLow(low);}catch(err){input.checked=low;toast(String(err));}finally{input.disabled=false;}break;}
 case 'reduce-motion':reduced=input.checked;if(scene)scene.reduced=reduced;document.documentElement.dataset.reduced=String(reduced);break;
 case 'show-base':showBase=input.checked;if(scene)scene.furniture.visible=showBase;break;
 case 'replay-mode':replayMode=input.value;prepareReplay();replayTime=0;updateHUD();applyReplay();break;
 }
});
app.addEventListener('input',e=>{const input=e.target as HTMLInputElement;if(input.id==='timeline'){replayTime=Number(input.value);replayPlaying=false;applyReplay();const b=$('[data-action="pause"]');if(b)b.textContent='播放';}});
window.addEventListener('keydown',e=>{if((e.target as HTMLElement).closest('input,textarea,select,[contenteditable="true"]')||$<HTMLDialogElement>('#modal')?.open||e.ctrlKey||e.metaKey||e.altKey||screen!=='play'||replaying)return;if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();nudge(e.key==='ArrowRight'?1:-1);}if(e.key==='Escape')scene?.cancelDrag();});
window.addEventListener('blur',()=>scene?.cancelDrag());
setInterval(()=>{if(!scene||!assets)return;const stats=$('#stats');if(stats)stats.textContent=`${scene.visibleTriangles().toLocaleString()} 三角形 · ${assets.bundleBase?(low?'轻量 LOD':'标准 LOD'):'原始 STL'} · ${scene.fps.toFixed(0)} fps（当前实例）`;const layer=$('#marker-layer');if(layer){const ids=[...(level===3&&!practice?['7']:[]),...(selected?[selected]:[])];layer.innerHTML=scene.directionSVG()+checks.filter(c=>c.endpoints).map(c=>{const a=c.endpoints![0],b=c.endpoints![1];const p=scene!.projectPoint(a.map((v,i)=>(v+b[i])/2) as Vec3);return p.visible?`<span class="distance-label" style="left:${p.x}px;top:${p.y}px">采样近似 ${c.value!.toFixed(3)} ${unit()}</span>`:'';}).join('')+[...new Set(ids)].map(id=>{const p=scene!.marker(id);return p?.visible?`<span class="model-label" style="left:${p.x}px;top:${p.y}px">${id==='7'&&level===3&&!practice?'▣ 固定 · ':''}模型 ${esc(id)}</span>`:'';}).join('');}},150);
render();
