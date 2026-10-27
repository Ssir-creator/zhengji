import { Plane, Quaternion, Raycaster, Vector2, Vector3 } from "three";
import type { Pose, Tool } from "./core";
import type { WorkshopScene } from "./scene";
/** Screen-plane rigid manipulation of source meshes. No snapping or inferred geometry. */
export function attachDirectDrag(
  scene: WorkshopScene,
  options: {
    select: (id: string) => void;
    canEdit: () => boolean;
    tool: () => Tool;
    fine: () => boolean;
    constrain?: (id: string, before: Pose, pose: Pose, normal: Vector3) => Pose;
    preview: (id: string, pose: Pose) => void;
    commit: (id: string, before: Pose, after: Pose) => void;
    cancel: () => void;
  },
) {
  const canvas = scene.renderer.domElement,
    ray = new Raycaster();
  let active: {
    id: string;
    pointer: number;
    before: Pose;
    after: Pose;
    plane: Plane;
    anchor: Vector3;
    normal: Vector3;
    startX: number;
    startY: number;
    center: Vector2;
    tool: Tool;
  } | null = null;
  const hitPlane = (e: PointerEvent, plane: Plane) => {
    const r = canvas.getBoundingClientRect();
    ray.setFromCamera(
      new Vector2(
        ((e.clientX - r.left) / r.width) * 2 - 1,
        1 - ((e.clientY - r.top) / r.height) * 2,
      ),
      scene.camera,
    );
    return ray.ray.intersectPlane(plane, new Vector3());
  };
  function down(e: PointerEvent) {
    if (active) {
      if (e.pointerId !== active.pointer) cancel();
      return;
    }
    if (e.button !== 0 || scene.transform.axis) return;
    const id = scene.pick(e);
    if (!id) return;
    options.select(id);
    if (scene.selected !== id || !options.canEdit()) return;
    const before = scene.readPose(id),
      normal = scene.camera.getWorldDirection(new Vector3()),
      origin = scene.teeth.get(id)!.position.clone(),
      plane = new Plane().setFromNormalAndCoplanarPoint(normal, origin),
      anchor = hitPlane(e, plane);
    if (!anchor) return;
    const projected = origin.clone().project(scene.camera),
      r = canvas.getBoundingClientRect();
    active = {
      id,
      pointer: e.pointerId,
      before,
      after: before,
      normal,
      plane,
      anchor,
      startX: e.clientX,
      startY: e.clientY,
      center: new Vector2(
        r.left + ((projected.x + 1) * r.width) / 2,
        r.top + ((1 - projected.y) * r.height) / 2,
      ),
      tool: options.tool(),
    };
    scene.orbit.enabled = false;
    canvas.setPointerCapture(e.pointerId);
    e.preventDefault();
    e.stopImmediatePropagation();
  }
  function move(e: PointerEvent) {
    if (!active || e.pointerId !== active.pointer) return;
    const a = active,
      p = structuredClone(a.before);
    if (a.tool === "translate") {
      const point = hitPlane(e, a.plane);
      if (!point) return;
      p.translation = new Vector3(...a.before.translation)
        .add(point.sub(a.anchor).multiplyScalar(options.fine() ? 0.2 : 1))
        .toArray();
    } else {
      const angle =
        ((e.clientX - a.startX) / canvas.clientWidth) *
        Math.PI *
        2 *
        (options.fine() ? 0.2 : 1);
      p.quaternion = new Quaternion()
        .setFromAxisAngle(a.normal, angle)
        .multiply(new Quaternion(...a.before.quaternion))
        .normalize()
        .toArray();
    }
    const after = options.constrain?.(a.id, a.before, p, a.normal) ?? p;
    active.after = after;
    scene.apply({ [a.id]: after });
    options.preview(a.id, after);
    e.preventDefault();
    e.stopImmediatePropagation();
  }
  function finish(e: PointerEvent) {
    if (!active || e.pointerId !== active.pointer) return;
    const a = active;
    active = null;
    scene.orbit.enabled = true;
    if (canvas.hasPointerCapture(e.pointerId))
      canvas.releasePointerCapture(e.pointerId);
    e.stopImmediatePropagation();
    options.commit(a.id, a.before, a.after);
  }
  function cancel() {
    if (!active) return;
    const a = active;
    active = null;
    scene.apply({ [a.id]: a.before });
    scene.orbit.enabled = true;
    if (canvas.hasPointerCapture(a.pointer))
      canvas.releasePointerCapture(a.pointer);
    options.cancel();
  }
  canvas.addEventListener("pointerdown", down, true);
  canvas.addEventListener("pointermove", move, true);
  canvas.addEventListener("pointerup", finish, true);
  canvas.addEventListener("pointercancel", cancel, true);
  canvas.addEventListener("lostpointercapture", cancel, true);
  return {
    cancel,
    dispose() {
      cancel();
      canvas.removeEventListener("pointerdown", down, true);
      canvas.removeEventListener("pointermove", move, true);
      canvas.removeEventListener("pointerup", finish, true);
      canvas.removeEventListener("pointercancel", cancel, true);
      canvas.removeEventListener("lostpointercapture", cancel, true);
    },
  };
}
