import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { referenceCase } from "../src/prediction";
import {
  freshCourse,
  validateCourse,
  moveCourse,
  advanceCourse,
  stageStart,
  lessonReady,
  lessons,
  correction,
} from "../src/course";
const m = JSON.parse(
    readFileSync("public/cases/initial/manifest.json", "utf8"),
  ),
  ref = JSON.parse(
    readFileSync("public/cases/initial/prediction/reference.json", "utf8"),
  );
const data = referenceCase(
  ref,
  m,
  Object.fromEntries(
    Object.entries(m.prepared_assets).map(([id, v]) => [id, (v as any).pivot]),
  ),
);
function solve(s: ReturnType<typeof freshCourse>) {
  for (const id of lessons[s.stage].ids) {
    if (s.stage === 3) s.guess[`3:${id}`] = "both";
    for (const tool of ["translate", "rotate"] as const) {
      if (lessons[s.stage].tool && lessons[s.stage].tool !== tool) continue;
      const p = structuredClone(s.poses[id]);
      if (tool === "translate")
        p.translation = structuredClone(data.target[id].translation);
      else p.quaternion = structuredClone(data.target[id].quaternion);
      s = moveCourse(data, s, id, p, tool);
    }
  }
  return s;
}
describe("六关空间课程", () => {
  it("工具限制、未完成阻止前进、禁止越区和同时改两分量", () => {
    const s = freshCourse(data);
    expect(() => advanceCourse(data, s)).toThrow();
    expect(() =>
      moveCourse(data, s, "6", data.target["6"], "rotate"),
    ).toThrow();
    expect(() =>
      moveCourse(data, s, "8", data.target["8"], "translate"),
    ).toThrow();
    const bad = structuredClone(s.poses["6"]);
    bad.quaternion = [0, 0, 1, 0];
    expect(() => moveCourse(data, s, "6", bad, "translate")).toThrow();
  });
  it("六关连续完成，准备下一关只改变未处理区域，28颗网格枢轴保持不变", () => {
    let s = freshCourse(data);
    const completed: string[] = [];
    for (let stage = 0; stage < 6; stage++) {
      expect(s.stage).toBe(stage);
      if (stage === 2) {
        expect(s.poses["9"]).toEqual(data.target["9"]);
        expect(s.poses["10"]).toEqual(data.original["10"]);
      }
      s = solve(s);
      expect(lessonReady(data, s)).toBe(true);
      completed.push(...lessons[stage].ids);
      const before = structuredClone(s);
      s = advanceCourse(data, s);
      for (const id of completed) expect(s.poses[id]).toEqual(before.poses[id]);
      expect(validateCourse(JSON.parse(JSON.stringify(s)), data)).toEqual(s);
    }
    expect(s.completed).toBe(true);
    expect(s.poses["2"]).toEqual(data.original["2"]);
  });
  it("错例是实际起点，判断不锁死工具，修复可迭代", () => {
    let s = freshCourse(data);
    for (let i = 0; i < 3; i++) s = advanceCourse(data, solve(s));
    expect(s.poses["12"].translation).toEqual(data.target["12"].translation);
    expect(s.poses["12"].quaternion).toEqual(data.original["12"].quaternion);
    expect(() =>
      moveCourse(data, s, "12", data.target["12"], "rotate"),
    ).toThrow();
    s.guess["3:12"] = "translate";
    s = moveCourse(data, s, "12", data.target["12"], "rotate");
    expect(lessonReady(data, s)).toBe(true);
  });
  it("拒绝篡改先前成果、越关、非有限位姿、伪造操作记录", () => {
    const s = freshCourse(data);
    for (const mutate of [
      (x: any) => (x.stage = 3),
      (x: any) => (x.poses["2"].translation[0] = 1),
      (x: any) => (x.poses["6"].quaternion = [0, 0, 0, 0]),
      (x: any) => (x.completed = true),
    ]) {
      const bad = structuredClone(s);
      mutate(bad);
      expect(() => validateCourse(bad, data)).toThrow();
    }
  });
  it("过头需要修正，正确分量被误动有明确反馈", () => {
    const p = stageStart(data, 4, data.original)["14"];
    expect(correction(data.target["14"], p, data.target["14"])).toContain(
      "原本合适",
    );
    expect(p.translation).not.toEqual(data.target["14"].translation);
  });
});
