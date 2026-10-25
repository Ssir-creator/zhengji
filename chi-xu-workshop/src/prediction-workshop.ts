import type {CaseAssets} from './assets';
import {WorkshopScene} from './scene';
import {poseError} from './core';
import {layoutMarkers} from './markers';
import {PREDICTION_KEY,referenceCase,freshReference,validateReferenceProgress,referencePoses,referenceStageReady,setReferenceStep,saveReferenceStage,type Prediction,type ReferenceProgress} from './prediction';

export function mountPrediction(app:HTMLElement,assets:CaseAssets,reference:Prediction,onExit:()=>void){
 const data=referenceCase(reference,assets.manifest,Object.fromEntries(assets.assets.map(a=>[a.id,a.pivot])));
 const raw=localStorage.getItem(PREDICTION_KEY);
 let progress=raw?validateReferenceProgress(JSON.parse(raw),data):freshReference(data);
 let selected=data.groups[progress.stage-1].find(id=>progress.steps[id]<10)??data.groups[progress.stage-1][0];
 let comparison:'original'|'target'|null=null,feedback='',disposed=false;
 const undo:Array<{before:ReferenceProgress;after:ReferenceProgress}>=[],redo:typeof undo=[];
 const b=(text:string,action:string,disabled=false)=>`<button data-pred-action="${action}" ${disabled?'disabled':''}>${text}</button>`;
 app.innerHTML=`<header class="in-game"><button class="brand" data-pred-action="exit"><span class="brand-mark">齿</span><span>齿序工坊<small>参考排齐 / 28 冠</small></span></button><nav>${b('回到首页','exit')}${b('导出记录','export')}</nav></header><main class="reference-workshop"><div class="game-heading"><div><span class="eyebrow">同一病例 · 连续三批</span><h2 id="reference-heading"></h2></div><span id="reference-total"></span></div><section class="workspace"><div class="viewport-shell"><div id="reference-viewport"><div id="reference-marker-layer"></div></div><section id="reference-controls" aria-label="沿参考路径调整"></section><div id="reference-banner" role="status" hidden></div><div class="viewbar">${b('整体看','view-overview')}${b('从上面看','view-occlusal')}${b('换个角度','view-front')}${b('另一侧','view-side')}${b('放大这颗','focus')}${b('退远一点','zoom-out')}</div></div><aside id="reference-sidebar"></aside></section></main>`;
 document.body.dataset.screen='play';document.body.classList.add('reference-mode');
 const get=<T extends HTMLElement=HTMLElement>(s:string)=>app.querySelector<T>(s)!;
 const scene=new WorkshopScene(get('#reference-viewport'));
 scene.load(assets,data.original);scene.setGuide(null);
 scene.onFailure=message=>{feedback=message;hud();};
 scene.onSelect=id=>{
  if(!data.groups[progress.stage-1].includes(id)||progress.completed.length===3){feedback='这颗不属于当前批次；前面完成的结果保持原样。';hud();return;}
  selected=id;feedback='';apply();hud();
 };
 const isDone=()=>progress.completed.length===3;
 const editing=()=>!comparison&&!isDone();
 function persist(next:ReferenceProgress){
  try{validateReferenceProgress(next,data);localStorage.setItem(PREDICTION_KEY,JSON.stringify(next));return true;}
  catch{feedback='本机保存失败，刚才的更改未应用。请检查浏览器存储后重试。';hud();return false;}
 }
 function apply(){
  scene.apply(comparison==='original'?data.original:comparison==='target'?data.target:referencePoses(data,progress));
  scene.setTaskTeeth(isDone()||comparison?[]:data.groups[progress.stage-1]);scene.setFixedTeeth([]);
  scene.setCompletedTeeth(isDone()||comparison?[]:Object.keys(progress.steps).filter(id=>progress.steps[id]===10));
  scene.select(selected,editing(),'translate',[]);
  scene.ghostsAt(editing()?{[selected]:data.target[selected]}:null);
 }
 function change(step:number){
  if(!editing())return;const next=setReferenceStep(data,progress,selected,step);
  if(next.steps[selected]===progress.steps[selected]){apply();return;}
  if(!persist(next)){apply();return;}
  undo.push({before:structuredClone(progress),after:structuredClone(next)});redo.length=0;progress=next;
  feedback=step===10?'这颗已达到预测参考。其他牙是否完成仍要逐颗检查。':`当前为这颗参考路径的 ${step*10}%，移动和旋转一起变化。`;
  apply();hud();
 }
 function hud(){
  if(disposed)return;
  const group=data.groups[progress.stage-1],completed=Object.values(progress.steps).filter(n=>n===10).length,ready=referenceStageReady(data,progress);
  get('#reference-heading').textContent=isDone()?'28 颗到达预测参考':`第 ${progress.stage} 批：调整 ${group.length} 颗`;
  get('#reference-total').textContent=`全病例 ${completed} / 28 颗到达参考`;
  const error=poseError(referencePoses(data,progress)[selected],data.target[selected]);
  get('#reference-controls').innerHTML=`<div class="motion-heading"><strong>文件 ${selected} · 同时移动与旋转</strong></div><p class="motion-explanation">蓝色轮廓是这颗牙的预测目标。沿参考路径逐步靠近，不会改变牙齿形状。</p><div class="motion-buttons">${b('← 退一步','back',!editing()||progress.steps[selected]===0)}${b('朝目标前进一步 →','forward',!editing()||progress.steps[selected]===10)}</div><label class="reference-path-label">起点 <input id="reference-path" aria-label="沿参考路径调整" type="range" min="0" max="10" step="1" value="${progress.steps[selected]}" ${!editing()?'disabled':''}> 目标</label><p class="reference-readout"><span id="reference-percent">${progress.steps[selected]*10}%</span> · 距参考 ${error.position.toFixed(2)} u / ${error.rotation.toFixed(1)}°</p><div class="reference-mini-actions">${b('撤销','undo',!editing()||!undo.length)}${b('重做','redo',!editing()||!redo.length)}${b('换下一颗','next-tooth',!editing())}</div><p class="motion-feedback" role="status">${feedback}</p>`;
  get('#reference-sidebar').innerHTML=`<span class="eyebrow">${isDone()?'参考练习记录':'当前批次'}</span><h2>${isDone()?'全部 28 颗均已核对到参考位置。':`本批 ${group.filter(id=>progress.steps[id]===10).length} / ${group.length} 颗到达参考`}</h2><p class="reference-explanation">${isDone()?'最终画面使用你上传结果中的全部 28 个刚体变换。':`完成本批只代表这 ${group.length} 颗到位，仍有 ${28-completed} 颗未到参考位置，不代表整副牙齿已排齐。`}</p><div class="reference-tooth-list">${group.map((id,i)=>`<button data-pred-action="select-${id}" aria-pressed="${selected===id}" ${isDone()?'disabled':''}><span>${progress.steps[id]===10?'✓':i+1}</span><strong>文件 ${id}</strong><small>${progress.steps[id]*10}%</small></button>`).join('')}</div><div class="comparison-controls">${b('看原始牙列','original')}${b('看模型参考','target')}${comparison?b('返回当前进度','current'):''}</div>${!isDone()?b(progress.stage===3?'核对全部 28 颗并完成':`保存本批，继续第 ${progress.stage+1} 批`,'save',!ready||!!comparison):''}<p class="reference-note">${isDone()?'模型预测参考，不是经临床审核的矫正结果。':'按原文件编号分批，编号不代表已确认牙位；前批结果连续保留。'} 旧版操作练习的进度单独保留。</p>`;
  const banner=get('#reference-banner');banner.hidden=!comparison;banner.textContent=comparison=== 'original'?'原始牙列 · 仅查看，进度不变':comparison==='target'?'模型预测参考 · 仅查看，尚未完成的牙不会因此过关':'';
  drawMarker();
 }
 function drawMarker(){
  const layer=get('#reference-marker-layer'),p=scene.marker(selected);if(!p?.visible){layer.innerHTML='';return;}
  const host=scene.host.getBoundingClientRect(),sidebar=get('#reference-sidebar').getBoundingClientRect(),c=get('#reference-controls').getBoundingClientRect();
  const [label]=layoutMarkers([{id:selected,x:p.x,y:p.y}],scene.projectedTeethBounds(),host.width,host.height,host.width>=760?sidebar.left-host.left-16:host.width-12,[{left:c.left-host.left,right:c.right-host.left,top:c.top-host.top,bottom:c.bottom-host.top}]);
  layer.innerHTML=`<svg class="marker-leaders" aria-hidden="true"><path d="M ${label.side==='left'?label.left+label.width:label.left} ${label.top+label.height/2} L ${p.x} ${p.y}"/></svg><span class="reference-selected-label" style="left:${label.left}px;top:${label.top}px;width:${label.width}px;height:${label.height}px">文件 ${selected}</span>`;
 }
 const onClick=(event:Event)=>{
  const button=(event.target as HTMLElement).closest<HTMLButtonElement>('[data-pred-action]');if(!button||button.disabled)return;
  const action=button.dataset.predAction!;
  if(action==='exit'){onExit();return;}
  if(action.startsWith('view-')){scene.view(action.slice(5),assets.manifest);return;}
  if(action.startsWith('select-')){const id=action.slice(7);if(!data.groups[progress.stage-1].includes(id))return;selected=id;feedback='';apply();hud();return;}
  if(action==='original'||action==='target'||action==='current'){comparison=action==='current'?null:action;apply();hud();return;}
  if(action==='export'){
   const url=URL.createObjectURL(new Blob([JSON.stringify({progress,reference_id:reference.reference_id,source_checksums:reference.source_checksums,poses:referencePoses(data,progress)},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='齿序工坊_参考练习.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;
  }
  if(action==='focus'){const tooth=scene.teeth.get(selected)!;const offset=scene.camera.position.clone().sub(scene.orbit.target).normalize().multiplyScalar(scene.size*.65);scene.orbit.target.copy(tooth.position);scene.camera.position.copy(tooth.position).add(offset);scene.orbit.update();return;}
  if(action==='zoom-out'){scene.zoom(1.25);return;}
  if(!editing())return;
  if(action==='forward'||action==='back'){change(progress.steps[selected]+(action==='forward'?1:-1));return;}
  if(action==='next-tooth'){const group=data.groups[progress.stage-1],i=group.indexOf(selected);selected=group.slice(i+1).concat(group.slice(0,i+1)).find(id=>progress.steps[id]<10)??group[(i+1)%group.length];feedback='';apply();hud();return;}
  if(action==='undo'||action==='redo'){
   const from=action==='undo'?undo:redo,to=action==='undo'?redo:undo,item=from.at(-1);if(!item)return;const next=action==='undo'?item.before:item.after;
   if(!persist(next))return;from.pop();to.push(item);progress=structuredClone(next);feedback=action==='undo'?'已撤销上一步。':'已重做上一步。';apply();hud();return;
  }
  if(action==='save'){
   const next=saveReferenceStage(data,progress);if(!persist(next))return;progress=next;undo.length=redo.length=0;selected=data.groups[progress.stage-1][0];feedback=isDone()?'已核对全部 28 颗达到预测参考。':'前一批结果已保存并连续带入当前批次。';apply();hud();
  }
 };
 const onChange=(event:Event)=>{const input=event.target as HTMLInputElement;if(input.id==='reference-path')change(Number(input.value));};
 const onInput=(event:Event)=>{const input=event.target as HTMLInputElement;if(input.id==='reference-path'&&editing()){const next=setReferenceStep(data,progress,selected,Number(input.value));scene.apply(referencePoses(data,next));get('#reference-percent').textContent=`${Number(input.value)*10}%`;}};
 app.addEventListener('click',onClick);app.addEventListener('change',onChange);app.addEventListener('input',onInput);
 if(!raw)persist(progress);apply();hud();const timer=setInterval(drawMarker,150);
 return()=>{disposed=true;clearInterval(timer);app.removeEventListener('click',onClick);app.removeEventListener('change',onChange);app.removeEventListener('input',onInput);scene.dispose();document.body.classList.remove('reference-mode');};
}
