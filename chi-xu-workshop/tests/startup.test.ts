import {it,expect,vi} from 'vitest';
const modulePath='../scripts/start.mjs';
const {startGame}=await import(modulePath);
function options(){return{update:vi.fn(async()=>{}),launch:vi.fn(async()=>{}),shortcuts:vi.fn(async()=>{}),isRunning:async()=>false,open:vi.fn(),isGit:async():Promise<string|null>=>null,env:{} as NodeJS.ProcessEnv,platform:'win32',log:vi.fn(),warn:vi.fn()};}
it('双击启动先自动更新，再刷新桌面入口，最后加载已安装版本',async()=>{
 const o=options(),steps:string[]=[];
 o.update=vi.fn(async()=>{steps.push('update');});o.shortcuts=vi.fn(async()=>{steps.push('shortcut');});o.launch=vi.fn(async()=>{steps.push('launch');});
 await startGame(process.cwd(),o);expect(steps).toEqual(['update','shortcut','launch']);
});
it('断网或更新失败仍尝试启动原版本，快捷入口失败也不阻止游戏',async()=>{
 const o=options();o.update=vi.fn(async()=>{throw Error('offline');});o.shortcuts=vi.fn(async()=>{throw Error('desktop unavailable');});
 await startGame(process.cwd(),o);expect(o.launch).toHaveBeenCalledOnce();expect(o.warn).toHaveBeenCalledTimes(2);
});
it('本机验收与开发工作区跳过自动更新，启动错误仍向上传递',async()=>{
 const checking=options();checking.env={CHIXU_CHECKING:'1'};
 await startGame(process.cwd(),checking);expect(checking.update).not.toHaveBeenCalled();expect(checking.shortcuts).not.toHaveBeenCalled();expect(checking.launch).toHaveBeenCalledOnce();
 const git=options();git.isGit=async()=>process.cwd();
 git.launch=vi.fn(async()=>{throw Error('busy port');});
 await expect(startGame(process.cwd(),git)).rejects.toThrow('busy port');expect(git.update).not.toHaveBeenCalled();
});
it('另一个窗口正在更新时不启动游戏，更新期间出现锁也不能离线回退',async()=>{
 const o=options();await expect(startGame(process.cwd(),{...o,isUpdating:async()=>true})).rejects.toThrow('另一个更新窗口');
 expect(o.update).not.toHaveBeenCalled();expect(o.launch).not.toHaveBeenCalled();
 let busy=false;o.update=vi.fn(async()=>{busy=true;throw Error('another updater acquired lock');});
 await expect(startGame(process.cwd(),{...o,isUpdating:async()=>busy})).rejects.toThrow('另一个更新窗口');
 expect(o.launch).not.toHaveBeenCalled();
});

it('重复启动只打开同一安装的现有游戏，跳过更新和第二个服务',async()=>{
 const o=options();await startGame(process.cwd(),{...o,isRunning:async()=>true});
 expect(o.open).toHaveBeenCalledOnce();expect(o.launch).not.toHaveBeenCalled();expect(o.update).not.toHaveBeenCalled();
});
