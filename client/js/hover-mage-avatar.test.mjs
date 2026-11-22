// Hover Mage player model: asset budgets, pure motion model, choice persistence, wiring and CC BY credit.
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
registerHooks({ resolve(specifier, context, next) { if (specifier === 'three') return { url: new URL('../vendor/three/build/three.module.min.js', import.meta.url).href, shortCircuit: true }; return next(specifier, context); } });
const { hoverTarget, HOVER_MAGE_FILES } = await import('./hover-mage-avatar.mjs');
const { getPlayerModel, savePlayerModel, PLAYER_MODELS, DEFAULT_PLAYER_MODEL, modelToWire, modelFromWire, playerModelOr } = await import('./player-model-choice.mjs');
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
assert.equal(DEFAULT_PLAYER_MODEL, 'hover-mage', 'the Hover Mage is the default body');
assert.equal(getPlayerModel('', st), 'hover-mage', 'new / unset players get the mage');
{ const g = mem(); savePlayerModel('gas-mask-guy', g); assert.equal(getPlayerModel('', g), 'gas-mask-guy', 'a saved Gas Mask Guy choice is kept'); }
assert.equal(modelToWire('gas-mask-guy'), 'g'); assert.equal(modelToWire('hover-mage'), 'm');
assert.equal(modelFromWire('g'), 'gas-mask-guy'); for (const x of ['m', undefined, null, 'x', 1]) assert.equal(modelFromWire(x), 'hover-mage', 'absent/junk wire id -> mage');
assert.equal(playerModelOr(undefined), 'hover-mage'); assert.equal(playerModelOr('gas-mask-guy'), 'gas-mask-guy');
assert.ok(savePlayerModel('hover-mage', st)); assert.equal(getPlayerModel('', st), 'hover-mage');
assert.equal(savePlayerModel('nope', st), false); assert.equal(getPlayerModel('', st), 'hover-mage');
assert.equal(getPlayerModel('?playermodel=gas-mask-guy', st), 'gas-mask-guy', 'query overrides');
assert.equal(getPlayerModel('?playermodel=evil', mem()), DEFAULT_PLAYER_MODEL);
assert.deepEqual(PLAYER_MODELS.map(m => m.id), ['hover-mage', 'gas-mask-guy']);

// ---- wiring: the mage is the walker default; presence carries the choice; first-person stays Gas Mask Guy
const read = p => readFileSync(here(p), 'utf8');
const walker = read('./walker.js'), dpa = read('./default-player-avatar.mjs'), app = read('./app.js'), html = read('../index.html');
assert.match(dpa, /model = 'gas-mask-guy'/, 'mountDefaultPlayerAvatar itself keeps Gas Mask Guy for first-person / seated callers');
assert.match(walker, /const model = playerModelOr\(options\?\.model\)/, 'buildPlayerWalker defaults to the mage');
assert.match(dpa, /model === 'hover-mage' && variant === 'thirdPerson'\) return mountHoverMage/);
assert.match(walker, /export function setWalkerModel/);
assert.match(app, /buildPlayerWalker\(\{[^}]*model:getPlayerModel\(\)/, 'local city avatar reads the choice');
assert.match(app, /setWalkerModel\(avatar,e\.target\.value\)/);
assert.match(html, /id="playerModel"/);
{ const city = read('./city.js');
  assert.match(city, /pm=modelToWire\(getPlayerModel\(\)\)/, 'presence sends my model');
  assert.match(city, /,md,j:jt,pm\}\)/, 'pm rides the existing p message (no new traffic)');
  assert.match(city, /\[id,name,guest,x,y,z,r,b,k,md,j,fs,fl,bt,pm\] of m\.p/, 'snapshot index 14 = pm');
  assert.match(city, /model:p\.pm\}\)/, 'remote walkers build with their model');
  assert.match(city, /setWalkerModel\(p\.wk,p\.pm\)/, 'and swap when it changes'); }
{ const srv = read('../../server/city.js');
  assert.match(srv, /c\.pm = m\.pm === 'g' \? 'g' : 'm'/); assert.match(srv, /c\.bt \|\| 'skiff', c\.pm \|\| 'm'\]/); }
