import assert from 'node:assert/strict';
import { VIEW_KEY, readViewMode, writeViewMode, nextViewMode, cameraPose, worldMove, walkingCameraHeading, directSprintRequested, releaseMovementControls } from './homefront-view.mjs';

const mem = new Map(); const storage = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)) };
assert.equal(readViewMode(storage), 'third', 'third-person is the default view');
assert.equal(writeViewMode('first', storage), 'first'); assert.equal(mem.get(VIEW_KEY), 'first');
assert.equal(readViewMode(storage), 'first', 'the chosen view is remembered');
assert.equal(writeViewMode('topdown', storage), 'third', 'unknown modes (e.g. a top-down exploration view) are not storable');
assert.equal(nextViewMode('third'), 'first'); assert.equal(nextViewMode('first'), 'third');

const at = { x: 4, y: 1, z: -3, heading: 0.7, pitch: 0.1, distance: 6 };
for (const mode of ['third', 'first']) {
  const p = cameraPose({ ...at, mode });
  assert.equal(p.kind, mode);
  const horiz = Math.hypot(p.lx - p.px, p.lz - p.pz), drop = p.py - p.ly;
  assert.ok(horiz > Math.abs(drop) * 1.2, mode + ' view never looks steeply down (not a bird’s-eye view)');
}
const fp = cameraPose({ ...at, mode: 'first' });
assert.ok(Math.abs(fp.py - (at.y + 1.62)) < 1e-9 && Math.hypot(fp.px - at.x, fp.pz - at.z) < 0.2, 'first-person camera sits at eye height on the character');
const tp = cameraPose({ ...at, mode: 'third' });
assert.ok(Math.hypot(tp.px - at.x, tp.pz - at.z) > 3, 'third-person camera sits behind the character');
const build = cameraPose({ ...at, mode: 'first', building: true });
assert.equal(build.kind, 'construction', 'building overrides either walking view');
assert.ok(build.py - build.ly > 20 && Math.hypot(build.lx - build.px, build.lz - build.pz) < 0.1, 'construction is the only straight-down view');

assert.equal(worldMove({ x: 0, y: 0.05 }, 0), null, 'small stick noise is ignored');
const fwd = worldMove({ x: 0, y: 1 }, 0); assert.ok(Math.abs(fwd.x) < 1e-9 && Math.abs(fwd.z - 1) < 1e-9, 'forward follows the camera heading');
const right = worldMove({ x: 1, y: 0 }, 0); assert.ok(Math.abs(Math.hypot(right.x, right.z) - 1) < 1e-9 && Math.abs(right.z) < 1e-9, 'strafe is perpendicular to heading');
const diag = worldMove({ x: 1, y: 1 }, 1.2); assert.ok(Math.abs(Math.hypot(diag.x, diag.z) - 1) < 1e-9, 'diagonal input is normalized');

const directA = walkingCameraHeading(0.35, 0.7, -0.1, true);
const directB = walkingCameraHeading(2.8, 0.7, -0.1, true);
assert.equal(directA, directB, 'direct walk heading remains stable while the avatar turns');
assert.equal(walkingCameraHeading(0.35, 0.7, -0.1, false), 0.35 + 0.7 - 0.1,
  'existing legacy camera movement stays actor-relative');
assert.equal(directSprintRequested(false, true, false), true, 'Shift/RUN triggers direct sprint');
assert.equal(directSprintRequested(true, false, false), true, 'existing sprint toggle triggers direct sprint');
assert.equal(directSprintRequested(true, true, true), false, 'aiming prevents direct sprint');
assert.equal(directSprintRequested(false, false, false), false);
const heldControls = { keys: { x: 1, y: 1 }, joy: { x: -0.5, y: 0.8 }, runKey: true, runTouch: true };
releaseMovementControls(heldControls);
assert.deepEqual(heldControls, { keys: { x: 0, y: 0 }, joy: { x: 0, y: 0 }, runKey: false, runTouch: false },
  'blur and hidden-tab resets clear keyboard, touch joystick and both run modes');

console.log('Homefront view (first/third-person, construction-only overhead) tests passed.');
