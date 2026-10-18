import {test,expect,type Page} from '@playwright/test';
import {readFileSync} from 'node:fs';
const click=(p:Page,a:string)=>p.locator(`[data-action="${a}"]`).first().click();
async function nudge(p:Page,id:string,tool:string,axis:string,sign:string,count:number){await click(p,'select-'+id);await click(p,'tool-'+tool);await click(p,'axis-'+axis);for(let i=0;i<count;i++)await click(p,sign);}
async function save(p:Page){await click(p,'review');await expect(p.locator('[data-action="save-stage"]')).toBeEnabled();await click(p,'save-stage');await expect(p.locator('#sidebar')).toContainText('教学目标已完成');}
test('用户真实牙冠：自动加载、LOD、三关连续、恢复、自由隔离和实际截图',async({page})=>{
 test.setTimeout(240000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));const originals:string[]=[];page.on('request',r=>{if(/\.stl($|\?)/.test(r.url()))originals.push(r.url());});
 await page.goto('/');await click(page,'new');await expect(page.locator('#sidebar')).toContainText('本阶段任务',{timeout:30000});await click(page,'intro-skip');
 await expect(page.locator('#pose-hud strong')).toHaveText('模型 3');await expect(page.locator('#stats')).toContainText('167,983');await expect(page.locator('.case-caveat')).toContainText('教学角色待核对');expect(originals).toEqual([]);
 await expect(page.locator('#jaw option[value="upper"]')).toBeDisabled();await expect(page.locator('#jaw option[value="lower"]')).toBeDisabled();
 const raw=()=>page.evaluate(()=>localStorage.getItem('chi-xu-workshop:challenge:v1'));
 const initial=await raw();const snapshot=JSON.parse(initial!).session.initial;expect(Object.keys(snapshot)).toHaveLength(28);expect(snapshot['16']).toBeUndefined();expect(snapshot['4'].translation).toEqual([0,4,0]);
 await click(page,'measure');await expect(page.locator('#sidebar')).toContainText('缺少已确认的邻接牙对');await page.screenshot({path:'docs/screenshots/real-stage1.png',fullPage:true});
 await click(page,'settings');await page.locator('#low-mode').check();await expect.poll(()=>page.locator('#low-mode').isEnabled(),{timeout:30000}).toBe(true);await click(page,'close-modal');await expect(page.locator('#stats')).toContainText('83,983');expect(await raw()).toBe(initial);
 await click(page,'settings');await page.locator('#low-mode').uncheck();await click(page,'close-modal');await expect(page.locator('#stats')).toContainText('167,983');
 await nudge(page,'3','translate','X','plus',6);await nudge(page,'5','translate','X','minus',6);await save(page);await click(page,'next');
 expect(JSON.parse((await raw())!).working.poses['3'].translation).toEqual([1.5,0,0]);await page.screenshot({path:'docs/screenshots/real-stage2.png',fullPage:true});
 await nudge(page,'4','translate','Y','minus',16);await nudge(page,'4','rotate','Z','minus',9);await save(page);await click(page,'next');
 await page.screenshot({path:'docs/screenshots/real-stage3.png',fullPage:true});await nudge(page,'3','translate','X','minus',2);await nudge(page,'5','translate','X','plus',2);await nudge(page,'6','translate','Y','plus',6);await nudge(page,'6','rotate','Z','plus',3);await save(page);
 const finalRaw=await raw();const completed=JSON.parse(finalRaw!).session;expect(completed.saved_snapshots).toHaveLength(3);expect(completed.saved_snapshots[2].all_poses['7']).toEqual(snapshot['7']);await page.screenshot({path:'docs/screenshots/real-complete.png',fullPage:true});
 await click(page,'replay');await page.locator('#timeline').fill('1.5');await click(page,'exit-replay');expect(await raw()).toBe(finalRaw);
 await click(page,'practice');await page.locator('#tooth-list').selectOption('7');await click(page,'plus');await click(page,'exit-practice');expect(await raw()).toBe(finalRaw);
 await click(page,'home');await page.reload();await click(page,'continue');await expect(page.locator('#sidebar')).toContainText('本阶段任务',{timeout:30000});const restored=JSON.parse((await raw())!).session;expect(restored.saved_snapshots).toEqual(completed.saved_snapshots);expect(errors).toEqual([]);
 const manifest=JSON.parse(readFileSync('public/cases/initial/manifest.json','utf8'));expect(restored.initial['3'].pivot).toEqual(manifest.prepared_assets['3'].pivot);
});
