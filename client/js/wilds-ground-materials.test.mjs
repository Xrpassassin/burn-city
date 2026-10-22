import assert from 'node:assert/strict';
import { drawGroundTexture } from './wilds-ground-materials.mjs';

function mockContext() {
  const calls = [];
  return { calls, set fillStyle(v) { this._fillStyle = v; }, get fillStyle() { return this._fillStyle; },
    fillRect(...args) { calls.push({ color: this.fillStyle, args }); } };
}
const a = mockContext();
const result = drawGroundTexture(a, 64, 64, 'natural', () => 0.4);
assert.equal(result.variant, 'natural');
assert.ok(result.flecks > 0);
assert.equal(a.calls.length, result.flecks + 1);
assert.equal(a.calls[0].color, '#52603a');
assert.ok(a.calls.slice(1).some(c => c.color === '#6b5638'));
const b = mockContext();
assert.equal(drawGroundTexture(b, 64, 64, 'legacy', () => 0.5).variant, 'legacy');
assert.equal(b.calls[0].color, '#c8c8c8');
assert.match(b.calls[1].color, /^rgb\(/);
assert.equal(drawGroundTexture(mockContext(), 32, 32, 'unknown', () => 0.2).variant, 'natural');
assert.throws(() => drawGroundTexture(null, 1, 1), /context/);
console.log('wilds-ground-materials: all tests passed');
