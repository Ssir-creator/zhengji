import {acquireUpdateLock} from './update-lock.mjs';
import * as http from 'node:http';
import {tmpdir} from 'node:os';
import {createHash,randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createConnection} from 'node:net';
import {access,copyFile,cp,mkdir,mkdtemp,readFile,readdir,rename,rm,stat,lstat,readlink,symlink,writeFile} from 'node:fs/promises';
import {basename,dirname,isAbsolute,join,resolve,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const branch='chi-xu-workshop-dev';
const repository='Ssir-creator/zhengji';
const versionFile='.chi-xu-version.json';
const archiveURL=`https://codeload.github.com/${repository}/zip/refs/heads/${branch}`;
if(typeof http.setGlobalProxyFromEnv==='function')http.setGlobalProxyFromEnv();
const archiveVersion=etag=>createHash('sha256').update(etag).digest('hex');
const exists=async path=>{try{await access(path);return true;}catch{return false;}};
export async function run(command,args,cwd,{capture=false,env=process.env}={}){
 return new Promise((accept,reject)=>{
  const child=spawn(command,args,{cwd,env,stdio:capture?['ignore','pipe','inherit']:'inherit'});
  let output='';if(capture)child.stdout.on('data',data=>{output+=data;});
  child.once('error',reject);
  child.once('exit',code=>code===0?accept(output.trim()):reject(new Error(`${basename(command)} 执行失败（${code}）。请保留上方错误信息。`)));
 });
}
export async function gitRoot(root){
 for(let dir=resolve(root);;dir=dirname(dir)){
  const metadata=join(dir,'.git');
  if(await exists(metadata)){
   const info=await stat(metadata);
   if(info.isDirectory()&&await exists(join(metadata,'HEAD')))return dir;
   if(info.isFile()&&(await readFile(metadata,'utf8')).startsWith('gitdir:'))return dir;
  }
  if(dirname(dir)===dir)return null;
 }
}
async function assertStopped(){
 const busy=await new Promise(accept=>{
  const socket=createConnection({host:'127.0.0.1',port:5173});
  socket.setTimeout(1000);
  socket.once('connect',()=>{socket.destroy();accept(true);});
  socket.once('error',()=>{socket.destroy();accept(false);});
  socket.once('timeout',()=>{socket.destroy();accept(true);});
 });
 if(busy)throw new Error('请先关闭游戏的黑色启动窗口，再双击“更新游戏”。5173 端口仍在使用。');
}
/** Fall back to Windows' native HTTPS client, including its system proxy.
 * Preserve the same HTTPS origin and ETag validation; never use public mirrors. */
export async function archiveRequest(method,destination,{platform=process.platform,request=fetch,execute=run}={}){
 let failure;
 try{
  const response=await request(archiveURL,{method,signal:AbortSignal.timeout(method==='HEAD'?30000:180000)});
  if(!response.ok)throw Error(`HTTP ${response.status}`);
  const etag=response.headers.get('etag');
  if(method==='GET')await writeFile(destination,new Uint8Array(await response.arrayBuffer()));
  return etag;
 }catch(error){failure=error;}
 if(platform!=='win32')throw Error(`无法连接 GitHub 更新服务：${failure.cause?.code??failure.message}；旧版未替换。`);
 console.log('直连更新服务失败，正在尝试 Windows 系统网络通道……');
 const temp=await mkdtemp(join(tmpdir(),'chi-xu-network-')),metadata=join(temp,'response.json');
 const command="$ErrorActionPreference='Stop'; try { [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $p=@{Uri=$env:CHIXU_NETWORK_URL; Method=$env:CHIXU_NETWORK_METHOD; UseBasicParsing=$true; TimeoutSec=180; UserAgent='ChiXuWorkshop-Updater'}; if($env:CHIXU_NETWORK_METHOD -eq 'GET'){$p.OutFile=$env:CHIXU_NETWORK_FILE; $p.PassThru=$true}; $r=Invoke-WebRequest @p; $v=@{etag=[string]$r.Headers['ETag']} | ConvertTo-Json -Compress; [IO.File]::WriteAllText($env:CHIXU_NETWORK_META,$v,(New-Object Text.UTF8Encoding($false))) } catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }";
 try{
  await execute('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],temp,{env:{...process.env,CHIXU_NETWORK_URL:archiveURL,CHIXU_NETWORK_METHOD:method,CHIXU_NETWORK_FILE:destination??'',CHIXU_NETWORK_META:metadata}});
  const result=JSON.parse((await readFile(metadata,'utf8')).replace(/^\uFEFF/,''));
  return typeof result.etag==='string'?result.etag:null;
 }catch(error){throw Error(`Node 网络通道和 Windows 系统网络通道都未能取得新版。请确认电脑可以访问 codeload.github.com，或连接可访问 GitHub 的网络。旧版未替换。直连原因：${failure.cause?.code??failure.message}；系统通道：${error.message}`);}
 finally{await rm(temp,{recursive:true,force:true});}
}
async function latestVersion(){
 const etag=await archiveRequest('HEAD');
 if(!etag)throw new Error('服务器未提供资源版本，已停止更新；旧版未替换。');
 return archiveVersion(etag);
}
export async function checkForUpdate(root){
 const version=await latestVersion();let installed=null;
 try{installed=JSON.parse(await readFile(join(root,versionFile),'utf8'));}catch{}
 return{reachable:true,latest:version,installed:installed?.version??null,current:installed?.version===version,lastSuccess:installed?.updated_at??null};
}
async function downloadArchive(version,destination){
 const etag=await archiveRequest('GET',destination);
 if(!etag||archiveVersion(etag)!==version)throw new Error('下载期间新版发生变化，请重新更新；旧版未替换。');
}
export async function extractArchive(archive,destination,{platform=process.platform,execute=run,wait=ms=>new Promise(accept=>setTimeout(accept,ms))}={}){
 if(platform!=='win32'){
  await mkdir(destination);await execute('unzip',['-q',archive,'-d',destination],dirname(archive));return;
 }
 // Expand-Archive can emit nonterminating errors, erase partial output and still
 // exit zero. Use .NET directly and propagate every extraction failure instead.
 // Fresh directories also let a transient scanner lock settle without reusing
 // partially extracted files. All attempts stay inside the updater's work dir.
 const command="$ErrorActionPreference = 'Stop'; try { Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::ExtractToDirectory($env:CHIXU_UPDATE_ARCHIVE, $env:CHIXU_UPDATE_EXTRACT) } catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }";
 let failure;
 for(let attempt=0;attempt<4;attempt++){
  if(attempt)await wait(500*2**(attempt-1));
  const staging=await mkdtemp(join(dirname(destination),'.extract-'));
  try{
   // Paths are environment data, never interpolated into PowerShell code.
   await execute('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],dirname(archive),{env:{...process.env,CHIXU_UPDATE_ARCHIVE:archive,CHIXU_UPDATE_EXTRACT:staging}});
   await rename(staging,destination);return;
  }catch(error){failure=error;}
 }
 throw new Error(`Windows 解压失败，已自动重试 3 次；旧版未替换。可能有文件被占用，请稍后重试。${failure.message}`);
}
async function validateProject(root){
 const pkg=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
 if(pkg.name!=='chi-xu-workshop')throw new Error('没有找到齿序工坊工程，已停止更新。');
 for(const path of ['package-lock.json','src/main.ts','public/cases/initial/manifest.json','scripts/start-windows.ps1','scripts/update-windows.ps1','scripts/update.mjs','scripts/update-lock.mjs','scripts/game-instance.mjs','scripts/start.mjs','scripts/launch.mjs','vite.config.ts']){
  if(!await exists(join(root,path)))throw new Error(`新版缺少 ${path}，旧版未替换。`);
 }
}
async function prepare(root){
 for(const step of ['ci','run build']){
  if(process.platform==='win32')await run('cmd.exe',['/d','/s','/c',`npm ${step}`],root);
  else await run('npm',step.split(' '),root);
 }
}
async function files(root,prefix=''){
 const result=[];
 for(const entry of await readdir(join(root,prefix),{withFileTypes:true})){
  const path=join(prefix,entry.name);result.push(path);
  if(entry.isDirectory())result.push(...await files(root,path));
 }
 return result;
}
export async function deployTree(source,destination,boundary=source){
 await mkdir(destination,{recursive:true});
 for(const entry of await readdir(source,{withFileTypes:true})){
  const from=join(source,entry.name),to=join(destination,entry.name);
  if(entry.isDirectory()){await deployTree(from,to,boundary);continue;}
  if(entry.isSymbolicLink()){
   const target=await readlink(from),resolved=resolve(source,target),base=resolve(boundary);
   if(isAbsolute(target)||(resolved!==base&&!resolved.startsWith(base+sep)))throw new Error(`不支持指向工程外的链接：${entry.name}`);
   if(await exists(to)&&(await lstat(to)).isSymbolicLink()&&await readlink(to)===target)continue;
   const temporary=to+'.update-'+randomUUID()+'.tmp';
   try{await symlink(target,temporary);await rename(temporary,to);}finally{await rm(temporary,{force:true});}
   continue;
  }
  if(!entry.isFile())throw new Error(`更新包包含不支持的文件类型：${entry.name}`);
  if(await exists(to)&&(await readFile(from)).equals(await readFile(to)))continue;
  const temporary=to+'.update-'+randomUUID()+'.tmp';
  try{await copyFile(from,temporary);await rename(temporary,to);}finally{await rm(temporary,{force:true});}
 }
}
/** Prepare in a sibling directory; keep the installation directory stable for Windows launchers. */
export async function updateZip(root,options={}){
 // fileURLToPath(new URL('../', import.meta.url)) retains a trailing separator.
 // Normalize before appending sibling names, or they become children of root.
 root=resolve(root);
 const {latest=latestVersion,download=downloadArchive,extract=extractArchive,build=prepare,deploy=deployTree,log=console.log}=options;
 if(await gitRoot(root))throw new Error('检测到 Git 工作区，请使用开发分支的 Git 更新流程。');
 const pkg=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
 if(pkg.name!=='chi-xu-workshop')throw new Error('请从齿序工坊工程目录运行更新。');
 const releaseLock=await acquireUpdateLock(root);
 let work;
 try{
  const version=await latest();
  if(!/^[a-f0-9]{64}$/.test(version))throw new Error('无效的远程版本号，已停止更新。');
  let previous;
  try{previous=JSON.parse(await readFile(join(root,versionFile),'utf8'));}catch{}
  if(previous?.version===version){log('已经是最新版，无需下载。');return{updated:false,version};}
  log('正在下载新版并检查；旧游戏目录暂不改动……');
  work=await mkdtemp(join(dirname(root),'.chi-xu-update-'));
  const archive=join(work,'game.zip'),extracted=join(work,'extracted');
  await download(version,archive);await extract(archive,extracted);
  const entries=await readdir(extracted,{withFileTypes:true});
  if(entries.length!==1||!entries[0].isDirectory())throw new Error('下载包目录结构异常，旧版未替换。');
  const next=join(extracted,entries[0].name,'chi-xu-workshop');
  await validateProject(next);
  // Keep supported local settings and imported local assets; every old file also remains in backup.
  for(const entry of await readdir(root,{withFileTypes:true})){
   if(entry.name==='local-assets'||entry.name.endsWith('.local.json')){
    if(await exists(join(next,entry.name)))throw new Error(`新版与本机文件 ${entry.name} 冲突，旧版未替换。`);
    await cp(join(root,entry.name),join(next,entry.name),{recursive:true,errorOnExist:true,force:false,verbatimSymlinks:true});
   }
  }
  log('正在安装依赖并构建新版；此步骤失败会保留旧版……');
  await build(next);
  const backup=await mkdtemp(root+'.backup-');
  await cp(root,backup,{recursive:true,verbatimSymlinks:true});
  const additions=[];
  for(const path of [...await files(next),versionFile])if(!await exists(join(root,path)))additions.push(path);
  try{
   await deploy(next,root);
   // Write the release marker last, so an interrupted copy can be retried.
   await writeFile(join(root,versionFile),JSON.stringify({version,updated_at:new Date().toISOString()},null,2)+'\n');
  }catch(error){
   try{
    for(const path of additions.reverse())await rm(join(root,path),{recursive:true,force:true});
    await deployTree(backup,root);
   }catch(restore){throw new Error(`替换失败，自动恢复也失败。旧文件仍保留在 ${backup}。${restore.message}`);}
   throw new Error(`更新失败，已恢复旧文件。备份保留在 ${backup}。${error.message}`);
  }
  log(`更新完成（资源版本 ${version.slice(0,7)}）。旧文件备份：${backup}`);
  log('请双击“开始游戏”。继续使用原浏览器和原地址，浏览器进度不会被清理。');
  return{updated:true,version,backup};
 }finally{
  // A scanner may still hold a staging file. Always release our own update lock,
  // even if Windows cannot remove a temporary directory immediately.
  try{if(work)await rm(work,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
  finally{await releaseLock();}
 }
}
async function updateGit(root){
 const current=await run('git',['branch','--show-current'],root,{capture:true});
 if(current!==branch)throw new Error('只允许更新 chi-xu-workshop-dev；不会切换或修改 main。');
 if(await run('git',['status','--porcelain'],root,{capture:true}))throw new Error('存在本地修改，请先保存或提交；不会覆盖文件。');
 await run('git',['fetch','origin',`refs/heads/${branch}`],root);
 await run('git',['merge','--ff-only','FETCH_HEAD'],root);
 await prepare(root);
 console.log('更新完成。请双击“开始游戏”；浏览器进度未清除。');
}
export async function main(root){
 const [major,minor]=process.versions.node.split('.').map(Number);
 if(major<22||(major===22&&minor<12))throw new Error('需要 Node.js 22.12+，推荐 24 LTS。');
 await assertStopped();
 if(await gitRoot(root))await updateGit(root);else await updateZip(root);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 main(fileURLToPath(new URL('../',import.meta.url))).catch(error=>{console.error(`更新未完成：${error.message}`);process.exitCode=1;});
}
