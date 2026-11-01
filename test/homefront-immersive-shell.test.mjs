// Source-level regression guard for Homefront immersive game shell.
// Execute: node --test test/homefront-immersive-shell.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../client/arena/homefront.html', import.meta.url), 'utf8');
const scene = readFileSync(new URL('../client/arena/homefront-graveyard-3d.js', import.meta.url), 'utf8');

test('immersive game shell fills available viewport without removing classic fallback', () => {
  assert.match(html, /body\.rpg-hud\.rpg-mode-expedition #graveyardPanel #graveyard3d\{position:absolute!important;inset:0!important;width:100%!important;height:100%!important/);
  assert.match(html, /get\('classic'\)==='1'\?null:createHud/);
});
test('continuous movement is preferred but requires server handshake', () => {
  assert.match(scene, /movementParams\.get\('movement'\) !== 'legacy'/);
  assert.match(scene, /continuousInput\.sync\(data\.inputProtocol, data\.self/);
  assert.match(scene, /if \(continuousInput\.enabled\) return false/);
});
test('empty ground cannot issue click-to-move in immersive mode', () => {
  assert.match(scene, /if \(wantsContinuous\) return;\s*if \(worldData\.party && !worldData\.party\.leader\) return;\s*const hits = raycaster\.intersectObject\(groundHit, false\)/);
});
test('fullscreen renderer accepts actual host height', () => {
  assert.match(scene, /Math\.max\(1, host\.clientHeight\)/);
});

test('unsupported movement is surfaced in the game view rather than silently returning to point-and-click', () => {
  assert.match(scene, /movementNotice\.setAttribute\('role', 'status'\)/);
  assert.match(scene, /setMovementAvailability\(continuousInput\.enabled, data\.inputProtocol\?\.enabled/);
  assert.match(scene, /setMovementAvailability\(false, reason\)/);
});

test('inventory and modal overlays block avatar movement and jumping', () => {
  const view = readFileSync(new URL('../client/arena/homefront-view.mjs', import.meta.url), 'utf8');
  assert.match(view, /const menuOpen = \(\) =>/);
  assert.match(view, /state\.move = \(\) => \{ if \(menuOpen\(\)\) return \{ x: 0, y: 0 \}/);
  assert.match(view, /state\.running = \(\) => !menuOpen\(\)/);
  assert.match(view, /state\.takeJump = \(\) => \{ const j = !menuOpen\(\)/);
});
