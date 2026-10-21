import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { copy,type Tool as GuideTool,type Axis as GuideAxis,type Pose,type Poses,type Tool,type Axis,type Vec3,type Manifest } from './core';
import type { CaseAssets } from './assets';
import {toothColors,toothState} from './appearance';
export class WorkshopScene{
 renderer:T.WebGLRenderer;scene=new T.Scene();camera=new T.PerspectiveCamera(35,1,.01,1e6);orbit:OrbitControls;transform:TransformControls;composer:EffectComposer;outline:OutlinePass;
 taskIds:string[]=[];completedIds:string[]=[];fixedIds:string[]=[];hoverId:string|undefined;guideGroup=new T.Group();guideArrow=new T.ArrowHelper(new T.Vector3(1,0,0),new T.Vector3(),1,'#326857',.2,.1);guideRing=new T.Mesh(new T.TorusGeometry(1,.035,6,64),new T.MeshBasicMaterial({color:'#326857',transparent:true,opacity:.85,depthTest:false}));
 teeth=new Map<string,T.Mesh>();ghosts=new Map<string,T.Mesh>();furniture=new T.Group();measurements=new T.Group();gizmo=new T.AxesHelper(1);selected:string|null=null;selectionEditable=false;before:Pose|null=null;dragCancelled=false;size=100;center=new T.Vector3();frame=0;dirty=true;outlineKey="";outlineChanged=0;reduced=false;ro:ResizeObserver;low=false;disposed=false;last=performance.now();fps=0;frames=0;
 onSelect:(id:string)=>void=()=>{};onCommit:(id:string,before:Pose,after:Pose)=>void=()=>{};onPreview:(id:string,pose:Pose)=>void=()=>{};onFailure:(message:string)=>void=()=>{};
 constructor(public host:HTMLElement,private offsetForSidebar=true){
  this.renderer=new T.WebGLRenderer({antialias:true,alpha:false});this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));this.renderer.setClearColor('#e3dfd4');this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.08;this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.autoUpdate=false;this.renderer.shadowMap.needsUpdate=true;this.renderer.shadowMap.type=T.PCFSoftShadowMap;this.renderer.setSize(host.clientWidth,host.clientHeight);host.append(this.renderer.domElement);
  const ambient=new T.HemisphereLight('#fff8e8','#a1a39c',1.35);ambient.position.set(0,0,1);this.scene.add(ambient);
  const light=new T.DirectionalLight('#fff4df',2.6);light.position.set(-80,-90,150);light.castShadow=true;light.shadow.mapSize.set(1024,1024);light.shadow.camera.left=-120;light.shadow.camera.right=120;light.shadow.camera.top=120;light.shadow.camera.bottom=-120;light.shadow.camera.far=700;light.shadow.bias=-.0001;this.scene.add(light);
  const fill=new T.DirectionalLight('#dcecf4',1.1);fill.position.set(80,50,60);this.scene.add(fill);
  const rim=new T.DirectionalLight('#c5e4ee',1.4);rim.position.set(20,100,90);this.scene.add(rim);
  this.camera.up.set(0,0,1);this.camera.position.set(100,-100,100);
  this.orbit=new OrbitControls(this.camera,this.renderer.domElement);this.orbit.enableDamping=true;this.orbit.addEventListener('change',()=>{this.dirty=true;});this.orbit.minDistance=1;this.orbit.maxDistance=500;
  this.renderer.domElement.addEventListener('pointerdown',e=>{if(e.pointerType==='touch'){this.transform.enabled=false;this.orbit.enabled=false;}},{capture:true});
  this.renderer.domElement.addEventListener('pointerup',e=>{if(e.pointerType==='touch')setTimeout(()=>{this.transform.enabled=true;this.orbit.enabled=true;},0);});
  this.transform=new TransformControls(this.camera,this.renderer.domElement);this.transform.addEventListener('change',()=>{this.dirty=true;});this.transform.setSpace('world');this.transform.setSize(.8);this.scene.add(this.transform.getHelper());
  this.transform.addEventListener('mouseDown',()=>{const id=this.selected;if(id){this.before=this.readPose(id);this.dragCancelled=false;}this.orbit.enabled=false;});
  this.transform.addEventListener('objectChange',()=>{if(this.selected&&!this.dragCancelled)this.onPreview(this.selected,this.readPose(this.selected));});
  this.transform.addEventListener('mouseUp',()=>{this.orbit.enabled=true;if(this.before&&this.selected&&!this.dragCancelled)this.onCommit(this.selected,copy(this.before),this.readPose(this.selected));this.before=null;});
  this.renderer.domElement.addEventListener('pointercancel',()=>this.cancelDrag(),{capture:true});
  this.renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();this.onFailure('WebGL 上下文丢失，当前记录仍可导出。请返回后重试。');});
  let down={x:0,y:0,handle:false};
  this.renderer.domElement.addEventListener('pointerdown',e=>{down={x:e.clientX,y:e.clientY,handle:!!this.transform.axis};});
  this.renderer.domElement.addEventListener('pointerup',e=>{if(down.handle||this.before||Math.hypot(e.clientX-down.x,e.clientY-down.y)>4)return;const hit=this.pick(e);if(hit)this.onSelect(hit);});
  this.renderer.domElement.addEventListener('pointermove',e=>{if(this.before||this.transform.axis)return;const hit=this.pick(e);if(this.hoverId!==hit){this.hoverId=hit;this.updateOutline();}this.renderer.domElement.style.cursor=hit?'pointer':'grab';});
  this.renderer.domElement.addEventListener('pointerleave',()=>{if(this.hoverId){this.hoverId=undefined;this.updateOutline();}});
  this.composer=new EffectComposer(this.renderer);this.composer.addPass(new RenderPass(this.scene,this.camera));this.outline=new OutlinePass(new T.Vector2(host.clientWidth,host.clientHeight),this.scene,this.camera);this.outline.edgeStrength=2.5;this.outline.edgeThickness=1.5;this.outline.visibleEdgeColor.set('#995b29');this.outline.hiddenEdgeColor.set('#995b29');this.outline.pulsePeriod=0;this.composer.addPass(this.outline);this.composer.addPass(new OutputPass());
  this.guideGroup.add(this.guideArrow,this.guideRing);this.guideGroup.visible=false;this.guideArrow.renderOrder=10;this.guideRing.renderOrder=10;this.scene.add(this.furniture,this.measurements,this.guideGroup);this.ro=new ResizeObserver(()=>this.resize());this.ro.observe(host);this.animate();
 }
 pick(e:PointerEvent){const r=this.renderer.domElement.getBoundingClientRect();const ray=new T.Raycaster();ray.setFromCamera(new T.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),this.camera);const hit=ray.intersectObjects([...this.teeth.values()].filter(m=>m.visible),false)[0];return hit?.object.userData.id as string|undefined;}
 load(data:CaseAssets,poses:Poses){
  for(const a of data.assets){const mesh=new T.Mesh(a.geometry,new T.MeshPhysicalMaterial({color:toothColors.natural,metalness:0,roughness:.28,clearcoat:.3,clearcoatRoughness:.24,side:T.DoubleSide}));mesh.userData={id:a.id,pivot:a.pivot,desktopGeometry:a.geometry,lowGeometry:a.lowGeometry,asset:a};mesh.castShadow=true;mesh.receiveShadow=true;this.teeth.set(a.id,mesh);this.scene.add(mesh);
   const ghost=new T.Mesh(a.geometry,new T.MeshBasicMaterial({color:'#ADC9DC',opacity:.18,transparent:true,depthWrite:false,wireframe:true}));ghost.visible=false;this.ghosts.set(a.id,ghost);this.scene.add(ghost);
  }
  this.apply(poses);const box=new T.Box3();this.teeth.forEach(m=>box.expandByObject(m));box.getCenter(this.center);this.size=box.getSize(new T.Vector3()).length();this.camera.near=this.size/2000;this.camera.far=this.size*100;this.camera.updateProjectionMatrix();this.orbit.minDistance=this.size*.25;this.orbit.maxDistance=this.size*5;
  this.makeFurniture(box);this.view('overview',data.manifest);this.resize();
 }
 makeFurniture(box:T.Box3){
  const d=this.size;const c=this.center;const z=box.min.z-d*.12;
  const rounded=(w:number,h:number,t:number,color:string,x:number,y:number,height:number)=>{const m=new T.Mesh(new RoundedBoxGeometry(w,h,t,3,Math.min(w,h,t)*.25),new T.MeshStandardMaterial({color,roughness:.65}));m.position.set(x,y,height);m.receiveShadow=true;m.castShadow=true;this.furniture.add(m);return m;};
  rounded(d*1.65,d*1.35,d*.065,'#77796b',c.x,c.y,z-d*.09);
  rounded(d*1.59,d*1.29,d*.05,'#eeeadf',c.x,c.y,z-d*.045);
  rounded(d*.82,d*.72,d*.035,'#b8b9ab',c.x,c.y,z);
  for(let i=0;i<3;i++){rounded(d*.12,d*.055,d*.04,'#c6b594',c.x+d*(.46+i*.15),c.y+d*.38,z);rounded(d*.1,d*.025,d*.14,['#a1b3ae','#c1c8c4','#c8aa70'][i],c.x+d*(.46+i*.15),c.y+d*.38,z+d*.08);}
  for(let i=0;i<5;i++)rounded(d*2.8,d*.006,d*.002,'#d6c4a8',c.x,c.y+d*(i*.32-.64),z-d*.135);
  const floor=new T.Mesh(new T.PlaneGeometry(d*20,d*20),new T.MeshStandardMaterial({color:'#dfd1ba',roughness:1}));floor.position.set(c.x,c.y,z-d*.14);floor.receiveShadow=true;this.furniture.add(floor);
  this.gizmo.scale.setScalar(d*.1);this.gizmo.position.set(c.x-d*.6,c.y-d*.45,z);this.gizmo.visible=false;this.furniture.add(this.gizmo);
  const wood='#b99b70',mint='#737c6c';
  // Decorative lamp and tray sit outside the dental work area; they have no click behavior.
  const cylinder=(r:number,h:number,color:string,x:number,y:number,z0:number)=>{const mesh=new T.Mesh(new T.CylinderGeometry(r,r,h,20),new T.MeshStandardMaterial({color,roughness:.7}));mesh.rotation.x=Math.PI/2;mesh.position.set(x,y,z0);mesh.castShadow=true;this.furniture.add(mesh);return mesh;};
  const lx=c.x+d*.6,ly=c.y-d*.43;
  cylinder(d*.095,d*.025,mint,lx,ly,z);cylinder(d*.012,d*.34,wood,lx,ly,z+d*.18);
  const shade=new T.Mesh(new T.ConeGeometry(d*.12,d*.1,24,1,true),new T.MeshStandardMaterial({color:mint,roughness:.6,side:T.DoubleSide}));shade.rotation.x=Math.PI/2;shade.position.set(lx,ly,z+d*.38);this.furniture.add(shade);
  rounded(d*.25,d*.16,d*.025,wood,c.x-d*.5,c.y+d*.44,z);rounded(d*.22,d*.13,d*.018,'#b5c9bb',c.x-d*.5,c.y+d*.44,z+d*.015);
  for(let i=0;i<3;i++)rounded(d*.012,d*.09,d*.012,'#e0e5dc',c.x-d*.56+i*d*.055,c.y+d*.44,z+d*.035);
 }
 readPose(id:string):Pose{const m=this.teeth.get(id)!;const pivot=m.userData.pivot as Vec3;return{translation:m.position.clone().sub(new T.Vector3(...pivot)).toArray() as Vec3,quaternion:m.quaternion.toArray() as [number,number,number,number],pivot:[...pivot]};}
 apply(poses:Poses){this.dirty=true;this.renderer.shadowMap.needsUpdate=true;for(const [id,p] of Object.entries(poses)){const m=this.teeth.get(id);if(m){m.position.fromArray(p.pivot).add(new T.Vector3(...p.translation));m.quaternion.fromArray(p.quaternion);m.updateMatrixWorld();}}}
 select(id:string|null,editable:boolean,tool:Tool,axes:Axis[]){this.dirty=true;this.selected=id;this.selectionEditable=editable;this.transform.detach();this.updateOutline();if(id&&editable&&axes.length){this.transform.setMode(tool);this.transform.showX=axes.includes('X');this.transform.showY=axes.includes('Y');this.transform.showZ=axes.includes('Z');this.transform.attach(this.teeth.get(id)!);}}

 updateOutline(){this.updateAppearance();this.outline.selectedObjects=[...new Set([...this.taskIds,this.selected,this.hoverId].filter((id):id is string=>!!id).map(id=>this.teeth.get(id)).filter((mesh):mesh is T.Mesh=>!!mesh&&mesh.visible))];}
 setTaskTeeth(ids:string[]){this.taskIds=ids;this.updateOutline();}
 setFixedTeeth(ids:string[]){this.fixedIds=ids;this.updateOutline();}
 setCompletedTeeth(ids:string[]){if(ids.join('|')===this.completedIds.join('|'))return;this.completedIds=ids;this.updateOutline();}
 updateAppearance(){
  for(const [id,mesh] of this.teeth){
   const state=toothState(id,{selected:this.selectionEditable?this.selected:null,hover:this.hoverId,tasks:this.taskIds,completed:this.completedIds,fixed:this.fixedIds});
   if(mesh.userData.appearance===state)continue;
   const material=mesh.material as T.MeshPhysicalMaterial;
   material.color.set(toothColors[state]);material.emissive.set(state==='selected'?'#6e350b':'#000000');material.emissiveIntensity=state==='selected'?.08:0;
   mesh.userData.appearance=state;this.dirty=true;
  }
 }
 setGuide(guide:{id:string;axis:GuideAxis;sign:number;tool:GuideTool}|null){
  this.dirty=true;this.guideGroup.visible=!!guide;if(!guide)return;const tooth=this.teeth.get(guide.id);if(!tooth)return;
  this.guideGroup.position.copy(tooth.position);const direction=new T.Vector3().setComponent(['X','Y','Z'].indexOf(guide.axis),guide.sign);
  if(guide.tool==='translate'){this.guideRing.visible=false;this.guideArrow.position.copy(direction).multiplyScalar(this.size*.018);this.guideArrow.setDirection(direction);this.guideArrow.setLength(this.size*.1,this.size*.018,this.size*.01);}
  else{this.guideRing.visible=true;const normal=new T.Vector3().setComponent(['X','Y','Z'].indexOf(guide.axis),1);const radial=guide.axis==='X'?new T.Vector3(0,1,0):new T.Vector3(1,0,0);this.guideRing.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),normal);this.guideRing.scale.setScalar(this.size*.052);this.guideArrow.position.copy(radial).multiplyScalar(this.size*.052);this.guideArrow.setDirection(normal.clone().cross(radial).multiplyScalar(guide.sign));this.guideArrow.setLength(this.size*.035,this.size*.015,this.size*.008);}
 }

 cancelDrag(){if(this.before&&this.selected){this.dragCancelled=true;const id=this.selected,p=copy(this.before);this.transform.reset();this.apply({[id]:p});this.onPreview(id,p);this.before=null;}this.orbit.enabled=true;}
 ghostsAt(poses:Poses|null,initial=false){this.dirty=true;for(const [id,g] of this.ghosts){const p=poses?.[id];g.visible=!!p&&!!this.teeth.get(id)?.visible;if(p){g.position.fromArray(p.pivot).add(new T.Vector3(...p.translation));g.quaternion.fromArray(p.quaternion);const mat=g.material as T.MeshBasicMaterial;mat.color.set(initial?'#90CBB5':'#ADC9DC');}}}
 view(name:string,m:Manifest){this.dirty=true;const preset=m.cameras?.[name];if(preset){this.camera.up.fromArray(preset.up);this.camera.position.fromArray(preset.position);this.orbit.target.fromArray(preset.target);}else{this.camera.up.set(0,0,1);this.camera.position.copy(this.center).add(new T.Vector3(1,-1,1).normalize().multiplyScalar(this.size*2));this.orbit.target.copy(this.center);}if(name==='overview'){this.camera.position.sub(this.orbit.target).multiplyScalar(1.22).add(this.orbit.target);}this.orbit.update();}
 zoom(factor:number){const d=this.camera.position.clone().sub(this.orbit.target);d.multiplyScalar(factor).clampLength(this.orbit.minDistance,this.orbit.maxDistance);this.camera.position.copy(this.orbit.target).add(d);this.orbit.update();}
 showJaw(jaw:string,m:Manifest){this.dirty=true;this.renderer.shadowMap.needsUpdate=true;this.transform.detach();for(const t of m.teeth){this.teeth.get(t.mesh_id)!.visible=jaw==='all'||t.jaw_group===jaw;}for(const g of this.ghosts.values())g.visible=false;}
 visibleTriangles(){let total=0;this.teeth.forEach(m=>{if(m.visible)total+=(m.geometry.index?.count??m.geometry.getAttribute('position').count)/3;});return total;}
 setLow(value:boolean){this.dirty=true;this.renderer.shadowMap.needsUpdate=true;this.low=value;for(const [id,mesh] of this.teeth){const asset=mesh.userData.asset as CaseAssets['assets'][number];const geometry=value&&asset.lowGeometry?asset.lowGeometry:asset.geometry;mesh.geometry=geometry;this.ghosts.get(id)!.geometry=geometry;}this.renderer.setPixelRatio(value?1:Math.min(devicePixelRatio,2));this.renderer.shadowMap.enabled=!value;this.resize();}
 line(endpoints:[Vec3,Vec3],label:string){this.dirty=true;const line=new T.Line(new T.BufferGeometry().setFromPoints(endpoints.map(p=>new T.Vector3(...p))),new T.LineBasicMaterial({color:'#6e9eb8'}));line.userData.label=label;this.measurements.add(line);for(const p of endpoints){const dot=new T.Mesh(new T.SphereGeometry(this.size*.004,8,6),new T.MeshBasicMaterial({color:'#6e9eb8'}));dot.position.fromArray(p);this.measurements.add(dot);}}
 clearLines(){this.dirty=true;this.measurements.traverse(o=>{if(o instanceof T.Mesh||o instanceof T.Line){o.geometry.dispose();(o.material as T.Material).dispose();}});this.measurements.clear();}
 projectPoint(point:Vec3){const p=new T.Vector3(...point).project(this.camera);return{x:(p.x+1)/2*this.host.clientWidth,y:(1-p.y)/2*this.host.clientHeight,visible:p.z>-1&&p.z<1};}
 directionSVG(){const inv=this.camera.quaternion.clone().invert();return `<svg class="direction-widget" viewBox="0 0 100 100" aria-label="模型世界坐标方向">${(['X','Y','Z'] as const).map((axis,i)=>{const v=new T.Vector3().setComponent(i,1).applyQuaternion(inv);const x=45+v.x*28,y=52-v.y*28;return `<line x1="45" y1="52" x2="${x}" y2="${y}" stroke="${['#aa6c5f','#568b72','#628da7'][i]}" stroke-width="2"/><text x="${x+4}" y="${y+3}" fill="#234B43" font-size="12">${axis}</text>`;}).join('')}</svg>`;}
 projectedTeethBounds(){
  const points:T.Vector3[]=[];
  for(const mesh of this.teeth.values()){
   if(!mesh.visible)continue;
   const box=mesh.geometry.boundingBox;if(!box)continue;
   for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
    const p=new T.Vector3(x,y,z).applyMatrix4(mesh.matrixWorld).project(this.camera);
    if(p.z>-1&&p.z<1)points.push(p);
   }
  }
  if(!points.length)return{left:0,right:this.host.clientWidth,top:0,bottom:this.host.clientHeight};
  return{left:Math.min(...points.map(p=>(p.x+1)/2*this.host.clientWidth)),right:Math.max(...points.map(p=>(p.x+1)/2*this.host.clientWidth)),top:Math.min(...points.map(p=>(1-p.y)/2*this.host.clientHeight)),bottom:Math.max(...points.map(p=>(1-p.y)/2*this.host.clientHeight))};
 }
 marker(id:string){const mesh=this.teeth.get(id);if(!mesh||!mesh.visible)return null;const p=mesh.position.clone().project(this.camera);return{x:(p.x+1)/2*this.host.clientWidth,y:(1-p.y)/2*this.host.clientHeight,visible:p.z>-1&&p.z<1};}
 resize(){this.dirty=true;if(this.disposed)return;const w=this.host.clientWidth,h=this.host.clientHeight;if(!w||!h)return;this.camera.aspect=w/h;if(this.offsetForSidebar)this.camera.setViewOffset(w,h,w>=1100?130:w>=900?100:0,0,w,h);else this.camera.clearViewOffset();this.camera.updateProjectionMatrix();this.renderer.setSize(w,h);this.composer.setSize(w,h);}
 animate=()=>{if(this.disposed)return;this.frame=requestAnimationFrame(this.animate);this.orbit.update();const now=performance.now();const key=this.outline.selectedObjects.map(o=>o.uuid).join();if(key!==this.outlineKey){this.dirty=true;this.outlineKey=key;this.outlineChanged=now;}const strength=2.5*(this.reduced?1:Math.min(1,(now-this.outlineChanged)/150));if(this.outline.edgeStrength!==strength)this.dirty=true;this.outline.edgeStrength=strength;const render=this.dirty||(!this.reduced&&now-this.outlineChanged<180);if(render){this.composer.render();this.frames++;this.dirty=false;}const t=performance.now();if(t-this.last>1000){this.fps=this.frames*1000/(t-this.last);this.frames=0;this.last=t;}};
 dispose(){this.disposed=true;cancelAnimationFrame(this.frame);this.ro.disconnect();this.orbit.dispose();this.transform.dispose();this.scene.traverse(o=>{if(o instanceof T.Mesh||o instanceof T.Line){if(![...this.teeth.values(),...this.ghosts.values()].includes(o as T.Mesh))o.geometry.dispose();const mats=Array.isArray(o.material)?o.material:[o.material];mats.forEach(m=>m.dispose());}});this.composer.dispose();this.renderer.dispose();this.renderer.domElement.remove();}
}
