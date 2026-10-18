import './style.css';
import {chapters,circles,taskName,guidance} from './player';
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
function select(id:string){scene?.cancelDrag();selected=id;if(!allowed().includes(axis))axis=allowed()[0]??'X';event('select',id);if(!editable())toast('这颗暂时不用动。点任务卡上的标记牙，就能继续。');updateTool();updateHUD();}
function updateTool(){scene?.select(selected,editable(),tool,allowed());scene?.setTaskTeeth(practice||screen==='finish'?[]:current().allowed_teeth);}
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
function applyReplay(){const max=replayFrames.length-1;const t=Math.min(max,Math.max(0,replayTime));const i=Math.min(Math.floor(t),Math.max(0,max-1));const value=interpolate(replayFrames[i],replayFrames[Math.min(i+1,max)],t-i);scene?.apply(value);const slider=$<HTMLInputElement>('#timeline');if(slider)slider.value=String(t);const text=$('#replay-position');if(text)text.textContent=replayMode==='stages'?`刚开始 → 第 ${Math.min(max,Math.ceil(t))} 关`:`操作 ${Math.ceil(t)} / ${max}`;}
function replayTick(now:number){if(!replaying)return;if(replayPlaying&&replayPrevious){replayTime+=(now-replayPrevious)/1800;if(replayTime>=replayFrames.length-1){replayTime=replayFrames.length-1;replayPlaying=false;const b=$('[data-action="pause"]');if(b)b.textContent='播放';}}replayPrevious=now;applyReplay();requestAnimationFrame(replayTick);}
function exitReplay(){replaying=false;replayPlaying=false;if(replayOriginal){poses=copy(replayOriginal);scene?.apply(poses);}replayOriginal=null;updateTool();updateHUD();}
function measure(){if(!assets||measurePending||replaying)return;
 if(!m().adjacency_confirmed||!m().adjacency.length){checks=baseChecks();updateHUD();toast(checks[0].reason);return;}
 measureWorker?.terminate();measureWorker=new Worker(new URL('./measure.worker.ts',import.meta.url),{type:'module'});const request=++measureRequest;measurePending=true;updateHUD();
 measureWorker.onmessage=({data})=>{if(data.request!==measureRequest)return;measurePending=false;
 if(data.error){checks=[{...baseChecks()[0],status:'failed',reason:data.error},baseChecks()[1]];}else{scene?.clearLines();checks=data.results.map((r:{pair:string[];distance:number;sample_count:number;endpoints:[Vec3,Vec3]})=>({check_id:'surface',status:'completed',method:`模型 ${r.pair.join('—')} · 原始 STL 确定性均匀面序三角形重心采样近似`,value:r.distance,unit:unit(),sample_count:r.sample_count,reason:'非负采样距离不能判断穿透。',computed_at:new Date().toISOString(),asset_version:m().asset_version,endpoints:r.endpoints} satisfies Check));checks.push(baseChecks()[1]);for(const c of checks)if(c.endpoints)scene?.line(c.endpoints,c.method);}
 updateHUD();if($<HTMLDialogElement>('#modal')?.open&&$('#pose-hud'))openDetails();};measureWorker.onerror=()=>{measurePending=false;checks=[{...baseChecks()[0],status:'failed',reason:'测量 Worker 执行失败，请重试。'},baseChecks()[1]];updateHUD();};
 measureWorker.postMessage({request,poses:copy(poses),pairs:m().adjacency,samples:Object.fromEntries(assets.assets.map(a=>[a.id,a.samples]))});}
