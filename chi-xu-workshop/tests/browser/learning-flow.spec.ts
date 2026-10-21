import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {copy,initialPoses,newSession,commitStage,type Manifest} from '../../src/core';
const KEY='chi-xu-workshop:challenge:v1';
test('真实操作教学与过关对比：先操作再撤销，对比不能改进度',async({page})=>{
 test.setTimeout(150000);await page.goto('/');await page.locator('[data-action="new"]').click();
 await expect(page.locator('.intro')).toHaveAttribute('data-step','1',{timeout:60000});
 await expect(page.locator('#toolbar [data-action="tool-rotate"]')).toHaveCount(0);
 const initial=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)!).working.poses,KEY);
 await page.screenshot({path:'docs/screenshots/tutorial-step1.png',fullPage:true});
 await page.locator('.task-marker[data-action="select-3"]').click();await expect(page.locator('.intro')).toHaveAttribute('data-step','2');
 await page.locator('#toolbar [data-action="guide-forward"]').click();await expect(page.locator('.intro')).toHaveAttribute('data-step','3');
 expect(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)!).working.poses['3'].translation[0],KEY)).toBe(.25);
 await page.locator('#toolbar [data-action="undo"]').click();await expect(page.locator('.intro')).toHaveAttribute('data-step','4');
 expect(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)!).working.poses,KEY)).toEqual(initial);
 await page.locator('[data-action="intro-next"]').click();await expect(page.locator('.intro')).toHaveCount(0);
 await page.locator('#toolbar [data-action="guide-forward"]').click();
 const working=await page.evaluate(k=>localStorage.getItem(k),KEY);
 await page.locator('aside [data-action="compare-before"]').click();
 await expect(page.locator('#toolbar [data-action="undo"]')).toBeDisabled();
 await expect(page.locator('#toolbar [data-action="guide-forward"]')).toBeDisabled();
 await page.keyboard.press('ArrowRight');expect(await page.evaluate(k=>localStorage.getItem(k),KEY)).toBe(working);
 await page.locator('aside [data-action="compare-exit"]').click();
 await expect(page.locator('#toolbar [data-action="undo"]')).toBeEnabled();await page.locator('#toolbar [data-action="undo"]').click();

 for(const id of ['3','5']){await page.locator(`aside [data-action="select-${id}"]`).first().click();for(let i=0;i<6;i++)await page.locator('#toolbar [data-action="guide-forward"]').click();}
 await page.locator('#toolbar [data-action="review"]').click();await page.locator('[data-action="save-stage"]').click();
 await expect(page.locator('.learning-summary')).toContainText('位置改变了，方向不一定改变');
 await expect(page.locator('.learning-summary table')).toContainText('1.50');
 const saved=await page.evaluate(k=>localStorage.getItem(k),KEY);
 await page.locator('aside [data-action="compare-before"]').click();await expect(page.locator('#comparison-banner')).toContainText('本关起点');
 await page.keyboard.press('ArrowRight');expect(await page.evaluate(k=>localStorage.getItem(k),KEY)).toBe(saved);
 await page.screenshot({path:'docs/screenshots/comparison-before.png',fullPage:true});
 await page.locator('aside [data-action="compare-after"]').click();await expect(page.locator('#comparison-banner')).toContainText('当前结果');
 await page.locator('aside [data-action="compare-exit"]').click();await expect(page.locator('#comparison-banner')).toBeHidden();
 expect(await page.evaluate(k=>localStorage.getItem(k),KEY)).toBe(saved);
 await page.locator('.reflection summary').click();await expect(page.locator('.reflection')).toContainText('平移与旋转');
 await page.screenshot({path:'docs/screenshots/learning-finish.png',fullPage:true});
 await page.locator('[data-action="next"]').click();expect(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)!).working.poses['3'].translation[0],KEY)).toBe(1.5);
});
test('第三关四个实际标记在不同屏幕不重叠，也不盖住自身牙齿锚点',async({page})=>{
 const m=JSON.parse(readFileSync('public/cases/initial/manifest.json','utf8')) as Manifest;
 const initial=initialPoses(m,Object.fromEntries(Object.entries(m.prepared_assets!).map(([id,a])=>[id,a.pivot])));
 let session=newSession(m,initial),p=copy(initial);
 for(const level of [1,2]){for(const [id,target] of Object.entries(m.levels[level-1].target_pose))p[id]={...copy(target),pivot:initial[id].pivot};session=commitStage(session,m,level,p,[],0,0);}
 session.current_level=3;const record={signature:createHash('sha256').update(JSON.stringify(m)).digest('hex'),session};
 await page.goto('/');await page.evaluate(({key,record})=>localStorage.setItem(key,JSON.stringify(record)),{key:KEY,record});await page.reload();await page.locator('[data-action="continue"]').click();
 await expect(page.locator('.task-marker')).toHaveCount(3,{timeout:60000});
 for(const width of [1440,1024,390]){
  await page.setViewportSize({width,height:900});
  await expect.poll(async()=>page.locator('[data-marker]').evaluateAll(nodes=>{
   const host=document.querySelector('#viewport')!.getBoundingClientRect();const rects=nodes.filter(node=>!(node as HTMLElement).hidden).map(node=>({r:node.getBoundingClientRect(),x:host.x+Number((node as HTMLElement).dataset.anchorX),y:host.y+Number((node as HTMLElement).dataset.anchorY)}));
   return rects.length===4&&rects.every((a,i)=>a.r.width===(innerWidth<760?58:76)&&a.r.left>=host.left&&a.r.right<=host.right&&a.r.top>=host.top&&a.r.bottom<=host.bottom&&!(a.x>=a.r.left&&a.x<=a.r.right&&a.y>=a.r.top&&a.y<=a.r.bottom)&&rects.slice(i+1).every(b=>a.r.right<=b.r.left||b.r.right<=a.r.left||a.r.bottom<=b.r.top||b.r.bottom<=a.r.top));
  })).toBe(true);
  await page.screenshot({path:`docs/screenshots/markers-${width}.png`,fullPage:true});
 }
});
