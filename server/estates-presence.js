// Lease-authorized presence relay for the shared Estates Island.
// Clients send only bounded position/heading snapshots; the server assigns peer IDs and broadcasts within one instance.
'use strict';

const rooms = new Map();
let nextPeerId = 1;
const MAX_POSITION = 240;
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const send = (ws, value) => {
  if (ws.readyState === 1 && ws.bufferedAmount < 32 * 1024) {
    try { ws.send(JSON.stringify(value)); } catch {}
  }
};
const cleanPosition = value => {
  if (!value || typeof value !== 'object') return null;
  const nums = [value.x, value.y, value.z, value.r].map(Number);
  if (!nums.every(Number.isFinite)) return null;
  return { x: clamp(nums[0], -MAX_POSITION, MAX_POSITION), y: clamp(nums[1], -2, 20), z: clamp(nums[2], -MAX_POSITION, MAX_POSITION), r: clamp(nums[3], -Math.PI, Math.PI) };
};

function attach(ws, url, instanceManager) {
  const token = String(url.searchParams.get('lease') || '');
  const lease = instanceManager.inspectLease(token);
  if (!lease) { send(ws, { t: 'e', e: 'invalid_or_expired_lease' }); ws.close(1008, 'invalid_estates_lease'); return; }
  const instanceId = lease.instanceId;
  let room = rooms.get(instanceId);
  if (!room) { room = new Map(); rooms.set(instanceId, room); }
  if (room.size >= 40) { send(ws, { t: 'e', e: 'estates_instance_full' }); ws.close(1013, 'estates_instance_full'); return; }
  const peer = { id: nextPeerId++, ws, position: { x: 0, y: 0, z: 0, r: 0 }, updatedAt: Date.now(), lastUpdate: 0 };
  room.set(peer.id, peer);
  send(ws, { t: 'w', id: peer.id, instanceId, peers: [...room.values()].filter(p => p !== peer).map(p => ({ id: p.id, ...p.position })) });
  for (const other of room.values()) if (other !== peer) send(other.ws, { t: 'j', id: peer.id, ...peer.position });

  ws.on('message', raw => {
    const now = Date.now();
    if (now - peer.lastUpdate < 90) return;
    peer.lastUpdate = now;
    let message;
    try { message = JSON.parse(raw); } catch { return; }
    if (!message || message.t !== 'p') return;
    const position = cleanPosition(message);
    if (!position) return;
    peer.position = position;
    peer.updatedAt = now;
    for (const other of room.values()) if (other !== peer) send(other.ws, { t: 'p', id: peer.id, ...position });
  });

  const remove = () => {
    if (room.get(peer.id) !== peer) return;
    room.delete(peer.id);
    for (const other of room.values()) send(other.ws, { t: 'l', id: peer.id });
    if (room.size === 0) rooms.delete(instanceId);
  };
  ws.on('close', remove);
  ws.on('error', remove);
}

module.exports = { attach, cleanPosition };
