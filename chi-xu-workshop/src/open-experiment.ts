import { poseError, type Pose } from "./core";
import { challengeTolerance } from "./challenge";
export type ExperimentGoal = "position" | "rotation" | "balanced";
export const experimentLabels: Record<ExperimentGoal, string> = {
  position: "先改善位置，保持方向",
  rotation: "先改善方向，保持位置",
  balanced: "位置与方向一起改善",
};
/** Multiple valid endpoints: reduce chosen gaps by at least 40%, protect the
 * other component at its starting error. No invented clinical/physical score. */
export function experimentResult(
  baseline: Pose,
  current: Pose,
  target: Pose,
  goal: ExperimentGoal,
) {
  const start = poseError(baseline, target),
    now = poseError(current, target);
  const p = Math.max(challengeTolerance.position, start.position * 0.6),
    r = Math.max(challengeTolerance.rotation, start.rotation * 0.6);
  const eligible =
    goal === "position"
      ? start.position > challengeTolerance.position
      : goal === "rotation"
        ? start.rotation > challengeTolerance.rotation
        : start.position > challengeTolerance.position &&
          start.rotation > challengeTolerance.rotation;
  const positionLimit = goal === "rotation" ? start.position + 1e-8 : p;
  const rotationLimit = goal === "position" ? start.rotation + 1e-5 : r;
  return {
    eligible,
    achieved:
      eligible &&
      now.position <= positionLimit &&
      now.rotation <= rotationLimit,
    positionLimit,
    rotationLimit,
    now,
  };
}
