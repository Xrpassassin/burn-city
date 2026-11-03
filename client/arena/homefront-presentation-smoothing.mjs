// Visual-only Homefront avatar/camera presentation. Never changes authoritative coordinates.
const TAU = Math.PI * 2;
// Cap angular velocity and frame stalls so turning never jumps after tab resume.
const MAX_TURN_RADIANS_PER_SECOND = Math.PI * 3.5;
export function smoothFacing(current, target, dt, responsiveness = 12) {
  if (![current, target, dt, responsiveness].every(Number.isFinite)) return current;
  const delta = ((target - current + Math.PI) % TAU + TAU) % TAU - Math.PI;
  const seconds = Math.min(0.05, Math.max(0, dt));
  const blend = 1 - Math.exp(-seconds * Math.max(0, responsiveness));
  const maxStep = MAX_TURN_RADIANS_PER_SECOND * seconds;
  return current + Math.max(-maxStep, Math.min(maxStep, delta * blend));
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

// A time-based correction matches the old ~16%/frame feel at 60 FPS without
// correcting 4x faster at 120 FPS than at 30 FPS. Visual-only; no server moves.
export function releasePredictionBlend(dt, responsiveness = 10.5) {
  if (!Number.isFinite(dt) || !Number.isFinite(responsiveness)) return 0;
  return 1 - Math.exp(-Math.min(0.05, Math.max(0, dt)) * Math.max(0, responsiveness));
}
