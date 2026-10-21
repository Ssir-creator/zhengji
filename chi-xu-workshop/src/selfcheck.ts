type BrowserCheck={name:string;passed:boolean;detail:string};
const saveKey='chi-xu-workshop:challenge:v1';
export async function runBrowserCheck(){
 const params=new URLSearchParams(location.search),port=params.get('check-port')??'',token=params.get('check-token')??'';
 if(!/^\d{1,5}$/.test(port)||Number(port)>65535||!/^[a-f0-9]{48}$/.test(token))return;
 const panel=document.createElement('section');panel.id='self-check-panel';panel.setAttribute('aria-label','本机浏览器检查');
 const title=document.createElement('h2');title.textContent='正在检查游戏运行情况';panel.append(title);
 const list=document.createElement('ul');panel.append(list);document.body.append(panel);
 const checks:BrowserCheck[]=[];
 const add=(name:string,passed:boolean,detail:string)=>{checks.push({name,passed,detail});const item=document.createElement('li');item.textContent=`${passed?'通过':'未通过'} · ${name}：${detail}`;list.append(item);};
 let original:string|null=null,readable=false;
 try{original=localStorage.getItem(saveKey);readable=true;}catch{}
 const temporary='chi-xu-workshop:check:'+crypto.randomUUID();
 try{localStorage.setItem(temporary,'check');if(localStorage.getItem(temporary)!=='check')throw Error('读写不一致');add('浏览器存储',true,'临时记录可读写');}
 catch{add('浏览器存储',false,'请检查浏览器的站点存储权限');}
 finally{try{localStorage.removeItem(temporary);}catch{}}
 const limit=Date.now()+60000;
 while(Date.now()<limit&&!document.querySelector('#title-studio[data-ready="true"]')){
  if(document.querySelector('#studio-status')?.textContent?.includes('无法显示'))break;
  await new Promise(resolve=>setTimeout(resolve,250));
 }
 await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
 const host=document.querySelector<HTMLElement>('#title-studio'),canvas=host?.querySelector('canvas');
 add('真实牙模',host?.dataset.ready==='true'&&host?.dataset.teeth==='28','检查真实 28 冠病例的校验与加载');
 try{const gl=canvas?.getContext('webgl2');const ready=!!gl&&!gl.isContextLost()&&!!canvas?.width&&!!canvas?.height;add('WebGL画面',ready,ready?'游戏实际绘图上下文正常':'请检查浏览器硬件加速和显卡是否支持 WebGL2');}
 catch{add('WebGL画面',false,'无法读取绘图上下文');}
 try{add('原进度保护',readable&&localStorage.getItem(saveKey)===original,original?'已有记录保持原文不变':'本地址没有旧记录，未创建或覆盖挑战进度');}
 catch{add('原进度保护',false,'无法读取当前地址的记录');}
 const note=document.createElement('p');note.textContent=`检查地址：${location.origin}。旧进度在其他浏览器或 localhost 地址时，需要回到原地址查看。`;panel.append(note);
 try{
  const response=await fetch(`http://127.0.0.1:${port}/report/${token}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({origin:location.origin,checks})});
  if(!response.ok)throw Error('report failed');
  title.textContent=checks.every(check=>check.passed)?'浏览器检查通过':'检查完成，有项目需要处理';
  const done=document.createElement('p');done.textContent='结果已保存在游戏文件夹的“本机检查结果.local.json”。检查服务随后关闭；请双击“开始游戏”继续。';panel.append(done);
 }catch{title.textContent='检查已完成，结果未能写入本机报告';}
}
