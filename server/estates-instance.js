// Public Estates Island admission lifecycle. This is a server-side shared lease registry,
// not movement replication or durable world persistence; those remain separate systems.
'use strict';
const { randomBytes } = require('node:crypto');

function createEstatesInstanceManager({
  idleMs = 30_000,
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = timer => clearTimeout(timer),
  onState = () => {}
} = {}) {
  if (!Number.isSafeInteger(idleMs) || idleMs < 0) throw new TypeError('idleMs must be a non-negative safe integer');
  if (typeof setTimer !== 'function' || typeof clearTimer !== 'function') throw new TypeError('timer adapters must be functions');
  const leases = new Map();
  let byClient = new Map();
  let instanceId = null;
  let generation = 0;
  let idleTimer = null;
  const notify = event => { try { onState(Object.freeze({ ...event })); } catch { /* observers cannot break lifecycle */ } };
  const cancelIdle = () => { if (idleTimer !== null) { clearTimer(idleTimer); idleTimer = null; } };
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
      byClient = new Map();
      notify({ state: 'disposed', instanceId: old, leaseCount: 0 });
    }, idleMs);
  };

  function enter(clientId) {
    if (typeof clientId !== 'string' || !/^[A-Za-z0-9_-]{16,100}$/.test(clientId)) {
      return { ok: false, error: 'invalid_client_session' };
    }
    const existingToken = byClient.get(clientId);
    if (existingToken && leases.has(existingToken)) {
      return { ok: true, instanceId: ensureInstance(), leaseToken: existingToken, activeVisitors: leases.size, reused: true };
    }
    const id = ensureInstance();
    const leaseToken = randomBytes(24).toString('hex');
    leases.set(leaseToken, clientId);
    byClient.set(clientId, leaseToken);
    notify({ state: 'joined', instanceId: id, leaseCount: leases.size });
    return { ok: true, instanceId: id, leaseToken, activeVisitors: leases.size, reused: false };
  }

  function leave(leaseToken) {
    if (typeof leaseToken !== 'string' || !/^[a-f0-9]{48}$/.test(leaseToken)) return { ok: false, error: 'invalid_lease' };
    const clientId = leases.get(leaseToken);
    if (!clientId) return { ok: true, released: false, activeVisitors: leases.size };
    leases.delete(leaseToken);
    if (byClient.get(clientId) === leaseToken) byClient.delete(clientId);
    notify({ state: 'left', instanceId, leaseCount: leases.size });
    scheduleIdle();
    return { ok: true, released: true, activeVisitors: leases.size };
  }

  function snapshot() {
    return Object.freeze({ instanceId, activeVisitors: leases.size, state: !instanceId ? 'absent' : leases.size ? 'active' : 'idle' });
  }

  return Object.freeze({ enter, leave, snapshot });
}

module.exports = { createEstatesInstanceManager };
