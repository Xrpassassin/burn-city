// Camera-relative ground movement shared by Zombies and Homefront's direct controls.
export const ZOMBIE_WALK_SPEED = 6;
export const ZOMBIE_FAST_SPEED = 8.2;
export const ZOMBIE_CRAWL_SPEED = 1.6;
export const HOMEFRONT_CROUCH_SPEED_SCALE = 0.52;

export function zombieMoveVector(strafe, forward, yaw) {
  const sin = Math.sin(yaw), cos = Math.cos(yaw);
  const x = forward * sin - strafe * cos;
  const z = forward * cos + strafe * sin;
  const length = Math.hypot(x, z);
  const divisor = Math.max(1, length);
  return { x: x / divisor, z: z / divisor, length };
}
