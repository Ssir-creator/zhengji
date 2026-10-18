/** Read-only STL inventory. Never infer model IDs, FDI, jaws, units or orientation. */
import {readFile,readdir,writeFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
const args=process.argv.slice(2);const value=flag=>args[args.indexOf(flag)+1];
if(!args.includes('--source')||!args.includes('--out')){console.error('Usage: node scripts/inspect-assets.mjs --source "D:\\论文复现\\CLIK-Diffusion-main\\Data\\256_crown\\initial" --out case.draft.json');process.exit(1);}
const source=path.resolve(value('--source'));const out=path.resolve(value('--out'));
try{await stat(out);throw Error('输出文件已存在；请指定新路径以保留已有核对结果。');}catch(e){if(e.code!=='ENOENT')throw e;}
const files=(await readdir(source,{withFileTypes:true})).filter(f=>f.isFile()&&/\.stl$/i.test(f.name)).sort((a,b)=>a.name.localeCompare(b.name));
const teeth=[];
for(const file of files){const bytes=await readFile(path.join(source,file.name));teeth.push({mesh_id:null,mesh_uri:file.name,checksum:createHash('sha256').update(bytes).digest('hex'),jaw_group:'unknown',FDI:null,origin:[0,0,0],source:'CLIK-Diffusion 目录样例，具体来源待核对',usage_status:'待核对',file_bytes:bytes.length});}
const tol={position:.35,rotation:3,fixed_position:.00001,fixed_rotation:.001};const pose=x=>({translation:[x,0,0],quaternion:[0,0,0,1]});
const levels=[{level_id:1,name:'创造空间',allowed_teeth:['3','5'],allowed_axes:{'3':{translate:['X'],rotate:[]},'5':{translate:['X'],rotate:[]}},target_pose:{'3':pose(1.5),'5':pose(-1.5)}},{level_id:2,name:'排齐错位牙',allowed_teeth:['4'],allowed_axes:{'4':{translate:['Y'],rotate:['Z']}},target_pose:{'4':pose(0)}},{level_id:3,name:'整体协调',allowed_teeth:['3','5','6'],allowed_axes:{'3':{translate:['X'],rotate:[]},'5':{translate:['X'],rotate:[]},'6':{translate:['Y'],rotate:['Z']}},target_pose:{'3':pose(1),'5':pose(-1),'6':pose(0)}}].map(l=>({...l,tolerances:{...tol},required_checks:l.level_id===3?['pose','fixed','stage2']:['pose','fixed']}));
await writeFile(out,JSON.stringify({case_id:'待填写匿名病例ID',asset_version:'待核对-v1',config_version:'prd-v1-provisional',unit:'u',unit_confirmed:false,scale:1,source:'CLIK-Diffusion 目录样例，具体来源待核对',usage_status:'待核对',teaching_reviewed:false,adjacency_confirmed:false,adjacency:[],teeth,levels},null,2),{flag:'wx'});
console.log(`发现 ${files.length} 个 STL；已写入 ${out}。只记录实际文件名、大小与 SHA-256，模型编号均为 null。`);
console.log('请明确核对模型 3/4/5/6/7 对应文件及其他编号；不会从排序或文件名推断牙位。教学允许轴为最小原型配置，边界及病例相机需审核补充。');
if(files.length!==28)console.warn('注意：PRD 要求 28 个牙冠，当前数量不符合。');
