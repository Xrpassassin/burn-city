// Public Estates Island admission lifecycle. This is a server-side shared lease registry,
// not movement replication or durable world persistence.
'use strict';
const { randomBytes } = require('node:crypto');

function createEstatesInstanceManager({
  idleMs = 30_000,
  leaseMs = 90_000,
  maxLeases = 256,
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = timer => clearTimeout(timer),
  onState = () => {}
} = {}) {
  if (!Number.isSafeInteger(idleMs) || idleMs < 0) throw new TypeError('idleMs must be a non-negative safe integer');
  if (!Number.isSafeInteger(leaseMs) || leaseMs < 1000) throw new TypeError('leaseMs must be at least 1000 ms');
  if (!Number.isSafeInteger(maxLeases) || maxLeases < 1) throw new TypeError('maxLeases must be positive');
  if (typeof setTimer !== 'function' || typeof clearTimer !== 'function') throw new TypeError('timer adapters must be functions');
  const leases = new Map();
  const byClient = new Map();
  const leaseTimers = new Map();
  let instanceId = null, generation = 0, idleTimer = null;
  const notify = event => { try { onState(Object.freeze({ ...event })); } catch { /* observers cannot break lifecycle */ } };
  const cancelIdle = () => { if (idleTimer !== null) { clearTimer(idleTimer); idleTimer = null; } };
  const cancelLeaseTimer = token => {
    const timer = leaseTimers.get(token);
    if (timer !== undefined) { clearTimer(timer); leaseTimers.delete(token); }
  };
  const scheduleLeaseExpiry = token => {
    cancelLeaseTimer(token);
    const timer = setTimer(() => {
      leaseTimers.delete(token);
      const lease = leases.get(token);
      if (!lease) return;
      leases.delete(token);
      if (byClient.get(lease.clientId) === token) byClient.delete(lease.clientId);
      notify({ state: 'lease-expired', instanceId, leaseCount: leases.size });
      scheduleIdle();
    }, leaseMs);
    leaseTimers.set(token, timer);
  };
  const ensureInstance = () => {
    cancelIdle();
    if (!instanceId) {
      generation += 1;
      instanceId = 'estates-island-' + generation;
      notify({ state: 'created', instanceId, leaseCount: 0 });
    }
    return instanceId;
  };
  const scheduleIdle = () => {
    if (leases.size || idleTimer !== null || !instanceId) return;
    notify({ state: 'idle', instanceId, leaseCount: 0 });
    idleTimer = setTimer(() => {
      idleTimer = null;
      if (leases.size || !instanceId) return;
      const old = instanceId;
      instanceId = null;
      notify({ state: 'disposed', instanceId: old, leaseCount: 0 });
    }, idleMs);
  };

  function enter(clientId) {
    if (typeof clientId !== 'string' || !/^[A-Za-z0-9_-]{16,100}$/.test(clientId)) return { ok: false, error: 'invalid_client_session' };
    const existingToken = byClient.get(clientId);
    if (existingToken && leases.has(existingToken)) {
      const id = ensureInstance();
      scheduleLeaseExpiry(existingToken);
      return { ok: true, instanceId: id, leaseToken: existingToken, activeVisitors: leases.size, leaseMs, reused: true };
    }
    if (leases.size >= maxLeases) return { ok: false, error: 'instance_full' };
    const id = ensureInstance();
    const leaseToken = randomBytes(24).toString('hex');
    leases.set(leaseToken, { clientId });
    byClient.set(clientId, leaseToken);
    scheduleLeaseExpiry(leaseToken);
    notify({ state: 'joined', instanceId: id, leaseCount: leases.size });
    return { ok: true, instanceId: id, leaseToken, activeVisitors: leases.size, leaseMs, reused: false };
  }

  function heartbeat(leaseToken) {
    if (typeof leaseToken !== 'string' || !/^[a-f0-9]{48}$/.test(leaseToken)) return { ok: false, error: 'invalid_lease' };
    if (!leases.has(leaseToken)) return { ok: false, error: 'lease_expired' };
    scheduleLeaseExpiry(leaseToken);
    return { ok: true, instanceId, activeVisitors: leases.size, leaseMs };
  }

  function leave(leaseToken) {
    if (typeof leaseToken !== 'string' || !/^[a-f0-9]{48}$/.test(leaseToken)) return { ok: false, error: 'invalid_lease' };
    const lease = leases.get(leaseToken);
    if (!lease) return { ok: true, released: false, activeVisitors: leases.size };
    cancelLeaseTimer(leaseToken);
    leases.delete(leaseToken);
    if (byClient.get(lease.clientId) === leaseToken) byClient.delete(lease.clientId);
    notify({ state: 'left', instanceId, leaseCount: leases.size });
    scheduleIdle();
    return { ok: true, released: true, activeVisitors: leases.size };
  }

  function inspectLease(leaseToken) {
    if (typeof leaseToken !== 'string' || !/^[a-f0-9]{48}$/.test(leaseToken)) return null;
    const lease = leases.get(leaseToken);
    if (!lease || !instanceId) return null;
    return Object.freeze({ clientId: lease.clientId, instanceId });
  }

  function snapshot() {
    return Object.freeze({ instanceId, activeVisitors: leases.size, state: !instanceId ? 'absent' : leases.size ? 'active' : 'idle' });
  }

  return Object.freeze({ enter, heartbeat, leave, inspectLease, snapshot });
}

module.exports = { createEstatesInstanceManager };
