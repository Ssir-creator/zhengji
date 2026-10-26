import {it,expect,vi} from 'vitest';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const mod='../scripts/update.mjs';const {archiveRequest}=await import(mod);
it('直连HEAD取得ETag，GET保存同一响应的原始归档，不调用系统通道',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'chixu-network-test-'));try{
 const execute=vi.fn(),request=vi.fn(async()=>new Response('zip bytes',{headers:{etag:'"version1"'}}));
 expect(await archiveRequest('HEAD',undefined,{request,execute})).toBe('"version1"');
 const path=join(dir,'game.zip');expect(await archiveRequest('GET',path,{request,execute})).toBe('"version1"');expect(await readFile(path,'utf8')).toBe('zip bytes');expect(execute).not.toHaveBeenCalled();
 }finally{await rm(dir,{recursive:true,force:true});}
});
it('Windows直连失败使用系统HTTPS请求，路径通过环境变量传入并保持ETag',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'chixu-network-test-'));try{
 const destination=join(dir,'game with spaces.zip');
 const request=async()=>{throw new TypeError('fetch failed');};
 const execute=vi.fn(async(command:string,args:string[],cwd:string,options:{env:NodeJS.ProcessEnv})=>{
 expect(command).toBe('powershell.exe');expect(args.at(-1)).toContain('Invoke-WebRequest @p');expect(args.at(-1)).not.toContain(destination);
 expect(options.env.CHIXU_NETWORK_URL).toBe('https://codeload.github.com/Ssir-creator/zhengji/zip/refs/heads/chi-xu-workshop-dev');
 if(options.env.CHIXU_NETWORK_METHOD==='GET')await writeFile(options.env.CHIXU_NETWORK_FILE!,'native zip');
 await writeFile(options.env.CHIXU_NETWORK_META!,JSON.stringify({etag:'"native-version"'}));
 });
 expect(await archiveRequest('HEAD',undefined,{platform:'win32',request,execute})).toBe('"native-version"');
 expect(await archiveRequest('GET',destination,{platform:'win32',request,execute})).toBe('"native-version"');expect(await readFile(destination,'utf8')).toBe('native zip');
 }finally{await rm(dir,{recursive:true,force:true});}
});
it('两条通道都失败时给出具体网络说明，不假装更新成功',async()=>{
 await expect(archiveRequest('HEAD',undefined,{platform:'win32',request:async()=>{throw Error('fetch failed');},execute:async()=>{throw Error('system network failed');}})).rejects.toThrow('系统网络通道都未能取得新版');
});
