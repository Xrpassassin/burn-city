// One player crew model per vessel. Assets may be shared with other entities;
// remove from scene but do not dispose shared geometries/materials here.
export function createCrewLifecycle({ ship, load }) {
  if (!ship || typeof ship.remove !== 'function' || typeof load !== 'function') throw new TypeError('ship and loader required');
  let current = null;
  let generation = 0;
  let disposed = false;
  function detach() {
    if (current) { ship.remove(current); current = null; }
  }
  async function replace(runtime) {
    if (disposed) return { ok: false, reason: 'disposed' };
    const request = ++generation;
    let result;
    try { result = await load(runtime); } catch { return { ok: false, reason: 'load-failed' }; }
    if (disposed || request !== generation) {
      if (result?.ok && result.model) ship.remove(result.model);
      return { ok: false, reason: 'superseded' };
    }
    if (!result?.ok) return result || { ok: false, reason: 'load-failed' };
    if (!result.model) return { ok: false, reason: 'missing-model' };
    const previous = current;
    current = result.model;
    if (previous && previous !== current) ship.remove(previous);
    return { ok: true, model: current, animations: result.animations || [] };
  }
  function clear() { ++generation; detach(); }
  function dispose() { disposed = true; clear(); }
  return Object.freeze({ replace, clear, dispose, get model() { return current; } });
}
