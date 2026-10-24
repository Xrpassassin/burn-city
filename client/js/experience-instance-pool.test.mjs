import assert from 'node:assert/strict';
import { createSharedInstancePool } from './experience-instance-pool.mjs';

let nextTimer = 1;
const timers = new Map();
const states = [];
let creates = 0;
let disposals = 0;
const pool = createSharedInstancePool({
  idleMs: 500,
  setTimer(fn, ms) {
    assert.equal(ms, 500);
    const id = nextTimer++;
    timers.set(id, fn);
    return id;
  },
  clearTimer(id) { timers.delete(id); },
  createInstance: async ({ key }) => ({ key, serial: ++creates }),
  disposeInstance: async instance => { assert.ok(instance.serial > 0); disposals++; },
  onState: event => states.push(event.state)
});

const [alice, bob] = await Promise.all([
  pool.acquire('estates-island', 'player-alice', { entry: 'bridge' }),
  pool.acquire('estates-island', 'player-bob', { entry: 'bridge' })
]);
assert.equal(creates, 1, 'concurrent entries share one creation');
assert.equal(alice.instance, bob.instance, 'both players join the same live instance');
assert.equal(pool.snapshot()[0].leaseCount, 2);
assert.deepEqual(new Set(pool.snapshot()[0].players), new Set(['player-alice', 'player-bob']));
assert.equal(alice.release(), true);
assert.equal(alice.release(), false, 'lease release is idempotent');
assert.equal(pool.snapshot()[0].leaseCount, 1);
assert.equal(bob.release(), true);
assert.equal(pool.snapshot()[0].state, 'idle');
assert.equal(timers.size, 1, 'empty instance receives an idle timer');

const carol = await pool.acquire('estates-island', 'player-carol');
assert.equal(carol.instance, alice.instance, 're-entry before timeout reuses the instance');
assert.equal(timers.size, 0, 're-entry cancels the pending idle timer');
assert.equal(carol.release(), true);
const [[timerId, fire]] = timers.entries();
timers.delete(timerId);
fire();
await new Promise(resolve => setImmediate(resolve));
assert.equal(disposals, 1, 'idle instance is disposed after its grace period');
assert.deepEqual(pool.snapshot(), []);

const [north, south] = await Promise.all([
  pool.acquire('estates-north', 'player-d'),
  pool.acquire('estates-south', 'player-e')
]);
assert.notEqual(north.instance, south.instance, 'different shard keys remain isolated');
assert.equal(creates, 3);
north.release();
south.release();

// Failed construction is not cached as a poisoned entry; the next attempt can retry.
let failFirst = true;
const retryPool = createSharedInstancePool({
  idleMs: 0,
  createInstance: async () => {
    if (failFirst) { failFirst = false; throw new Error('simulated-create-failure'); }
    return { recovered: true };
  },
  disposeInstance: async () => {}
});
await assert.rejects(retryPool.acquire('estates-retry', 'player-f'), /simulated-create-failure/);
const recovered = await retryPool.acquire('estates-retry', 'player-f');
assert.equal(recovered.instance.recovered, true);
recovered.release();

assert.ok(states.includes('loading'));
assert.ok(states.includes('joined'));
assert.ok(states.includes('unloading'));
assert.ok(states.includes('disposed'));
await assert.rejects(pool.acquire('Bad Key', 'player-g'), /kebab-case/);
await assert.rejects(pool.acquire('estates-island', ''), /authenticated player id/);
console.log('experience-instance-pool: all tests passed');
