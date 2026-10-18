import {test,expect,type Page} from '@playwright/test';
import {readFileSync} from 'node:fs';
const click=(p:Page,a:string)=>p.locator(`[data-action="${a}"]`).first().click();
async function nudge(p:Page,id:string,tool:string,axis:string,sign:string,count:number){await click(p,'select-'+id);await click(p,'tool-'+tool);for(let i=0;i<count;i++)await click(p,'guide-forward');}
async function save(p:Page){await click(p,'review');await expect(p.locator('[data-action="save-stage"]')).toBeEnabled();await click(p,'save-stage');await expect(p.locator('#sidebar')).toContainText('完成');}
test('用户真实牙冠：自动加载、LOD、三关连续、恢复、自由隔离和实际截图',async({page})=>{
 test.setTimeout(240000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));const originals:string[]=[];page.on('request',r=>{if(/\.stl($|\?)/.test(r.url()))originals.push(r.url());});
 await page.goto('/');await click(page,'new');await expect(page.locator('#sidebar')).toContainText('这关要做的事',{timeout:60000});await click(page,'intro-skip');
 await expect(page.locator('.coach')).toContainText('现在调整①号任务牙');await expect(page.locator('#pose-hud')).toHaveCount(0);await expect(page.locator('#stats')).toHaveCount(0);expect(originals).toEqual([]);
 const raw=()=>page.evaluate(()=>localStorage.getItem('chi-xu-workshop:challenge:v1'));
 const initial=await raw();const snapshot=JSON.parse(initial!).session.initial;expect(Object.keys(snapshot)).toHaveLength(28);expect(snapshot['16']).toBeUndefined();expect(snapshot['4'].translation).toEqual([0,4,0]);
 await click(page,'details');await expect(page.locator('#modal')).toContainText('缺少已确认的邻接牙对');await expect(page.locator('#jaw option[value="upper"]')).toBeDisabled();await click(page,'close-modal');await page.screenshot({path:'docs/screenshots/player-redesign-stage1.png',fullPage:true});
 await click(page,'settings');await page.locator('#low-mode').check();await expect.poll(()=>page.locator('#low-mode').isEnabled(),{timeout:30000}).toBe(true);await click(page,'close-modal');await click(page,'details');await expect(page.locator('#stats')).toContainText('83,983');await click(page,'close-modal');expect(await raw()).toBe(initial);
 await click(page,'settings');await page.locator('#low-mode').uncheck();await click(page,'close-modal');await click(page,'details');await expect(page.locator('#stats')).toContainText('167,983');await click(page,'close-modal');
 await nudge(page,'3','translate','X','plus',6);await nudge(page,'5','translate','X','minus',6);await save(page);await click(page,'next');
 expect(JSON.parse((await raw())!).working.poses['3'].translation).toEqual([1.5,0,0]);await page.screenshot({path:'docs/screenshots/player-redesign-stage2.png',fullPage:true});
 await nudge(page,'4','translate','Y','minus',16);await nudge(page,'4','rotate','Z','minus',9);await save(page);await click(page,'next');
 await page.screenshot({path:'docs/screenshots/player-redesign-stage3.png',fullPage:true});await nudge(page,'3','translate','X','minus',2);await nudge(page,'5','translate','X','plus',2);await nudge(page,'6','translate','Y','plus',6);await nudge(page,'6','rotate','Z','plus',3);await save(page);
 const finalRaw=await raw();const completed=JSON.parse(finalRaw!).session;expect(completed.saved_snapshots).toHaveLength(3);expect(completed.saved_snapshots[2].all_poses['7']).toEqual(snapshot['7']);await page.screenshot({path:'docs/screenshots/player-redesign-complete.png',fullPage:true});
 await click(page,'replay');await page.locator('#timeline').fill('1.5');await click(page,'exit-replay');expect(await raw()).toBe(finalRaw);
 await click(page,'practice');await page.locator('#tooth-list').selectOption('7');await click(page,'plus');await click(page,'exit-practice');expect(await raw()).toBe(finalRaw);
 await click(page,'home');await page.reload();await click(page,'continue');await expect(page.locator('#sidebar')).toContainText('这关要做的事',{timeout:60000});const restored=JSON.parse((await raw())!).session;expect(restored.saved_snapshots).toEqual(completed.saved_snapshots);expect(errors).toEqual([]);
 const manifest=JSON.parse(readFileSync('public/cases/initial/manifest.json','utf8'));expect(restored.initial['3'].pivot).toEqual(manifest.prepared_assets['3'].pivot);
});
