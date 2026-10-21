import {it,expect} from 'vitest';
import {PerspectiveCamera,Vector3} from 'three';
import {motionCue} from '../src/motion';
function camera(x:number,y:number,z:number){const c=new PerspectiveCamera(35,1,.01,1000);c.up.set(0,0,1);c.position.set(x,y,z);c.lookAt(0,0,0);c.updateMatrixWorld();return c;}
it('同一个世界方向在相反观察面显示相反的屏幕移动名称',()=>{
 const origin=new Vector3();
 const front=motionCue(camera(0,-20,4),origin,2,'X',1,'translate',500,500);
 const back=motionCue(camera(0,20,4),origin,2,'X',1,'translate',500,500);
 expect(front.forward).toBe('向右挪');expect(back.forward).toBe('向左挪');
 expect(front.points[1].x).toBeGreaterThan(front.points[0].x);
 expect(back.points[1].x).toBeLessThan(back.points[0].x);
 expect(front.back).toBe(back.forward);
});
it('正对观察轴时明确朝向或远离玩家，避免把深度误标为左右',()=>{
 const c=camera(0,-20,0),origin=new Vector3();
 expect(motionCue(c,origin,2,'Y',1,'translate',500,500)).toMatchObject({depth:true,forward:'远离你挪',back:'朝向你挪',symbol:'⊗'});
 expect(motionCue(c,origin,2,'Y',-1,'translate',500,500)).toMatchObject({depth:true,forward:'朝向你挪',symbol:'⊙'});
});
it('旋转弧线按实际投影区分顺逆时针，反向与换面后都翻转',()=>{
 const origin=new Vector3(),c=camera(0,0,20);
 const forward=motionCue(c,origin,2,'Z',1,'rotate',500,500);
 const reverse=motionCue(c,origin,2,'Z',-1,'rotate',500,500);
 const back=motionCue(camera(0,0,-20),origin,2,'Z',1,'rotate',500,500);
 expect(forward.forward).toBe('逆时针转');expect(reverse.forward).toBe('顺时针转');expect(back.forward).toBe(reverse.forward);
 expect(forward.points).toHaveLength(33);expect(forward.path).not.toContain('NaN');
});
