import {test,expect} from '@playwright/test';

test('真实牙模的任务、选中、悬停、完成和固定色只改变显示材质',async({page})=>{
 await page.goto('/');
 await page.locator('[data-action="levels"]').click();
 const result=await page.evaluate(async()=>{
  const sceneModule='/src/scene.ts',assetModule='/src/assets.ts',coreModule='/src/core.ts';
  const {WorkshopScene}=await import(sceneModule);
  const {loadBundledCase,disposeCase}=await import(assetModule);
  const {initialPoses}=await import(coreModule);
  const data=await loadBundledCase(()=>{});
  const host=document.createElement('div');host.style.cssText='position:fixed;inset:0;width:900px;height:650px';document.body.append(host);
  const scene=new WorkshopScene(host,false);
  try{
   const poses=initialPoses(data.manifest,Object.fromEntries(data.assets.map((a:{id:string;pivot:number[]})=>[a.id,a.pivot])));
   scene.load(data,poses);scene.setTaskTeeth(['3','5']);scene.setFixedTeeth(['7']);
   const tooth=scene.teeth.get('3'),geometry=tooth.geometry;
   const positions=Array.from(geometry.getAttribute('position').array);
   const before=JSON.stringify(scene.readPose('3'));
   const color=(id:string)=>scene.teeth.get(id).material.color.getHexString();
   const initial={task:color('3'),natural:color('9'),fixed:color('7')};
   scene.select('3',true,'translate',['X']);const selected=color('3');
   scene.hoverId='5';scene.updateOutline();const hover=color('5');
   scene.hoverId=undefined;scene.updateOutline();const restored=color('5');
   scene.setCompletedTeeth(['3']);const completed=color('3');
   scene.setCompletedTeeth([]);const movedAgain=color('3');
   scene.select('7',false,'translate',[]);const locked=color('7');
   return{initial,selected,hover,restored,completed,movedAgain,locked,poseUnchanged:JSON.stringify(scene.readPose('3'))===before,geometryUnchanged:tooth.geometry===geometry&&positions.every((v,i)=>v===geometry.getAttribute('position').array[i])};
  }finally{scene.dispose();disposeCase(data);host.remove();}
 });
 expect(result.initial).toEqual({task:'e8b487',natural:'eee5d3',fixed:'aab8bb'});
 expect(result.selected).toBe('f1ac46');expect(result.hover).toBe('9dcbdc');expect(result.restored).toBe('e8b487');
 expect(result.completed).toBe('88b9a5');expect(result.movedAgain).toBe('f1ac46');expect(result.locked).toBe('aab8bb');
 expect(result.poseUnchanged).toBe(true);expect(result.geometryUnchanged).toBe(true);
});
