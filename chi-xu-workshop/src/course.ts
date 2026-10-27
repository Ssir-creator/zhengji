import { poseError, type Pose, type Poses, type Tool } from "./core";
import type { ReferenceCase } from "./prediction";
export const COURSE_KEY = "chi-xu-workshop:spatial-course:v1";
export const tolerance = { position: 0.075, rotation: 5 };
export const lessons = [
  {
    title: "挪到这里",
    prompt: "把它挪到轮廓里。",
    ids: ["6"],
    tool: "translate",
  },
  {
    title: "转个方向",
    prompt: "位置合适了，试着转正它。",
    ids: ["8"],
    tool: "rotate",
  },
  {
    title: "先看，再动手",
    prompt: "两颗里，有一颗不用动。",
    ids: ["9", "10"],
    tool: null,
  },
  {
    title: "修好这一处",
    prompt: "这里漏了一处，找找看。",
    ids: ["11", "12", "13"],
    tool: null,
  },
  {
    title: "停在合适的地方",
    prompt: "挪过头了，试着修回来。",
    ids: ["14"],
    tool: null,
  },
  {
    title: "独立复核",
    prompt: "最后交给你。检查、调整，再一起核对。",
    ids: ["18", "19", "20", "21"],
    tool: null,
  },
] as const;
export type Guess = "translate" | "rotate" | "both";
export type CourseEvent = {
  stage: number;
  id: string;
  tool: Tool;
  before: Pose;
  after: Pose;
};
export type CourseState = {
  schema: 1;
  reference: string;
  stage: number;
  poses: Poses;
  checked: string[];
  guess: Record<string, Guess>;
  events: CourseEvent[];
  completed: boolean;
  reflection: string;
};
export function stageStart(
  data: ReferenceCase,
  stage: number,
  previous: Poses,
): Poses {
  const poses = structuredClone(previous),
    l = lessons[stage];
  for (const id of l.ids) poses[id] = structuredClone(data.target[id]);
  const original = (id: string) => structuredClone(data.original[id]);
  if (stage === 0) poses["6"].translation = original("6").translation;
  if (stage === 1) poses["8"].quaternion = original("8").quaternion;
  if (stage === 2) poses["10"] = original("10");
  if (stage === 3) poses["12"].quaternion = original("12").quaternion;
  if (stage === 4)
    poses["14"].translation = data.target["14"].translation.map(
      (v, i) => v + (v - data.original["14"].translation[i]) * 0.6,
    ) as Pose["translation"];
  if (stage === 5) {
    poses["19"].translation = original("19").translation;
    poses["20"].quaternion = original("20").quaternion;
    poses["21"] = original("21");
  }
  return poses;
}
export function freshCourse(data: ReferenceCase): CourseState {
  return {
    schema: 1,
    reference: data.reference.reference_id,
    stage: 0,
    poses: stageStart(data, 0, data.original),
    checked: [],
    guess: {},
    events: [],
    completed: false,
    reflection: "",
  };
}
export function passed(p: Pose, target: Pose) {
  const e = poseError(p, target);
  return e.position <= tolerance.position && e.rotation <= tolerance.rotation;
}
export function lessonReady(data: ReferenceCase, s: CourseState) {
  return lessons[s.stage].ids.every((id) =>
    passed(s.poses[id], data.target[id]),
  );
}
export function validateCourse(raw: unknown, data: ReferenceCase): CourseState {
  const s = raw as CourseState,
    ids = Object.keys(data.original);
  if (
    !s ||
    s.schema !== 1 ||
    s.reference !== data.reference.reference_id ||
    !Number.isInteger(s.stage) ||
    s.stage < 0 ||
    s.stage > 5 ||
    typeof s.completed !== "boolean" ||
    (s.completed && s.stage !== 5) ||
    !Array.isArray(s.checked) ||
    new Set(s.checked).size !== s.checked.length ||
    !s.guess ||
    Object.values(s.guess).some(
      (v) => !["translate", "rotate", "both"].includes(v),
    ) ||
    Object.keys(s.guess).some((k) => !/^3:(11|12|13)$/.test(k)) ||
    typeof s.reflection !== "string" ||
    s.reflection.length > 100 ||
    !Array.isArray(s.events) ||
    s.events.length > 2000
  )
    throw Error("课程记录无法读取，旧记录已保留。");
  const valid = (p: Pose, id: string) =>
    p &&
    JSON.stringify(p.pivot) === JSON.stringify(data.original[id]?.pivot) &&
    p.translation?.length === 3 &&
    p.translation.every((v) => Number.isFinite(v) && Math.abs(v) < 100) &&
    p.quaternion?.length === 4 &&
    p.quaternion.every(Number.isFinite) &&
    Math.abs(Math.hypot(...p.quaternion) - 1) < 1e-6;
  if (
    !s.poses ||
    Object.keys(s.poses).sort().join() !== ids.sort().join() ||
    ids.some((id) => !valid(s.poses[id], id))
  )
    throw Error("课程位置记录损坏，未覆盖。");
  let base = structuredClone(data.original);
  for (let stage = 0; stage <= s.stage; stage++) {
    base = stageStart(data, stage, base);
    for (const e of s.events.filter((e) => e.stage === stage)) {
      if (
        !(lessons[stage].ids as readonly string[]).includes(e.id) ||
        !["translate", "rotate"].includes(e.tool) ||
        !valid(e.before, e.id) ||
        !valid(e.after, e.id) ||
        JSON.stringify(e.before) !== JSON.stringify(base[e.id]) ||
        (lessons[stage].tool && e.tool !== lessons[stage].tool)
      )
        throw Error("课程操作记录损坏。");
      if (
        (e.tool === "translate" &&
          JSON.stringify(e.before.quaternion) !==
            JSON.stringify(e.after.quaternion)) ||
        (e.tool === "rotate" &&
          JSON.stringify(e.before.translation) !==
            JSON.stringify(e.after.translation))
      )
        throw Error("操作分量不匹配。");
      base[e.id] = structuredClone(e.after);
    }
    if (
      stage < s.stage &&
      !lessons[stage].ids.every((id) => passed(base[id], data.target[id]))
    )
      throw Error("课程存在越关记录。");
  }
  if (
    s.events.some(
      (e) => !Number.isInteger(e.stage) || e.stage < 0 || e.stage > s.stage,
    ) ||
    ids.some(
      (id) => JSON.stringify(s.poses[id]) !== JSON.stringify(base[id]),
    ) ||
    s.checked.some(
      (id) =>
        !(lessons[s.stage].ids as readonly string[]).includes(id) ||
        !passed(s.poses[id], data.target[id]),
    ) ||
    (s.completed && !lessonReady(data, s))
  )
    throw Error("课程进度不一致。");
  return structuredClone(s);
}
export function moveCourse(
  data: ReferenceCase,
  s: CourseState,
  id: string,
  pose: Pose,
  tool: Tool,
) {
  if (
    s.completed ||
    !(lessons[s.stage].ids as readonly string[]).includes(id) ||
    (lessons[s.stage].tool && lessons[s.stage].tool !== tool)
  )
    throw Error("这一步先用已解锁的工具。");
  if (s.stage === 3 && !s.guess[`3:${id}`])
    throw Error("先想一想：只挪、只转，还是两项？");
  const next = structuredClone(s);
  next.events.push({
    stage: s.stage,
    id,
    tool,
    before: structuredClone(s.poses[id]),
    after: structuredClone(pose),
  });
  next.poses[id] = structuredClone(pose);
  next.checked = next.checked.filter((v) => v !== id);
  return validateCourse(next, data);
}
export function advanceCourse(data: ReferenceCase, s: CourseState) {
  if (!lessonReady(data, s)) throw Error("还有遗漏，再看看。");
  const next = structuredClone(s);
  next.checked = [];
  if (s.stage === 5) next.completed = true;
  else {
    next.stage++;
    next.poses = stageStart(data, next.stage, next.poses);
  }
  return validateCourse(next, data);
}
export function correction(before: Pose, after: Pose, target: Pose) {
  if (passed(after, target)) return "已经到位了，点“核对”就好。";
  const a = poseError(before, target),
    b = poseError(after, target);
  if (a.position <= tolerance.position && b.position > tolerance.position)
    return "刚才挪动了原本合适的位置，可以撤销。";
  if (a.rotation <= tolerance.rotation && b.rotation > tolerance.rotation)
    return "刚才改变了原本合适的方向，可以撤销。";
  if (b.position > a.position + 1e-5 || b.rotation > a.rotation + 1e-4)
    return "这一步更远了，试试反向，或撤销。";
  return "更接近了，继续观察。";
}
