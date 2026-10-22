// Small, dependency-free registry for real BURN City cross-experience transitions.
// This module deliberately does not invent routes or make planned destinations look playable.
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const STATUSES = new Set(['planned', 'available']);

export function createExperienceRegistry({ onState = () => {} } = {}) {
  const entries = new Map();
  let pendingId = null;
  let activeId = null;

  function register(definition) {
    if (!definition || typeof definition !== 'object') throw new TypeError('Experience definition is required');
    const { id, label, status = 'planned', description = '', launch, returnTo = 'city' } = definition;
    if (typeof id !== 'string' || !ID.test(id)) throw new TypeError('Experience id must be a stable kebab-case id');
    if (entries.has(id)) throw new Error(`Experience already registered: ${id}`);
    if (typeof label !== 'string' || !label.trim()) throw new TypeError('Experience label is required');
    if (!STATUSES.has(status)) throw new TypeError('Experience status must be planned or available');
    if (status === 'available' && typeof launch !== 'function') {
      throw new TypeError('Available experiences require a launch adapter');
    }
    if (status === 'planned' && launch != null && typeof launch !== 'function') {
      throw new TypeError('Launch adapter must be a function when supplied');
    }
    const entry = Object.freeze({ id, label: label.trim(), description: String(description), status, launch, returnTo });
    entries.set(id, entry);
    return publicEntry(entry);
  }

  function publicEntry(entry) {
    return Object.freeze({
      id: entry.id,
      label: entry.label,
      description: entry.description,
      status: entry.status,
      available: entry.status === 'available',
      returnTo: entry.returnTo
    });
  }

  function get(id) {
    const entry = entries.get(id);
    return entry ? publicEntry(entry) : null;
  }

  function list() {
    return [...entries.values()].map(publicEntry);
  }

  async function enter(id, context = {}) {
    if (pendingId) return { ok: false, reason: 'transition-in-progress' };
    const entry = entries.get(id);
    if (!entry) return { ok: false, reason: 'unknown-experience' };
    if (entry.status !== 'available' || typeof entry.launch !== 'function') {
      return { ok: false, reason: 'not-available' };
    }

    pendingId = id;
    onState({ state: 'loading', destinationId: id });
    try {
      const result = await entry.launch({ ...context, destinationId: id, returnTo: entry.returnTo });
      activeId = id;
      return { ok: true, destinationId: id, result };
    } catch (error) {
      return { ok: false, reason: 'launch-failed', error };
    } finally {
      pendingId = null;
      onState({ state: 'idle', destinationId: id, activeId });
    }
  }

  return Object.freeze({
    register,
    get,
    list,
    enter,
    get activeId() { return activeId; },
    get pendingId() { return pendingId; }
  });
}
