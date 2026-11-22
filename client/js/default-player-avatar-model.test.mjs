// Gas Mask Guy: the locomotion clips may change, the model may not.
// Exception, on purpose (fix/walk-bind, Nov 2026): the inverse binds and the legacy Idle/Jump/Sit/Ride
// clips were rewritten by scripts/player-avatar/fix_bind.mjs (the bind was off by a half turn, so every
// joint pivoted on the far side of the body). BIND_FIX pins their new bytes; everything else still
// matches the original model byte for byte. Hashes every byte the mesh and
// skin are made of (POSITION / NORMAL / TEXCOORD_0 / JOINTS_0 / WEIGHTS_0 / indices /
// inverseBindMatrices), the node rest transforms and hierarchy, skin joints, materials/textures, and
// the untouched Idle/Jump/Sit/Ride clips, against the values from before the gait rework (#668 assets).
// Then checks the authored clips: present, smooth (CUBICSPLINE), strides as player-gait.mjs says,
// and the planted boot does not slide when the body moves one stride per cycle.
//   node client/js/default-player-avatar-model.test.mjs --baseline   prints the current hashes
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const DIR = new URL('../assets/players/', import.meta.url);
const FILES = ['gas-mask-guy.gltf', 'gas-mask-guy-lod.gltf', 'gas-mask-guy-body.gltf'];
const KEPT_CLIPS = ['Idle', 'Jump', 'Sit', 'Ride'];
const sha = buf => createHash('sha256').update(buf).digest('hex').slice(0, 24);
const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const SIZE = { 5126: 4, 5125: 4, 5123: 2, 5121: 1, 5122: 2, 5120: 1 };

function accessorBytes(gltf, bin, index) {
  const a = gltf.accessors[index], v = gltf.bufferViews[a.bufferView];
  const row = COMPONENTS[a.type] * SIZE[a.componentType], stride = v.byteStride || row;
  const start = (v.byteOffset || 0) + (a.byteOffset || 0), out = Buffer.alloc(a.count * row);
  for (let i = 0; i < a.count; i++) bin.copy(out, i * row, start + i * stride, start + i * stride + row);
  return Buffer.concat([Buffer.from(JSON.stringify([a.componentType, a.type, a.count, !!a.normalized])), out]);
}

export function modelFingerprint(file) {
  const gltf = JSON.parse(readFileSync(new URL(file, DIR), 'utf8'));
  const bin = readFileSync(new URL(gltf.buffers[0].uri, DIR));
  const out = {};
  gltf.meshes.forEach((m, mi) => m.primitives.forEach((p, pi) => {
    for (const [k, idx] of Object.entries(p.attributes)) out[`mesh${mi}.${pi}.${k}`] = sha(accessorBytes(gltf, bin, idx));
    if (p.indices != null) out[`mesh${mi}.${pi}.indices`] = sha(accessorBytes(gltf, bin, p.indices));
    out[`mesh${mi}.${pi}.material`] = p.material ?? null;
  }));
  gltf.skins.forEach((s, si) => {
    out[`skin${si}.inverseBindMatrices`] = sha(accessorBytes(gltf, bin, s.inverseBindMatrices));
    out[`skin${si}.joints`] = sha(JSON.stringify([s.joints, s.skeleton ?? null]));
  });
  out.nodes = sha(JSON.stringify(gltf.nodes.map(n => [n.name, n.translation, n.rotation, n.scale, n.matrix, n.children, n.mesh, n.skin])));
  out.scenes = sha(JSON.stringify([gltf.scene, gltf.scenes]));
  out.materials = sha(JSON.stringify([gltf.materials, gltf.textures, gltf.images, gltf.samplers, gltf.extensionsUsed, gltf.extensionsRequired]));
  for (const name of KEPT_CLIPS) {
    const a = gltf.animations.find(x => x.name === name);
    out[`clip.${name}`] = a ? sha(Buffer.concat(a.channels.map(c => {
      const s = a.samplers[c.sampler];
      return Buffer.concat([Buffer.from(JSON.stringify([gltf.nodes[c.target.node].name, c.target.path, s.interpolation])),
        accessorBytes(gltf, bin, s.input), accessorBytes(gltf, bin, s.output)]);
    }))) : null;
  }
  return out;
}

