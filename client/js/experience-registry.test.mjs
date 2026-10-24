import assert from 'node:assert/strict';
import { createExperienceRegistry, createBurnCityExperienceRegistry } from './experience-registry.mjs';

const defaults = createBurnCityExperienceRegistry();
assert.deepEqual(defaults.list().map(e => [e.id, e.status, e.available]), [
  ['zombies', 'planned', false],
  ['homefront', 'planned', false],
  ['light-cycles', 'planned', false],
  ['estates-island', 'planned', false]
]);
assert.deepEqual(await defaults.enter('zombies'), { ok: false, reason: 'not-available' });
const wired = createBurnCityExperienceRegistry({
  launchers: {
    zombies: async ctx => ({ path: 'arena/flight-lobby.html', returnTo: ctx.returnTo }),
    homefront: async ctx => ({ path: 'arena/homefront.html', returnTo: ctx.returnTo }),
    'light-cycles': async ctx => ({ path: 'arena/?mode=tron', returnTo: ctx.returnTo }),
    'estates-island': async ctx => ({ adapter: 'estates-entry-adapter', returnTo: ctx.returnTo })
  }
});
assert.equal(wired.get('zombies').available, true);
assert.equal(wired.get('homefront').available, true);
assert.equal(wired.get('light-cycles').available, true);
assert.equal(wired.get('estates-island').available, true);
assert.equal((await wired.enter('zombies')).result.returnTo, 'airport');
assert.equal((await wired.enter('homefront')).result.returnTo, 'airport');
assert.equal((await wired.enter('light-cycles')).result.returnTo, 'aegis-pyramid-plaza');
assert.equal((await wired.enter('estates-island')).result.returnTo, 'estates-island-entrance');

const states = [];
const registry = createExperienceRegistry({ onState: state => states.push(state) });
registry.register({ id: 'zombies', label: 'Zombie Extermination', status: 'planned', description: 'Airport expedition; not wired yet.' });
assert.equal(registry.get('zombies').available, false);
assert.deepEqual(await registry.enter('zombies'), { ok: false, reason: 'not-available' });
assert.deepEqual(await registry.enter('missing'), { ok: false, reason: 'unknown-experience' });
assert.throws(() => registry.register({ id: 'bad id', label: 'Bad' }), /kebab-case/);
assert.throws(() => registry.register({ id: 'zombies', label: 'Duplicate' }), /already registered/);
assert.throws(() => registry.register({ id: 'broken', label: 'Broken', status: 'available' }), /launch adapter/);

let release;
const launchPromise = new Promise(resolve => { release = resolve; });
registry.register({
  id: 'light-cycles',
  label: 'Light Cycles',
  status: 'available',
  returnTo: 'aegis-pyramid-plaza',
  launch: async context => {
    assert.equal(context.destinationId, 'light-cycles');
    assert.equal(context.returnTo, 'aegis-pyramid-plaza');
    await launchPromise;
    return 'launched';
  }
});
const first = registry.enter('light-cycles', { source: 'aegis-pyramid-plaza' });
assert.equal(registry.pendingId, 'light-cycles');
assert.deepEqual(await registry.enter('light-cycles'), { ok: false, reason: 'transition-in-progress' });
release();
assert.deepEqual(await first, { ok: true, destinationId: 'light-cycles', result: 'launched' });
assert.equal(registry.activeId, 'light-cycles');
assert.equal(registry.pendingId, null);
assert.deepEqual(states.map(s => s.state), ['loading', 'idle']);

registry.register({ id: 'broken-launch', label: 'Broken Launch', status: 'available', launch: async () => { throw new Error('expected'); } });
const failed = await registry.enter('broken-launch');
assert.equal(failed.ok, false);
assert.equal(failed.reason, 'launch-failed');
assert.equal(registry.pendingId, null);
assert.deepEqual(registry.list().map(e => e.id), ['zombies', 'light-cycles', 'broken-launch']);
console.log('experience-registry: all tests passed');
