import {spawn} from 'node:child_process';
import {createHash,randomBytes} from 'node:crypto';
import {createServer,request,Agent} from 'node:http';
import {createServer as createTCPServer} from 'node:net';
import {access,readFile,writeFile,unlink} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {checkForUpdate,run} from './update.mjs';

const origins=['http://127.0.0.1:5173','http://localhost:5173'];
const browserNames=['浏览器存储','真实牙模','WebGL画面','原进度保护'];
const reportFile='本机检查结果.local.json';
export function validateBrowserReport(value){
 if(!value||!origins.includes(value.origin)||!Array.isArray(value.checks)||value.checks.length!==browserNames.length)throw Error('浏览器报告格式无效');
 if(new Set(value.checks.map(check=>check.name)).size!==browserNames.length)throw Error('浏览器检查项重复');
 const checks=value.checks.map(check=>{
  if(!browserNames.includes(check.name)||typeof check.passed!=='boolean'||typeof check.detail!=='string'||check.detail.length>240)throw Error('浏览器检查项无效');
  return{name:check.name,passed:check.passed,detail:check.detail};
 });
 return{origin:value.origin,checks};
}
export async function receiveBrowserReport(){
 const token=randomBytes(24).toString('hex');let accept;
 const report=new Promise(resolve=>{accept=resolve;});
 const server=createServer((req,res)=>{
  void (async()=>{
   if(req.url!==`/report/${token}`||!origins.includes(req.headers.origin)){res.writeHead(403);res.end();return;}
   res.setHeader('Access-Control-Allow-Origin',req.headers.origin);res.setHeader('Vary','Origin');
   if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Methods':'POST','Access-Control-Allow-Headers':'Content-Type'});res.end();return;}
   if(req.method!=='POST'){res.writeHead(405);res.end();return;}
   const chunks=[];let size=0;
   for await(const chunk of req){size+=chunk.length;if(size>16384)throw Error('报告过大');chunks.push(chunk);}
   const value=validateBrowserReport(JSON.parse(Buffer.concat(chunks).toString('utf8')));
   res.writeHead(200,{'Content-Type':'application/json'});res.end('{"saved":true}');accept(value);
  })().catch(()=>{if(!res.headersSent)res.writeHead(400);res.end();});
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 return{server,report,token,port:server.address().port};
}
async function portFree(){
 const server=createTCPServer();
 return new Promise(resolve=>{server.once('error',()=>resolve(false));server.listen(5173,'127.0.0.1',()=>server.close(()=>resolve(true)));});
}
function pageReady(){
 return new Promise(resolve=>{
  const req=request({hostname:'127.0.0.1',port:5173,path:'/',agent:new Agent(),timeout:1000},res=>{
   let body='';res.on('data',data=>{body+=data;});res.on('end',()=>resolve(res.statusCode===200&&body.includes('齿序工坊')));
  });
  req.on('error',()=>resolve(false));req.on('timeout',()=>req.destroy());req.end();
 });
}
async function writeReport(root,report){
 await writeFile(join(root,reportFile),JSON.stringify(report,null,2)+'\n');
 for(const check of report.checks)console.log(`${check.status==='pass'?'通过':check.status==='fail'?'未通过':'待确认'} · ${check.name}：${check.detail}`);
 console.log(`报告已保存：${join(root,reportFile)}`);
}
export async function preflight(root,{update=checkForUpdate}={}){
 const checks=[];
 const add=(name,status,detail)=>checks.push({name,status,detail});
 const [major,minor]=process.versions.node.split('.').map(Number);
 add('Node.js',major>22||(major===22&&minor>=12)?'pass':'fail',process.versions.node);
 try{await access(join(root,'node_modules/vite/bin/vite.js'));add('游戏依赖','pass','Vite 已安装');}catch{add('游戏依赖','fail','请先双击开始游戏，完成首次依赖安装');}
 const temporary=join(root,`.check-${randomBytes(8).toString('hex')}.local.json`);
 try{await writeFile(temporary,'check',{flag:'wx'});await unlink(temporary);add('文件夹写入','pass','可以保存报告');}catch{add('文件夹写入','fail','当前目录不可写，请检查目录权限');}
 try{
  const manifest=JSON.parse(await readFile(join(root,'public/cases/initial/manifest.json'),'utf8'));
  if(manifest.teeth.length!==28)throw Error('病例数量不符');
  for(const tooth of manifest.teeth){const asset=manifest.prepared_assets[tooth.mesh_id].desktop;const bytes=await readFile(join(root,'public/cases/initial',asset.uri));if(createHash('sha256').update(bytes).digest('hex')!==asset.checksum)throw Error('模型校验失败');}
  add('真实病例文件','pass','28 个显示网格校验通过');
 }catch{add('真实病例文件','fail','病例缺失或校验不一致，请运行更新游戏');}
 try{const result=await update(root);add('更新连接','pass',result.current?'已是当前远程资源版本':'可以读取新版资源，请使用更新游戏应用新版');add('本机更新记录',result.lastSuccess?'pass':'pending',result.lastSuccess?`最近一次成功更新时间：${new Date(result.lastSuccess).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})}（北京时间）`:'当前目录没有成功更新记录，不能据此确认 Windows 更新已执行');}
 catch{add('更新连接','fail','无法读取 GitHub 更新资源，请检查网络；本检查没有替换文件');}
 return checks;
}
export async function checkMachine(root,{noOpen=false}={}){
 const report={schema:1,time:new Date().toISOString(),platform:process.platform,startupMethod:process.platform==='win32'?'Windows CMD':'Node launcher (Linux verification)',checks:await preflight(root),browser:null};
 let child,receiver;
 try{
  if(report.checks.some(check=>check.status==='fail')){await writeReport(root,report);return report;}
  if(!await portFree()){report.checks.push({name:'游戏启动',status:'fail',detail:'请先关闭旧的黑色游戏启动窗口，再重新检查；不会关闭已有进程'});await writeReport(root,report);return report;}
  if(process.platform==='win32'){
   try{await run('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',join(root,'scripts/desktop-shortcut.ps1'),'-NoPause'],root);report.checks.push({name:'桌面入口',status:'pass',detail:'启动和更新快捷方式已创建或刷新到当前目录'});}
   catch{report.checks.push({name:'桌面入口',status:'fail',detail:'快捷方式创建失败，请检查桌面写入权限'});}
  }else report.checks.push({name:'Windows 桌面入口',status:'pending',detail:'当前为 Linux，此项须在用户 Windows 电脑运行检查'});
  const windows=process.platform==='win32';
  child=spawn(windows?'cmd.exe':process.execPath,windows?['/d','/s','/c','开始游戏.cmd']:['scripts/launch.mjs'],{cwd:root,env:{...process.env,CHIXU_NO_BROWSER:'1',CHIXU_CHECKING:'1'},stdio:['ignore','pipe','pipe']});
  let exited=false;child.once('exit',()=>{exited=true;});child.once('error',()=>{exited=true;});
  // Consume child pipes without including logs or environment data in the shareable report.
  child.stdout.resume();child.stderr.resume();
  let ready=false;
  for(let attempt=0;attempt<120&&!exited;attempt++){if(await pageReady()){ready=true;break;}await new Promise(resolve=>setTimeout(resolve,500));}
  report.checks.push({name:'游戏启动',status:ready?'pass':'fail',detail:ready?'启动入口返回了游戏页面':'启动入口未能在一分钟内返回游戏页面'});
  if(!ready){await writeReport(root,report);return report;}
  receiver=await receiveBrowserReport();
  const url=`http://127.0.0.1:5173/?check-port=${receiver.port}&check-token=${receiver.token}`;
  console.log(`CHECK_URL=${url}`);
  if(windows&&!noOpen){const browser=spawn('explorer.exe',[url],{stdio:'ignore'});browser.on('error',()=>console.log('请复制上面的地址到原来的浏览器打开。'));browser.unref();}
  else console.log('请在浏览器打开 CHECK_URL，等待检查完成。');
  let timeout;
  const browser=await Promise.race([receiver.report,new Promise(resolve=>{timeout=setTimeout(()=>resolve(null),120000);})]);
  clearTimeout(timeout);
  if(browser){report.browser=browser;report.checks.push(...browser.checks.map(check=>({name:check.name,status:check.passed?'pass':'fail',detail:check.detail})));}
  else report.checks.push({name:'浏览器检查',status:'fail',detail:'两分钟内没有收到报告，请打开 CHECK_URL 后重试'});
  await writeReport(root,report);return report;
 }finally{
  if(receiver)await new Promise(resolve=>receiver.server.close(resolve));
  if(child&&child.exitCode===null){
   if(process.platform==='win32'){try{await run('taskkill.exe',['/PID',String(child.pid),'/T','/F'],root,{capture:true});}catch{}}
   else{child.kill('SIGTERM');await new Promise(resolve=>{child.once('exit',resolve);setTimeout(resolve,3000).unref();});}
  }
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 checkMachine(fileURLToPath(new URL('../',import.meta.url)),{noOpen:process.argv.includes('--no-open')}).then(report=>{if(report.checks.some(check=>check.status==='fail'))process.exitCode=1;}).catch(error=>{console.error(`本机检查未完成：${error.message}`);process.exitCode=1;});
}
