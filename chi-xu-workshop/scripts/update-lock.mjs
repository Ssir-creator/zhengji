import {mkdir,readFile,writeFile,rename,rm,stat,readdir} from 'node:fs/promises';
import {hostname} from 'node:os';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {resolve,join,basename} from 'node:path';
const alive=pid=>{try{process.kill(pid,0);return true;}catch(e){return e.code!=='ESRCH';}};
// Old empty locks contain no PID. Recover only after a grace period and an
// explicit scan for any other updater; uncertainty must not release a lock.
async function otherUpdater(){
 if(process.platform==='win32')return new Promise(accept=>{
  const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',`$ErrorActionPreference='Stop'; try { $p=@(Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.ProcessId -ne ${process.pid} -and $_.CommandLine -match 'update\\.mjs' }); if($p.Count -gt 0){exit 10}; exit 0 } catch {exit 20}`],{stdio:'ignore'});
  child.once('error',()=>accept(true));child.once('exit',code=>accept(code!==0));
 });
 try{
  for(const entry of await readdir('/proc'))if(/^\d+$/.test(entry)&&Number(entry)!==process.pid){
   let command='';try{command=await readFile(`/proc/${entry}/cmdline`,'utf8');}catch{}
   if(['node','nodejs'].includes(basename(command.split('\0')[0]))&&/scripts[\\/]update\.mjs/.test(command))return true;
  }
  return false;
 }catch{return true;}
}
export async function inspectUpdateLock(root,{isAlive=alive,scan=otherUpdater,now=Date.now}={}){
 const path=resolve(root)+'.update-lock';let info;
 try{info=await stat(path);}catch(e){if(e.code==='ENOENT')return 'absent';throw e;}
 try{
  const owner=JSON.parse(await readFile(join(path,'owner.json'),'utf8'));
  if(owner.host!==hostname()||!Number.isSafeInteger(owner.pid)||owner.pid<1||typeof owner.token!=='string')return 'active';
  return isAlive(owner.pid)?'active':'stale';
 }catch{
  if(now()-info.mtimeMs<120000)return 'active';
  return await scan()?'active':'stale';
 }
}
export async function acquireUpdateLock(root,options={}){
 const path=resolve(root)+'.update-lock', token=randomUUID();
 for(let attempt=0;attempt<3;attempt++){
  try{
   await mkdir(path);
   try{await writeFile(join(path,'owner.json'),JSON.stringify({pid:process.pid,host:hostname(),token,started:new Date().toISOString()}),{flag:'wx'});}catch(e){await rm(path,{recursive:true,force:true});throw e;}
   return async()=>{
    const owner=JSON.parse(await readFile(join(path,'owner.json'),'utf8'));
    if(owner.token===token)await rm(path,{recursive:true,force:true,maxRetries:5,retryDelay:200});
   };
  }catch(e){
   if(e.code!=='EEXIST')throw e;
   const recovery=path+'.recovery';
   try{await mkdir(recovery);}catch{throw Error('已有更新任务正在检查恢复锁，请稍后重试。');}
   try{
    if(await inspectUpdateLock(root,options)!=='stale')throw Error(`已有更新任务正在运行，请等它完成。锁目录：${path}`);
    // Serialize stale recovery and re-check ownership inside the recovery guard.
    try{await rename(path,path+'.recovered-'+randomUUID());}catch(e){if(e.code!=='ENOENT')throw e;}
   }finally{await rm(recovery,{recursive:true,force:true});}
  }
 }
 throw Error('更新锁发生竞争，请稍后重试。');
}
