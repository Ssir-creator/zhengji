import { loadBundledCase,disposeCase,type CaseAssets } from './assets';
import { identity } from './core';
import { WorkshopScene } from './scene';

// A separate display instance never writes challenge state or changes tooth geometry.
export function mountStudio(host:HTMLElement,status:HTMLElement,existing:CaseAssets|null){
 let cancelled=false,scene:WorkshopScene|null=null,owned:CaseAssets|null=null;
 const show=async()=>{
  try{
   const data=existing??await loadBundledCase(text=>{if(!cancelled)status.textContent=text;});
   if(!existing)owned=data;
   if(cancelled){if(owned)disposeCase(owned);return;}
   scene=new WorkshopScene(host,false);
   scene.load(data,Object.fromEntries(data.assets.map(a=>[a.id,identity(a.pivot)])));
   scene.onFailure=message=>{status.textContent=message;};
   host.dataset.ready='true';host.dataset.teeth=String(data.assets.length);
   status.textContent='真实病例 · 28 颗牙冠 · 拖动旋转，滚轮缩放';
  }catch(error){if(!cancelled)status.textContent=`牙模暂时无法显示：${String(error)}。可点击开始重试加载。`;}
 };
 void show();
 return()=>{cancelled=true;scene?.dispose();if(owned)disposeCase(owned);};
}
