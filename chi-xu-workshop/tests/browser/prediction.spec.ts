import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {referenceCase} from '../../src/prediction';
const oldKey='chi-xu-workshop:challenge:v1',key='chi-xu-workshop:prediction:v1';
const m=JSON.parse(readFileSync('public/cases/initial/manifest.json','utf8'));
const reference=JSON.parse(readFileSync('public/cases/initial/prediction/reference.json','utf8'));
const data=referenceCase(reference,m,Object.fromEntries(Object.entries(m.prepared_assets).map(([id,a])=>[id,(a as {pivot:[number,number,number]}).pivot])));
test('真实28冠预测：原始对比、三批继承、恢复、逐牙完成与旧进度隔离',async({page})=>{
 test.setTimeout(180000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');const old='{"legacy":"keep this exact text"}';await page.evaluate(({oldKey,old})=>localStorage.setItem(oldKey,old),{oldKey,old});await page.reload();
 await page.locator('[data-action="prediction"]').click();await expect(page.locator('#reference-heading')).toContainText('第 1 批',{timeout:60000});
 const action=(s:string)=>page.locator(`[data-pred-action="${s}"]`);
 await expect(page.locator('#reference-total')).toContainText('0 / 28');await expect(action('save')).toBeDisabled();
 await expect(page.locator('#reference-path, #reference-controls input[type=range]')).toHaveCount(0);
 const initial=await page.evaluate(k=>localStorage.getItem(k),key);const bar=page.getByRole('progressbar');const box=(await bar.boundingBox())!;
 await page.mouse.move(box.x+1,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width-1,box.y+box.height/2,{steps:5});await page.mouse.up();await page.keyboard.press('End');
 await expect(page.locator('#reference-percent')).toHaveText('0%');expect(await page.evaluate(k=>localStorage.getItem(k),key)).toBe(initial);await expect(action('save')).toBeDisabled();
 await action('forward').click();await expect(page.locator('#reference-percent')).toHaveText('10%');
 await action('undo').click();await expect(page.locator('#reference-percent')).toHaveText('0%');
 await action('redo').click();await expect(page.locator('#reference-percent')).toHaveText('10%');
 const saved=await page.evaluate(k=>localStorage.getItem(k),key);
 await action('original').click();await expect(page.locator('#reference-banner')).toContainText('原始牙列');await expect(action('forward')).toBeDisabled();
 await page.screenshot({path:'docs/screenshots/reference-original.png',fullPage:true});
 await action('target').click();await expect(page.locator('#reference-banner')).toContainText('仅查看');
 await page.screenshot({path:'docs/screenshots/reference-predicted.png',fullPage:true});
 expect(await page.evaluate(k=>localStorage.getItem(k),key)).toBe(saved);
 await action('current').click();await page.setViewportSize({width:390,height:900});
 await expect(action('forward')).toBeInViewport();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:'docs/screenshots/reference-mobile.png',fullPage:true});
 await page.setViewportSize({width:1440,height:900});
 for(let i=0;i<3;i++){
  for(const id of data.groups[i]){await action('select-'+id).click();const step=Number((await page.locator('#reference-percent').innerText()).replace('%',''))/10;if(step<10){await action('forward').click();
   // Keep one real pointer click per tooth; the remaining individual button events avoid hundreds of software-WebGL actionability waits.
   await action('forward').evaluate((_,remaining)=>{for(let n=0;n<remaining;n++){const button=document.querySelector<HTMLButtonElement>('[data-pred-action=forward]');if(!button||button.disabled)throw Error('参考步进提前禁用');button.click();}},9-step);
  }await expect(page.locator('#reference-percent')).toHaveText('100%');}
  await expect(action('save')).toBeEnabled();
  if(i===0){await expect(page.locator('#reference-total')).toContainText('9 / 28');await expect(page.locator('#reference-sidebar')).toContainText('19 颗未到参考位置');}
  await action('save').click();
  if(i===0){await page.reload();await page.locator('[data-action="prediction"]').click();await expect(page.locator('#reference-heading')).toContainText('第 2 批',{timeout:60000});const p=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)!),key);for(const id of data.groups[0])expect(p.steps[id]).toBe(10);}
 }
 await expect(page.locator('#reference-heading')).toHaveText('28 颗到达预测参考');await expect(page.locator('#reference-total')).toContainText('28 / 28');
 await expect(page.locator('#reference-sidebar')).toContainText('不是经临床审核');await expect(action('save')).toHaveCount(0);await expect(action('forward')).toBeDisabled();
 await page.screenshot({path:'docs/screenshots/reference-completed.png',fullPage:true});
 const downloadEvent=page.waitForEvent('download');await action('export').click();const download=await downloadEvent;const path=(await download.path())!;const record=JSON.parse(readFileSync(path,'utf8'));
 expect(record.poses).toEqual(data.target);expect(record.progress.completed).toHaveLength(3);
 expect(await page.evaluate(k=>localStorage.getItem(k),oldKey)).toBe(old);expect(errors).toEqual([]);
 await action('exit').first().click();await expect(page.locator('#title-studio')).toHaveAttribute('data-ready','true');
 expect(await page.evaluate(k=>localStorage.getItem(k),oldKey)).toBe(old);
});
test('参考记录不兼容时保留原文，不重置旧进度',async({page})=>{
 await page.goto('/');const raw=JSON.stringify({schema:1,reference_id:'wrong-version'}),old='old challenge untouched';
 await page.evaluate(({key,raw,oldKey,old})=>{localStorage.setItem(key,raw);localStorage.setItem(oldKey,old);},{key,raw,oldKey,old});
 await page.reload();await page.locator('[data-action="prediction"]').click();await expect(page.locator('#notice')).toContainText('原记录已保留',{timeout:60000});
 expect(await page.evaluate(k=>localStorage.getItem(k),key)).toBe(raw);expect(await page.evaluate(k=>localStorage.getItem(k),oldKey)).toBe(old);
});
test('保存失败不应用参考步进，不把未保存进度当过关',async({page})=>{
 await page.goto('/');await page.locator('[data-action="prediction"]').click();await expect(page.getByRole('progressbar')).toBeVisible({timeout:60000});
 const before=await page.evaluate(k=>localStorage.getItem(k),key);
 await page.evaluate(()=>{Storage.prototype.setItem=()=>{throw new DOMException('quota','QuotaExceededError');};});
 await page.locator('[data-pred-action="forward"]').click();await expect(page.locator('#reference-controls [role="status"]')).toContainText('保存失败');
 await expect(page.locator('#reference-percent')).toHaveText('0%');await expect(page.locator('[data-pred-action="save"]')).toBeDisabled();
 expect(await page.evaluate(k=>localStorage.getItem(k),key)).toBe(before);
});
test('窄屏操作区不遮挡实际牙模画布',async({page})=>{
 await page.setViewportSize({width:390,height:900});await page.goto('/');await expect(page.locator('#title-studio')).toHaveAttribute('data-ready','true',{timeout:60000});
 await page.screenshot({path:'docs/screenshots/reference-home-mobile.png',fullPage:true});await page.locator('[data-action="prediction"]').click();
 await expect(page.getByRole('progressbar')).toBeVisible({timeout:60000});await page.locator('[data-pred-action="forward"]').click();
 await expect.poll(async()=>{
  const panel=await page.locator('#reference-controls').boundingBox(),canvas=await page.locator('#reference-viewport canvas').boundingBox();
  return !!panel&&!!canvas&&canvas.y>=panel.y+panel.height&&canvas.height>=180;
 }).toBe(true);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
