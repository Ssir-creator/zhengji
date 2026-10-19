import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {createServer} from 'node:net';

const root=fileURLToPath(new URL('../',import.meta.url));
const url='http://127.0.0.1:5173'; // Keep the origin stable so existing browser saves remain available.
const free=await new Promise(resolve=>{const probe=createServer();probe.once('error',()=>resolve(false));probe.listen(5173,'127.0.0.1',()=>probe.close(()=>resolve(true)));});
if(!free){console.error('5173 端口已被占用。请先关闭旧游戏窗口，再重新启动。');process.exit(1);}
const vite=resolve(root,'node_modules/vite/bin/vite.js');
const server=spawn(process.execPath,[vite,'--host','127.0.0.1','--port','5173','--strictPort'],{cwd:root,stdio:'inherit'});
let exited=false;
server.on('error',error=>{console.error(error.message);process.exitCode=1;exited=true;});
server.on('exit',code=>{exited=true;process.exitCode=code??1;});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.kill(signal));
for(let i=0;i<120&&!exited;i++){
 await new Promise(r=>setTimeout(r,250));
 try{
  const response=await fetch(url,{signal:AbortSignal.timeout(1000)});
  if(!exited&&response.ok&&(await response.text()).includes('齿序工坊')){
   console.log(`齿序工坊已启动：${url}。关闭此窗口可停止游戏。`);
   if(process.platform==='win32'){
    const browser=spawn('explorer.exe',[url],{stdio:'ignore'});
    browser.on('error',()=>console.log(`请在浏览器打开 ${url}`));
   }
   break;
  }
 }catch{}
 if(i===119){console.error('启动超时，请查看上方日志。');server.kill();process.exitCode=1;}
}
