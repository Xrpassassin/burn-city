// In-memory cache + coalesced atomic writes for the Homefront save files
// (homefront.json: per-account refuges, homefront-world.json: the shared XRPL Graveyard world).
//
// Why: every Homefront/world request used to readFileSync + JSON.parse the whole file and then
// writeFileSync it back (sometimes both files, twice per request). This module loads each file once
// through store.load (so .bak recovery and the corrupt-file payout pause behave exactly as before),
// serves later loads from memory, and writes dirty files with store.save (tmp + rename + .bak)
// on a short timer, coalescing bursts into one write per file. flush() writes synchronously and is
// called on process exit and from server.js on SIGTERM/SIGINT.
//
// Isolation: handlers mutate what they load and sometimes throw midway, so a load must never hand
// out the cached object itself. 'deep' files are structuredClone'd on load and save. 'shallow'
// files (a map of account -> base) copy only the top-level map: homefront.js never mutates a saved
// base in place (Core.validateBase returns a clone), so sharing the per-account values is safe and
// avoids cloning every refuge on every request.
'use strict';
const Store = require('./store');

function createCachedStore({ base = Store, delayMs = 400, modes = {}, timers = { setTimeout, clearTimeout }, log = console } = {}) {
  const cache = new Map();          // name -> { present, value }
  const dirty = new Set();
  let timer = null;
  const stats = { diskLoads: 0, diskWrites: 0, writeErrors: 0 };
  const modeOf = name => modes[name] || 'deep';
  const copy = (name, v) => {
    if (v === null || typeof v !== 'object') return v;
    return modeOf(name) === 'shallow' && !Array.isArray(v) ? { ...v } : structuredClone(v);
  };
  function entry(name) {
    let e = cache.get(name);
    if (!e) {
      const MISSING = {};
      const v = base.load(name, MISSING);
      stats.diskLoads++;
      e = v === MISSING ? { present: false, value: undefined } : { present: true, value: v };
      cache.set(name, e);
    }
    return e;
  }
  function load(name, fallback) {
    const e = entry(name);
    return e.present ? copy(name, e.value) : fallback;
  }
  function flush() {
    if (timer) { timers.clearTimeout(timer); timer = null; }
    for (const name of [...dirty]) {
      const e = cache.get(name);
      try { base.save(name, e.value); stats.diskWrites++; dirty.delete(name); }
      catch (err) { stats.writeErrors++; log.error('[homefront-store] write failed', name, err?.message); }
    }
    if (dirty.size) schedule(Math.max(delayMs, 2000));   // retry failed writes; memory stays authoritative
  }
  function schedule(ms = delayMs) {
    if (timer) return;
    timer = timers.setTimeout(() => { timer = null; flush(); }, ms);
    timer?.unref?.();
  }
  function save(name, value) {
    entry(name);
    cache.set(name, { present: true, value: copy(name, value) });
    dirty.add(name);
    schedule();
  }
  // Drop the cache (tests, or an operator restoring a file by hand while the process is stopped).
  function reset() { if (timer) { timers.clearTimeout(timer); timer = null; } cache.clear(); dirty.clear(); }
  return { load, save, flush, reset, pending: () => [...dirty], stats };
}

const shared = createCachedStore({ modes: { 'homefront.json': 'shallow', 'homefront-world.json': 'deep' } });
process.once('exit', () => { try { shared.flush(); } catch {} });

module.exports = { createCachedStore, shared };
