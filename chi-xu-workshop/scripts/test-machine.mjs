import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const child=spawn(process.execPath,['scripts/check.mjs','--no-open'],{cwd:root,stdio:['ignore','pipe','pipe']});
let output='';child.stdout.on('data',data=>{output+=data;});child.stderr.on('data',data=>{output+=data;});
const exited=new Promise(resolve=>child.once('exit',code=>resolve(code)));
const url=await new Promise((resolve,reject)=>{
 const timer=setTimeout(()=>reject(Error('check URL timeout: '+output.slice(-2000))),60000);
 child.stdout.on('data',()=>{const match=output.match(/CHECK_URL=(http:\/\/[^\s]+)/);if(match){clearTimeout(timer);resolve(match[1]);}});
 child.once('exit',()=>{if(!output.includes('CHECK_URL=')){clearTimeout(timer);reject(Error('check exited before browser: '+output.slice(-2000)));}});
});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const context=await browser.newContext({viewport:{width:1440,height:900}});
 const original='{"old-progress":"preserve this exact text"}';
 await context.addInitScript(value=>localStorage.setItem('chi-xu-workshop:challenge:v1',value),original);
 const page=await context.newPage();await page.goto(url);
 await page.waitForFunction(()=>document.querySelector('#self-check-panel h2')?.textContent==='浏览器检查通过',null,{timeout:90000});
 if(await page.evaluate(()=>localStorage.getItem('chi-xu-workshop:challenge:v1'))!==original)throw Error('progress changed');
 await page.screenshot({path:root+'/docs/screenshots/machine-check.png',fullPage:true});
 const code=await exited;if(code!==0)throw Error('checker exit '+code+': '+output.slice(-1000));
 const report=JSON.parse(await readFile(root+'/本机检查结果.local.json','utf8'));
 if(!report.browser.checks.every(check=>check.passed))throw Error('browser report failed');
 console.log(JSON.stringify({exit:code,platform:report.platform,checks:report.checks.map(check=>({name:check.name,status:check.status})),progressUnchanged:true}));
}finally{await browser.close();if(child.exitCode===null)child.kill('SIGTERM');}
