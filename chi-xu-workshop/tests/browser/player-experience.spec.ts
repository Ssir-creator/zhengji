import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {initialPoses,newSession,type Manifest} from '../../src/core';
test('玩家不需要坐标读数：任务、方向、误选恢复与过关动作始终明确',async({page})=>{
 test.setTimeout(90000);await page.goto('/');await page.locator('[data-action="new"]').click();await expect(page.locator('.coach')).toContainText('现在调整①号任务牙',{timeout:60000});
 await expect(page.locator('#stats')).toHaveCount(0);await expect(page.locator('#pose-hud')).toHaveCount(0);await expect(page.locator('[data-action="axis-X"]')).toHaveCount(0);await expect(page.locator('[data-action="measure"]')).toHaveCount(0);await expect(page.locator('aside')).not.toContainText('位置误差');
 await page.locator('[data-action="intro-skip"]').click();await page.locator('.task-marker[data-action="select-5"]').click();await expect(page.locator('.coach')).toContainText('现在调整②号任务牙');await page.locator('.task-marker[data-action="select-3"]').click();
 await page.evaluate(()=>{const b=document.createElement('button');b.dataset.action='select-9';document.querySelector('#app')!.append(b);b.click();b.remove();});
 await expect(page.locator('.coach')).toContainText('这颗先不用动');await page.locator('aside [data-action="select-3"]').last().click();await expect(page.locator('.coach')).toContainText('现在调整①号任务牙');
 await page.locator('aside [data-action="guide-forward"]').click();const raw=await page.evaluate(()=>JSON.parse(localStorage.getItem('chi-xu-workshop:challenge:v1')!));expect(raw.working.poses['3'].translation).toEqual([.25,0,0]);expect(raw.working.poses['5'].translation).toEqual([0,0,0]);
 await page.locator('[data-action="undo"]').click();await expect(page.locator('.goal[data-action="select-3"] .task-bars i').first()).toHaveAttribute('style','width:0%');
 await page.screenshot({path:'docs/screenshots/player-redesign-guidance.png',fullPage:true});
 for(const [width,height] of [[1440,900],[1366,768],[1024,768]]){await page.setViewportSize({width,height});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight)).toBe(true);await expect(page.locator('[data-action="guide-forward"]').last()).toBeInViewport();await expect(page.locator('.coach')).toBeInViewport();}
});
test('改版可以恢复旧版本schema1的真实病例存档，不改资产及目标配置',async({page})=>{
 const m=JSON.parse(readFileSync('public/cases/initial/manifest.json','utf8')) as Manifest;
 const p=initialPoses(m,Object.fromEntries(Object.entries(m.prepared_assets!).map(([id,a])=>[id,a.pivot])));
 const session=newSession(m,p),working=structuredClone(p);working['3'].translation=[.5,0,0];
 const record={signature:createHash('sha256').update(JSON.stringify(m)).digest('hex'),session,working:{level:1,poses:working,history:[],redo:[],hint:0,operations:2}};
 await page.goto('/');await page.evaluate(v=>localStorage.setItem('chi-xu-workshop:challenge:v1',JSON.stringify(v)),record);await page.reload();await page.locator('[data-action="continue"]').click();await expect(page.locator('.coach')).toContainText('现在调整①号任务牙',{timeout:60000});
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('chi-xu-workshop:challenge:v1')!).working.poses['3'].translation)).toEqual([.5,0,0]);await page.locator('[data-action="guide-forward"]').last().click();expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('chi-xu-workshop:challenge:v1')!).working.poses['3'].translation)).toEqual([.75,0,0]);
});