assert.match(read('../../server/server.js'), /searchParams\.get\('pm'\) === 'g'\) look\.pm = 'g'/, 'arena join look.pm');
assert.match(read('../arena/index.html'), /'&pm=g'/); assert.match(read('../arena/index.html'), /modelFromWire\(net\?\.roster\.get\(id\)\?\.look\?\.pm\)/);
assert.match(read('../arena/fx.js'), /model: pm \}\)/, 'Zombies remote players mount their model');
assert.match(read('../arena/homefront.html'), /model:getPlayerModel\(\)/, 'Homefront refuge walker uses the choice');
assert.match(read('../arena/homefront-graveyard-3d.js'), /model: isLocalPlayer \? getPlayerModel\(\) : undefined/, 'Graveyard local = choice, others = default');
assert.match(read('./nft-avatar-placeholder.js'), /model:'gas-mask-guy'/, 'NFT placeholder keeps Gas Mask Guy textures');
assert.doesNotMatch(read('../arena/fpbody.js'), /hover-mage/, 'first-person Zombies body stays Gas Mask Guy');
// boots tucked into the robe (#687 gap): no vertex below boot height inside the toe ellipses
{ const { BOOTS } = await import('../../scripts/hover-mage/tuck-boots.mjs');
  for (const file of Object.values(HOVER_MAGE_FILES)) {
    const buf = readFileSync(here('../assets/players/hover-mage/' + file)), jl = buf.readUInt32LE(12), json = JSON.parse(buf.subarray(20, 20 + jl).toString('utf8'));
    const bin = buf.subarray(20 + jl + 8), node = json.nodes.find(n => n.mesh !== undefined), T = node.translation || [0, 0, 0], S = node.scale || [1, 1, 1];
    const acc = json.accessors[json.meshes[node.mesh].primitives[0].attributes.POSITION], bv = json.bufferViews[acc.bufferView];
    assert.equal(acc.componentType, 5122, file + ': int16 positions'); assert.ok(acc.normalized);
    const stride = bv.byteStride || 6, off = (bv.byteOffset || 0) + (acc.byteOffset || 0); let inBoot = 0;
    for (let i = 0; i < acc.count; i++) {
      const q = k => Math.max(-1, bin.readInt16LE(off + i * stride + k * 2) / 32767), x = q(0) * S[0] + T[0], y = q(1) * S[1] + T[1], z = q(2) * S[2] + T[2];
      for (const [cx, cz, rx, rz, ymax] of BOOTS) if (y < ymax && ((x - cx) / rx) ** 2 + ((z - cz) / rz) ** 2 < 1) inBoot++;
    }
    assert.equal(inBoot, 0, file + ': boots tucked up inside the robe (scripts/hover-mage/tuck-boots.mjs)');
  } }
const sw = read('../sw.js');
assert.match(sw, /'js\/hover-mage-avatar\.mjs'/); assert.match(sw, /'js\/player-model-choice\.mjs'/);

// ---- every module this feature touches still parses as an ES module (`node --check file.js` treats these as CommonJS and misses breakage)
for (const f of ['./app.js', './city.js', './walker.js', './default-player-avatar.mjs', './hover-mage-avatar.mjs', './player-model-choice.mjs', '../arena/fx.js', '../arena/homefront-graveyard-3d.js', './nft-avatar-placeholder.js']) {
  const r = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: read(f), encoding: 'utf8' });
  assert.equal(r.status, 0, f + ' parses as a module: ' + (r.stderr || '').split('\n').slice(0, 6).join(' '));
}

// ---- CC BY credit
const credits = read('../city-credits.html');
assert.match(credits, /dark-hooded-robe-2763a5cc223b48ecb2745b7e2067f00b/);
assert.match(credits, /sketchfab\.com\/maksfrolov947/);
assert.match(credits, /id="hover-mage"[\s\S]*creativecommons\.org\/licenses\/by\/4\.0/);
console.log('hover mage: ok', Object.values(HOVER_MAGE_FILES).map(f => `${f} ${statSync(here('../assets/players/hover-mage/' + f)).size} B`).join(', '));
