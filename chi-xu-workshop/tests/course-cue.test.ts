import { it, expect } from "vitest";
import { PerspectiveCamera, Quaternion, Vector3 } from "three";
import { courseCue, assistPose } from "../src/course-cue";
import { passed, courseLimits } from "../src/course";
const p = {
  pivot: [0, 0, 0] as [number, number, number],
  translation: [0, 0, 0] as [number, number, number],
  quaternion: [0, 0, 0, 1] as [number, number, number, number],
};
it("移动与深度提示随镜头变化，不把文字引线当移动方向", () => {
  const camera = new PerspectiveCamera(35, 1, 0.01, 1000);
  camera.position.set(0, 0, 20);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const target = { ...p, translation: [2, 0, 0] as [number, number, number] };
  expect(courseCue(camera, p, target, "translate", 1, 900, 900).text).toContain(
    "右",
  );
  camera.position.set(0, 0, -20);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  expect(courseCue(camera, p, target, "translate", 1, 900, 900).text).toContain(
    "左",
  );
  const depth = { ...p, translation: [0, 0, 2] as [number, number, number] };
  expect(courseCue(camera, p, depth, "translate", 1, 900, 900).text).toContain(
    "远离你",
  );
});
it("辅助每次只缩小一半差距，保留另一分量，不吸附，旋转有真实弧线", () => {
  const target = {
    ...p,
    translation: [2, 1, 0] as [number, number, number],
    quaternion: new Quaternion()
      .setFromAxisAngle(new Vector3(0, 1, 0), 0.4)
      .toArray(),
  };
  const next = assistPose(p, target, "translate");
  expect(next.translation).toEqual([1, 0.5, 0]);
  expect(next.quaternion).toEqual(p.quaternion);
  expect(p.translation).toEqual([0, 0, 0]);
  const turn = assistPose(next, target, "rotate");
  expect(turn.translation).toEqual(next.translation);
  expect(turn.quaternion).not.toEqual(target.quaternion);
  const camera = new PerspectiveCamera();
  camera.position.set(0, -20, 12);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  expect(courseCue(camera, next, target, "rotate", 1, 900, 900).path).toContain(
    "L",
  );
});
it("较大任务允许更宽近似，小任务不变严格，也不自动初始过关", () => {
  const target = {
    ...p,
    translation: [2, 0, 0] as [number, number, number],
    quaternion: new Quaternion()
      .setFromAxisAngle(new Vector3(0, 0, 1), 0.4)
      .toArray(),
  };
  expect(courseLimits(target)).toEqual({ position: 0.35, rotation: 8 });
  expect(passed({ ...target, translation: [2.3, 0, 0] }, target)).toBe(true);
  expect(passed(p, target)).toBe(false);
  expect(courseLimits({ ...p, translation: [0.3, 0, 0] }).position).toBe(0.2);
});
