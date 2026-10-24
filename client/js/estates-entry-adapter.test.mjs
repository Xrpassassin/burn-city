import assert from 'node:assert/strict';
import { createEstatesEntryAdapter } from './estates-entry-adapter.mjs';

const events = [];
let acquires = 0;
let releases = 0;
let transitions = 0;
let returns = 0;
let authorized = true;
const sharedInstance = { id: 'shared-estates-world' };
const pool = {
  async acquire(key, playerId, context) {
    acquires++;
    assert.equal(key, 'estates-island');
    assert.equal(playerId, 'player-42');
    assert.ok(['city-island-gate', 'estates-island-entrance'].includes(context.returnTo));   // explicit anchor, then the default anchor on re-entry
    return { instance: sharedInstance, release() { releases++; return true; } };
  }
};
const adapter = createEstatesEntryAdapter({
  instancePool: pool,
  authenticatePlayer: async () => ({ id: 'player-42', session: 'trusted-session' }),
  authorizeEntry: async principal => { assert.equal(principal.id, 'player-42'); return authorized; },
  transitionToInstance: async data => {
    transitions++;
    assert.equal(data.instance, sharedInstance);
    assert.ok(['city-island-gate', 'estates-island-entrance'].includes(data.returnTo));
  },
  returnToCity: async data => { returns++; assert.ok(['city-island-gate', 'estates-island-entrance'].includes(data.returnTo)); },
  onState: event => events.push(event.state)
});

assert.deepEqual(await adapter.confirmEntry(), { ok: false, reason: 'confirmation-required' });
assert.equal(acquires, 0, 'no instance is acquired without explicit prompt confirmation');
assert.deepEqual(adapter.showPrompt({ returnTo: 'city-island-gate' }), {
  shown: true, requiresConfirmation: true, destinationId: 'estates-island'
});
assert.equal(acquires, 0, 'proximity only opens the prompt; it never teleports');
assert.equal(adapter.cancelPrompt(), true);
assert.equal(adapter.state.promptVisible, false);
assert.deepEqual(await adapter.confirmEntry(), { ok: false, reason: 'confirmation-required' });

adapter.showPrompt({ returnTo: 'city-island-gate' });
authorized = false;
assert.deepEqual(await adapter.confirmEntry(), { ok: false, reason: 'entry-denied' });
assert.equal(acquires, 0, 'authorization occurs before instance acquisition');

authorized = true;
adapter.showPrompt({ returnTo: 'city-island-gate' });
assert.deepEqual(await adapter.confirmEntry(), { ok: true, destinationId: 'estates-island', returnTo: 'city-island-gate' });
assert.equal(acquires, 1);
assert.equal(transitions, 1);
assert.equal(adapter.state.inside, true);
assert.deepEqual(await adapter.confirmEntry(), { ok: false, reason: 'confirmation-required' });
assert.deepEqual(await adapter.exit(), { ok: true, returnTo: 'city-island-gate' });
assert.equal(releases, 1);
assert.equal(returns, 1);
assert.equal(adapter.state.inside, false);

adapter.showPrompt();
assert.deepEqual(await adapter.confirmEntry(), { ok: true, destinationId: 'estates-island', returnTo: 'estates-island-entrance' });
assert.equal(adapter.disconnect(), true);
assert.equal(releases, 2, 'disconnect releases the instance lease');
assert.equal(adapter.disconnect(), false);
assert.ok(events.includes('entry-denied'));
assert.ok(events.includes('entered'));
assert.ok(events.includes('returned-to-city'));
assert.ok(events.includes('disconnected'));

let failedRelease = 0;
const failing = createEstatesEntryAdapter({
  instancePool: { acquire: async () => ({ instance: {}, release() { failedRelease++; } }) },
  authenticatePlayer: async () => ({ id: 'player-fail' }),
  authorizeEntry: async () => true,
  transitionToInstance: async () => { throw new Error('scene transition failed'); },
  returnToCity: async () => {}
});
failing.showPrompt();
const failed = await failing.confirmEntry();
assert.equal(failed.ok, false);
assert.equal(failed.reason, 'entry-failed');
assert.equal(failedRelease, 1, 'failed scene transition releases acquired lease');
assert.equal(failing.state.promptVisible, true, 'failed entry permits explicit retry');
assert.throws(() => createEstatesEntryAdapter({}), /instancePool.acquire/);
console.log('estates-entry-adapter: all tests passed');
