// Offsets are normalized against the docking corridor. Distance is in game meters.
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
export const DOCKING_TOLERANCE = .2;
const dockable = (x, y) => Math.hypot(x, y) <= DOCKING_TOLERANCE;

export function beginFlight() {
  return { phase: 'launch', elapsed: 0, distance: 90, x: -.44, y: .28 };
}

export function advanceFlight(flight, dt, { x = 0, y = 0, approach = false } = {}) {
  if (!Number.isFinite(dt) || dt <= 0 || flight.phase === 'docked') return flight;
  const step = Math.min(dt, .1);
  if (flight.phase === 'launch') {
    const elapsed = flight.elapsed + step;
    return { ...flight, elapsed, phase: elapsed >= 3 ? 'approach' : 'launch' };
  }
  const offsetX = clamp(flight.x + clamp(Number.isFinite(x) ? x : 0, -1, 1) * step * .7, -1, 1);
  const offsetY = clamp(flight.y + clamp(Number.isFinite(y) ? y : 0, -1, 1) * step * .7, -1, 1);
  const distance = approach ? Math.max(4, flight.distance - 18 * step) : flight.distance;
  return {
    ...flight, x: offsetX, y: offsetY, distance,
    phase: distance === 4 && dockable(offsetX, offsetY) && approach ? 'docked' : 'approach'
  };
}

export function dockingStatus(flight) {
  if (flight.phase === 'launch') return 'Launching CB1';
  if (flight.phase === 'docked') return 'Docked at the ISS';
  return dockable(flight.x, flight.y) ? 'Aligned · hold Approach' : 'Steer the dot into the ring';
}
