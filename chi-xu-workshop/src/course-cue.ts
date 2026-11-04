import { Quaternion, Vector3, type Camera } from "three";
import { poseError, type Pose, type Tool } from "./core";
import { courseLimits } from "./course";
/** Camera-relative teaching cues; these do not change the actual poses. */
export function courseCue(
  camera: Camera,
  current: Pose,
  target: Pose,
  tool: Tool,
  radius: number,
  width: number,
  height: number,
) {
  const origin = new Vector3(...current.pivot).add(
      new Vector3(...current.translation),
    ),
    end = new Vector3(...target.pivot).add(new Vector3(...target.translation));
  const project = (p: Vector3) => {
    const v = p.clone().project(camera);
    return { x: ((v.x + 1) * width) / 2, y: ((1 - v.y) * height) / 2 };
  };
  const a = project(origin),
    b = project(end),
    delta = end.clone().sub(origin),
    limits = courseLimits(target),
    error = poseError(current, target);
  const status = `位置${error.position <= limits.position ? " ✓" : "待调"} · 方向${error.rotation <= limits.rotation ? " ✓" : "待调"}`;
  if (tool === "translate") {
    if (error.position <= limits.position)
      return {
        path: "",
        text:
          error.rotation <= limits.rotation
            ? "已经足够接近，点核对。"
            : "位置够近了，换“转方向”。",
        status,
      };
    const dx = b.x - a.x,
      dy = b.y - a.y,
      length = Math.hypot(dx, dy),
      depth = delta
        .clone()
        .normalize()
        .dot(camera.getWorldDirection(new Vector3()));
    const screen =
      length > 6
        ? `向${Math.abs(dx) > length * 0.3 ? (dx > 0 ? "右" : "左") : ""}${Math.abs(dy) > length * 0.3 ? (dy > 0 ? "下" : "上") : ""}挪`
        : "";
    const z = Math.abs(depth) > 0.35 ? (depth > 0 ? "远离你" : "朝向你") : "";
    const path =
      length > 6
        ? `M ${a.x} ${a.y} L ${a.x + (dx / length) * 85} ${a.y + (dy / length) * 85}`
        : "";
    return {
      path,
      text: [screen, z].filter(Boolean).join(" · ") || "换个角度看前后差距。",
      status,
    };
  }
  if (error.rotation <= limits.rotation)
    return {
      path: "",
      text:
        error.position <= limits.position
          ? "已经足够接近，点核对。"
          : "方向够近了，换“挪位置”。",
      status,
    };
  const q = new Quaternion(...target.quaternion).multiply(
    new Quaternion(...current.quaternion).invert(),
  );
  if (q.w < 0) q.set(-q.x, -q.y, -q.z, -q.w);
  const axis = new Vector3(q.x, q.y, q.z).normalize(),
    view = camera.getWorldDirection(new Vector3());
  let radial = new Vector3().crossVectors(axis, view);
  if (radial.lengthSq() < 1e-6) radial = new Vector3(1, 0, 0).cross(axis);
  if (radial.lengthSq() < 1e-6) radial = new Vector3(0, 1, 0).cross(axis);
  radial.normalize().multiplyScalar(radius);
  const angle = Math.max(0.45, Math.min(1.6, 2 * Math.acos(Math.min(1, q.w))));
  const points = Array.from({ length: 22 }, (_, i) =>
    project(
      origin.clone().add(radial.clone().applyAxisAngle(axis, (angle * i) / 21)),
    ),
  );
  return {
    path: points.map((p, i) => `${i ? "L" : "M"} ${p.x} ${p.y}`).join(" "),
    text: "沿弧形箭头转 · 可按提示微调",
    status,
  };
}
export function assistPose(current: Pose, target: Pose, tool: Tool): Pose {
  const next = structuredClone(current);
  if (tool === "translate")
    next.translation = new Vector3(...current.translation)
      .lerp(new Vector3(...target.translation), 0.5)
      .toArray();
  else
    next.quaternion = new Quaternion(...current.quaternion)
      .slerp(new Quaternion(...target.quaternion), 0.5)
      .normalize()
      .toArray();
  return next;
}
