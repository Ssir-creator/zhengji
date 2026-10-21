export type Point={x:number;y:number};
export type Bounds={left:number;right:number;top:number;bottom:number};
export type MarkerInput=Point&{id:string};
/** Screen-space labels only; no model transforms or dental metadata are inferred. */
export function layoutMarkers(points:MarkerInput[],bounds:Bounds,width:number,height:number,rightLimit=width-12,reserved:Bounds[]=[]){
 const compact=width<760,labelWidth=compact?58:76,labelHeight=44,gap=compact&&reserved.length?4:8;
 const defaultTop=compact?32:88,bottom=Math.max(defaultTop+labelHeight,height-(compact?(reserved.length?74:132):208));
 const mid=(bounds.left+bounds.right)/2;
 let left=Math.max(12,Math.min(bounds.left-labelWidth-16,rightLimit-labelWidth));
 let right=Math.max(12,Math.min(bounds.right+16,rightLimit-labelWidth));
 if(right-left<labelWidth+gap){left=12;right=Math.max(left+labelWidth+gap,rightLimit-labelWidth);}
 const result:Array<MarkerInput&{left:number;top:number;width:number;height:number;side:'left'|'right'}>=[];
 for(const side of ['left','right'] as const){
  const x=side==='left'?left:right;
  const top=Math.max(defaultTop,...reserved.filter(r=>x<r.right&&x+labelWidth>r.left).map(r=>r.bottom+gap));
  const group=points.filter(p=>(p.x<=mid?'left':'right')===side).sort((a,b)=>a.y-b.y||a.id.localeCompare(b.id));
  let previous=top-labelHeight-gap;
  const positions=group.map(p=>{const y=Math.max(top,p.y-labelHeight/2,previous+labelHeight+gap);previous=y;return y;});
  const excess=Math.max(0,(positions.at(-1)??top)+labelHeight-bottom);
  for(let i=positions.length-1;i>=0;i--)positions[i]=Math.max(top+i*(labelHeight+gap),positions[i]-excess);
  group.forEach((p,i)=>result.push({...p,left:side==='left'?left:right,top:positions[i],width:labelWidth,height:labelHeight,side}));
 }
 return result;
}