function saveStage(){if(!session)return;scene?.cancelDrag();const goals=evaluate(poses,start,m(),level);if(!canSave(goals,checks,current()))return toast('还有牙齿没调整好，先跟着任务卡继续试试。');if(session.saved_snapshots.length>=level&&!confirm('保存此阶段将清除其后阶段记录。是否继续？'))return;try{const next=commitStage(session,m(),level,poses,checks,operationCount,hint);if(!persistCandidate(next))return;session=next;event('save_stage',String(level));screen='finish';render();}catch(e){toast(String(e));}}
function render(){
 scene?.dispose();scene=null;replaying=false;measureRequest++;measurePending=false;measureWorker?.terminate();measureWorker=null;
 const playing=['play','review','finish'].includes(screen);document.body.dataset.screen=screen;
 app.innerHTML=`<header class="${playing?'in-game':''}"><button class="brand" data-action="home"><span class="brand-mark">齿</span><span>齿序工坊<small>一个小小的牙齿工作室</small></span></button><nav>${btn(playing?'关卡地图':'三个小挑战','levels')}${!playing?btn('牙模资源','assets'):''}${btn('☷ 菜单','settings')}</nav></header><main id="main"></main><footer>一颗一颗，慢慢调整。<span>自主练习 · 随时可以重来</span></footer><div id="notice" role="status" aria-live="polite"></div><dialog id="modal"></dialog>`;
 const main=$('#main')!;
 if(screen==='home'){
 main.innerHTML=`<section class="home"><div class="home-copy"><div class="eyebrow">欢迎来到你的小工作台</div><h1>挪一挪，转一转。<br><span>让牙齿各就各位。</span></h1><p class="lead">没有倒计时，也不用怕做错。<br>跟着三个小挑战，一步一步试试看。</p><div class="home-card">${hasSave()?btn('继续上次的挑战　▷','continue',true):btn('开始三个小挑战　▷','new',true)}${hasSave()?btn('重新开始','new'):''}${btn('自由玩一会儿','practice')}<small>可以撤销、看提示，也可以重新尝试。</small></div><p class="asset-status">${assets?'牙模准备好了':'牙齿已准备好，点击开始就能玩'}</p></div><figure class="hero"><img src="/design/workbench.png" alt="PDF工作台视觉参考，不是运行中的病例"><figcaption>工作室氛围参考图</figcaption><div class="hero-note"><span>01 → 03</span><strong>同一副牙模<br>三个接着完成的小挑战</strong></div></figure></section>${warning?`<div class="warning">${esc(warning)}${btn('导出旧记录','export-raw')}</div>`:''}<section class="steps">${chapters.map((c,i)=>`<div><span>0${i+1}</span><strong>${c.title}</strong><small>${c.objective}</small></div>`).join('')}</section>`;
 }else if(screen==='levels'){
 const count=session?.saved_snapshots.length??0;
 main.innerHTML=`<section class="page-heading"><span class="eyebrow">你的挑战地图</span><h1>在这张桌上，完成三个小挑战。</h1><p>上一关调整好的牙，会原样带到下一关。</p></section><section class="level-grid">${chapters.map((c,i)=>{const locked=i>count;return `<article class="level-card ${locked?'locked':''}"><span class="level-number">0${i+1}</span><span class="pill">${locked?'🔒 还没解锁':i<count?'✓ 已完成':'轮到这里啦'}</span><div class="stage-symbol">${['↔','↻','◇'][i]}</div><h2>${c.title}</h2><p>${c.objective}</p>${btn(locked?'先完成前一个挑战':i<count?'再试一次':'开始这一关',`stage-${i+1}`,!locked,locked)}</article>`;}).join('')}</section><p class="muted">重玩时会保留原记录。只有你确认保存新的结果，才会清除后面的进度。</p>`;
 }else{
 main.innerHTML=`<div class="game-heading"><div><span class="eyebrow">${practice?'随便试试 · 不影响挑战':`第 ${level} 个小挑战`}</span><h2>${practice?'自由玩一会儿':chapters[level-1].title}</h2></div><div class="stage-track">${chapters.map((c,i)=>`<span class="${i+1===level&&!practice?'current':''} ${i<(session?.saved_snapshots.length??0)?'done':''}"><b>${i<(session?.saved_snapshots.length??0)?'✓':i+1}</b>${c.short}</span>`).join('')}</div><span id="save-label">${practice?'独立练习':saveStatus}</span></div>
 <section class="workspace"><div class="viewport-shell"><div id="viewport"><div id="marker-layer"></div><div id="geometry-error" class="geometry-error" hidden></div></div><div class="viewbar">${btn('⌂ 回到桌面','view-overview')}${btn('从上面看','view-occlusal',false,!m().cameras?.occlusal)}${btn('换个角度','view-front',false,!m().cameras?.front)}${btn('另一侧','view-side',false,!m().cameras?.side)}${btn('−','zoom-out')}${btn('＋','zoom-in')}</div><div class="view-help">拖动空白处看一看 · 滚轮拉近或拉远</div></div><aside id="sidebar"></aside></section><div id="toolbar"></div>`;
 try{
  scene=new WorkshopScene($('#viewport')!);scene.load(assets!,poses);scene.setLow(low);scene.reduced=reduced;scene.furniture.visible=showBase;
  scene.onSelect=select;scene.onFailure=message=>{const el=$('#geometry-error')!;el.hidden=false;el.innerHTML=`<h3>画面暂时打不开</h3><p>${esc(message)}</p>${btn('再试一次','retry')}${btn('保存一份记录','export')}`;};
  scene.onPreview=(id,p)=>{const next=constrain(id,p);scene!.apply({[id]:next});invalidate();updateHUD({...poses,[id]:next});updatePoseHUD(next);};
  scene.onCommit=(id,b,a)=>record(id,b,constrain(id,a));updateTool();showGhosts();
 }catch(e){$('#geometry-error')!.hidden=false;$('#geometry-error')!.innerHTML=`<h3>画面暂时打不开</h3><p>${esc(e)}</p>${btn('再试一次','retry')}${btn('保存记录','export')}`;}
 updateHUD();
 }
 document.documentElement.dataset.reduced=String(reduced);
}
function updatePoseHUD(preview?:Pose){const node=$('#pose-hud');if(!node)return;const p=preview??(selected?poses[selected]:null);const q=p?new Quaternion(...p.quaternion):null;const angle=q?2*Math.acos(Math.min(1,Math.abs(q.w)))*180/Math.PI:0;node.innerHTML=p?`<strong>模型 ${esc(selected)}</strong><span>${editable()?'可调整':'▣ 固定 / 仅查看'}</span><span>${tool==='translate'?'平移':'旋转'} · ${esc(allowedLabel())}</span><span>Δ ${p.translation.map(v=>v.toFixed(2)).join(' / ')} ${unit()}</span><span>相对原始朝向 ${angle.toFixed(2)}°${scene?.before?` · 本次 Δ ${poseError(scene.before,p).rotation.toFixed(2)}°`:""}</span>`:'点击牙冠，或从任务卡选择模型';}
function checkHTML(){return checks.map(c=>`<div class="check ${c.status}"><strong>${c.check_id==='surface'?'表面采样距离':'穿透检查'} · ${({'completed':'已完成','not_computed':'未计算','failed':'失败','not_applicable':'不适用'})[c.status]}</strong>${c.value!==null?`<b>${c.value.toFixed(3)} ${unit()}</b><small>${esc(c.method)} · ${c.sample_count} 点</small>`:''}<small>${esc(c.reason)}</small></div>`).join('');}
function updateHUD(displayPoses:Poses=poses){
 if(!assets||!['play','review','finish'].includes(screen))return;
 const goals=evaluate(displayPoses,start,m(),level),g=guidance(m(),level,displayPoses,start,selected,tool,axis),sidebar=$('#sidebar')!;
 if(replaying){
 sidebar.innerHTML=`<span class="eyebrow">回看刚才的变化</span><h2>看，你做了这些调整。</h2><p>播放的是几何变化示意，可以停下来换个角度看。</p><select id="replay-mode" aria-label="回放内容"><option value="stages" ${replayMode==='stages'?'selected':''}>三个挑战的变化</option><option value="operations" ${replayMode==='operations'?'selected':''}>每一步操作</option></select><p id="replay-position"></p><input id="timeline" aria-label="回放时间轴" type="range" min="0" max="${replayFrames.length-1}" step=".001" value="${replayTime}"><div class="timeline-nodes">${replayMode==='stages'?replayFrames.map((_,i)=>`<span>${i===0?'刚开始':'第'+i+'关'}</span>`).join(''):''}</div><div class="button-row">${btn(replayPlaying?'暂停':'播放','pause')}${btn('看完了，返回','exit-replay')}</div>`;
 }else if(screen==='finish'){
 sidebar.innerHTML=`<div class="win-sparkles" aria-hidden="true">✦　✧　✦</div><div class="badge"><img src="/icons/badge-${['space','alignment','coordination'][level-1]}-128.svg" alt="挑战完成徽章"></div><span class="eyebrow">第 ${level} 关 · 完成</span><h2>${chapters[level-1].reward}</h2><p>${chapters[level-1].next}</p><div class="completed-stages">${session!.saved_snapshots.map(s=>`<span>✓ ${chapters[s.level_id-1].short}</span>`).join('')}</div>${level<3?btn('继续，下一个挑战　→','next',true):btn('回看我的调整　▷','replay',true)}${level<3?btn('回看刚才的变化','replay'):''}${btn('自由玩一会儿','practice')}${btn('回到关卡地图','levels')}`;
 }else if(screen==='review'){
 const passed=canSave(goals,checks,current());
 sidebar.innerHTML=`<span class="eyebrow">最后检查一下</span><h2>${passed?'都调整好了，可以过关！':'还有一点点，继续试试。'}</h2><div class="goals">${g.tasks.map(x=>goalHTML(x,displayPoses)).join('')}</div><div class="keep-note">${goals.filter(x=>x.fixed).every(x=>x.passed)?'✓ 其他牙齿保持原样':'还有不该移动的牙发生了变化，请先撤销。'}</div>${!passed?`<p>${g.text}</p>`:''}${btn(passed?'收下徽章，保存这一关':'还没完成，先调整','save-stage',true,!passed)}${btn('返回，再调整一下','adjust')}<small class="soft-note">这里检查的是这次摆放练习，不代表真实治疗结果。</small>`;
 }else if(practice){
 sidebar.innerHTML=`<span class="eyebrow">没有任务，放心试</span><h2>想动哪颗，就点哪颗。</h2><p>挪一挪、转一转；不满意就撤销。这里不会改变你的挑战进度。</p><label class="practice-picker">选择一颗牙<select id="tooth-list">${m().teeth.map(t=>`<option value="${esc(t.mesh_id)}" ${selected===t.mesh_id?'selected':''}>文件 ${esc(t.mesh_id)}</option>`).join('')}</select></label>${btn('重置这次练习','reset-practice')}${btn('回到挑战地图','exit-practice',true)}`;
 }else{
 const focusAction=g.action==='select'||g.action==='next'?`select-${g.nextId}`:g.action==='rotate'?'tool-rotate':g.action==='review'?'review':tool==='rotate'&&g.active?.rotation_ok?'tool-translate':'guide-forward';
 const focusText=g.action==='select'||g.action==='next'?`去调整${taskName(m(),level,g.nextId)}`:g.action==='rotate'?'换成「转一转」':g.action==='review'?'检查一下，准备过关':'顺着箭头，试一下';
 sidebar.innerHTML=`<div class="mission-count"><span>这关要做的事</span><b>${g.completed} / ${g.tasks.length} 颗好了</b></div><h2>${chapters[level-1].objective}</h2><div class="goals">${g.tasks.map(x=>goalHTML(x,displayPoses)).join('')}</div><div class="coach"><span class="coach-avatar" aria-hidden="true">✦</span><div><strong>${g.heading}</strong><p>${g.text}</p></div></div>${btn(focusText,focusAction,true,false,'data-testid="coach-action"')}<div class="mission-actions">${btn(hint?'再给我一点提示':'不知道怎么做？','hint',false,hint===3)}${hint?btn('收起提示','hint-off'):''}</div>${hint?`<p class="hint-copy">${['','发亮、带编号的牙才是本关要动的。点任务卡也可以选中它。','画面上的箭头就是当前的调整方向，用下面的两个按钮慢慢试。','浅蓝色轮廓是目标位置；牙齿不会自动吸过去。'][hint]}</p>`:''}${intro?`<div class="intro"><strong>第一次玩？记住这 ${intro===1?'三步':intro+' / 4'}就好</strong><p>${['① 点标记牙　② 挪一挪　③ 检查过关','按箭头小步调整，挪过头可以撤销。','下一关会用到「转一转」，位置和方向都要照顾。','全部变成勾号，再点击「检查一下」。'][intro-1]}</p>${btn(intro===4?'知道了':'下一步','intro-next')}${btn('我来试试','intro-skip')}</div>`:''}<small class="soft-note">${level===3?'带盾牌的牙保持不动。':'只调整标记牙，其他牙先不用动。'}</small>`;
 }
 const canEdit=editable(),canTranslate=!!selected&&(practice||!!current().allowed_axes[selected]?.translate.length),canRotate=!!selected&&(practice||!!current().allowed_axes[selected]?.rotate.length);
 const moveName=tool==='translate'?'挪一点':'转一点';
 $('#toolbar')!.innerHTML=`<div class="toolbar"><div class="tool-group">${btn('挪一挪','tool-translate',tool==='translate',!canTranslate||screen!=='play'||replaying)}${btn('转一转','tool-rotate',tool==='rotate',!canRotate||screen!=='play'||replaying,'title="'+(!canRotate?'这一关先挪动，之后再练习旋转':'调整方向')+'"')}</div><span class="dock-divider"></span><div class="tool-group nudge-group">${practice?`<select id="practice-axis" aria-label="调整方向">${(['X','Y','Z'] as Axis[]).map(a=>`<option ${axis===a?'selected':''}>${a}</option>`).join('')}</select>`:''}${btn(practice?'− '+moveName:'反向一点',practice?'minus':'guide-back',false,!canEdit||!allowed().includes(axis))}${btn(practice?'＋ '+moveName:'顺着箭头',practice?'plus':'guide-forward',true,!canEdit||!allowed().includes(axis))}</div><span class="dock-divider"></span><div class="tool-group">${btn('撤销','undo',false,!history.undoStack.length||screen!=='play'||replaying)}${btn('重做','redo',false,!history.redoStack.length||screen!=='play'||replaying)}${btn('检查一下','review',g.ready,screen!=='play'||replaying)}${btn('查看细节','details')}</div></div>`;
 scene?.setGuide(!practice&&screen==='play'&&canEdit&&!g.active?.passed?{id:selected!,axis,sign:g.sign,tool}:null);
 updatePoseHUD();updateMarkerLayer();const save=$('#save-label');if(save)save.textContent=practice?'独立练习':saveStatus;
 if(warning.startsWith('本地进度保存失败'))toast(warning);
}
function goalHTML(g:ReturnType<typeof evaluate>[number],displayPoses:Poses=poses){
 const name=taskName(m(),level,g.id);const i=current().allowed_teeth.indexOf(g.id);const guide=guidance(m(),level,displayPoses,start,selected,tool,axis);
 return `<button class="goal ${g.passed?'passed':''} ${selected===g.id?'selected':''}" data-action="select-${esc(g.id)}"><span class="goal-icon">${g.passed?'✓':circles[i]}</span><span class="goal-copy"><strong>${name}</strong><small>${g.passed?'调整好了！':!g.position_ok?'还要挪一点':!g.rotation_ok?'再转一转':'调整好了！'}</small><span class="task-bar-labels"><span>位置${g.position_ok?' ✓':''}</span><span>方向${g.rotation_ok?' ✓':''}</span></span><span class="task-bars"><span title="位置进度"><i style="width:${guide.progress(g.id,'position')*100}%"></i></span><span title="方向进度"><i style="width:${guide.progress(g.id,'rotation')*100}%"></i></span></span></span><span class="task-status">${g.passed?'完成':selected===g.id?'正在调':'点我'}</span></button>`;
}
function openDetails(){
 const d=$<HTMLDialogElement>('#modal')!;
 d.innerHTML=`<div class="dialog-heading"><h2>练习细节</h2>${btn('返回游戏','close-modal')}</div><p class="muted">编号和读数只用于查看这次摆放练习。单位、真实牙位和教学角色仍待核对。</p><div id="pose-hud" class="pose-hud"></div><p id="stats"></p><div class="technical-goals">${evaluate(poses,start,m(),level).filter(g=>!g.fixed||!g.passed).map(g=>`<p>文件 ${esc(g.id)}：位置误差 ${g.position.toFixed(3)} ${unit()}；方向误差 ${g.rotation.toFixed(2)}°</p>`).join('')}</div><label class="toggle"><input id="target-outline" type="checkbox" ${outline?'checked':''}>显示目标轮廓</label><label class="toggle"><input id="initial-outline" type="checkbox" ${initialOutline?'checked':''}>显示起始轮廓</label><label class="toggle"><input id="fine" type="checkbox" ${fineStep?'checked':''}>更小的调整步长</label><details><summary>检查与模型信息</summary><select id="jaw" aria-label="牙列显示"><option value="all">全部牙列</option>${['upper','lower'].map(j=>`<option value="${j}" ${m().teeth.some(t=>t.jaw_group===j)?'':'disabled'}>${j==='upper'?'上颌':'下颌'}</option>`).join('')}</select>${checkHTML()}${btn(measurePending?'计算中…':'计算表面距离','measure',false,measurePending)}</details><div class="button-row">${btn('保存一份记录','export')}${btn('更换牙模资源','assets')}</div>`;
 updatePoseHUD();d.showModal();
}
function updateMarkerLayer(){
 if(!scene||!assets)return;const layer=$('#marker-layer');if(!layer)return;
 const ids=practice?(selected?[selected]:[]):[...current().allowed_teeth,...(level===3?['7']:[])];
 const signature=ids.join(',')+'|'+practice;
 if(layer.dataset.signature!==signature){layer.dataset.signature=signature;layer.innerHTML=ids.map(id=>practice?`<span class="model-label" data-marker="${id}">当前牙齿</span>`:id==='7'&&level===3?`<span class="fixed-marker" data-marker="${id}">▣ 这颗不动</span>`:`<button class="task-marker" data-marker="${id}" data-action="select-${id}" aria-label="选择${taskName(m(),level,id)}">${circles[current().allowed_teeth.indexOf(id)]}<span>点这里</span></button>`).join('');}
 for(const id of ids){const node=layer.querySelector<HTMLElement>(`[data-marker="${id}"]`),p=scene.marker(id);if(!node)continue;node.hidden=!p?.visible;if(p){node.style.left=p.x+'px';node.style.top=p.y+'px';node.classList.toggle('active',selected===id);}}
}

