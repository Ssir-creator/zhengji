import {test,expect,type Page} from '@playwright/test';
import {createHash} from 'node:crypto';
import {manifest} from '../fixtures';
import {PerspectiveCamera,Vector3} from 'three';
/** 28 spatially separate tetrahedra. These are TEST FIXTURES, never shipped as dental models. */
function files(){const m=manifest();const list=[];
 for(let i=0;i<28;i++){
  const x=(i%7)*4-12,y=Math.floor(i/7)*4-6,z=0;const v=[[x,y,z],[x+1,y,z],[x,y+1,z],[x,y,z+1]];
  const text='solid NON_ANATOMICAL_TEST_ONLY\n'+[[0,2,1],[0,1,3],[1,2,3],[2,0,3]].map(tri=>'facet normal 0 0 1\nouter loop\n'+tri.map(n=>'vertex '+v[n].join(' ')).join('\n')+'\nendloop\nendfacet').join('\n')+'\nendsolid';
  const buffer=Buffer.from(text);m.teeth[i].checksum=createHash('sha256').update(buffer).digest('hex');list.push({name:m.teeth[i].mesh_uri,mimeType:'application/octet-stream',buffer});
 }
 m.cameras={overview:{position:[0,-50,50],target:[0,0,0],up:[0,0,1]},occlusal:{position:[0,0,60],target:[0,0,0],up:[0,1,0]},front:{position:[0,-60,0],target:[0,0,0],up:[0,0,1]},side:{position:[60,0,0],target:[0,0,0],up:[0,0,1]}};m.adjacency_confirmed=true;m.adjacency=[['3','4']];
 return [...list,{name:'case.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(m))}];
}
const click=(p:Page,a:string)=>p.locator(`[data-action="${a}"]`).first().click();
async function load(p:Page){await p.goto('/');await click(p,'assets');await p.locator('#case-files').setInputFiles(files());await expect(p.locator('dialog')).not.toBeVisible();await click(p,'new');await expect(p.locator('#sidebar')).toContainText('这关要做的事');await click(p,'intro-skip');}
async function nudge(p:Page,id:string,tool:string,axis:string,sign:string,count:number){await click(p,'select-'+id);await click(p,'tool-'+tool);for(let i=0;i<count;i++)await click(p,'guide-forward');}
async function save(p:Page){await click(p,'review');await expect(p.locator('[data-action="save-stage"]')).toBeEnabled();await click(p,'save-stage');await expect(p.locator('#sidebar')).toContainText('完成');}
test('缺少资源时保持真实空状态；首页与设置在三种分辨率可用',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/cases/initial/manifest.json',r=>r.fulfill({status:404,body:'missing test'}));await page.goto('/');await expect(page.getByText('牙齿已准备好，点击开始就能玩')).toBeVisible();await expect(page.locator('[data-action="continue"]')).toHaveCount(0);await click(page,'new');await expect(page.locator('dialog')).toContainText('28 个 STL');await expect(page.locator('#load-state')).toContainText('内置病例暂不可用');await click(page,'close-modal');
 for(const [width,height] of [[1440,900],[1366,768],[1024,768]]){await page.setViewportSize({width,height});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
 await page.setViewportSize({width:1440,height:900});await page.screenshot({path:'test-results/home-1440.png',fullPage:true});await click(page,'settings');await page.locator('#reduce-motion').check();await click(page,'close-modal');expect(errors).toEqual([]);
});
test('真实导入路径的校验拒绝错误 checksum；不留半载入状态',async({page})=>{await page.goto('/');await click(page,'assets');const data=files();const manifest=JSON.parse(data.at(-1)!.buffer.toString());manifest.teeth[0].checksum='0'.repeat(64);data.at(-1)!.buffer=Buffer.from(JSON.stringify(manifest));await page.locator('#case-files').setInputFiles(data);await expect(page.locator('#load-state')).toContainText('SHA-256');await click(page,'close-modal');await expect(page.getByText('牙齿已准备好，点击开始就能玩')).toBeVisible();});
test('三关继承、固定、撤销、测量、恢复、自由隔离、回放及前关失效',async({page})=>{test.setTimeout(150000);
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await load(page);
 await expect(page.locator('#viewport canvas')).toBeVisible();await expect(page.locator('[data-action="tool-rotate"]')).toBeDisabled();await expect(page.locator('[data-action="axis-Y"]')).toHaveCount(0);
 await nudge(page,'3','translate','X','plus',6);await click(page,'undo');await click(page,'details');await expect(page.locator('#pose-hud')).toContainText('1.25');await click(page,'close-modal');await click(page,'redo');await nudge(page,'5','translate','X','minus',6);
 await click(page,'details');await page.locator('details').evaluate(e=>{(e as HTMLDetailsElement).open=true;});await click(page,'measure');await expect(page.locator('#modal')).toContainText('表面采样距离 · 已完成');await expect(page.locator('#modal')).toContainText('穿透检查 · 未计算');await click(page,'close-modal');await save(page);
 const s1=await page.evaluate(()=>JSON.parse(localStorage.getItem('chi-xu-workshop:challenge:v1')!).session.saved_snapshots[0]);expect(s1.all_poses['3'].translation[0]).toBe(1.5);expect(s1.all_poses['4'].translation[1]).toBe(4);
 await click(page,'next');await nudge(page,'4','translate','Y','minus',16);await click(page,'review');await expect(page.locator('[data-action="save-stage"]')).toBeDisabled();await click(page,'adjust');await nudge(page,'4','rotate','Z','minus',9);await save(page);await click(page,'next');
 await nudge(page,'3','translate','X','minus',2);await nudge(page,'5','translate','X','plus',2);await nudge(page,'6','translate','Y','plus',6);await nudge(page,'6','rotate','Z','plus',3);await save(page);
 const recordBefore=await page.evaluate(()=>localStorage.getItem('chi-xu-workshop:challenge:v1'));const s=JSON.parse(recordBefore!).session;expect(s.saved_snapshots).toHaveLength(3);expect(s.saved_snapshots[2].all_poses['7']).toEqual(s.initial['7']);
 await click(page,'replay');await expect(page.locator('#sidebar')).toContainText('几何变化示意');await page.locator('#timeline').fill('1.5');await click(page,'exit-replay');expect(await page.evaluate(()=>localStorage.getItem('chi-xu-workshop:challenge:v1'))).toBe(recordBefore);
 await click(page,'practice');await page.locator('#tooth-list').selectOption('7');await click(page,'plus');await click(page,'exit-practice');expect(await page.evaluate(()=>localStorage.getItem('chi-xu-workshop:challenge:v1'))).toBe(recordBefore);
 await click(page,'home');await page.reload();await click(page,'assets');await page.locator('#case-files').setInputFiles(files());await expect(page.locator('dialog')).not.toBeVisible();await click(page,'continue');await expect(page.locator('#sidebar')).toContainText('这关要做的事');
 await click(page,'levels');await click(page,'stage-1');await nudge(page,'3','translate','X','plus',6);await nudge(page,'5','translate','X','minus',6);await click(page,'review');page.once('dialog',d=>d.accept());await click(page,'save-stage');
 const result=await page.evaluate(()=>JSON.parse(localStorage.getItem('chi-xu-workshop:challenge:v1')!).session);expect(result.saved_snapshots).toHaveLength(1);expect(errors).toEqual([]);
});

test('多视角射线拾取、相机观察不改记录、轴拖动取消回滚',async({page})=>{
 await load(page);
 const box=(await page.locator('#viewport canvas').boundingBox())!;
 const camera=new PerspectiveCamera(35,box.width/box.height,.01,10000);camera.up.set(0,1,0);camera.position.set(0,0,60);camera.lookAt(0,0,0);camera.setViewOffset(box.width,box.height,box.width>=1100?130:box.width>=900?100:0,0,box.width,box.height);camera.updateMatrixWorld();
 const project=(v:Vector3)=>{const p=v.project(camera);return{x:box.x+(p.x+1)/2*box.width,y:box.y+(1-p.y)/2*box.height};};
 await click(page,'view-occlusal');await page.waitForTimeout(500);
 // model 5 is a tetrahedron at x=4,y=-6. Select its real top-facing triangle.
 const point=project(new Vector3(4.2,-5.8,.6));await page.mouse.click(point.x,point.y);await expect(page.locator('.goal.selected')).toContainText('②号任务牙');
 const before=await page.evaluate(()=>localStorage.getItem('chi-xu-workshop:challenge:v1'));
 for(const view of ['front','side','occlusal']){await click(page,'view-'+view);await page.waitForTimeout(180);expect(await page.evaluate(()=>localStorage.getItem('chi-xu-workshop:challenge:v1'))).toBe(before);}
 await page.waitForTimeout(500);
 // An X handle from fixed pivot extends right in this audited fixture camera.
 const pivot=project(new Vector3(4.5,-5.5,.5));
 // Read the ray-hit handle by probing visible pixels around the pivot, without exposing application state.
 let dragging=false;
 for(const dx of [35,25,45,18]){await page.mouse.move(pivot.x+dx,pivot.y);await page.mouse.down();await page.mouse.move(pivot.x+dx-14,pivot.y,{steps:3});const width=await page.locator('[data-action="select-5"] .task-bars i').first().getAttribute('style');if(width!=='width:0%'){dragging=true;await page.keyboard.press('Escape');await page.mouse.up();break;}await page.keyboard.press('Escape');await page.mouse.up();}
 expect(dragging).toBe(true);
 await expect(page.locator('[data-action="select-5"] .task-bars i').first()).toHaveAttribute('style','width:0%');expect(await page.evaluate(()=>localStorage.getItem('chi-xu-workshop:challenge:v1'))).toBe(before);
 await click(page,'details');await expect(page.locator('#stats')).toContainText('112');const stats=await page.locator('#stats').innerText();expect(stats).toContain('112 三角形');await click(page,'close-modal');
 for(const [width,height] of [[1440,900],[1366,768],[1024,768]]){await page.setViewportSize({width,height});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);const viewport=(await page.locator('.viewport-shell').boundingBox())!,sidebar=(await page.locator('#sidebar').boundingBox())!;expect(1-sidebar.width/viewport.width).toBeGreaterThanOrEqual(.65);}
});

test('保存失败不解锁后关，不替换有效记录，当前操作保留',async({page})=>{
 await load(page);await nudge(page,'3','translate','X','plus',6);await nudge(page,'5','translate','X','minus',6);await click(page,'review');const raw=await page.evaluate(()=>localStorage.getItem('chi-xu-workshop:challenge:v1'));
 await page.evaluate(()=>{Storage.prototype.setItem=()=>{throw new DOMException('quota test','QuotaExceededError');};});await click(page,'save-stage');await expect(page.locator('#notice')).toContainText('本地进度保存失败');await expect(page.locator('#sidebar')).toContainText('都调整好了');expect(await page.evaluate(()=>localStorage.getItem('chi-xu-workshop:challenge:v1'))).toBe(raw);await click(page,'details');await expect(page.locator('[data-action="export"]').first()).toBeEnabled();
});
test('不兼容旧档拒绝恢复并保留原文',async({page})=>{
 await load(page);await click(page,'home');await page.evaluate(()=>localStorage.setItem('chi-xu-workshop:challenge:v1','{"signature":"wrong","session":{"schema_version":99}}'));const raw=await page.evaluate(()=>localStorage.getItem('chi-xu-workshop:challenge:v1'));await click(page,'continue');await expect(page.locator('#notice')).toContainText('不匹配');expect(await page.evaluate(()=>localStorage.getItem('chi-xu-workshop:challenge:v1'))).toBe(raw);await expect(page.locator('[data-action="export-raw"]')).toBeVisible();
});
