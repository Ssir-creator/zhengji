import {it,expect} from 'vitest';
import {request,Agent} from 'node:http';
const modulePath='../scripts/check.mjs';const {validateBrowserReport,receiveBrowserReport,preflight}=await import(modulePath);
const valid={origin:'http://127.0.0.1:5173',checks:['浏览器存储','真实牙模','WebGL画面','原进度保护'].map(name=>({name,passed:true,detail:'verified'}))};
it('本机报告不能把缺项、重复项或外部来源当作通过',()=>{
 expect(validateBrowserReport(valid).checks).toHaveLength(4);
 for(const value of [{...valid,origin:'https://example.com'},{...valid,checks:[]},{...valid,checks:[valid.checks[0],valid.checks[0],...valid.checks.slice(2)]}])expect(()=>validateBrowserReport(value)).toThrow();
});
it('本机接收器只接收具有令牌且来自游戏页面的检查报告',async()=>{
 const receiver=await receiveBrowserReport();
 const post=(token:string)=>new Promise<number>(resolve=>{
  const req=request({hostname:'127.0.0.1',port:receiver.port,path:'/report/'+token,method:'POST',agent:new Agent(),headers:{Origin:valid.origin,'Content-Type':'application/json'}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode!));});req.end(JSON.stringify(valid));
 });
 try{expect(await post('wrong')).toBe(403);expect(await post(receiver.token)).toBe(200);expect((await receiver.report).checks).toHaveLength(4);}finally{await new Promise<void>(resolve=>receiver.server.close(resolve));}
});
it('本机预检读取实际病例且更新检查不替换项目',async()=>{
 const checks=await preflight(process.cwd(),{update:async()=>({current:true,lastSuccess:null})});
 expect(checks.find((check:{name:string})=>check.name==='真实病例文件').status).toBe('pass');
 expect(checks.find((check:{name:string})=>check.name==='文件夹写入').status).toBe('pass');
 expect(checks.find((check:{name:string})=>check.name==='本机更新记录').status).toBe('pending');
});
