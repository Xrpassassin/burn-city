import assert from 'node:assert/strict';
import { homefrontContextAction, homefrontActionTarget } from './homefront-context-action.mjs';

assert.equal(homefrontContextAction({}), null, 'no nearby action does not produce a fake interaction');
assert.deepEqual(homefrontContextAction({ canEnter: true, enterTitle: 'Ironworks', canLoot: true, lootLabel: 'Crate' }),
  { id: 'enter', label: 'Enter Ironworks' }, 'entering a nearby building takes priority');
assert.deepEqual(homefrontContextAction({ canLoot: true, lootLabel: 'Supply cache', canDamage: true }),
  { id: 'loot', label: 'Search Supply cache' }, 'searchable supplies take priority over destroying scenery');
assert.deepEqual(homefrontContextAction({ canDamage: true }),
  { id: 'damage', label: 'Damage structure' }, 'destructible object is available when selected');
assert.deepEqual(homefrontContextAction({ canEnter: true }),
  { id: 'enter', label: 'Enter building' }, 'missing labels use a readable fallback');
assert.ok(homefrontContextAction({ canLoot: true, lootLabel: 'X'.repeat(200) }).label.length <= 63,
  'malformed long labels cannot overflow the mobile interaction overlay');

let clicked = '';
const enter = { hidden: false, disabled: false, click: () => { clicked = 'enter'; } };
const loot = { hidden: false, disabled: false, click: () => { clicked = 'loot'; } };
const damage = { hidden: false, disabled: false, click: () => { clicked = 'damage'; } };
const controls = { enter, loot, damage };
const target = homefrontActionTarget({ id: 'loot' }, controls);
assert.equal(target, loot);
target.click();
assert.equal(clicked, 'loot', 'context prompt invokes existing action control');
loot.disabled = true;
assert.equal(homefrontActionTarget({ id: 'loot' }, controls), null, 'disabled server-controlled action cannot be bypassed');
loot.disabled = false; loot.hidden = true;
assert.equal(homefrontActionTarget({ id: 'loot' }, controls), null, 'hidden action cannot be invoked');
assert.equal(homefrontActionTarget({ id: 'nonexistent' }, controls), null, 'unknown actions have no handler');
assert.equal(homefrontActionTarget(null, controls), null);
const roomAction = homefrontContextAction({
  canEnter: true, roomTarget: { kind: 'action', id: 'generator_switch', label: 'Emergency power breaker' }
});
assert.deepEqual(roomAction, { id: 'interior-action', targetId: 'generator_switch', label: 'Use Emergency power breaker' },
  'a real in-room switch takes priority over an unrelated outdoor Enter prompt');
const roomDoor = homefrontContextAction({ roomTarget: { kind: 'door', id: 'pharmacy_door', label: 'Pharmacy' } });
assert.deepEqual(roomDoor, { id: 'interior-door', targetId: 'pharmacy_door', label: 'Go through Pharmacy' },
  'door prompt names the connected destination');
assert.equal(homefrontActionTarget(roomDoor, controls), null,
  'interior actions never masquerade as external loot or enter buttons');
assert.equal(homefrontContextAction({ roomTarget: { kind: 'teleport', id: 'x', label: 'Unsafe' } }), null,
  'unknown interaction kinds are never offered');
assert.equal(homefrontContextAction({ roomTarget: { kind: 'action', id: '', label: 'Empty' } }), null,
  'empty action identifiers cannot enter the control path');

console.log('Homefront in-world contextual interaction tests passed.');
