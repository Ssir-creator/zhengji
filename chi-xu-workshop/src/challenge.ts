import { Quaternion, Vector3 } from "three";
import { poseError, type Pose, type Poses, type Tool, type Axis } from "./core";
import type { ReferenceCase } from "./prediction";
export const CHALLENGE_KEY = "chi-xu-workshop:reference-challenge:v2";
export const challengeTolerance = { position: 0.075, rotation: 0.6 };
export type ReplayStep = {
  id: string;
  pose: Pose;
  label: string;
  time: string;
};
export type ChallengeState = {
  schema: 2;
  reference_id: string;
  card: number;
  poses: Poses;
  checked: string[];
  observed: number[];
  judgements: Record<string, string>;
  reflections: Record<string, string>;
  stats: { moves: number; checks: number; hints: number; wrong: number };
  replayBase: Poses;
  replay: ReplayStep[];
};
export const taskCards = (data: ReferenceCase) =>
  data.groups.flatMap((g) => [g.slice(0, 3), g.slice(3, 6), g.slice(6)]);
export function freshChallenge(data: ReferenceCase): ChallengeState {
  return {
    schema: 2,
    reference_id: data.reference.reference_id,
    card: 0,
    poses: structuredClone(data.original),
    checked: [],
    observed: [],
    judgements: {},
    reflections: {},
    stats: { moves: 0, checks: 0, hints: 0, wrong: 0 },
    replayBase: structuredClone(data.original),
    replay: [],
  };
}
export function validateChallenge(
  raw: unknown,
  data: ReferenceCase,
): ChallengeState {
  const s = raw as ChallengeState,
    ids = Object.keys(data.original),
    cards = taskCards(data);
  if (
    !s ||
    s.schema !== 2 ||
    s.reference_id !== data.reference.reference_id ||
    !Number.isInteger(s.card) ||
    s.card < 0 ||
    s.card > cards.length ||
    !Array.isArray(s.checked) ||
    new Set(s.checked).size !== s.checked.length ||
    s.checked.some((id) => !ids.includes(id)) ||
    !Array.isArray(s.observed) ||
    new Set(s.observed).size !== s.observed.length ||
    s.observed.some(
      (i) => !Number.isInteger(i) || i < 0 || i >= cards.length || i > s.card,
    ) ||
    !s.stats ||
    Object.keys(s.stats).sort().join("|") !== "checks|hints|moves|wrong" ||
    Object.values(s.stats).some((n) => !Number.isSafeInteger(n) || n < 0) ||
    !s.judgements ||
    !s.reflections ||
    Object.values(s.reflections).some(
      (v) => !["observe", "fine", "review"].includes(v),
    ) ||
    Object.entries(s.judgements).some(
      ([id, v]) =>
        !ids.includes(id) ||
        !["translate", "rotate", "both", "none"].includes(v),
    )
  )
    throw Error("观察挑战存档不兼容，原记录已保留。");
  const validPose = (p: Pose, id: string) =>
    p &&
    JSON.stringify(p.pivot) === JSON.stringify(data.original[id].pivot) &&
    Array.isArray(p.translation) &&
    p.translation.length === 3 &&
    p.translation.every((n) => Number.isFinite(n) && Math.abs(n) <= 100) &&
    Array.isArray(p.quaternion) &&
    p.quaternion.length === 4 &&
    p.quaternion.every(Number.isFinite) &&
    Math.abs(new Quaternion(...p.quaternion).length() - 1) < 1e-6;
  for (const poses of [s.poses, s.replayBase])
    if (
      !poses ||
      Object.keys(poses).sort().join("|") !== ids.sort().join("|") ||
      ids.some((id) => !validPose(poses[id], id))
    )
      throw Error("挑战位姿损坏，原记录已保留。");
  for (const [i, group] of cards.entries())
    for (const id of group) {
      const e = poseError(
        s.poses[id],
        i < s.card || s.checked.includes(id)
          ? data.target[id]
          : data.original[id],
      );
      if (
        (i < s.card && !s.checked.includes(id)) ||
        (i > s.card && s.checked.includes(id)) ||
        ((i > s.card ||
          (!s.observed.includes(i) && i === s.card) ||
          s.checked.includes(id)) &&
          (e.position > 1e-8 || e.rotation > 1e-5))
      )
        throw Error("挑战包含越关或固定牙变化。");
    }
  for (let i = 0; i < s.card; i++)
    if (!s.observed.includes(i)) throw Error("缺少观察记录。");
  if (
    !Array.isArray(s.replay) ||
    s.replay.length > 400 ||
    s.replay.some(
      (r) =>
        !ids.includes(r.id) ||
        !validPose(r.pose, r.id) ||
        typeof r.label !== "string" ||
        r.label.length > 100 ||
        !Number.isFinite(Date.parse(r.time)),
    )
  )
    throw Error("回放记录损坏。");
  const replayed = replayPoses(s, s.replay.length);
  if (
    ids.some((id) => {
      const e = poseError(replayed[id], s.poses[id]);
      return e.position > 1e-8 || e.rotation > 1e-5;
    })
  )
    throw Error("回放与进度不一致。");
  return structuredClone(s);
}
export function replayPoses(s: ChallengeState, index: number) {
  const poses = structuredClone(s.replayBase);
  for (const r of s.replay.slice(0, index))
    poses[r.id] = structuredClone(r.pose);
  return poses;
}
export function appendReplay(s: ChallengeState, id: string, label: string) {
  s.replay.push({
    id,
    pose: structuredClone(s.poses[id]),
    label,
    time: new Date().toISOString(),
  });
  if (s.replay.length > 400) {
    const first = s.replay.shift()!;
    s.replayBase[first.id] = first.pose;
  }
}
export const referenceOption = (card: number) =>
  Math.floor(card / 2) % 2 === 0 ? "A" : "B";
