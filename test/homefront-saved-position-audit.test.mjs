import test from 'node:test';
import assert from 'node:assert/strict';
import { auditHomefrontSavedPositions } from '../client/arena/homefront-saved-position-audit.mjs';

test('v2 saved-position audit flags collision without moving any saved data', () => {
  const positions = [{ id: 'inside', x: 0, z: 0 }, { id: 'outside', x: 9, z: 9 }];
  const buildings = [{ id: 'ruin', x: 0, z: 0, w: 4, d: 4, rotation: 0 }];
  const before = JSON.stringify({ positions, buildings });
  const result = auditHomefrontSavedPositions({ positions, buildings });
  assert.deepEqual(result.hazards.map(v => v.id), ['inside']);
  assert.equal(result.previewOnly, true);
  assert.equal(result.clear, false);
  assert.equal(JSON.stringify({ positions, buildings }), before);
});

test('v2 audit handles rotated buildings, invalid positions and safe margins', () => {
  const buildings = [{ id: 'angled', x: 0, z: 0, w: 6, d: 2, rotation: Math.PI / 4 }];
  const positions = [{ id: 'near', x: 1, z: -1 }, { id: 'far', x: 20, z: 20 }, { id: 'broken', x: NaN, z: 0 }];
  const result = auditHomefrontSavedPositions({ positions, buildings });
  assert.equal(result.hazards.some(h => h.id === 'near' && h.reason === 'building_obstruction'), true);
  assert.equal(result.hazards.some(h => h.id === 'broken' && h.reason === 'invalid_position'), true);
  assert.equal(result.hazards.some(h => h.id === 'far'), false);
  assert.throws(() => auditHomefrontSavedPositions({ positions: [], buildings: [], clearance: -1 }), RangeError);
});
