import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { referenceCase } from "../src/prediction";
import { taskCards, challengeTolerance } from "../src/challenge";
import { taskPuzzle, sequenceFrames } from "../src/puzzles";
import { poseError } from "../src/core";
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
    Object.entries(m.prepared_assets).map(([id, v]) => [
      id,
      (v as { pivot: [number, number, number] }).pivot,
    ]),
  ),
);
it("九题有不同观察目标，错例依据实际刚体变换，不改变原始或参考模型", () => {
  const before = JSON.stringify(data),
    puzzles = taskCards(data).map((_, i) => taskPuzzle(data, i));
  expect(new Set(puzzles.map((p) => p.title)).size).toBe(9);
  for (const p of puzzles)
    expect(p.options.some((o) => o.value === p.answer)).toBe(true);
  expect(puzzles[3].answer).toBe("rotate");
  expect(puzzles[4].answer).toBe("translate");
  expect(puzzles[5].answer).toBe("both");
  expect(puzzles[8].answer).toBe("translate");
  const id = taskCards(data)[5][0],
    e = poseError(puzzles[5].sample![id], data.target[id]);
  expect(e.position).toBeGreaterThan(challengeTolerance.position);
  expect(e.rotation).toBeGreaterThan(challengeTolerance.rotation);
  expect(JSON.stringify(data)).toBe(before);
});
it("六步顺序试验世界平移与固定枢轴旋转终点相同，每步保留枢轴和单位四元数", () => {
  const frames = sequenceFrames(data, 7),
    id = taskCards(data)[7][0];
  expect(frames).toHaveLength(6);
  expect(frames[2]).toEqual(frames[5]);
  expect(frames[0]).toEqual(data.original);
  expect(frames[1]).not.toEqual(frames[4]);
  for (const frame of frames)
    expect(frame[id].pivot).toEqual(data.original[id].pivot);
  expect(taskPuzzle(data, 7).answer).toBe("same");
});
