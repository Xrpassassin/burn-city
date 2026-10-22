// Pure, deterministic math shared by the skate controller and Node tests.
export function decomposeVelocity(vx, vz, heading) {
  const fx = -Math.sin(heading), fz = -Math.cos(heading);
  return {
    forward: vx * fx + vz * fz,
    lateral: vx * Math.cos(heading) - vz * Math.sin(heading),
  };
}

export function composeVelocity(forward, lateral, heading) {
  const fx = -Math.sin(heading), fz = -Math.cos(heading);
  return {
    x: fx * forward + Math.cos(heading) * lateral,
    z: fz * forward - Math.sin(heading) * lateral,
  };
}

export function dampLateral(lateral, dt, speed) {
  return lateral * Math.exp(-dt * (2.0 + speed * 0.10));
}

export function clampHorizontalVelocity(vx, vz, maxSpeed) {
  const speed = Math.hypot(vx, vz);
  if (speed <= maxSpeed || speed === 0) return { x: vx, z: vz };
  const scale = maxSpeed / speed;
  return { x: vx * scale, z: vz * scale };
}
