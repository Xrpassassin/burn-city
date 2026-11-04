// Optional Homefront 3D movement controller. Visual prediction never modifies game authority.
import { releasePredictionBlend, clampPredictionLead } from './homefront-presentation-smoothing.mjs';
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
  let readyAfter = -Infinity, fatalFallback = false;
  let lastFrameAt = -Infinity, networkFailureStreak = 0;

  function disable(reason = 'disabled') {
    const hadMode = enabled;
    enabled = false; pending = false; sentMotion = false; generation++;
    predicted = server ? { ...server } : null;
    if (hadMode) onUnavailable(reason);
  }
  function sync(protocol, position, now = 0) {
    if (fatalFallback) return;
    if (!protocol?.enabled) { disable('server_disabled'); return; }
    if (!Number.isSafeInteger(protocol.nextSequence) || protocol.nextSequence < 0) return;
    const point = coords(position);
    if (!point) return;
    if (!enabled) {
      enabled = true; generation++; nextSequence = protocol.nextSequence;
      server = point; predicted = { ...point }; lastSentAt = -Infinity; sentMotion = false;
      readyAfter = now + Math.min(1000, Math.max(0, Number.isFinite(protocol.readyInMs) ? protocol.readyInMs : 0));
      return;
    }
    // A world GET sent before an acknowledged movement can arrive much later.
    // Its protocol cursor is older than the next locally allocated command,
    // so its position must never roll our presentation back. Still honor an
    // explicit server disable above, even when the refresh is stale.
    if (protocol.nextSequence < nextSequence) return;
    nextSequence = protocol.nextSequence;
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
    // A server ack can move the authoritative anchor enough that the old
    // 35%-toward-server blend still leaves more than 1.5 units of visual lead.
    predicted = clampPredictionLead(predicted, server, MAX_PREDICTION_LEAD);
  }
  function step(direction, sprint, now, dt) {
    if (Number.isFinite(now)) lastFrameAt = Math.max(lastFrameAt, now);
    if (!enabled || !server || !predicted) return;
    if (now < readyAfter) { predicted = { ...server }; return; }
    const vec = normalizeDirection(direction);
    if (vec.moving && Number.isFinite(dt) && dt > 0) {
      const speed = sprint ? SPRINT_SPEED : WALK_SPEED;
      predicted.x += vec.x * Math.min(0.05, dt) * speed;
      predicted.z += vec.z * Math.min(0.05, dt) * speed;
      predicted = clampPredictionLead(predicted, server, MAX_PREDICTION_LEAD);
    } else {
      // Release correction is elapsed-time based, not a fixed percent per frame.
      const recovery = releasePredictionBlend(dt);
      predicted.x += (server.x - predicted.x) * recovery;
      predicted.z += (server.z - predicted.z) * recovery;
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
      networkFailureStreak = 0;
      lastAckAt = Math.max(now, lastFrameAt);
      onSnapshot(data, now);
    }).catch(error => {
      if (!enabled || generation !== requestGeneration) return;
      const code = String(error?.message || error);
      if (code === 'continuous_movement_unavailable' || code === 'invalid_movement_sequence' ||
          code === 'movement_ack_mismatch' || code === 'sign_in_with_xaman') {
        if (code !== 'continuous_movement_unavailable') fatalFallback = true;
        disable(code);
      } else if (code === 'move_cooldown') {
        // Avoid briefly showing movement that the server cannot accept after a fresh spawn.
        correct(server, true);
        readyAfter = Math.max(now, lastFrameAt) + 200;
      } else {
        // Network failures cannot grant a longer speculative lead. Base
        // backoff on the latest frame clock, not the timestamp captured
        // before a 1.8-second fetch timeout.
        correct(server, true);
        networkFailureStreak = Math.min(5, networkFailureStreak + 1);
        readyAfter = Math.max(now, lastFrameAt) + Math.min(4000, 350 * (2 ** (networkFailureStreak - 1)));
        if (networkFailureStreak >= 5) {
          fatalFallback = true;
          disable('movement_network_unavailable');
        }
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
