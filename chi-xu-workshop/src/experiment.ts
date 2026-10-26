import { Quaternion } from "three";
import { poseError, type Poses } from "./core";
import {
  appendReplay,
  challengeTolerance,
  taskCards,
  validateChallenge,
  type ChallengeState,
} from "./challenge";
import type { ReferenceCase } from "./prediction";
export type Match = { score: number; position: number; rotation: number };
/** A transparent reference-distance index, never a clinical or physical energy score. */
export function referenceMatch(
  data: ReferenceCase,
  poses: Poses,
  ids: string[],
): Match {
  const rms = (values: number[]) =>
    Math.sqrt(values.reduce((s, v) => s + v * v, 0) / values.length);
  if (!ids.length) throw Error("没有可比较的牙齿。");
  const errors = ids.map((id) => poseError(poses[id], data.target[id])),
    initial = ids.map((id) => poseError(data.original[id], data.target[id]));
  const position = rms(errors.map((e) => e.position)),
    rotation = rms(errors.map((e) => (e.rotation < 1e-5 ? 0 : e.rotation))),
    p0 = rms(initial.map((e) => e.position)),
    r0 = rms(initial.map((e) => (e.rotation < 1e-5 ? 0 : e.rotation)));
  const positionScale = Math.max(p0, challengeTolerance.position),
    rotationScale = Math.max(r0, challengeTolerance.rotation);
  const initialGap = p0 / positionScale + r0 / rotationScale,
    currentGap = position / positionScale + rotation / rotationScale;
  return {
    position,
    rotation,
    score: Math.max(
      0,
      Math.min(
        100,
        100 * (1 - currentGap / (initialGap > 1e-8 ? initialGap : 1)),
      ),
    ),
  };
}
export type Attempt = {
  id: string;
  card: number;
  name: string;
  time: string;
  poses: Poses;
  checked: string[];
  judgements: Record<string, string>;
};
export type AttemptBook = {
  schema: 1;
  reference_id: string;
  sequence: number;
  entries: Attempt[];
  best: Record<string, Attempt>;
};
export const freshBook = (data: ReferenceCase): AttemptBook => ({
  schema: 1,
  reference_id: data.reference.reference_id,
  sequence: 0,
  entries: [],
  best: {},
});
export function validateBook(raw: unknown, data: ReferenceCase): AttemptBook {
  const book = raw as AttemptBook,
    cards = taskCards(data);
  if (
    !book ||
    book.schema !== 1 ||
    book.reference_id !== data.reference.reference_id ||
    !Number.isSafeInteger(book.sequence) ||
    book.sequence < 0 ||
    !Array.isArray(book.entries) ||
    book.entries.length > 12 ||
    !book.best ||
    Array.isArray(book.best) ||
    Object.keys(book.best).some(
      (k) => !/^\d$/.test(k) || Number(k) >= cards.length,
    )
  )
    throw Error("方案记录不兼容，原记录已保留。");
  const validate = (a: Attempt) => {
    const ids = cards[a?.card];
    if (
      !ids ||
      !Number.isInteger(a.card) ||
      typeof a.id !== "string" ||
      a.id.length > 100 ||
      !a.id ||
      typeof a.name !== "string" ||
      a.name.length > 50 ||
      !Number.isFinite(Date.parse(a.time)) ||
      !a.poses ||
      Object.keys(a.poses).sort().join("|") !== [...ids].sort().join("|") ||
      !Array.isArray(a.checked) ||
      new Set(a.checked).size !== a.checked.length ||
      a.checked.some((id) => !ids.includes(id)) ||
      !a.judgements ||
      Object.entries(a.judgements).some(
        ([id, v]) =>
          !ids.includes(id) ||
          !["translate", "rotate", "both", "none"].includes(v),
      )
    )
      throw Error("方案数据损坏，原记录已保留。");
    for (const id of ids) {
      const p = a.poses[id];
      if (
        !p ||
        JSON.stringify(p.pivot) !== JSON.stringify(data.original[id].pivot) ||
        !Array.isArray(p.translation) ||
        p.translation.length !== 3 ||
        p.translation.some((n) => !Number.isFinite(n) || Math.abs(n) > 100) ||
        !Array.isArray(p.quaternion) ||
        p.quaternion.length !== 4 ||
        p.quaternion.some((n) => !Number.isFinite(n)) ||
        Math.abs(new Quaternion(...p.quaternion).length() - 1) > 1e-6
      )
        throw Error("方案位姿无效。");
      if (a.checked.includes(id)) {
        const e = poseError(p, data.target[id]);
        if (e.position > 1e-8 || e.rotation > 1e-5)
          throw Error("方案中的核对标记与位姿不符。");
      }
    }
  };
  for (const a of book.entries) validate(a);
  for (const [k, a] of Object.entries(book.best)) {
    validate(a);
    if (a.card !== Number(k)) throw Error("最佳方案任务不匹配。");
  }
  return structuredClone(book);
}
export function captureAttempt(
  data: ReferenceCase,
  s: ChallengeState,
  name: string,
): Attempt {
  validateChallenge(s, data);
  if (!s.observed.includes(s.card) || s.card >= taskCards(data).length)
    throw Error("完成观察后才能保存当前任务的尝试。");
  const ids = taskCards(data)[s.card];
  return {
    id: crypto.randomUUID(),
    card: s.card,
    name,
    time: new Date().toISOString(),
    poses: Object.fromEntries(
      ids.map((id) => [id, structuredClone(s.poses[id])]),
    ),
    checked: s.checked.filter((id) => ids.includes(id)),
    judgements: Object.fromEntries(
      Object.entries(s.judgements).filter(([id]) => ids.includes(id)),
    ),
  };
}
export function recordAttempt(
  data: ReferenceCase,
  book: AttemptBook,
  s: ChallengeState,
  manual: boolean,
) {
  const next = structuredClone(book),
    a = captureAttempt(
      data,
      s,
      manual ? `尝试 ${book.sequence + 1}` : "个人最佳",
    ),
    ids = taskCards(data)[s.card],
    best = next.best[String(s.card)];
  if (
    !best ||
    referenceMatch(data, a.poses, ids).score >
      referenceMatch(data, best.poses, ids).score + 1e-9
  )
    next.best[String(s.card)] = a;
  if (manual) {
    next.sequence++;
    next.entries.push(a);
    next.entries = next.entries.slice(-12);
  }
  return validateBook(next, data);
}
export function restoreAttempt(
  data: ReferenceCase,
  s: ChallengeState,
  a: Attempt,
) {
  if (a.card !== s.card || !s.observed.includes(s.card))
    throw Error("只能恢复当前任务的方案；以前任务的方案仅可查看。");
  validateBook(
    {
      schema: 1,
      reference_id: data.reference.reference_id,
      sequence: 1,
      entries: [a],
      best: {},
    },
    data,
  );
  const next = structuredClone(s),
    ids = taskCards(data)[s.card];
  next.checked = next.checked
    .filter((id) => !ids.includes(id))
    .concat(a.checked);
  for (const id of ids) {
    next.poses[id] = structuredClone(a.poses[id]);
    delete next.judgements[id];
    if (a.judgements[id]) next.judgements[id] = a.judgements[id];
    appendReplay(next, id, `恢复${a.name}`);
  }
  next.stats.moves++;
  return validateChallenge(next, data);
}