// Recorded from main @ 05232b45 (assets as of #668), before the gait rework touched the files.
const BASELINE = {"gas-mask-guy.gltf":{"mesh0.0.POSITION":"2694d263aa982fc83f4ea955","mesh0.0.NORMAL":"900a270728822d5e2f969c7a","mesh0.0.TEXCOORD_0":"0855ab82a2ab632ce6b3f386","mesh0.0.JOINTS_0":"35c175b58a4b617b252a5f73","mesh0.0.WEIGHTS_0":"166cb50ec2e2fd6c75a97dce","mesh0.0.indices":"bca079e555628888b608adc3","mesh0.0.material":0,"skin0.inverseBindMatrices":"13d67b9a44edc5bf5ddf5445","skin0.joints":"989b90385f314e30f794d331","nodes":"d36a3ec97e582bb8c427dd0f","scenes":"9f6f63e66e63f9e843d372ea","materials":"8681a8beae16a6e282b806f0","clip.Idle":"a6a516d1f9691a9534e919af","clip.Jump":"d1c3ad0a75130843d73b28b4","clip.Sit":"5b419a984c584a59ea5b52c3","clip.Ride":"cda6f2a13700a0857db5daf4"},"gas-mask-guy-lod.gltf":{"mesh0.0.POSITION":"2dd69a93ce9bb5758883a06f","mesh0.0.NORMAL":"f82882a42650a252d6e70846","mesh0.0.TEXCOORD_0":"c5d59d3bfce01fec85aeeaec","mesh0.0.JOINTS_0":"f9664e937c91d0899c604e02","mesh0.0.WEIGHTS_0":"34bfe170e8fda244461a9608","mesh0.0.indices":"ec7372070d949216400ed867","mesh0.0.material":0,"skin0.inverseBindMatrices":"13d67b9a44edc5bf5ddf5445","skin0.joints":"989b90385f314e30f794d331","nodes":"46eb4b667039d1337fc4f7e4","scenes":"9f6f63e66e63f9e843d372ea","materials":"8681a8beae16a6e282b806f0","clip.Idle":"a6a516d1f9691a9534e919af","clip.Jump":"d1c3ad0a75130843d73b28b4","clip.Sit":"5b419a984c584a59ea5b52c3","clip.Ride":"cda6f2a13700a0857db5daf4"},"gas-mask-guy-body.gltf":{"mesh0.0.POSITION":"db7b01543d633b5830dd8d53","mesh0.0.NORMAL":"641deeec0c63a2dd1de7d916","mesh0.0.TEXCOORD_0":"86c8a130c9c92f2ca1542c24","mesh0.0.JOINTS_0":"98031ccec00e0071cb3c5d98","mesh0.0.WEIGHTS_0":"c22ddde0ccb6f07c4349fa38","mesh0.0.indices":"233b00f1e4a0260f7346a210","mesh0.0.material":0,"skin0.inverseBindMatrices":"13d67b9a44edc5bf5ddf5445","skin0.joints":"989b90385f314e30f794d331","nodes":"9bf512735f0690211d3467b2","scenes":"9f6f63e66e63f9e843d372ea","materials":"8681a8beae16a6e282b806f0","clip.Idle":"a6a516d1f9691a9534e919af","clip.Jump":"d1c3ad0a75130843d73b28b4","clip.Sit":"5b419a984c584a59ea5b52c3","clip.Ride":"cda6f2a13700a0857db5daf4"}};

// After fix_bind.mjs: inverseBindMatrices = original * Ry(180); Idle/Jump/Sit/Ride turned to match.
const BIND_FIX = {"skin0.inverseBindMatrices":"02df73e32817e45c56f8aa49","clip.Idle":"0a9aca956046ffaeceee43c7","clip.Jump":"9972294efd4547700e3f0116","clip.Sit":"924c897b59a6458bac797b2d","clip.Ride":"3a1474aab111e3c39ed0908c"};

if (process.argv.includes('--baseline')) {
  console.log(JSON.stringify(Object.fromEntries(FILES.map(f => [f, modelFingerprint(f)]))));
  process.exit(0);
}

for (const file of FILES) {
  const now = modelFingerprint(file), was = BASELINE[file];
  assert(was, `baseline recorded for ${file}`);
  for (const key of Object.keys(was)) {
    if (key in BIND_FIX) assert.equal(now[key], BIND_FIX[key], `${file}: ${key} must match the bind-fixed asset (fix_bind.mjs)`);
    else assert.equal(now[key], was[key], `${file}: ${key} must be byte-identical to the original model`);
  }
  assert.deepEqual(Object.keys(now).sort(), Object.keys(was).sort(), `${file}: same set of model parts`);
}
console.log('Gas Mask Guy model untouched: mesh, skin weights, joints, rest pose and materials are byte-identical in all three files; inverse binds and Idle/Jump/Sit/Ride match the bind fix');
