// Homefront yard jetpack: take-off, hover/glide, ceiling, fuel drain + refuel, landing, off = walking; page hooks.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stepYardJet, YARD_JET } from './homefront-jetpack.mjs';
import { JETPACK } from '../js/player-motion.mjs';
const dt = 1 / 60, run = (j, m, v, secs, input, floor = 0) => { for (let t = 0; t < secs; t += dt) stepYardJet(j, m, v, dt, floor, input); };
let j = { on: false, fuel: 1 }, m = { y: 0, vy: 0, onGround: true }, v = { x: 0, z: 0 };
run(j, m, v, 1, { up: true, mx: 1 }); assert.equal(m.y, 0, 'jet off → no flight'); assert.equal(j.flying, false);
j.on = true; run(j, m, v, 1.5, { up: true, mx: 1 });
assert.ok(m.y > 1 && j.flying, 'takes off while thrust is held'); assert.ok(v.x > 0 && v.x <= JETPACK.cruise * YARD_JET.scale + 1e-9, 'steers at yard-scaled cruise');
assert.ok(j.fuel < 1 && j.fuel > 0.7, 'thrust drains fuel');
run(j, m, v, 3, { up: true }); assert.ok(m.y <= YARD_JET.ceiling + 1e-9 && m.y > YARD_JET.ceiling - 0.01, 'yard ceiling');
run(j, m, v, 4, { up: true }); assert.equal(j.fuel, 0, 'tank runs dry after ~6 s of thrust');
const hiY = m.y; run(j, m, v, 0.5, { up: true }); assert.ok(m.y < hiY, 'no fuel → glides down even with thrust held');
run(j, m, v, 10, {}); assert.equal(m.y, 0); assert.equal(m.onGround, true); assert.equal(j.flying, false, 'lands');
run(j, m, v, 2.5, {}); assert.ok(j.fuel > 0.99, 'refuels on the ground (0.5 tank/s)');
// Landing on a gun-platform deck height floor.
m = { y: 3.5, vy: 0, onGround: false }; j = { on: true, fuel: 0.5 }; run(j, m, v, 6, {}, 2.4); assert.equal(m.y, 2.4, 'lands on the deck floor');
const html = fs.readFileSync(new URL('./homefront.html', import.meta.url), 'utf8');
assert.ok(html.includes("import { createYardJetpack } from './homefront-jetpack.mjs'"));
assert.ok(html.includes('const jv=!constructionView&&yardJet?yardJet.step('), 'jet is off while building');
assert.ok(html.includes('yardJet?.setHidden(constructionView)'), 'JET control hidden in build mode');
assert.ok(html.includes("yardJet?.setOwned(!visiting&&!!st?.owned?.homefront)"), 'ownership from the server, never while visiting');
assert.ok(/cameraPose\(\{mode:yardView\.mode,building:constructionView,/.test(html), 'camera: overhead only in build mode (jet does not change the pose)');
const mod = fs.readFileSync(new URL('./homefront-jetpack.mjs', import.meta.url), 'utf8');
assert.ok(/bottom:144px;width:58px;height:58px/.test(mod), 'JET button stacks above RUN (bottom 78 + 58) — no overlap with the joystick or RUN/JUMP');
console.log('Homefront jetpack tests passed (flight, ceiling, fuel, glide, landing, build-mode off, camera rule, iPhone control).');
