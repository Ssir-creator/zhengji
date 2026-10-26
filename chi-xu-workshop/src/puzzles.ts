import { Quaternion, Vector3 } from "three";
import { poseError, type Pose, type Poses } from "./core";
import {
  taskCards,
  observation,
  referenceOption,
  challengeTolerance,
} from "./challenge";
import type { ReferenceCase } from "./prediction";
export type Puzzle = {
  title: string;
  prompt: string;
  options: { value: string; label: string }[];
  answer: string;
  explanation: string;
  sample: Poses | null;
  sampleLabel: string;
};
const choices = [
  { value: "translate", label: "位置还没到" },
  { value: "rotate", label: "方向还没到" },
  { value: "both", label: "位置、方向都没到" },
  { value: "none", label: "两项都已到" },
];
/** Read-only teaching samples use only rigid poses of the authentic source meshes. */
export function taskPuzzle(data: ReferenceCase, card: number): Puzzle {
  const ids = taskCards(data)[card],
    id = ids[0];
  const rank = (metric: "position" | "rotation", ascending = false) =>
    [...ids].sort((a, b) => {
      const d =
        poseError(data.original[a], data.target[a])[metric] -
        poseError(data.original[b], data.target[b])[metric];
      return (ascending ? d : -d) || Number(a) - Number(b);
    })[0];
  const toothOptions = ids.map((value) => ({ value, label: `文件 ${value}` }));
  const base = { sample: null, sampleLabel: "" };
  if (card === 0)
    return {
      ...base,
      title: "视角侦探：谁的位置变化最大？",
      prompt: "依次查看“原始”和“参考”，找出移动最远的牙。转得多不一定挪得远。",
      options: toothOptions,
      answer: observation(data, card),
      explanation: "要比较牙齿整体移动的距离，不能只看朝向变化。",
    };
  if (card === 1)
    return {
      ...base,
      title: "轮廓侦探：哪份是参考？",
      prompt: "在同一视角切换方案 A / B，找出与参考轮廓重合的一份。",
      options: [
        { value: "A", label: "方案 A" },
        { value: "B", label: "方案 B" },
      ],
      answer: referenceOption(card),
      explanation: "目标轮廓重合的一份是预测参考；不是临床优劣评价。",
    };
  if (card === 2)
    return {
      ...base,
      title: "旋转侦探：谁转动最多？",
      prompt: "比较牙冠朝向，找出原始到参考旋转角度最大的牙。",
      options: toothOptions,
      answer: rank("rotation"),
      explanation: "这次比较的是转动幅度，而不是挪动距离。",
    };
  if (card === 6)
    return {
      ...base,
      title: "精细观察：谁挪动最少？",
      prompt: "找出平移距离最小的一颗；不要把朝向变化当作位置变化。",
      options: toothOptions,
      answer: rank("position", true),
      explanation: "小位移也可能伴随明显旋转，两项应分开观察。",
    };
  const sample = structuredClone(data.original);
  if (card === 7) {
    // World translation and rotation about a fixed mesh pivot commute; no invented collision rules.
    const p = data.original[id],
      q = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), 0.12);
    const a = structuredClone(p);
    a.translation[0] += 0.25;
    a.quaternion = q.multiply(new Quaternion(...p.quaternion)).toArray();
    return {
      ...base,
      title: "顺序试验：先挪还是先转？",
      prompt: `文件 ${id}：同一世界 X 平移 0.25 u，加同一枢轴 Z 旋转。两种顺序的终点是否相同？先按“播放顺序试验”观察。`,
      options: [
        { value: "same", label: "相同" },
        { value: "different", label: "不同" },
      ],
      answer: "same",
      explanation:
        "本游戏采用固定枢轴的刚体旋转和世界平移；相同的两次操作交换顺序后终点相同。没有模拟碰撞或治疗过程。",
      sample: { ...sample, [id]: a },
      sampleLabel: `顺序试验 · 文件 ${id}`,
    };
  }
  const p = structuredClone(data.target[id]);
  if (card === 3) p.quaternion = structuredClone(data.original[id].quaternion);
  if (card === 4)
    p.translation = structuredClone(data.original[id].translation);
  if (card === 5) {
    p.translation = p.translation.map(
      (v, i) => v + (v - data.original[id].translation[i]) * 0.6,
    ) as Pose["translation"];
    p.quaternion = new Quaternion(...data.original[id].quaternion)
      .slerp(new Quaternion(...data.target[id].quaternion), 0.5)
      .toArray();
  }
  if (card === 8) {
    p.translation[0] += challengeTolerance.position * 2;
    p.quaternion = structuredClone(data.target[id].quaternion);
  }
  sample[id] = p;
  const error = poseError(p, data.target[id]);
  const answer =
    error.position > challengeTolerance.position
      ? error.rotation > challengeTolerance.rotation
        ? "both"
        : "translate"
      : error.rotation > challengeTolerance.rotation
        ? "rotate"
        : "none";
  return {
    title:
      card === 3
        ? "复核错例：位置到了就算好吗？"
        : card === 4
          ? "复核错例：方向到了就算好吗？"
          : card === 5
            ? "过头侦探：该修正哪一项？"
            : "终点审查：还有什么没做好？",
    prompt: `打开“查看只读样例”，重点检查文件 ${id}。判断它还需要哪种调整；样例不覆盖你的病例进度。`,
    options: choices,
    answer,
    explanation: `样例文件 ${id} 距参考：位置 ${error.position.toFixed(3)} u / 方向 ${error.rotation.toFixed(2)}°；位置和方向必须分别核对。`,
    sample,
    sampleLabel: `只读错例 · 文件 ${id}`,
  };
}
/** Same operations, different sequence. Samples are never persisted. */
export function sequenceFrames(data: ReferenceCase, card: number): Poses[] {
  const id = taskCards(data)[card][0],
    p = structuredClone(data.original[id]);
  const shift = (v: Pose) => {
    const n = structuredClone(v);
    n.translation[0] += 0.25;
    return n;
  };
  const turn = (v: Pose) => {
    const n = structuredClone(v);
    n.quaternion = new Quaternion()
      .setFromAxisAngle(new Vector3(0, 0, 1), 0.12)
      .multiply(new Quaternion(...v.quaternion))
      .toArray();
    return n;
  };
  return [p, shift(p), turn(shift(p)), p, turn(p), shift(turn(p))].map((v) => ({
    ...structuredClone(data.original),
    [id]: v,
  }));
}
