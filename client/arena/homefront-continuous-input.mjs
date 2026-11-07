// Optional Homefront 3D movement controller. Visual prediction never modifies game authority.
import { ZOMBIE_WALK_SPEED as WALK_SPEED, ZOMBIE_FAST_SPEED as SPRINT_SPEED, HOMEFRONT_CROUCH_SPEED_SCALE } from './zombie-locomotion.mjs';

export const INPUT_SEND_INTERVAL_MS = 125;
export { WALK_SPEED, SPRINT_SPEED };
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

export function createContinuousInput({ send, onSnapshot = () => {}, onUnavailable = () => {}, onResync = null }) {
  if (typeof send !== 'function') throw new TypeError('send is required');
  let enabled = false, nextSequence = 0, pending = false, lastSentAt = -Infinity;
  let sentMotion = false, acknowledgedCrouch = false, lastAckAt = -Infinity, server = null, predicted = null, generation = 0;
  let readyAfter = -Infinity, fatalFallback = false;
  let lastFrameAt = -Infinity, networkFailureStreak = 0, recovering = false;

  function disable(reason = 'disabled') {
    const hadMode = enabled;
    enabled = false; pending = false; sentMotion = false; recovering = false; generation++;
    predicted = server ? { ...server } : null;
    if (hadMode) onUnavailable(reason);
  }
  function sync(protocol, position, now = 0) {
    if (fatalFallback) return;
    if (!protocol?.enabled) { disable('server_disabled'); return; }
    if (!Number.isSafeInteger(protocol.nextSequence) || protocol.nextSequence < 0) return;
    const point = coords(position);
    if (!point || recovering) return;
    if (!pending) acknowledgedCrouch = position.crouched === true;
    if (!enabled) {
      enabled = true; generation++; nextSequence = protocol.nextSequence;
      server = point; predicted = { ...point }; lastSentAt = -Infinity; sentMotion = false;
      readyAfter = now + Math.min(1000, Math.max(0, Number.isFinite(protocol.readyInMs) ? protocol.readyInMs : 0));
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
  function recover(now) {
    if(pending||now<readyAfter)return;
    pending=true;
    const revision=generation;
    Promise.resolve().then(()=>onResync()).then(data=>{
      if(!enabled||generation!==revision)return;
      if(data?.inputProtocol?.enabled===false){disable('server_disabled');return;}
      if(data?.self===null){disable('returned_to_refuge');return;}
      const point=coords(data?.self),protocol=data?.inputProtocol;
      if(!point||protocol?.enabled!==true||!Number.isSafeInteger(protocol.nextSequence)||protocol.nextSequence<0)
        throw Error('movement_resync_invalid');
      // The lost command may have committed or may never have reached the server.
      // Only this fresh authenticated response may move the sequence backwards.
      nextSequence=protocol.nextSequence;correct(point,true);
      acknowledgedCrouch=data.self.crouched===true;sentMotion=false;
      recovering=false;networkFailureStreak=0;
      lastAckAt=Math.max(now,lastFrameAt);lastSentAt=lastAckAt;
      readyAfter=lastAckAt+Math.min(1000,Math.max(0,Number.isFinite(protocol.readyInMs)?protocol.readyInMs:0));
      onSnapshot(data,lastAckAt);
    }).catch(error=>{
      if(!enabled||generation!==revision)return;
      if(error?.message==='sign_in_with_xaman'){fatalFallback=true;disable('sign_in_with_xaman');return;}
      networkFailureStreak=Math.min(5,networkFailureStreak+1);
      readyAfter=Math.max(now,lastFrameAt)+Math.min(4000,350*2**(networkFailureStreak-1));
    }).finally(()=>{if(generation===revision)pending=false;});
  }
  function step(direction, sprint, now, dt, crouched = false) {
    if (Number.isFinite(now)) lastFrameAt = Math.max(lastFrameAt, now);
    if (!enabled || !server || !predicted) return;
    if(recovering){predicted={...server};recover(now);return;}
    if (now < readyAfter) { predicted = { ...server }; return; }
    const vec = normalizeDirection(direction);
    if (vec.moving && Number.isFinite(dt) && dt > 0) {
      const speed = crouched ? WALK_SPEED * HOMEFRONT_CROUCH_SPEED_SCALE : sprint ? SPRINT_SPEED : WALK_SPEED;
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
    if (pending || now - lastSentAt < INPUT_SEND_INTERVAL_MS ||
        (!vec.moving && !sentMotion && crouched === acknowledgedCrouch)) return;
    pending = true;
    lastSentAt = now;
    sentMotion = vec.moving;
    const command = { sequence: nextSequence++, x: vec.moving ? vec.x : 0, z: vec.moving ? vec.z : 0,
      sprint: !crouched && !!sprint, ...(crouched ? { crouched: true } : {}) };
    const requestGeneration = generation;
    Promise.resolve().then(() => send(command)).then(data => {
      if (!enabled || generation !== requestGeneration) return;
      if (!data?.inputAck || data.inputAck.sequence !== command.sequence) throw new Error('movement_ack_mismatch');
      correct(data.inputAck);
      acknowledgedCrouch = data.self?.crouched ?? crouched;
      networkFailureStreak = 0;
      lastAckAt = Math.max(now, lastFrameAt);
      onSnapshot(data, now);
    }).catch(error => {
      if (!enabled || generation !== requestGeneration) return;
      const code = String(error?.message || error);
      if(typeof onResync==='function'&&code!=='continuous_movement_unavailable'&&code!=='sign_in_with_xaman'){
        recovering=true;correct(server,true);
        readyAfter=Math.max(now,lastFrameAt)+350;
      } else if (code === 'continuous_movement_unavailable' || code === 'invalid_movement_sequence' ||
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
    get recovering() { return recovering; },
    position() { return enabled && predicted ? { ...predicted } : null; },
    get nextSequence() { return nextSequence; }
  };
}
