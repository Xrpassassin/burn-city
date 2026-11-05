// Shared analog response for Zombies and Homefront. Screen Y increases downward.
export function readZombieStick(dx, dy, radius) {
  const distance = Math.hypot(dx, dy);
  if (distance === 0 || radius <= 0) return { x: 0, y: 0, knobX: 0, knobY: 0 };
  const magnitude = Math.min(1, distance / radius);
  const knobX = dx / distance * magnitude;
  const knobY = dy / distance * magnitude;
  const ramp = Math.max(0, (magnitude - 0.15) / 0.85);
  const strength = ramp * ramp * (3 - 2 * ramp);
  return { x: dx / distance * strength, y: dy / distance * strength, knobX, knobY };
}
