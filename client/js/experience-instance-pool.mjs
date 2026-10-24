// Shared, on-demand experience instance lifecycle primitive.
// This is a runtime adapter seam, not a server deployment or renderer by itself.
// Call acquire only after server-side identity and destination access have been validated.
const KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function createSharedInstancePool({
  createInstance,
  disposeInstance,
  idleMs = 30_000,
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = handle => clearTimeout(handle),
  onState = () => {}
} = {}) {
  if (typeof createInstance !== 'function') throw new TypeError('createInstance callback is required');
  if (typeof disposeInstance !== 'function') throw new TypeError('disposeInstance callback is required');
  if (!Number.isSafeInteger(idleMs) || idleMs < 0) throw new TypeError('idleMs must be a non-negative safe integer');
  if (typeof setTimer !== 'function' || typeof clearTimer !== 'function') throw new TypeError('timer adapters must be functions');

  const instances = new Map();
  let nextLeaseId = 1;
  const notify = event => { try { onState(Object.freeze({ ...event })); } catch { /* Observers must not break lifecycle transitions. */ } };

  function validateKey(key) {
    if (typeof key !== 'string' || !KEY.test(key)) throw new TypeError('instance key must be stable kebab-case');
  }
  function validatePlayer(playerId) {
    if (typeof playerId !== 'string' || !playerId.trim() || playerId.length > 160) {
      throw new TypeError('authenticated player id is required');
    }
  }
  function cancelIdle(entry) {
    if (entry.idleTimer !== null) {
      clearTimer(entry.idleTimer);
      entry.idleTimer = null;
    }
  }
  function scheduleDispose(key, entry) {
    if (entry.leases.size !== 0 || entry.status === 'unloading') return;
    entry.status = 'idle';
    notify({ state: 'idle', key, leaseCount: 0 });
    entry.idleTimer = setTimer(() => {
      entry.idleTimer = null;
      if (instances.get(key) !== entry || entry.leases.size !== 0 || entry.status === 'unloading') return;
      entry.status = 'unloading';
      notify({ state: 'unloading', key, leaseCount: 0 });
      entry.disposePromise = Promise.resolve()
        .then(() => disposeInstance(entry.instance, { key }))
        .then(() => notify({ state: 'disposed', key, leaseCount: 0 }))
        .catch(error => {
          notify({ state: 'dispose-failed', key, leaseCount: 0, error });
        })
        .finally(() => {
          if (instances.get(key) === entry) instances.delete(key);
        });
    }, idleMs);
  }

  async function acquire(key, playerId, context = {}) {
    validateKey(key);
    validatePlayer(playerId);
    if (context === null || typeof context !== 'object' || Array.isArray(context)) {
      throw new TypeError('instance context must be an object');
    }

    let entry = instances.get(key);
    if (entry?.status === 'unloading') {
      await entry.disposePromise;
      return acquire(key, playerId, context);
    }
    if (!entry) {
      entry = {
        key,
        status: 'loading',
        instance: null,
        leases: new Map(),
        idleTimer: null,
        disposePromise: null,
        readyPromise: null
      };
      instances.set(key, entry);
      notify({ state: 'loading', key, leaseCount: 0 });
      entry.readyPromise = Promise.resolve()
        .then(() => createInstance({ key, context }))
        .then(instance => {
          if (instance == null) throw new Error('instance_factory_returned_empty');
          entry.instance = instance;
          entry.status = 'active';
          notify({ state: 'active', key, leaseCount: entry.leases.size });
          return instance;
        })
        .catch(error => {
          if (instances.get(key) === entry) instances.delete(key);
          notify({ state: 'creation-failed', key, leaseCount: 0, error });
          throw error;
        });
    } else {
      cancelIdle(entry);
      if (entry.status === 'idle') {
        entry.status = 'active';
        notify({ state: 'active', key, leaseCount: entry.leases.size });
      }
    }

    let instance;
    try {
      instance = await entry.readyPromise;
    } catch (error) {
      throw error;
    }
    // The instance may have begun unloading only after its idle timer fired; acquisition
    // cancels that timer synchronously above, before waiting for readiness.
    if (instances.get(key) !== entry || entry.status === 'unloading') {
      return acquire(key, playerId, context);
    }

    const leaseId = nextLeaseId++;
    entry.leases.set(leaseId, playerId);
    notify({ state: 'joined', key, leaseCount: entry.leases.size, playerId });
    let released = false;
    return Object.freeze({
      key,
      playerId,
      instance,
      release() {
        if (released) return false;
        released = true;
        if (instances.get(key) !== entry || !entry.leases.delete(leaseId)) return false;
        notify({ state: 'left', key, leaseCount: entry.leases.size, playerId });
        if (entry.leases.size === 0) scheduleDispose(key, entry);
        return true;
      }
    });
  }

  function snapshot() {
    return [...instances.values()].map(entry => Object.freeze({
      key: entry.key,
      state: entry.status,
      leaseCount: entry.leases.size,
      players: [...new Set(entry.leases.values())]
    }));
  }

  return Object.freeze({ acquire, snapshot });
}
