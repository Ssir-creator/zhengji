import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {spawn} from 'node:child_process';
export const gameURL='http://127.0.0.1:5173';
export const installationID=root=>createHash('sha256').update(resolve(root)).digest('hex');
export async function existingGame(root,{request=fetch}={}){
 try{
  const response=await request(gameURL+'/__chixu_instance',{signal:AbortSignal.timeout(1500)});
  if(!response.ok)return false;
  const identity=await response.json();
  return identity.app==='chi-xu-workshop'&&identity.installation===installationID(root);
 }catch{return false;}
}
export function openGame({platform=process.platform,env=process.env}={}){
 console.log(`游戏地址：${gameURL}`);
 if(platform==='win32'&&env.CHIXU_NO_BROWSER!=='1'){
  const browser=spawn('explorer.exe',[gameURL],{stdio:'ignore'});
  browser.on('error',()=>console.log(`请在浏览器打开 ${gameURL}`));
 }
}
