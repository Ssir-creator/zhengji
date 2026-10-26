import {inspectUpdateLock} from './update-lock.mjs';
import {existingGame,openGame} from './game-instance.mjs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve,join} from 'node:path';
import {run,gitRoot} from './update.mjs';

/** Windows entry point: check before serving files, then load the installed launcher. */
export async function startGame(root,{
 update=()=>run(process.execPath,['scripts/update.mjs'],root),
 launch=()=>run(process.execPath,['scripts/launch.mjs'],root),
 shortcuts=()=>run('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',join(root,'scripts/desktop-shortcut.ps1'),'-NoPause'],root),
 isGit=gitRoot,isUpdating=async()=>await inspectUpdateLock(root)==='active',isRunning=existingGame,open=openGame,
 env=process.env,platform=process.platform,log=console.log,warn=console.warn
}={}){
 root=resolve(root);
 const guard=async()=>{if(await isUpdating())throw new Error('另一个更新窗口正在工作。请等更新结束后再启动游戏。');};
 await guard();
 if(await isRunning(root)){
  log('游戏已经在运行，为你打开现有游戏；无需再启动一次。若要安装新版，请先关闭原启动窗口。');
  open({platform,env});return;
 }
 if(env.CHIXU_CHECKING!=='1'&&!await isGit(root)){
  log('正在检查新版，有更新会自动安装；无需手动下载。');
  try{await update();}
  catch(error){warn(`自动更新未完成，将尝试打开本地版本。${error.message}`);}
 }
 // Never serve an installation while another updater may be replacing it.
 await guard();
 if(platform==='win32'&&env.CHIXU_CHECKING!=='1'){
  try{await shortcuts();}catch{warn('桌面入口未能创建，仍可从原文件夹双击“开始游戏”。');}
 }
 // A new process reads the freshly installed launcher after an update.
 await launch();
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 startGame(fileURLToPath(new URL('../',import.meta.url))).catch(error=>{console.error(error.message);process.exitCode=1;});
}
