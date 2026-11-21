import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const skiffUrl = new URL('../assets/props/fisher-boat.gltf', import.meta.url);
let skiffSource;

function makeHull({ width, length, rail, chine }) {
  const shape = new THREE.Shape();
  shape.moveTo(0, -length * .54);
  shape.bezierCurveTo(width * .56, -length * .45, width * .54, -length * .18, width * .5, 0);
  shape.lineTo(width * chine, length * .46);
  shape.quadraticCurveTo(width * chine * .99, length * .49, width * chine * .88, length * .49);
  shape.lineTo(-width * chine * .88, length * .49);
  shape.quadraticCurveTo(-width * chine * .99, length * .49, -width * chine, length * .46);
  shape.lineTo(-width * .5, 0);
  shape.bezierCurveTo(-width * .54, -length * .18, -width * .56, -length * .45, 0, -length * .54);
  // A wide sheet at the gunwale tapers down to a narrow keel below the waterline.
  const profile = shape.getPoints(7).slice(0, -1);
  const vertices = [];
  const rings = [[1, rail], [.96, rail - .16], [.8, .04], [.53, -.24]];
  for (const [scale, y] of rings) {
    for (const p of profile) vertices.push(p.x * scale, y, p.y * scale);
  }
  const indices = [];
  const count = profile.length;
  for (let layer = 0; layer < rings.length - 1; layer++) {
    for (let i = 0; i < count; i++) {
      const a = layer * count + i, b = layer * count + (i + 1) % count;
      indices.push(a, b, a + count, b, b + count, a + count);
    }
  }
  const hull = new THREE.BufferGeometry();
  hull.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  hull.setIndex(indices);
  hull.computeVertexNormals();
  const deck = new THREE.ShapeGeometry(shape, 7).rotateX(Math.PI / 2);
  deck.scale(.97, 1, .98);
  deck.translate(0, rail - .06, 0);
  // The shape is mapped straight to X/Z, so reverse its downward-facing normals.
  const winding = deck.index.array;
  for (let i = 0; i < winding.length; i += 3) {
    [winding[i + 1], winding[i + 2]] = [winding[i + 2], winding[i + 1]];
  }
  deck.computeVertexNormals();
  return { hull, deck };
}

const profiles = {
  skiff: { width: 1.52, length: 4.2, rail: .49, chine: .38 },
  bass: { width: 2.12, length: 5.35, rail: .62, chine: .49 },
  offshore: { width: 2.52, length: 6.35, rail: .72, chine: .42 },
  abyss: { width: 2.9, length: 7.25, rail: .82, chine: .48 }
};

function buildMotorboat(spec) {
  const { id, color } = spec;
  const { hull, deck } = makeHull(profiles[id]);
  const parts = new Map();
  const add = (paint, geometry) => {
    if (!parts.has(paint)) parts.set(paint, []);
    parts.get(paint).push(geometry);
  };
  const box = (paint, x, y, z, w, h, l) => add(paint, new THREE.BoxGeometry(w, h, l).translate(x, y, z));
  const strut = (paint, start, end, radius) => {
    const a = new THREE.Vector3(...start), b = new THREE.Vector3(...end), delta = b.clone().sub(a);
    const geometry = new THREE.CylinderGeometry(radius, radius, delta.length(), 6);
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()));
    add(paint, geometry.translate(...a.lerp(b, .5)));
  };
  const paint = 0xdce8ec, hardware = 0x242d38, glass = 0x28516b;
  add(color, hull);
  add(id === 'skiff' ? 0x9c6e43 : 0x9aa7ab, deck);
  const motor = (x, z) => {
    box(hardware, x, .48, z, .42, .77, .35);
    box(paint, x, .94, z, .5, .33, .52);
  };

  if (id === 'skiff') {
    box(0x98683e, 0, .56, .6, 1.23, .11, .27);
    box(0x98683e, 0, .56, -.74, 1.16, .11, .27);
    motor(0, 2.08);
  } else if (id === 'bass') {
    box(hardware, 0, .66, -1.5, 1.29, .18, 1.08);
    box(color, .6, .83, -.58, .6, .49, .48);
    box(glass, .6, 1.1, -.72, .53, .2, .13);
    box(paint, 0, .73, 1.7, 1.7, .22, .75);
    motor(0, 2.67);
  } else {
    const jumbo = id === 'abyss';
    const half = jumbo ? 1.05 : .82, roofY = jumbo ? 2.35 : 2.07;
    const beam = jumbo ? 2.1 : 1.65;
    box(paint, 0, .91, -1.29, beam, .57, 1.42);
    box(glass, 0, 1.46, -1.65, beam * .9, .57, .12);
    for (const sign of [-1, 1]) {
      const x = sign * half;
      strut(paint, [x, 1.1, -1.72], [x, roofY, -1.51], .045);
      strut(paint, [x, .72, .38], [x, roofY, -.49], .052);
      strut(paint, [x, .98, .64], [x, .98, jumbo ? 2.8 : 2.44], .038);
      strut(paint, [x, .72, 1.8], [x, .98, 1.8], .037);
    }
    box(jumbo ? color : paint, 0, roofY, -1.03, beam + .28, .14, jumbo ? 1.86 : 1.56);
    strut(hardware, [0, roofY, -1.15], [0, roofY + .77, -1.15], .045);
    box(paint, 0, roofY + .46, -1.15, jumbo ? .9 : .49, .14, .28);
    if (jumbo) {
      box(hardware, 0, .98, 2.15, .92, .28, .73);
      box(color, 0, 1.16, 2.15, .95, .08, .75);
      motor(-.56, 3.49);
      motor(.56, 3.49);
    } else {
      box(paint, 0, .86, 1.82, .86, .28, .49);
      motor(0, 3.04);
    }
  }

  const group = new THREE.Group();
  for (const [materialColor, geometries] of parts) {
    const flat = geometries.map(source => {
      const geometry = source.index ? source.toNonIndexed() : source;
      geometry.deleteAttribute('uv');
      return geometry;
    });
    const geometry = mergeGeometries(flat);
    for (const source of new Set([...flat, ...geometries])) source.dispose();
    group.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
      color: materialColor, roughness: .78, metalness: .12
    })));
  }
  return group;
}

function disposeMotorboat(model) {
  model.traverse(object => {
    if (!object.isMesh) return;
    object.geometry.dispose();
    object.material.dispose();
  });
}

export function createFishingBoat(spec) {
  const root = new THREE.Group();
  const fallback = buildMotorboat(spec);
  root.add(fallback);
  if (spec.id === 'skiff') {
    skiffSource ??= new GLTFLoader().loadAsync(skiffUrl.href).then(gltf => gltf.scene, () => null);
    skiffSource.then(source => {
      if (!source || root.userData.disposed) return;
      const skiff = source.clone();
      // The downloaded model's pointed bow faces +Z. The fleet drives toward -Z.
      skiff.rotation.y = Math.PI;
      skiff.position.y = -.21;
      skiff.position.z = -.36;
      skiff.scale.y = 1.42;
      root.add(skiff);
      root.remove(fallback);
      disposeMotorboat(fallback);
    });
  }
  root.userData.disposeBoat = () => {
    if (root.userData.disposed) return;
    root.userData.disposed = true;
    if (fallback.parent) disposeMotorboat(fallback);
  };
  return root;
}