function installCase(next:CaseAssets){
 scene?.cancelDrag();scene?.dispose();scene=null;if(assets)disposeCase(assets);assets=next;
 const initial=initialPoses(m(),Object.fromEntries(next.assets.map(a=>[a.id,a.pivot])));
 session=newSession(m(),initial);challengeActivated=false;poses=copy(initial);start=copy(initial);history=new History();practice=false;returnChallenge=null;practiceLog=[];level=1;selected=null;hint=0;operationCount=0;checks=baseChecks();low=false;
 warning='';
}
async function loadBuiltIn(after=''){
 if(loadingBuiltIn)return;
 loadingBuiltIn=true;requestedAfterLoad=after;const loadingDialog=$<HTMLDialogElement>('#modal')!;loadingDialog.innerHTML=`<div class="loading-workbench"><span class="loading-symbol">✦</span><h2>把小工作台准备好……</h2><p id="load-state" role="status">正在搬来牙齿。</p><small>第一次需要一点时间，正在加载真实牙模。</small></div>`;loadingDialog.showModal();const input=$<HTMLInputElement>('#case-files');if(input)input.disabled=true;
 const status=$('#load-state');if(status)status.textContent='正在校验内置病例清单…';
 try{
  const next=await loadBundledCase(text=>{const label=$('#load-state');if(label){const match=text.match(/(\d+)\/28/);label.textContent=match?`正在摆好牙齿 ${match[1]} / 28`:text;}});
  installCase(next);$<HTMLDialogElement>('#modal')?.close();screen='home';render();
  if(after==='new')newChallenge();else if(after==='continue')resume();else if(after==='practice')startPractice();
 }catch(err){openAssets(after);const label=$('#load-state');if(label){label.textContent=String(err);label.classList.add('error');}else toast(String(err));}
 finally{loadingBuiltIn=false;const f=$<HTMLInputElement>('#case-files');if(f)f.disabled=false;const b=$<HTMLButtonElement>('[data-action="load-built-in"]');if(b){b.disabled=false;b.textContent='重试加载内置病例';}}
}

