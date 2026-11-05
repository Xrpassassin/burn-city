import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Exercise the actual inline page handler, not a synthetic route copy.
const html = readFileSync(new URL('../client/arena/homefront.html', import.meta.url), 'utf8');
const start = html.indexOf('async function worldAction(path,payload){');
const end = html.indexOf('\nfunction startGraveyardWorld()', start);
assert(start >= 0 && end > start, 'Homefront inline world action must be found');
const handler = html.slice(start, end);

function harness(initialMode = 'home') {
  let response = null;
  let failure = null;
  const changes = [];
  const sandbox = {
    request: async () => { if (failure) throw failure; return response; },
    drawGraveyardMap() {},
    renderSurvival() {},
    render() {},
    showReturnDebrief() {},
    FRIENDLY_ERRORS: {}
  };
  vm.runInNewContext(`
    let expeditionWorld = null, graveyardBusy = false, base = null,
        threatProfile = null, lastEncounterText = '', homefrontMode = ${JSON.stringify(initialMode)};
    function setHomefrontMode(mode) { homefrontMode = mode; globalThis.modeChanges.push(mode); }
    ${handler}
    globalThis.run = worldAction;
    globalThis.getMode = () => homefrontMode;
    globalThis.getWorld = () => expeditionWorld;
    globalThis.modeChanges = [];
  `, sandbox, { timeout: 1000 });
  return {
    setResponse: value => { response = value; failure = null; },
    setFailure: error => { failure = error; },
    run: sandbox.run,
    getMode: sandbox.getMode,
    getWorld: sandbox.getWorld,
    changes: sandbox.modeChanges
  };
}

const direct = harness();
direct.setResponse({ self: { x: 2, z: 3 } });
await direct.run('/api/homefront/world/enter', {});
assert.equal(direct.getMode(), 'expedition',
  'direct expedition entry must reveal the Graveyard panel');
assert.deepEqual(Array.from(direct.changes), ['expedition'],
  'entry makes a single intentional mode transition');
direct.setResponse({ self: { x: 2.2, z: 3 } });
await direct.run('/api/homefront/world/move', { x: 2.2, z: 3 });
assert.equal(direct.getMode(), 'expedition',
  'regular movement does not alter the selected presentation mode');
assert.deepEqual(Array.from(direct.changes), ['expedition']);
direct.setResponse({ self: null });
await direct.run('/api/homefront/world/leave', {});
assert.equal(direct.getMode(), 'home',
  'direct expedition exit must reveal the refuge panel');

const failed = harness();
failed.setFailure(new Error('not_in_expedition'));
await failed.run('/api/homefront/world/enter', {});
assert.equal(failed.getMode(), 'home',
  'failed server enter cannot falsely show an expedition');
assert.equal(failed.changes.length, 0);

const unaccepted = harness();
unaccepted.setResponse({ self: null });
await unaccepted.run('/api/homefront/world/enter', {});
assert.equal(unaccepted.getMode(), 'home',
  'successful HTTP response without a deployed player cannot show expedition');

const viaTravel = harness('expedition');
viaTravel.setResponse({ self: { x: 1, z: 1 } });
await viaTravel.run('/api/homefront/world/enter', { withParty: false });
assert.equal(viaTravel.getMode(), 'expedition');
assert.equal(viaTravel.changes.length, 0,
  'normal Travel menu mode switch must not cause a second full render');

console.log('Homefront entry modes: direct enter/leave, failed response, normal travel and movement isolation passed.');