export function observation(data: ReferenceCase, card: number) {
  const ids = taskCards(data)[card];
  return [...ids].sort(
    (a, b) =>
      poseError(data.original[b], data.target[b]).position -
        poseError(data.original[a], data.target[a]).position ||
      Number(a) - Number(b),
  )[0];
}
export function expectedJudgement(data: ReferenceCase, id: string) {
  const e = poseError(data.original[id], data.target[id]);
  return e.position > challengeTolerance.position
    ? e.rotation > challengeTolerance.rotation
      ? "both"
      : "translate"
    : e.rotation > challengeTolerance.rotation
      ? "rotate"
      : "none";
}
export function moveChallenge(
  data: ReferenceCase,
  s: ChallengeState,
  id: string,
  pose: Pose,
  label: string,
) {
  if (
    !taskCards(data)[s.card]?.includes(id) ||
    !s.observed.includes(s.card) ||
    s.checked.includes(id)
  )
    throw Error("先完成观察；只能调整本任务尚未核对的牙。");
  const next = structuredClone(s);
  next.poses[id] = structuredClone(pose);
  next.stats.moves++;
  appendReplay(next, id, label);
  return validateChallenge(next, data);
}
export function nudgePose(
  p: Pose,
  tool: Tool,
  axis: Axis,
  sign: number,
  fine: boolean,
): Pose {
  const next = structuredClone(p),
    v = new Vector3().setComponent(["X", "Y", "Z"].indexOf(axis), 1);
  if (tool === "translate")
    next.translation = new Vector3(...p.translation)
      .addScaledVector(v, sign * (fine ? 0.05 : 0.25))
      .toArray();
  else
    next.quaternion = new Quaternion()
      .setFromAxisAngle(v, (sign * (fine ? 0.5 : 2) * Math.PI) / 180)
      .multiply(new Quaternion(...p.quaternion))
      .normalize()
      .toArray();
  return next;
}
export function checkChallengeTooth(
  data: ReferenceCase,
  s: ChallengeState,
  id: string,
) {
  if (!taskCards(data)[s.card]?.includes(id) || !s.observed.includes(s.card))
    throw Error("先完成观察任务。");
  const next = structuredClone(s),
    error = poseError(s.poses[id], data.target[id]);
  next.stats.checks++;
  const passed =
    error.position <= challengeTolerance.position &&
    error.rotation <= challengeTolerance.rotation;
  if (passed && !next.checked.includes(id)) {
    next.poses[id] = structuredClone(data.target[id]);
    next.checked.push(id);
    appendReplay(next, id, "核对：记录参考终点");
  }
  return { next: validateChallenge(next, data), passed, error };
}
export function advanceChallenge(data: ReferenceCase, s: ChallengeState) {
  if (
    !taskCards(data)[s.card]?.every((id) => s.checked.includes(id)) ||
    !s.observed.includes(s.card) ||
    !s.reflections[String(s.card)]
  )
    throw Error("先逐牙核对并完成自评。");
  const next = structuredClone(s);
  next.card++;
  return validateChallenge(next, data);
}
