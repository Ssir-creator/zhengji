import { it, expect } from "vitest";
import { Quaternion, Vector3 } from "three";
import { experimentResult } from "../src/open-experiment";
import type { Pose } from "../src/core";
const target: Pose = {
    pivot: [0, 0, 0],
    translation: [0, 0, 0],
    quaternion: [0, 0, 0, 1],
  },
  baseline: Pose = {
    pivot: [0, 0, 0],
    translation: [2, 0, 0],
    quaternion: new Quaternion()
      .setFromAxisAngle(new Vector3(0, 0, 1), 0.3)
      .toArray(),
  };
it("开放位置试验接受不同终点，但不允许靠恶化方向换取达成", () => {
  for (const x of [0.5, 1])
    expect(
      experimentResult(
        baseline,
        { ...baseline, translation: [x, 0, 0] },
        target,
        "position",
      ).achieved,
    ).toBe(true);
  expect(
    experimentResult(
      baseline,
      {
        ...baseline,
        translation: [0.5, 0, 0],
        quaternion: new Quaternion()
          .setFromAxisAngle(new Vector3(0, 0, 1), 0.4)
          .toArray(),
      },
      target,
      "position",
    ).achieved,
  ).toBe(false);
  expect(
    experimentResult(baseline, baseline, target, "position").achieved,
  ).toBe(false);
});
it("方向和平衡目标分别要求改善所选项，已在容差内不能刷试验达成", () => {
  const turned = { ...baseline, quaternion: target.quaternion };
  expect(experimentResult(baseline, turned, target, "rotation").achieved).toBe(
    true,
  );
  expect(experimentResult(baseline, turned, target, "balanced").achieved).toBe(
    false,
  );
  expect(experimentResult(baseline, target, target, "balanced").achieved).toBe(
    true,
  );
  expect(experimentResult(target, target, target, "balanced").eligible).toBe(
    false,
  );
});
