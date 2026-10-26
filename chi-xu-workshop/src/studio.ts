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
   const compose=()=>{if(!scene)return;const w=host.clientWidth,h=host.clientHeight,wide=w>=900;scene.camera.setViewOffset(w,h,wide?-w*.14:0,wide?0:h*.06,w,h);scene.camera.updateProjectionMatrix();for(let pass=0;pass<3;pass++){scene.camera.updateMatrixWorld(true);scene.scene.updateMatrixWorld(true);const bounds=scene.projectedTeethBounds(),anchor=scene.projectPoint([scene.orbit.target.x,scene.orbit.target.y,scene.orbit.target.z]),left=w*(wide?.35:.04),right=w*.96,top=h*(wide?.10:.20),bottom=h*(wide?.85:.61);const factor=Math.max(1,(bounds.right-bounds.left)/(w*(wide?.52:.86)),(bounds.bottom-bounds.top)/(h*(wide?.64:.34)),(bounds.right-anchor.x)/(right-anchor.x),(anchor.x-bounds.left)/(anchor.x-left),(bounds.bottom-anchor.y)/(bottom-anchor.y),(anchor.y-bounds.top)/(anchor.y-top));if(factor>1.02)scene.zoom(factor*1.01);else break;}};
   scene.onResize=compose;compose();
   scene.onFailure=message=>{status.textContent=message;};
   host.dataset.ready='true';host.dataset.teeth=String(data.assets.length);
   status.textContent='真实病例 · 28 颗牙冠 · 拖动旋转，滚轮缩放';
  }catch(error){if(!cancelled)status.textContent=`牙模暂时无法显示：${String(error)}。可点击开始重试加载。`;}
 };
 void show();
 return()=>{cancelled=true;scene?.dispose();if(owned)disposeCase(owned);};
}
