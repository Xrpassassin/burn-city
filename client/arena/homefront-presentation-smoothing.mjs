// Visual-only Homefront avatar/camera presentation. Never changes authoritative coordinates.
const TAU = Math.PI * 2;
export function smoothFacing(current, target, dt, responsiveness = 12) {
  if (![current, target, dt, responsiveness].every(Number.isFinite)) return current;
  const delta = ((target - current + Math.PI) % TAU + TAU) % TAU - Math.PI;
  const blend = 1 - Math.exp(-Math.max(0, dt) * Math.max(0, responsiveness));
  return current + delta * blend;
}
export function facingFromMovement(direction, fallback) {
  if (!Number.isFinite(direction?.x) || !Number.isFinite(direction?.z) ||
      Math.hypot(direction.x, direction.z) <= 0.1) return fallback;
  return Math.atan2(direction.x, direction.z);
}
// Both avatar and camera should be driven from the same presented position.
// The camera may have its own follow damping, but must not target a different
// (more speculative) coordinate than the rendered avatar.
export function cameraFollowAnchor(continuous, avatar, predicted) {
  if (continuous && avatar && Number.isFinite(avatar.position?.x) &&
      Number.isFinite(avatar.position?.z)) {
    return { x: avatar.position.x, z: avatar.position.z };
  }
  return predicted;
}
