import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { Quaternion, Vector3 } from "three";
import { referenceCase } from "../src/prediction";
import {
  freshChallenge,
  taskCards,
  moveChallenge,
  validateChallenge,
  replayPoses,
} from "../src/challenge";
import {
  referenceMatch,
  freshBook,
  validateBook,
  recordAttempt,
  restoreAttempt,
  captureAttempt,
} from "../src/experiment";
import type { Poses, Quat, Vec3 } from "../src/core";
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
        (v as { pivot: Vec3 }).pivot,
      ]),
    ),
  ),
  ids = taskCards(data)[0];
it("匹配指数仅基于真实参考差距：原始0、半程50、参考100，倒退会降低指数", () => {
  expect(referenceMatch(data, data.original, ids).score).toBeCloseTo(0, 8);
  expect(referenceMatch(data, data.target, ids)).toEqual({
    score: 100,
    position: 0,
    rotation: 0,
  });
  const halfway: Poses = structuredClone(data.original);
  for (const id of ids) {
    halfway[id].translation = new Vector3(...data.target[id].translation)
      .multiplyScalar(0.5)
      .toArray() as Vec3;
    halfway[id].quaternion = new Quaternion()
      .slerp(new Quaternion(...data.target[id].quaternion), 0.5)
      .toArray() as Quat;
  }
  expect(referenceMatch(data, halfway, ids).score).toBeCloseTo(50, 6);
  const moved = structuredClone(halfway);
  moved[ids[0]].translation[0] += 20;
  expect(referenceMatch(data, moved, ids).score).toBeLessThan(50);
});
it("自动保留最佳，不以更差尝试覆盖；手动保留12份，刷新可验证恢复", () => {
  let s = freshChallenge(data);
  s.observed.push(0);
  let book = recordAttempt(data, freshBook(data), s, false);
  const initial = book.best["0"];
  s = moveChallenge(data, s, ids[0], data.target[ids[0]], "接近参考");
  book = recordAttempt(data, book, s, false);
  expect(book.best["0"].id).not.toBe(initial.id);
  const best = structuredClone(book.best["0"]);
  s = moveChallenge(data, s, ids[0], data.original[ids[0]], "退回");
  book = recordAttempt(data, book, s, false);
  expect(book.best["0"]).toEqual(best);
  for (let i = 0; i < 15; i++) book = recordAttempt(data, book, s, true);
  expect(book.entries).toHaveLength(12);
  expect(book.sequence).toBe(15);
  expect(validateBook(JSON.parse(JSON.stringify(book)), data)).toEqual(book);
});
it("恢复只改当前任务，保存逐牙核对状态与判断，回放与实际位姿一致", () => {
  let s = freshChallenge(data);
  s.card = 1;
  s.observed = [0, 1];
  for (const id of ids) {
    s.poses[id] = structuredClone(data.target[id]);
    s.checked.push(id);
  }
  s.replayBase = structuredClone(s.poses);
  const group = taskCards(data)[1],
    id = group[0];
  s.judgements[id] = "both";
  s = moveChallenge(data, s, id, data.target[id], "到参考");
  const attempt = captureAttempt(data, s, "尝试甲");
  s = moveChallenge(data, s, id, data.original[id], "再尝试");
  const before = structuredClone(s);
  const restored = restoreAttempt(data, s, attempt);
  expect(s).toEqual(before);
  expect(restored.poses[id]).toEqual(data.target[id]);
  for (const other of Object.keys(s.poses).filter((x) => !group.includes(x)))
    expect(restored.poses[other]).toEqual(s.poses[other]);
  expect(restored.checked).toEqual(ids);
  expect(restored.judgements[id]).toBe("both");
  expect(replayPoses(restored, restored.replay.length)).toEqual(restored.poses);
  expect(validateChallenge(restored, data)).toEqual(restored);
});
it("方案不能跨任务恢复，错误版本、枢轴、四元数和伪造核对会拒绝", () => {
  const s = freshChallenge(data);
  s.observed.push(0);
  const book = recordAttempt(data, freshBook(data), s, true),
    a = book.entries[0];
  const later = structuredClone(s);
  later.card = 1;
  later.observed.push(1);
  expect(() => restoreAttempt(data, later, a)).toThrow("当前任务");
  for (const change of [
    (v: typeof book) => {
      v.reference_id = "wrong";
    },
    (v: typeof book) => {
      v.entries[0].poses[ids[0]].pivot[0]++;
    },
    (v: typeof book) => {
      v.entries[0].poses[ids[0]].quaternion = [0, 0, 0, 0];
    },
    (v: typeof book) => {
      v.entries[0].checked.push(ids[0]);
    },
  ]) {
    const bad = structuredClone(book);
    change(bad);
    expect(() => validateBook(bad, data)).toThrow();
  }
});
it("某项原始误差为零时，故意破坏它不能提高匹配指数", () => {
  const rotationOnly = structuredClone(data);
  for (const id of ids) rotationOnly.target[id].translation = [0, 0, 0];
  const poses = structuredClone(rotationOnly.original);
  for (const id of ids)
    poses[id].quaternion = new Quaternion()
      .slerp(new Quaternion(...rotationOnly.target[id].quaternion), 0.5)
      .toArray() as Quat;
  const good = referenceMatch(rotationOnly, poses, ids).score;
  expect(good).toBeCloseTo(50, 6);
  poses[ids[0]].translation[0] = 0.01;
  expect(referenceMatch(rotationOnly, poses, ids).score).toBeLessThan(good);
});
