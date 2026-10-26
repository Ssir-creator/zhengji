import {test,expect} from '@playwright/test';

test('首页直接显示真实3D病例，进入与返回均不覆盖已有存档',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');
 await expect(page.locator('#title-studio')).toHaveAttribute('data-ready','true',{timeout:60000});
 await expect(page.locator('#title-studio')).toHaveAttribute('data-teeth','28');
 await expect(page.locator('#title-studio canvas')).toBeVisible();
 await expect(page.locator('.hero img')).toHaveCount(0);
 await expect(page.locator('#studio-status')).toContainText('拖动旋转');
 expect((await page.locator('#studio-status').boundingBox())!.height).toBeLessThan(70);
 await page.screenshot({path:'docs/screenshots/title-studio-1440.png',fullPage:true});
 await page.locator('[data-action="new"]').click();
 await expect(page.locator('.coach')).toBeVisible({timeout:60000});
 await page.locator('[data-action="intro-skip"]').click();
 await page.locator('[data-action="guide-forward"]').last().click();
 const key='chi-xu-workshop:challenge:v1';
 const before=await page.evaluate(k=>localStorage.getItem(k),key);
 await page.locator('[data-action="home"]').first().click();
 await expect(page.locator('#title-studio')).toHaveAttribute('data-ready','true');
 expect(await page.evaluate(k=>localStorage.getItem(k),key)).toBe(before);
 await page.locator('[data-action="practice"]').click();
 await expect(page.locator('.practice-picker')).toBeVisible();
 await page.locator('[data-action="plus"]').click();
 expect(await page.evaluate(k=>localStorage.getItem(k),key)).toBe(before);
 await page.screenshot({path:'docs/screenshots/studio-practice-1440.png',fullPage:true});
 expect(errors).toEqual([]);
});

test('首页在窄屏上仍可开始并加载实际牙模',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/');
 await expect(page.locator('#title-studio')).toHaveAttribute('data-ready','true',{timeout:60000});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await expect(page.locator('[data-action="new"]')).toBeVisible();
 await page.screenshot({path:'docs/screenshots/title-studio-mobile.png',fullPage:true});
});

test('标题主菜单支持方向键选择与Enter进入，旧记录保留',async({page})=>{
 await page.goto('/');await expect(page.locator('#title-studio')).toHaveAttribute('data-ready','true',{timeout:60000});
 const old='legacy record preserved';await page.evaluate(raw=>localStorage.setItem('chi-xu-workshop:challenge:v1',raw),old);
 await page.keyboard.press('ArrowDown');await expect(page.locator('[data-action="interaction"]')).toBeFocused();
 await page.keyboard.press('ArrowDown');await expect(page.locator('[data-action="prediction"]')).toBeFocused();
 await page.keyboard.press('ArrowUp');await expect(page.locator('[data-action="interaction"]')).toBeFocused();
 await page.keyboard.press('Enter');await expect(page.locator('#int-task-line')).toBeVisible({timeout:60000});await expect(page.locator('#int-total')).toContainText('0/28');
 expect(await page.evaluate(()=>localStorage.getItem('chi-xu-workshop:challenge:v1'))).toBe(old);
});
