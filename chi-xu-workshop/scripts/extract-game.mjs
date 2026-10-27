import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname,sep} from 'node:path';
import {inflateRawSync,crc32} from 'node:zlib';
// GitHub branch ZIPs use ordinary stored/deflated entries. Reject unsupported
// formats instead of publishing a partial game. No shell or native unzip step.
export async function extractGameZip(archive,destination,{write=writeFile,wait=ms=>new Promise(r=>setTimeout(r,ms))}={}){
 const zip=await readFile(archive);
 let end=-1;
 for(let i=zip.length-22;i>=Math.max(0,zip.length-65557);i--){if(zip.readUInt32LE(i)===0x06054b50&&i+22+zip.readUInt16LE(i+20)===zip.length){end=i;break;}}
 if(end<0)throw Error('下载的ZIP尾部不完整。');
 const count=zip.readUInt16LE(end+10),size=zip.readUInt32LE(end+12),offset=zip.readUInt32LE(end+16);
 if(zip.readUInt16LE(end+4)||zip.readUInt16LE(end+6)||count!==zip.readUInt16LE(end+8)||count===65535||offset+size!==end)throw Error('不支持此ZIP布局，旧版未替换。');
 const root=resolve(destination)+sep;let cursor=offset,files=0,total=0,project=null;const seen=new Set();
 for(let i=0;i<count;i++){
  if(cursor+46>end||zip.readUInt32LE(cursor)!==0x02014b50)throw Error('ZIP目录损坏。');
  const flags=zip.readUInt16LE(cursor+8),method=zip.readUInt16LE(cursor+10),checksum=zip.readUInt32LE(cursor+16),packed=zip.readUInt32LE(cursor+20),unpacked=zip.readUInt32LE(cursor+24),length=zip.readUInt16LE(cursor+28),extra=zip.readUInt16LE(cursor+30),comment=zip.readUInt16LE(cursor+32),local=zip.readUInt32LE(cursor+42);
  const next=cursor+46+length+extra+comment;if(next>end)throw Error('ZIP目录越界。');
  const name=zip.subarray(cursor+46,cursor+46+length).toString('utf8');cursor=next;
  if(name.includes('\\')||name.includes(':')||name.includes('\0')||name.startsWith('/')||name.split('/').some(p=>p==='.'||p==='..'))throw Error('ZIP中包含不安全路径。');
  const match=/^([^/]+)\/chi-xu-workshop\/(.+)$/.exec(name);
  if(!match||name.endsWith('/'))continue;
  const relative=match[2];
  if(/^(docs|tests|node_modules|dist|\.git|\.github)(\/|$)/i.test(relative))continue;
  if(project&&project!==match[1])throw Error('ZIP包含多份游戏。');project=match[1];
  const target=resolve(destination,name);if(!target.startsWith(root)||seen.has(target.toLowerCase()))throw Error('ZIP路径冲突。');seen.add(target.toLowerCase());
  total+=unpacked;if(unpacked>256*1024*1024||total>1024*1024*1024||flags&1||![0,8].includes(method)||local+30>offset||zip.readUInt32LE(local)!==0x04034b50)throw Error('ZIP文件格式无效或超出限制。');
  const start=local+30+zip.readUInt16LE(local+26)+zip.readUInt16LE(local+28);
  if(start+packed>offset)throw Error('ZIP文件数据不完整。');
  const compressed=zip.subarray(start,start+packed),bytes=method===0?compressed:inflateRawSync(compressed,{maxOutputLength:Math.max(1,unpacked)});
  if(bytes.length!==unpacked||crc32(bytes)!==checksum)throw Error('ZIP文件校验失败。');
  await mkdir(dirname(target),{recursive:true});
  for(let attempt=0;;attempt++){
   try{await write(target,bytes);break;}catch(error){if(!['EBUSY','EPERM','EACCES'].includes(error.code)||attempt===5)throw error;await wait(250*2**attempt);}
  }
  files++;
 }
 if(cursor!==end||!files)throw Error('ZIP中没有完整游戏文件。');
 return {files};
}
