// Lease-authorized presence relay for the shared Estates Island.
// Clients send only bounded position/heading snapshots; the server assigns peer IDs and broadcasts within one instance.
'use strict';

const rooms = new Map();
let nextPeerId = 1;
const MAX_POSITION = 240;
const MAX_Y = 20;
const MIN_Y = -2;
const MAX_HORIZONTAL_SPEED = 8.5; // metres/second; includes the current sprint speed plus modest jitter
const MAX_VERTICAL_STEP = 1.25;
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const send = (ws, value) => {
  if (ws.readyState === 1 && ws.bufferedAmount < 32 * 1024) {
    try { ws.send(JSON.stringify(value)); } catch {}
  }
};
function isPlausibleStep(previous, next, elapsedMs) {
  if (!previous || !next || ![previous.x,previous.y,previous.z,next.x,next.y,next.z,elapsedMs].every(Number.isFinite)) return false;
  const dx = next.x-previous.x, dy = next.y-previous.y, dz = next.z-previous.z;
  const distance = Math.hypot(dx,dy,dz);
  const elapsed = Math.max(0, elapsedMs) / 1000;
  const horizontal = Math.hypot(dx, dz);
  const horizontalAllowance = Math.max(1.1, elapsed * MAX_HORIZONTAL_SPEED + .45);
  // Estates traversal is grounded: reject vertical position spoofing rather than relaying it.
  return horizontal <= horizontalAllowance && Math.abs(dy) <= Math.min(MAX_VERTICAL_STEP, Math.max(.35, elapsed * 4 + .15));
}
const cleanPosition = value => {
  if (!value || typeof value !== 'object') return null;
  const nums = [value.x, value.y, value.z, value.r].map(Number);
  if (!nums.every(Number.isFinite)) return null;
  if (Math.abs(nums[0]) > MAX_POSITION || nums[1] < MIN_Y || nums[1] > MAX_Y || Math.abs(nums[2]) > MAX_POSITION) return null;
  return { x: nums[0], y: nums[1], z: nums[2], r: clamp(nums[3], -Math.PI, Math.PI) };
};

function attach(ws, url, instanceManager) {
  const token = String(url.searchParams.get('lease') || '');
  const lease = instanceManager.inspectLease(token);
  if (!lease) { send(ws, { t: 'e', e: 'invalid_or_expired_lease' }); ws.close(1008, 'invalid_estates_lease'); return; }
  const instanceId = lease.instanceId;
  let room = rooms.get(instanceId);
  if (!room) { room = new Map(); rooms.set(instanceId, room); }
  for (const existing of room.values()) if (existing.leaseToken === token) { try { existing.ws.close(4001, 'presence_replaced'); } catch {} }
  if (room.size >= 40) { send(ws, { t: 'e', e: 'estates_instance_full' }); ws.close(1013, 'estates_instance_full'); return; }
  const peer = { id: nextPeerId++, ws, leaseToken: token, position: { x: 0, y: 0, z: 0, r: 0 }, updatedAt: Date.now(), lastUpdate: 0, hasPosition: false };
  room.set(peer.id, peer);
  send(ws, { t: 'w', id: peer.id, instanceId, peers: [...room.values()].filter(p => p !== peer && p.hasPosition).map(p => ({ id: p.id, ...p.position })) });
  for (const other of room.values()) if (other !== peer) send(other.ws, { t: 'j', id: peer.id, ...peer.position });

  ws.on('message', raw => {
    if (!instanceManager.inspectLease(token)) { try { ws.close(1008, 'invalid_estates_lease'); } catch {} return; }
    const now = Date.now();
    if (now - peer.lastUpdate < 90) return;
    peer.lastUpdate = now;
    let message;
    try { message = JSON.parse(raw); } catch { return; }
    if (!message || message.t !== 'p') return;
    const position = cleanPosition(message);
    if (!position) return;
    if (peer.hasPosition && !isPlausibleStep(peer.position, position, now-peer.updatedAt)) return;
    peer.position = position;
    peer.hasPosition = true;
    peer.updatedAt = now;
    for (const other of room.values()) if (other !== peer) send(other.ws, { t: 'p', id: peer.id, ...position });
  });

  const leaseWatch = setInterval(() => {
    if (!instanceManager.inspectLease(token)) { try { ws.close(1008, 'invalid_estates_lease'); } catch {} }
  }, 15_000);
  leaseWatch.unref?.();
  const remove = () => {
    clearInterval(leaseWatch);
    if (room.get(peer.id) !== peer) return;
    room.delete(peer.id);
    for (const other of room.values()) send(other.ws, { t: 'l', id: peer.id });
    if (room.size === 0) rooms.delete(instanceId);
  };
  ws.on('close', remove);
  ws.on('error', remove);
}

module.exports = { attach, cleanPosition, isPlausibleStep };