let requestedAfterLoad='';
function openAssets(after=''){requestedAfterLoad=after;const d=$<HTMLDialogElement>('#modal')!;d.innerHTML=`<div class="dialog-heading"><div><span class="eyebrow">病例资源 / 本机读取</span><h2>接入真实牙冠</h2></div>${btn('关闭','close-modal')}</div><p>已收到用户上传的 28 个真实 STL，可直接加载内置病例。若要更换病例，也可选择本机文件。Windows 原路径 <code>D:\\论文复现\\CLIK-Diffusion-main\\Data\\256_crown\\initial\\</code> 未直接挂载；可以选择 28 个 STL 和已填写的病例 JSON。文件仅在浏览器内解析，不上传服务器。</p><div class="warning">真实网格已接入；单位、上下颌、FDI、邻接与教学角色仍待核对。编号直接沿用 STL 文件名，不自动转换牙位。</div><ol><li>在 Windows 工作目录运行 <code>node scripts/inspect-assets.mjs --source "D:\\论文复现\\CLIK-Diffusion-main\\Data\\256_crown\\initial" --out case.draft.json</code>。</li><li>核对草稿中的模型编号、上下颌、来源、单位、相机与教学轴。未知 FDI 保持 null，未知单位使用 u。</li><li>将文件改名为 case.json，与原始 STL 一起选择。不会根据文件顺序自动映射牙位。</li></ol><label class="file-drop">选择病例 JSON 和 28 个 STL<input id="case-files" type="file" accept=".json,.stl,.STL" multiple></label><p id="load-state" role="status">${assets?`已载入：${esc(m().case_id)} · ${assets.assets.length} 颗牙冠 · ${assets.assets.reduce((s,a)=>s+a.triangles,0).toLocaleString()} 三角形`:'尚未载入病例'}</p><div class="button-row">${btn(loadingBuiltIn?'正在加载真实病例…':'加载已上传的真实病例','load-built-in',true,loadingBuiltIn)}${btn('下载参数模板','template')}${btn('导出旧存档','export-raw')}</div><p class="muted">单位、牙位和教学角色未审核时只能标为原型位姿练习。真实网格、来源审核与性能实测完成前不视为正式交付。</p>`;d.showModal();}
function template(){exportData({case_id:'请填写匿名病例ID',asset_version:'待核对-v1',config_version:'prd-v1-provisional',unit:'u',unit_confirmed:false,scale:1,source:'待核对',usage_status:'待核对',teaching_reviewed:false,adjacency_confirmed:false,adjacency:[],teeth:Array.from({length:28},(_,i)=>({mesh_id:String(i+1),mesh_uri:'请填写对应原始文件名-'+(i+1)+'.stl',checksum:'请填写实际SHA256',jaw_group:'unknown',FDI:null,origin:[0,0,0],source:'待核对',usage_status:'待核对'})),levels:defaultLevels()},'case.template.json');}
function openSettings(){const d=$<HTMLDialogElement>('#modal')!;d.innerHTML=`<div class="dialog-heading"><h2>歇一下，再继续</h2>${btn('回到游戏','close-modal',true)}</div><div class="menu-options">${btn('关卡地图','levels')}${btn('回到首页','home')}${assets?btn('保存一份记录','export'):''}</div><label class="setting"><input id="low-mode" type="checkbox" ${low?'checked':''}>画面更流畅（减少显示细节）</label><label class="setting"><input id="reduce-motion" type="checkbox" ${reduced?'checked':''}>减少动画</label><label class="setting"><input id="show-base" type="checkbox" ${showBase?'checked':''}>显示小工作台</label><details><summary>资源与练习说明</summary><p>这是一段牙齿摆放练习，不是诊疗建议。真实牙位、单位与教学角色仍待核对。触屏先使用点选和按钮；暂无音效。</p>${btn('牙模资源与导入','assets')}${assets?btn('查看练习细节','details'):''}</details>`;d.showModal();}
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
 case 'details':openDetails();break;
 case 'guide-forward':case 'guide-back':{const sign=practice?1:guidance(m(),level,poses,start,selected,tool,axis).sign;nudge((a==='guide-forward'?1:-1)*sign);break;}
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
 case 'target-outline':outline=input.checked;initialOutline=false;hint=hint===3?0:hint;{const x=$<HTMLInputElement>('#initial-outline');if(x)x.checked=false;}showGhosts();updateHUD();break;
 case 'initial-outline':initialOutline=input.checked;outline=false;hint=hint===3?0:hint;{const x=$<HTMLInputElement>('#target-outline');if(x)x.checked=false;}showGhosts();updateHUD();break;
 case 'tooth-list':select(input.value);break;case 'practice-axis':axis=input.value as Axis;updateHUD();break;
 case 'jaw':scene?.showJaw(input.value,m());selected=null;outline=initialOutline=false;updateTool();updateHUD();break;
 case 'fine':fineStep=input.checked;break;
 case 'low-mode':{const requested=input.checked;input.disabled=true;try{if(requested&&assets)await loadLowVariants(assets,text=>toast(text));low=requested;scene?.setLow(low);}catch(err){input.checked=low;toast(String(err));}finally{input.disabled=false;}break;}
 case 'reduce-motion':reduced=input.checked;if(scene)scene.reduced=reduced;document.documentElement.dataset.reduced=String(reduced);break;
 case 'show-base':showBase=input.checked;if(scene){scene.furniture.visible=showBase;scene.dirty=true;scene.renderer.shadowMap.needsUpdate=true;}break;
 case 'replay-mode':replayMode=input.value;prepareReplay();replayTime=0;updateHUD();applyReplay();break;
 }
});
app.addEventListener('input',e=>{const input=e.target as HTMLInputElement;if(input.id==='timeline'){replayTime=Number(input.value);replayPlaying=false;applyReplay();const b=$('[data-action="pause"]');if(b)b.textContent='播放';}});
window.addEventListener('keydown',e=>{if((e.target as HTMLElement).closest('input,textarea,select,[contenteditable="true"]')||$<HTMLDialogElement>('#modal')?.open||e.ctrlKey||e.metaKey||e.altKey||screen!=='play'||replaying)return;if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();nudge(e.key==='ArrowRight'?1:-1);}if(e.key==='Escape')scene?.cancelDrag();});
window.addEventListener('blur',()=>scene?.cancelDrag());
setInterval(()=>{if(!scene||!assets)return;const stats=$('#stats');if(stats)stats.textContent=`${scene.visibleTriangles().toLocaleString()} 三角形 · 按需绘制 · 原始模型单位 ${unit()}`;updateMarkerLayer();},150);
render();
