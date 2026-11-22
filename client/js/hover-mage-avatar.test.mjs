// Hover Mage player model: asset budgets, pure motion model, choice persistence, wiring and CC BY credit.
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
registerHooks({ resolve(specifier, context, next) { if (specifier === 'three') return { url: new URL('../vendor/three/build/three.module.min.js', import.meta.url).href, shortCircuit: true }; return next(specifier, context); } });
const { hoverTarget, HOVER_MAGE_FILES } = await import('./hover-mage-avatar.mjs');
const { getPlayerModel, savePlayerModel, PLAYER_MODELS, DEFAULT_PLAYER_MODEL } = await import('./player-model-choice.mjs');
const here = p => new URL(p, import.meta.url);

// ---- assets: GLB, budgets, one webp texture, no normal map, no rig
function glb(file) {
  const b = readFileSync(here('../assets/players/hover-mage/' + file));
  assert.equal(b.readUInt32LE(0), 0x46546c67, file + ' is GLB');
  const len = b.readUInt32LE(12), json = JSON.parse(b.subarray(20, 20 + len).toString('utf8'));
  return { json, bytes: b.length };
}
const budgets = { near: { tris: 15000, tex: 1024, bytes: 600_000 }, far: { tris: 5000, tex: 512, bytes: 250_000 } };
for (const [k, file] of Object.entries(HOVER_MAGE_FILES)) {
  const { json, bytes } = glb(file), B = budgets[k];
  let tris = 0;
  for (const m of json.meshes) for (const p of m.primitives) tris += json.accessors[p.indices].count / 3;
  assert.ok(tris <= B.tris * 1.02 && tris >= B.tris * .8, `${file}: ${tris} tris near the ${B.tris} budget`);
  assert.ok(bytes <= B.bytes, `${file}: ${bytes} bytes <= ${B.bytes}`);
  assert.equal(json.images.length, 1, file + ': base colour only');
  assert.equal(json.images[0].mimeType, 'image/webp', file + ': webp texture');
  assert.ok(!json.materials[0].normalTexture, file + ': flat source normal map dropped');
  assert.ok(!json.skins && !json.animations?.length, file + ': rigless');
  // webp VP8/VP8L/VP8X header carries the size; just check the encoded image is small enough for the budget
  const view = json.bufferViews[json.images[0].bufferView];
  assert.ok(view.byteLength < B.tex * B.tex * .5, file + ': texture size plausible for ' + B.tex);
}
const lic = readFileSync(here('../assets/players/hover-mage/LICENSE.txt'), 'utf8');
assert.match(lic, /maksfrolov947/); assert.match(lic, /CC-BY-4\.0/);

// ---- motion model
const idle = hoverTarget('Idle', 0), walk = hoverTarget('Walk', 2), run = hoverTarget('Run', 5);
assert.ok(idle.hover > 0 && idle.bobAmp > 0, 'idle floats and bobs');
assert.ok(idle.lean === 0 && walk.lean > 0 && run.lean > walk.lean, 'leans more the faster it moves');
assert.ok(run.trail > walk.trail && walk.trail > idle.trail, 'hem trails more with speed');
assert.ok(run.bobHz > idle.bobHz && run.hover >= idle.hover, 'faster bob and a little higher when moving');
const sit = hoverTarget('Sit', 3), ride = hoverTarget('Ride', 0);
assert.ok(sit.hover < 0 && ride.hover < 0 && sit.lean <= 0 && sit.trail === 0, 'seated sinks into the seat, no lean or trail');
assert.equal(hoverTarget('Air', 0).bobAmp, 0, 'no bob in the air');
assert.equal(hoverTarget('Walk', NaN).lean, 0, 'NaN speed is safe');

// ---- choice persistence
const mem = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) }; };
const st = mem();
assert.equal(getPlayerModel('', st), DEFAULT_PLAYER_MODEL);
assert.ok(savePlayerModel('hover-mage', st)); assert.equal(getPlayerModel('', st), 'hover-mage');
assert.equal(savePlayerModel('nope', st), false); assert.equal(getPlayerModel('', st), 'hover-mage');
assert.equal(getPlayerModel('?playermodel=gas-mask-guy', st), 'gas-mask-guy', 'query overrides');
assert.equal(getPlayerModel('?playermodel=evil', mem()), DEFAULT_PLAYER_MODEL);
assert.deepEqual(PLAYER_MODELS.map(m => m.id), ['gas-mask-guy', 'hover-mage']);

// ---- wiring: default stays Gas Mask Guy; local player opts in; remote peers untouched
const read = p => readFileSync(here(p), 'utf8');
const walker = read('./walker.js'), dpa = read('./default-player-avatar.mjs'), app = read('./app.js'), html = read('../index.html');
assert.match(dpa, /model = 'gas-mask-guy'/, 'default model stays Gas Mask Guy');
assert.match(dpa, /model === 'hover-mage' && variant === 'thirdPerson'\) return mountHoverMage/);
assert.match(walker, /export function setWalkerModel/);
assert.match(app, /buildPlayerWalker\(\{[^}]*model:getPlayerModel\(\)/, 'local city avatar reads the choice');
assert.match(app, /setWalkerModel\(avatar,e\.target\.value\)/);
assert.match(html, /id="playerModel"/);
assert.doesNotMatch(read('./city.js'), /getPlayerModel/, 'remote peers keep the default body');
const sw = read('../sw.js');
assert.match(sw, /'js\/hover-mage-avatar\.mjs'/); assert.match(sw, /'js\/player-model-choice\.mjs'/);

// ---- every module this feature touches still parses as an ES module (`node --check file.js` treats these as CommonJS and misses breakage)
for (const f of ['./app.js', './city.js', './walker.js', './default-player-avatar.mjs', './hover-mage-avatar.mjs', './player-model-choice.mjs']) {
  const r = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: read(f), encoding: 'utf8' });
  assert.equal(r.status, 0, f + ' parses as a module: ' + (r.stderr || '').split('\n').slice(0, 6).join(' '));
}

// ---- CC BY credit
const credits = read('../city-credits.html');
assert.match(credits, /dark-hooded-robe-2763a5cc223b48ecb2745b7e2067f00b/);
assert.match(credits, /sketchfab\.com\/maksfrolov947/);
assert.match(credits, /id="hover-mage"[\s\S]*creativecommons\.org\/licenses\/by\/4\.0/);
console.log('hover mage: ok', Object.values(HOVER_MAGE_FILES).map(f => `${f} ${statSync(here('../assets/players/hover-mage/' + f)).size} B`).join(', '));
