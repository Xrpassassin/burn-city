// Guard: three.js bakes the scene's light count into every lit shader. A PointLight added after the city's first
// frames recompiles every lit material at once (a 15-20 s main-thread freeze under SwiftShader, which broke the
// ui-v8 desktop smoke, and a visible hitch on real GPUs). Late props must borrow window.__city.lightSlots.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = f => readFileSync(new URL(f, import.meta.url), 'utf8');
const app = read('./app.js'), barge = read('./pirate-party-barge.mjs'), props = read('./cityprops.mjs');
const slots = app.match(/const lightSlots=\(MOBILE\|\|TIER==='low'\)\?\[\]:\[0,1\]\.map\(/);
assert.ok(slots, 'app.js reserves two PointLight slots on desktop tiers');
assert.ok(slots.index < app.indexOf('function frame('), 'light slots are added before the render loop starts');
assert.match(app, /window\.__city\.lightSlots=lightSlots/, 'app.js exposes the slots');
assert.match(props, /lightSlots: c\.lightSlots/, 'cityprops hands the slots to the barge');
const body = barge.slice(barge.indexOf('export function createPiratePartyBarge('));
assert.doesNotMatch(body, /new THREE\.PointLight\(/, 'the barge borrows slots instead of adding lights');
assert.equal((body.match(/partyLight\(lightSlots,/g) || []).length, 2, 'both barge lights come from slots');
// Software WebGL (SwiftShader/llvmpipe) never auto-picks the 'high' tier: at 1.75x pixel ratio it ran well under 1 fps.
assert.match(app, /const softGL=\(\)=>\{[^\n]*swiftshader\|llvmpipe/, 'app.js detects software WebGL');
assert.match(app, /return\(cores<=2\|\|mem<=2\|\|softGL\(\)\)\?'medium':'high'/, 'software WebGL caps the desktop auto tier at medium');
console.log('light-slots ok');
