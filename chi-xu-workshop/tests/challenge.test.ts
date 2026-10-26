import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { referenceCase } from "../src/prediction";
import {
  CHALLENGE_KEY,
  taskCards,
  freshChallenge,
  validateChallenge,
  moveChallenge,
  checkChallengeTooth,
  advanceChallenge,
  replayPoses,
  nudgePose,
} from "../src/challenge";
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
it("短任务覆盖全部28颗，与旧存档隔离；最终仍为上传的精确参考", () => {
  expect(CHALLENGE_KEY).not.toBe("chi-xu-workshop:prediction:v1");
  const cards = taskCards(data);
  expect(cards.map((g) => g.length)).toEqual([3, 3, 3, 3, 3, 3, 3, 3, 4]);
  expect(new Set(cards.flat()).size).toBe(28);
  let s = freshChallenge(data);
  for (const [i, group] of cards.entries()) {
    expect(() => advanceChallenge(data, s)).toThrow();
    s.observed.push(i);
    for (const id of group) {
      s = moveChallenge(data, s, id, data.target[id], "测试实际位姿");
      const checked = checkChallengeTooth(data, s, id);
      expect(checked.passed).toBe(true);
      s = checked.next;
    }
    s.reflections[String(i)] = "observe";
    s = advanceChallenge(data, s);
    expect(validateChallenge(s, data)).toEqual(s);
  }
  expect(s.checked).toHaveLength(28);
  expect(s.poses).toEqual(data.target);
  expect(replayPoses(s, s.replay.length)).toEqual(data.target);
});
it("观察未完成、其他任务牙和已核对牙不能移动；前后回放不改存档", () => {
  let s = freshChallenge(data),
    id = taskCards(data)[0][0];
  expect(() =>
    moveChallenge(data, s, id, data.target[id], "越过观察"),
  ).toThrow();
  s.observed.push(0);
  expect(() =>
    moveChallenge(data, s, taskCards(data)[1][0], data.target[id], "越关"),
  ).toThrow();
  const before = structuredClone(s);
  s = moveChallenge(
    data,
    s,
    id,
    nudgePose(s.poses[id], "translate", "X", 1, true),
    "细调",
  );
  const raw = JSON.stringify(s);
  expect(replayPoses(s, 0)).toEqual(before.poses);
  replayPoses(s, 1);
  expect(JSON.stringify(s)).toBe(raw);
  expect(checkChallengeTooth(data, s, id).passed).toBe(false);
  s = moveChallenge(data, s, id, data.target[id], "到目标");
  s = checkChallengeTooth(data, s, id).next;
  expect(() =>
    moveChallenge(data, s, id, data.original[id], "改已核对"),
  ).toThrow();
});
it("拒绝坏四元数、枢轴变化、篡改回放、非有限数和跳关；回放折叠后仍能复现", () => {
  const s = freshChallenge(data),
    id = taskCards(data)[0][0];
  for (const mutate of [
    (v: typeof s) => {
      v.poses[id].quaternion = [0, 0, 0, 0];
    },
    (v: typeof s) => {
      v.poses[id].pivot[0]++;
    },
    (v: typeof s) => {
      v.poses[id].translation[0] = NaN;
    },
    (v: typeof s) => {
      v.card = 2;
    },
    (v: typeof s) => {
      v.checked.push(id);
    },
  ]) {
    const bad = structuredClone(s);
    mutate(bad);
    expect(() => validateChallenge(bad, data)).toThrow();
  }
  let next = structuredClone(s);
  next.observed.push(0);
  for (let i = 0; i < 405; i++)
    next = moveChallenge(
      data,
      next,
      id,
      nudgePose(next.poses[id], "translate", "X", i % 2 ? 1 : -1, true),
      "微调",
    );
  expect(next.replay).toHaveLength(400);
  expect(replayPoses(next, 400)).toEqual(next.poses);
  expect(next.stats.moves).toBe(405);
});
