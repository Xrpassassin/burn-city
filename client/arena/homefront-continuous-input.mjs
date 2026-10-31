// Optional Homefront 3D movement controller. Visual prediction never modifies game authority.
export const INPUT_SEND_INTERVAL_MS = 125;
export const WALK_SPEED = 8;
export const SPRINT_SPEED = 12;
export const MAX_PREDICTION_LEAD = 1.5;

function normalizeDirection(direction) {
  const x = Number.isFinite(direction?.x) ? direction.x : 0;
  const z = Number.isFinite(direction?.z) ? direction.z : 0;
  const length = Math.hypot(x, z);
  const scale = length > 1 ? 1 / length : 1;
  return { x: x * scale, z: z * scale, moving: length > 0.1 };
}
const coords = value => Number.isFinite(value?.x) && Number.isFinite(value?.z)
  ? { x: value.x, z: value.z } : null;

export function createContinuousInput({ send, onSnapshot = () => {}, onUnavailable = () => {} }) {
  if (typeof send !== 'function') throw new TypeError('send is required');
  let enabled = false, nextSequence = 0, pending = false, lastSentAt = -Infinity;
  let sentMotion = false, lastAckAt = -Infinity, server = null, predicted = null, generation = 0;

  function disable(reason = 'disabled') {
    const hadMode = enabled;
    enabled = false; pending = false; sentMotion = false; generation++;
    predicted = server ? { ...server } : null;
    if (hadMode) onUnavailable(reason);
  }
  function sync(protocol, position, now = 0) {
    if (!protocol?.enabled) { disable('server_disabled'); return; }
    if (!Number.isSafeInteger(protocol.nextSequence) || protocol.nextSequence < 0) return;
    const point = coords(position);
    if (!point) return;
    if (!enabled) {
      enabled = true; generation++; nextSequence = protocol.nextSequence;
      server = point; predicted = { ...point }; lastSentAt = -Infinity; sentMotion = false;
      return;
    }
    nextSequence = Math.max(nextSequence, protocol.nextSequence);
    // A delayed GET must not roll an acknowledged player position backwards.
    if (!pending && now - lastAckAt >= 1200) correct(point);
  }
  function correct(point, blocked = false) {
    const valid = coords(point);
    if (!valid) return;
    server = valid;
    if (!predicted || blocked || Math.hypot(predicted.x - server.x, predicted.z - server.z) > 2.5) {
      predicted = { ...server };
    } else {
      predicted.x += (server.x - predicted.x) * 0.35;
      predicted.z += (server.z - predicted.z) * 0.35;
    }
  }
  function step(direction, sprint, now, dt) {
    if (!enabled || !server || !predicted) return;
    const vec = normalizeDirection(direction);
    if (vec.moving && Number.isFinite(dt) && dt > 0) {
      const speed = sprint ? SPRINT_SPEED : WALK_SPEED;
      predicted.x += vec.x * Math.min(0.05, dt) * speed;
      predicted.z += vec.z * Math.min(0.05, dt) * speed;
      const lead = Math.hypot(predicted.x - server.x, predicted.z - server.z);
      if (lead > MAX_PREDICTION_LEAD) {
        const k = MAX_PREDICTION_LEAD / lead;
        predicted.x = server.x + (predicted.x - server.x) * k;
        predicted.z = server.z + (predicted.z - server.z) * k;
      }
    } else {
      // Recover from speculative movement after release.
      predicted.x += (server.x - predicted.x) * 0.16;
      predicted.z += (server.z - predicted.z) * 0.16;
    }
    if (pending || now - lastSentAt < INPUT_SEND_INTERVAL_MS || (!vec.moving && !sentMotion)) return;
    pending = true;
    lastSentAt = now;
    sentMotion = vec.moving;
    const command = { sequence: nextSequence++, x: vec.moving ? vec.x : 0, z: vec.moving ? vec.z : 0, sprint: !!sprint };
    const requestGeneration = generation;
    Promise.resolve().then(() => send(command)).then(data => {
      if (!enabled || generation !== requestGeneration) return;
      if (!data?.inputAck || data.inputAck.sequence !== command.sequence) throw new Error('movement_ack_mismatch');
      correct(data.inputAck);
      lastAckAt = now;
      onSnapshot(data, now);
    }).catch(error => {
      if (!enabled || generation !== requestGeneration) return;
      const code = String(error?.message || error);
      if (code === 'continuous_movement_unavailable' || code === 'invalid_movement_sequence' || code === 'movement_ack_mismatch') {
        disable(code);
      } else if (code === 'terrain_path_blocked') {
        correct(server, true);
      }
    }).finally(() => { if (generation === requestGeneration) pending = false; });
  }
  return {
    sync, step, disable,
    get enabled() { return enabled; },
    get pending() { return pending; },
    position() { return enabled && predicted ? { ...predicted } : null; },
    get nextSequence() { return nextSequence; }
  };
}
