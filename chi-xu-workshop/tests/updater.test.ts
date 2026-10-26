import {it,expect,vi,afterEach} from 'vitest';
import {mkdtemp,mkdir,writeFile,readFile,readdir,rm,symlink,readlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const updaterPath='../scripts/update.mjs';
const {updateZip,extractArchive,run}=await import(updaterPath);
const sandboxes:string[]=[];
const version='a'.repeat(64);
afterEach(async()=>{for(const dir of sandboxes.splice(0))await rm(dir,{recursive:true,force:true});});
async function installation(){
 const dir=await mkdtemp(join(tmpdir(),'chixu-updater-test-'));sandboxes.push(dir);
 const root=join(dir,'chi-xu-workshop');await mkdir(root);
 await writeFile(join(root,'package.json'),JSON.stringify({name:'chi-xu-workshop'}));
 await writeFile(join(root,'old-custom.txt'),'my original file');
 await writeFile(join(root,'settings.local.json'),'private local settings');
 await mkdir(join(root,'local-assets'));await writeFile(join(root,'local-assets','import.stl'),'original import');
 return{dir,root};
}
function options(overrides:Record<string,unknown>={}){
 return{
  latest:async()=>version,log:()=>{},download:vi.fn(async(_sha:string,destination:string)=>{await writeFile(destination,'download fixture');}),
  extract:async(_archive:string,destination:string)=>{
   const root=join(destination,'repository-version','chi-xu-workshop');
   for(const file of ['package.json','package-lock.json','src/main.ts','public/cases/initial/manifest.json','scripts/start-windows.ps1','scripts/update-windows.ps1','scripts/update.mjs','scripts/update-lock.mjs','scripts/game-instance.mjs','scripts/start.mjs','scripts/launch.mjs','vite.config.ts']){
    const parts=file.split('/');parts.pop();await mkdir(join(root,...parts),{recursive:true});
    await writeFile(join(root,file),file==='package.json'?JSON.stringify({name:'chi-xu-workshop'}):'new version');
   }
  },build:vi.fn(async()=>{}),...overrides
 };
}
it('ZIP更新先构建再替换，完整备份旧文件并保留本机导入与配置',async()=>{
 const{root}=await installation();const opts=options({build:async(next:string)=>{
  expect(await readFile(join(root,'old-custom.txt'),'utf8')).toBe('my original file');
  expect(await readFile(join(next,'src/main.ts'),'utf8')).toBe('new version');
 }});
 const result=await updateZip(root,opts);
 expect(result.updated).toBe(true);
 expect(await readFile(join(result.backup,'old-custom.txt'),'utf8')).toBe('my original file');
 expect(await readFile(join(root,'settings.local.json'),'utf8')).toBe('private local settings');
 expect(await readFile(join(root,'local-assets/import.stl'),'utf8')).toBe('original import');
 expect(JSON.parse(await readFile(join(root,'.chi-xu-version.json'),'utf8')).version).toBe(version);
});
it('命令行入口的目录URL带末尾分隔符时，备份和锁仍位于游戏目录外',async()=>{
 const{root,dir}=await installation();
 const cliRoot=fileURLToPath(new URL('./',pathToFileURL(join(root,'entry.mjs'))));
 expect(cliRoot.endsWith(sep)).toBe(true);
 const result=await updateZip(cliRoot,options());
 expect(result.updated).toBe(true);
 expect(dirname(result.backup)).toBe(dir);
 expect(await readFile(join(result.backup,'old-custom.txt'),'utf8')).toBe('my original file');
 expect(await readFile(join(root,'src/main.ts'),'utf8')).toBe('new version');
 expect((await readdir(root)).some(name=>name.startsWith('.backup-'))).toBe(false);
 expect((await readdir(dir)).some(name=>name.endsWith('.update-lock'))).toBe(false);
});
it('版本相同不下载、不构建、不替换',async()=>{
 const{root}=await installation();await writeFile(join(root,'.chi-xu-version.json'),JSON.stringify({version}));
 const opts=options();expect((await updateZip(root,opts)).updated).toBe(false);
 expect(opts.download).not.toHaveBeenCalled();expect(opts.build).not.toHaveBeenCalled();
 expect(await readFile(join(root,'old-custom.txt'),'utf8')).toBe('my original file');
});
it.each(['download','extract','build'])('%s失败保留原目录，清理临时目录和更新锁',async(step)=>{
 const{root,dir}=await installation();const opts=options({[step]:async()=>{throw new Error('test failure');}});
 await expect(updateZip(root,opts)).rejects.toThrow('test failure');
 expect(await readFile(join(root,'old-custom.txt'),'utf8')).toBe('my original file');
 expect(await readdir(dir)).toEqual(['chi-xu-workshop']);
});

it('Windows解压遇到暂时占用后使用全新目录重试，只发布完整解压结果',async()=>{
 const{root,dir}=await installation();
 const source=join(dir,'source');await mkdir(join(source,'repository','chi-xu-workshop'),{recursive:true});
 await writeFile(join(source,'repository','chi-xu-workshop','开始游戏.cmd'),'complete game');
 const archive=join(dir,'game.zip');await run('zip',['-qr',archive,'.'],source);
 const destination=join(dir,'extracted');const waits:number[]=[];const attempts:string[]=[];
 await extractArchive(archive,destination,{platform:'win32',wait:async(ms:number)=>{waits.push(ms);},execute:async(command:string,args:string[],cwd:string,options:{env:NodeJS.ProcessEnv})=>{
  expect(command).toBe('powershell.exe');
  expect(args.at(-1)).toContain("$ErrorActionPreference = 'Stop'");
  expect(args.at(-1)).toContain('exit 1');
  expect(args.at(-1)).not.toContain(archive);
  const stage=options.env.CHIXU_UPDATE_EXTRACT!;attempts.push(stage);
  if(attempts.length===1){await writeFile(join(stage,'partial.txt'),'locked partial output');throw new Error('file is in use');}
  await run('unzip',['-q',options.env.CHIXU_UPDATE_ARCHIVE!,'-d',stage],cwd);
 }});
 expect(waits).toEqual([500]);expect(new Set(attempts).size).toBe(2);
 expect(await readdir(destination)).toEqual(['repository']);
 expect(await readFile(join(destination,'repository/chi-xu-workshop/开始游戏.cmd'),'utf8')).toBe('complete game');
 expect(await readFile(join(root,'old-custom.txt'),'utf8')).toBe('my original file');
});

it('Windows解压持续失败会停止更新、保留旧文件并释放锁，不把部分结果当成功',async()=>{
 const{root,dir}=await installation();const waits:number[]=[];let attempts=0;
 await expect(updateZip(root,options({extract:(archive:string,destination:string)=>extractArchive(archive,destination,{
  platform:'win32',wait:async(ms:number)=>{waits.push(ms);},execute:async(_command:string,_args:string[],_cwd:string,options:{env:NodeJS.ProcessEnv})=>{
   attempts++;await writeFile(join(options.env.CHIXU_UPDATE_EXTRACT!,'partial.txt'),'partial');throw new Error('locked');
  }
 })}))).rejects.toThrow('Windows 解压失败，已自动重试 3 次');
 expect(attempts).toBe(4);expect(waits).toEqual([500,1000,2000]);
 expect(await readdir(dir)).toEqual(['chi-xu-workshop']);
 expect(await readFile(join(root,'old-custom.txt'),'utf8')).toBe('my original file');
 expect(await readdir(root)).not.toContain('.chi-xu-version.json');
});
it('替换部分文件后失败时恢复旧文件，保留备份',async()=>{
 const{root,dir}=await installation();
 await expect(updateZip(root,options({deploy:async(_from:string,to:string)=>{
  await writeFile(join(to,'old-custom.txt'),'overwritten');
  await mkdir(join(to,'src'));await writeFile(join(to,'src/main.ts'),'partial update');
  throw new Error('copy failure');
 }}))).rejects.toThrow('已恢复旧文件');
 expect(await readFile(join(root,'old-custom.txt'),'utf8')).toBe('my original file');
 const entries=await readdir(dir);expect(entries).toHaveLength(2);expect(entries.some(x=>x.startsWith('chi-xu-workshop.backup-'))).toBe(true);
 expect(await readdir(root)).not.toContain('src');
});
it('已有更新锁时拒绝并行更新，不移除其他任务的锁',async()=>{
 const{root}=await installation();await mkdir(root+'.update-lock');
 await expect(updateZip(root,options())).rejects.toThrow('已有更新任务');
 expect(await readdir(root+'.update-lock')).toEqual([]);
});
it('Git工作区不走ZIP覆盖路径',async()=>{
 const{root,dir}=await installation();await mkdir(join(dir,'.git'));await writeFile(join(dir,'.git/HEAD'),'ref: refs/heads/main\n');
 const opts=options();await expect(updateZip(root,opts)).rejects.toThrow('Git 工作区');expect(opts.download).not.toHaveBeenCalled();
});

it('部署保留依赖的相对链接，不要求更换安装目录',async()=>{
 const{root}=await installation();const opts=options();const originalExtract=opts.extract;
 opts.extract=async(archive:string,destination:string)=>{
  await originalExtract(archive,destination);
  const stage=join(destination,'repository-version','chi-xu-workshop');
  await mkdir(join(stage,'node_modules/.bin'),{recursive:true});
  await symlink('../../src/main.ts',join(stage,'node_modules/.bin/test-link'));
 };
 await updateZip(root,opts);
 expect(await readlink(join(root,'node_modules/.bin/test-link'))).toBe('../../src/main.ts');
 expect(await readFile(join(root,'node_modules/.bin/test-link'),'utf8')).toBe('new version');
});
