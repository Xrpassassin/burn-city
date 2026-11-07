import { worldSurfaceUVs } from './homefront-surface-materials.mjs';
import { GLTFLoader } from '../vendor/three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from '../vendor/three/examples/jsm/utils/BufferGeometryUtils.js';
import { PINE_CREEK, PINE_CROSSING_ROUTES, PINE_CROSSING_TREES, PINE_ROADSIDE_SITES, pineRouteDistance } from './homefront-pine-crossing.mjs';
import { terrainElevation } from './homefront-terrain-generation.mjs';

const ROAD_COLORS = { gravel: 0x766c56, dirt: 0x574933, asphalt: 0x414343 };
const ROAD_OFFSETS = { dirt: 0.085, gravel: 0.11, asphalt: 0.17 };

export function addPineCrossingScenery(THREE, chunkAt, groundAt, surfaces=null) {
  const roadMaterials=new Map();
  for (const route of PINE_CROSSING_ROUTES) {
    const rows = [];
    for (let i = 1; i < route.points.length; i++) {
      const [ax, az] = route.points[i - 1], [bx, bz] = route.points[i];
      const length = Math.hypot(bx - ax, bz - az);
      const count = Math.ceil(length / 0.45);
      for (let j = 0; j < count; j++) rows.push([ax + (bx - ax) * j / count, az + (bz - az) * j / count]);
    }
    rows.push(route.points.at(-1));
    const vertices = [], colors = [], indices = [];
    const color = new THREE.Color(surfaces?(route.surface==='asphalt'?0xddddcf:route.surface==='gravel'?0xc8c1a2:0xa6987d):ROAD_COLORS[route.surface]);
    rows.forEach(([x,z], i) => {
      const [ax, az] = rows[Math.max(0, i - 1)], [bx, bz] = rows[Math.min(rows.length - 1, i + 1)];
      const dx = bx - ax, dz = bz - az;
      const span = Math.hypot(dx, dz);
      const half = route.width / 2;
      for (const side of [-1, -0.5, 0, 0.5, 1]) {
        const wx = x - dz / span * half * side, wz = z + dx / span * half * side;
        vertices.push(wx, groundAt(wx, wz) + ROAD_OFFSETS[route.surface], wz);
        const shade = 1 + Math.sin(i * 17.17) * 0.065 - Math.abs(side) * 0.15;
        const moss = Math.abs(side) * Math.max(0, Math.sin(i * 0.22)) * 0.25;
        colors.push(color.r * shade * (1 - moss), color.g * shade, color.b * shade * (1 - moss));
      }
      if (i === 0) return;
      for (let column = 0; column < 4; column++) {
        const a = (i - 1) * 5 + column, b = i * 5 + column;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    let roadMaterial=roadMaterials.get(route.surface);
    if(!roadMaterial){
      roadMaterial=surfaces?surfaces.material(route.surface==='asphalt'?'asphalt':'soil',
        {vertexColors:true,side:THREE.DoubleSide}):new THREE.MeshStandardMaterial({vertexColors:true,side:THREE.DoubleSide,roughness:1});
      roadMaterials.set(route.surface,roadMaterial);
    }
    if(surfaces)worldSurfaceUVs(THREE,geometry,roadMaterial.userData.homefrontTileMetres);
    const ribbon = new THREE.Mesh(geometry, roadMaterial);
    ribbon.name = 'pine-road:' + route.id;
    chunkAt(...route.points[Math.floor(route.points.length / 2)]).add(ribbon);
  }
  addRoadsideDressing(THREE, chunkAt, groundAt);

  const postGeometry = new THREE.BoxGeometry(0.13, 1.65, 0.13);
  const postMaterial = new THREE.MeshStandardMaterial({ color: 0x544b39, roughness: 1 });
  for (const [x,z,yaw,text] of [
    [-12,-79,Math.PI,'PINE CROSSING  →'],
    [-45,-46,Math.PI,'PINE CROSSING'],
    [-41.6,-62.7,-Math.PI / 2,'CREW KIT'],
    [-19.5,-45,0,'CREEK TRAIL  →'],
    [-25.6,-57.8,Math.PI / 2,'FIRST AID'],
    [-16,-77,0,'NORTH GATE  →']
  ]) {
    const sign = new THREE.Group();
    sign.position.set(x, terrainElevation(x,z), z);
    sign.rotation.y = yaw;
    const post = new THREE.Mesh(postGeometry, postMaterial);
    post.position.y = 0.83;
    const plaque = signPlaque(THREE, text, 2.55, '#504b3d');
    plaque.position.set(0, 1.55, 0.08);
    sign.add(post, plaque);
    chunkAt(x,z).add(sign);
  }

  const groups = new Map();
  for (const tree of PINE_CROSSING_TREES) {
    const chunk = chunkAt(tree.x, tree.z);
    if (!groups.has(chunk)) groups.set(chunk, []);
    groups.get(chunk).push(tree);
  }
  const trunkGeometry = new THREE.CylinderGeometry(0.51, 1, 1, 7);
  const branchGeometry = new THREE.LatheGeometry([
    [0, -0.46], [0.51, -0.47], [0.95, -0.43], [0.81, -0.32],
    [0.54, -0.11], [0.42, 0.07], [0.23, 0.25], [0, 0.52]
  ].map(([radius, height]) => new THREE.Vector2(radius, height)), 9);
  const needlesPosition = branchGeometry.getAttribute('position');
  for (let i = 0; i < needlesPosition.count; i++) {
    const x = needlesPosition.getX(i), z = needlesPosition.getZ(i), y = needlesPosition.getY(i);
    const angle = Math.atan2(z, x);
    const radius = Math.hypot(x, z);
    const uneven = 1 + 0.18 * Math.sin(angle * 5 + y * 3) + 0.12 * Math.cos(angle * 3 - y * 4);
    needlesPosition.setXYZ(i, x * uneven, y + radius * 0.10 * Math.sin(angle * 4), z * uneven);
  }
  branchGeometry.computeVertexNormals();
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x514539, roughness: 1 });
  // Soft contact shading grounds the trunk without mobile shadow-map passes.
  const contactCanvas=document.createElement('canvas');contactCanvas.width=contactCanvas.height=64;
  const contactContext=contactCanvas.getContext('2d');
  const fade=contactContext.createRadialGradient(32,32,3,32,32,32);
  fade.addColorStop(0,'rgba(15,19,12,0.42)');fade.addColorStop(0.45,'rgba(15,19,12,0.22)');fade.addColorStop(1,'rgba(15,19,12,0)');
  contactContext.fillStyle=fade;contactContext.fillRect(0,0,64,64);
  const contactMap=new THREE.CanvasTexture(contactCanvas);contactMap.colorSpace=THREE.SRGBColorSpace;
  const contactMaterial=new THREE.MeshBasicMaterial({map:contactMap,transparent:true,depthWrite:false,
    polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
  const contactGeometry=new THREE.PlaneGeometry(1,1);contactGeometry.rotateX(-Math.PI/2);
  const needles = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
  const brushGeometry = new THREE.IcosahedronGeometry(1, 0);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  for (const [group, trees] of groups) {
    const trunks = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, trees.length);
    const contacts=new THREE.InstancedMesh(contactGeometry,contactMaterial,trees.length);
    contacts.name='pine-tree-contact-shadows';
    const crowns = new THREE.InstancedMesh(branchGeometry, needles, trees.length * 4);
    const brush = new THREE.InstancedMesh(brushGeometry, needles, trees.length * 2);
    trunks.name = 'pine-trunks';
    crowns.name = 'pine-crowns';
    brush.name = 'pine-undergrowth';
    trees.forEach(({x,z,height,radius,variation}, i) => {
      const ground = terrainElevation(x,z);
      dummy.position.set(x,groundAt(x,z)+0.025,z);
      dummy.rotation.set(0,0,0);dummy.scale.set(radius*4,1,radius*4);dummy.updateMatrix();
      contacts.setMatrixAt(i,dummy.matrix);
      dummy.position.set(x, ground + height * 0.36, z);
      dummy.scale.set(radius, height * 0.72, radius);
      dummy.rotation.set(0, variation * Math.PI, 0);
      dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);
      for (let tier = 0; tier < 4; tier++) {
        const spread = height * (0.239 - tier * 0.047) * (0.85 + variation * 0.3);
        dummy.position.set(x + Math.sin(variation * 12 + tier) * spread * 0.13,
          ground + height * (0.48 + tier * 0.13 + variation * 0.07), z);
        dummy.scale.set(spread, height * (0.48 - tier * 0.045), spread * (0.72 + variation * 0.30));
        dummy.rotation.x = (variation - 0.5) * 0.15;
        dummy.rotation.y = (variation + tier * 0.23) * Math.PI * 2;
        dummy.updateMatrix();
        crowns.setMatrixAt(i * 4 + tier, dummy.matrix);
        color.setHSL(0.21 + variation * 0.075, 0.16 + variation * 0.18, 0.13 + tier * 0.014 + variation * 0.084);
        crowns.setColorAt(i * 4 + tier, color);
      }
      for (let tuft = 0; tuft < 2; tuft++) {
        const angle = variation * 6.28 + tuft * 2.2;
        const rx = x + Math.sin(angle) * 0.93, rz = z + Math.cos(angle) * 0.93;
        const size = 0.21 + 0.32 * Math.abs(Math.sin(variation * 18 + tuft));
        dummy.position.set(rx, groundAt(rx, rz) + size * 0.19, rz);
        dummy.scale.set(size, size * 0.63, size * 0.77);
        dummy.rotation.set(0, angle, 0);
        dummy.updateMatrix();
        brush.setMatrixAt(i * 2 + tuft, dummy.matrix);
        color.setHSL(0.16 + variation * 0.1, 0.16 + variation * 0.13, 0.18 + variation * 0.07);
        brush.setColorAt(i * 2 + tuft, color);
      }
    });
    trunks.computeBoundingSphere();
    crowns.computeBoundingSphere();
    brush.computeBoundingSphere();
    contacts.computeBoundingSphere();
    group.add(contacts, trunks, crowns, brush);
  }
  const updateCreek = addPineCreek(THREE, chunkAt, groundAt);
  const updateCrows = addPineCrows(THREE, chunkAt(-36, -58));
  return dt => { updateCreek(dt); updateCrows(dt); };
}

function addPineCrows(THREE, chunk) {
  const wing = new THREE.BufferGeometry();
  wing.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, -0.18, 0.31, 0, -0.12, 0.59, 0, 0,
    0, 0, -0.18, 0.59, 0, 0, 0, 0, 0.18
  ], 3));
  const flock = new THREE.InstancedMesh(wing, new THREE.MeshBasicMaterial({ color: 0x242a26, side: THREE.DoubleSide }), 8);
  flock.name = 'pine-crows';
  flock.frustumCulled = false;
  chunk.add(flock);
  const root = new THREE.Object3D(), hinge = new THREE.Object3D();
  root.add(hinge);
  let clock = 0;
  return dt => {
    if (!chunk.visible) return;
    clock += dt;
    for (let bird = 0; bird < 4; bird++) {
      const angle = clock * 0.27 + bird * 0.17;
      const radius = 11 + bird * 1.2;
      root.position.set(-36 + Math.cos(angle) * radius, 10.5 + bird * 0.53 + Math.sin(angle * 2) * 0.7,
        -58 + Math.sin(angle) * radius);
      root.rotation.set(0, -angle, 0.13);
      const flap = (0.2 + 0.35 * Math.sin(clock * 0.94 + bird) ** 2) * Math.sin(clock * 12 + bird);
      for (const side of [-1, 1]) {
        hinge.rotation.set(0, side < 0 ? Math.PI : 0, side * flap, 'ZYX');
        root.updateMatrixWorld(true);
        flock.setMatrixAt(bird * 2 + (side > 0 ? 1 : 0), hinge.matrixWorld);
      }
    }
    flock.instanceMatrix.needsUpdate = true;
  };
}

function addRoadsideDressing(THREE, chunkAt, groundAt) {
  const material = color => new THREE.MeshStandardMaterial({ color, roughness: 0.92 });
  const bark = material(0x4b4035), cutWood = material(0x7a6247), moss = material(0x545d37);
  const paint = material(0x53594e), rust = material(0x74503b), rubber = material(0x292924);
  const glass = material(0x273637), frame = material(0x414643), concrete = material(0x757267);
  const reflector = material(0x968354), lamp = material(0x8c825c);
  const box = (group, mat, w, h, d, x, y, z) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  };
  const cylinder = (group, mat, top, bottom, length, x, y, z, axis) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(top, bottom, length, 9), mat);
    mesh.position.set(x, y, z);
    mesh.rotation[axis] = Math.PI / 2;
    group.add(mesh);
    return mesh;
  };
  for (const site of PINE_ROADSIDE_SITES) {
    const group = new THREE.Group();
    group.name = site.id;
    group.position.set(site.x, groundAt(site.x, site.z), site.z);
    if (site.kind === 'deadfall') {
      cylinder(group, bark, 0.32, 0.41, 3.76, 0, 0.34, 0, 'z');
      cylinder(group, cutWood, 0.27, 0.27, 0.07, -1.86, 0.34, 0, 'z');
      for (const [x, angle] of [[-1.02, -0.4], [0.2, 0.38], [1.1, -0.64]]) {
        cylinder(group, bark, 0.045, 0.16, 0.62, x, 0.6, 0.04, 'z').rotation.z = angle;
      }
      for (const [x, w, z] of [[-1.16, 0.63, 0.06], [0.12, 1.1, -0.06], [1.24, 0.45, 0.09]]) {
        box(group, moss, w, 0.065, 0.19, x, 0.68, z).rotation.x = z;
      }
    } else if (site.kind === 'pickup') {
      box(group, frame, 4.26, 0.21, 1.66, 0, 0.44, 0);
      box(group, paint, 4.12, 0.4, 1.75, 0, 0.71, 0);
      box(group, paint, 1.4, 0.2, 1.74, 1.38, 0.99, 0);
      box(group, paint, 1.39, 0.11, 1.54, 0.16, 1.78, 0);
      for (const x of [-0.47, 0.8]) for (const z of [-0.7, 0.7]) {
        box(group, frame, 0.11, 0.79, 0.1, x, 1.38, z).rotation.z = x > 0 ? 0.20 : 0;
      }
      box(group, glass, 0.055, 0.68, 1.35, 0.81, 1.37, 0).rotation.z = 0.20;
      box(group, frame, 0.11, 0.14, 1.73, 2.11, 0.52, 0);
      box(group, lamp, 0.05, 0.13, 0.31, 2.08, 0.86, 0.57);
      box(group, rust, 1.24, 0.29, 0.05, -1.36, 0.91, 0.84);
      box(group, rust, 0.76, 0.035, 0.39, 1.47, 1.102, -0.38);
      for (const x of [-1.4, 1.3]) for (const z of [-0.82, 0.82]) {
        cylinder(group, rubber, 0.36, 0.36, 0.29, x, 0.35, z, 'x');
      }
    } else if (site.kind === 'relay') {
      // Authored abandoned radio shelter, visible from the logging spur.
      // The base matches the single server-owned AABB. Everything above its
      // roof is visual: no phantom collision, expensive lights, or new assets.
      box(group, concrete, 3.38, 0.3, 2.58, 0, 0.12, 0);
      box(group, frame, 3.2, 2.15, 2.44, 0, 1.3, 0);
      box(group, paint, 3.3, 0.22, 2.6, 0, 2.47, 0);
      box(group, rust, 0.92, 1.68, 0.08, -0.78, 1.17, 1.25); // seized service hatch
      box(group, glass, 0.9, 0.58, 0.08, 0.85, 1.49, 1.25);
      box(group, rust, 1.15, 0.32, 0.26, 0.85, 1.01, 1.36); // weathered console
      for (const x of [-1.4, 1.4]) {
        const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.047, 0.07, 4.3, 6), frame);
        mast.position.set(x, 3.55, -0.75); group.add(mast);
        box(group, rust, 0.13, 0.1, 1.63, x, 4.2, -0.52);
      }
      box(group, frame, 2.86, 0.08, 0.08, 0, 5.35, -0.75);
      box(group, frame, 2.86, 0.08, 0.08, 0, 4.9, -0.75);
      box(group, paint, 1.1, 0.08, 1.05, 0.86, 3.35, 0.43).rotation.x = -0.44; // bent antenna dish
      box(group, reflector, 0.25, 0.17, 0.06, -1.35, 5.62, -0.74);
      for (let i = 0; i < 3; i++) {
        box(group, concrete, 0.61, 0.38, 0.65, -1.4 + i * 0.65, 0.2, 2.1); // flood-damaged crates
      }
      const notice = signPlaque(THREE, 'RELAY 07 / NO SIGNAL', 2.35, '#514e3c');
      notice.position.set(0.06, 2.04, 1.35);
      group.add(notice);
    } else {
      for (const x of [-1.52, 1.52]) {
        box(group, concrete, 0.66, 0.24, 0.96, x, 0.12, 0);
        box(group, frame, 0.12, 1.33, 0.16, x, 0.78, 0);
      }
      box(group, concrete, 4, 0.42, 0.44, 0, 0.46, 0);
      box(group, frame, 3.85, 0.21, 0.13, 0, 1.02, 0).rotation.z = -0.05;
      for (const x of [-1.52, -0.62, 0.35, 1.4]) {
        box(group, reflector, 0.28, 0.2, 0.025, x, 1.02 - x * 0.05, -0.071).rotation.z = -0.38;
      }
      const notice = signPlaque(THREE, 'EVACUATION HALTED', 1.92, '#6d5235');
      notice.position.set(0.12, 1.33, -0.12);
      notice.rotation.y = Math.PI;
      notice.rotation.z = -0.10;
      group.add(notice);
    }
    chunkAt(site.x, site.z).add(group);
  }

  const marks = [], colors = [];
  const marking = new THREE.Color(0x81734f), fracture = new THREE.Color(0x272b26);
  const strip = (ax, az, bx, bz, width, tint) => {
    const dx = bx - ax, dz = bz - az, span = Math.hypot(dx, dz);
    const tx = -dz * width / (2 * span), tz = dx * width / (2 * span);
    for (const [x, z] of [[ax + tx, az + tz], [bx + tx, bz + tz], [ax - tx, az - tz],
      [ax - tx, az - tz], [bx + tx, bz + tz], [bx - tx, bz - tz]]) {
      marks.push(x, groundAt(x, z) + ROAD_OFFSETS.asphalt + 0.022, z);
      colors.push(tint.r, tint.g, tint.b);
    }
  };
  for (let i = 0; i < 9; i++) {
    const x = -47.5 + i * 3.25;
    if (i !== 3 && i !== 6) {
      strip(x, -43, x + 0.59, -43, 0.09, marking);
      strip(x + 0.69, -43, x + 1.22, -43, 0.07, marking);
    }
    const side = i % 2 === 0 ? -1 : 1;
    const edge = -43 + side * 2.2, inner = -43 + side * (0.5 + i % 3 * 0.35);
    strip(x, edge, x + 0.62, (edge + inner) / 2, 0.05, fracture);
    strip(x + 0.62, (edge + inner) / 2, x + 0.22, inner, 0.035, fracture);
    strip(x + 0.62, (edge + inner) / 2, x + 1.04, edge - side * 0.44, 0.026, fracture);
  }
  const asphalt = new THREE.BufferGeometry();
  asphalt.setAttribute('position', new THREE.Float32BufferAttribute(marks, 3));
  asphalt.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  asphalt.computeVertexNormals();
  const brokenPaint = new THREE.Mesh(asphalt, new THREE.MeshStandardMaterial({
    vertexColors: true, side: THREE.DoubleSide, roughness: 1
  }));
  brokenPaint.name = 'pine-cracked-asphalt';
  chunkAt(-34, -43).add(brokenPaint);

  // Reuse one grass clump mesh for all shoulder plants and keep it batched by chunk.
  const clump = new THREE.BufferGeometry(), blades = [];
  for (let i = 0; i < 6; i++) {
    const angle = i * 2.4, x = Math.cos(angle), z = Math.sin(angle), height = 0.45 + i * 0.10;
    blades.push(x * 0.15 - z * 0.052, 0, z * 0.15 + x * 0.052,
      x * 0.15 + z * 0.052, 0, z * 0.15 - x * 0.052, x * 0.42, height, z * 0.42);
  }
  clump.setAttribute('position', new THREE.Float32BufferAttribute(blades, 3));
  clump.computeVertexNormals();
  const grassMat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 1 });
  const sites = new Map();
  let serial = 0;
  for (const { points, width, surface } of PINE_CROSSING_ROUTES.slice(0, 3)) {
    for (let i = 1; i < points.length; i++) {
      const [ax, az] = points[i - 1], [bx, bz] = points[i];
      const dx = bx - ax, dz = bz - az, span = Math.hypot(dx, dz);
      for (let along = 0.5; along < span; along += 0.78) {
        for (const side of [-1, 1]) {
          const id = serial++;
          const verge = width / 2 + 0.08 + 1.2 * Math.abs(Math.sin(id * 11.73));
          const x = ax + dx * along / span - side * dz * verge / span;
          const z = az + dz * along / span + side * dx * verge / span;
          if (pineRouteDistance(x, z) < 0.05) continue;
          const chunk = chunkAt(x, z);
          if (!sites.has(chunk)) sites.set(chunk, []);
          sites.get(chunk).push({ x, z, id, surface });
        }
      }
    }
  }
  const dummy = new THREE.Object3D(), tint = new THREE.Color();
  for (const [chunk, plants] of sites) {
    const grass = new THREE.InstancedMesh(clump, grassMat, plants.length);
    grass.name = 'pine-roadside-grass';
    plants.forEach(({ x, z, id, surface }, i) => {
      const growth = 0.27 + 0.52 * Math.abs(Math.cos(id * 4.67));
      dummy.position.set(x, groundAt(x, z) - 0.01, z);
      dummy.rotation.y = id * 2.4;
      dummy.scale.set(growth, growth * (surface === 'asphalt' ? 0.72 : 1), growth);
      dummy.updateMatrix();
      grass.setMatrixAt(i, dummy.matrix);
      tint.setHSL(0.14 + 0.10 * Math.abs(Math.sin(id)), 0.19 + 0.21 * Math.abs(Math.cos(id * 2.31)), 0.22 + 0.13 * growth);
      grass.setColorAt(i, tint);
    });
    grass.computeBoundingSphere();
    chunk.add(grass);
  }
}

function addPineCreek(THREE, chunkAt, groundAt) {
  const vertices = [], uv = [], indices = [], stoneSites = [];
  let length = 0;
  for (let i = 1; i < PINE_CREEK.length; i++) {
    const [ax, az] = PINE_CREEK[i - 1], [bx, bz] = PINE_CREEK[i];
    const dx = bx - ax, dz = bz - az, span = Math.hypot(dx, dz);
    const rows = Math.ceil(span / 0.32);
    for (let j = 0; j < rows; j++) {
      const t = j / rows, x = ax + dx * t, z = az + dz * t;
      const along = length + span * t;
      const width = 0.72 + 0.17 * Math.sin(along * 0.52);
      const row = vertices.length / 6;
      for (const side of [-1, 1]) {
        const wx = x - dz / span * width * side, wz = z + dx / span * width * side;
        vertices.push(wx, groundAt(wx, wz) + 0.055, wz);
        uv.push((side + 1) / 2, along / 4);
      }
      if (row > 0) {
        const v = row * 2;
        indices.push(v - 2, v, v - 1, v - 1, v, v + 1);
      }
      if (j % 5 === 1) {
        const side = row % 2 ? 1 : -1;
        const bank = width + 0.19 + 0.24 * Math.abs(Math.sin(row));
        const sx = x - dz / span * bank * side, sz = z + dx / span * bank * side;
        if (pineRouteDistance(sx, sz) > 0.32) stoneSites.push([sx, sz, row]);
      }
    }
    length += span;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  const banks = context.createLinearGradient(0, 0, 64, 0);
  banks.addColorStop(0, '#3e4c40');
  banks.addColorStop(0.3, '#526b65');
  banks.addColorStop(0.63, '#405d59');
  banks.addColorStop(1, '#3e4c40');
  context.fillStyle = banks;
  context.fillRect(0, 0, 64, 128);
  for (let i = 0; i < 35; i++) {
    context.fillStyle = i % 3 ? '#9ea9a220' : '#202c2940';
    context.fillRect(8 + i * 11 % 43, i * 23 % 128, 2 + i % 4, 3 + i % 8);
  }
  const ripples = new THREE.CanvasTexture(canvas);
  ripples.colorSpace = THREE.SRGBColorSpace;
  ripples.wrapT = THREE.RepeatWrapping;
  const water = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    map: ripples, color: 0xd8e1dc, roughness: 0.48, side: THREE.DoubleSide
  }));
  water.name = 'pine-creek-water';
  const chunk = chunkAt(...PINE_CREEK[Math.floor(PINE_CREEK.length / 2)]);
  chunk.add(water);

  // Keep the whole bank in a single draw call, with a geometric fallback while
  // the bundled Kenney rock loads. Normalize the source's miniature scale.
  const fallback = new THREE.IcosahedronGeometry(0.5, 0);
  const stones = new THREE.InstancedMesh(fallback, new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 1
  }), stoneSites.length);
  stones.name = 'pine-creek-stones';
  const dummy = new THREE.Object3D(), tint = new THREE.Color();
  for (const [index, [x, z, row]] of stoneSites.entries()) {
    const size = 0.24 + 0.44 * Math.abs(Math.sin(row * 0.19));
    dummy.position.set(x, groundAt(x, z) + size * 0.09, z);
    dummy.scale.set(size, size * 0.63, size * 0.85);
    dummy.rotation.y = row * 1.23;
    dummy.updateMatrix();
    stones.setMatrixAt(index, dummy.matrix);
    tint.setHSL(0.15, 0.07, 0.31 + 0.16 * Math.abs(Math.cos(row)));
    stones.setColorAt(index, tint);
  }
  chunk.add(stones);
  const rockUrl = new URL('./assets/homefront/pine-crossing/rock-small.glb', import.meta.url).href;
  new GLTFLoader().loadAsync(rockUrl).then(({ scene }) => {
    const pieces = [];
    scene.updateMatrixWorld(true);
    scene.traverse(node => {
      if (node.isMesh) pieces.push(node.geometry.clone().applyMatrix4(node.matrixWorld));
    });
    const shape = pieces.length ? mergeGeometries(pieces) : null;
    for (const piece of pieces) piece.dispose();
    scene.traverse(node => {
      node.geometry?.dispose();
      node.material?.dispose();
    });
    if (!shape) return;
    shape.center();
    const size = shape.boundingBox.getSize(new THREE.Vector3());
    const footprint = Math.max(size.x, size.z);
    shape.scale(1 / footprint, 1 / size.y, 1 / footprint);
    stones.geometry = shape;
    stones.computeBoundingSphere();
    fallback.dispose();
  }).catch(() => {});

  const reedSites = stoneSites.filter(([, , row]) => row % 3 !== 0);
  const reeds = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 3), new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 1
  }), reedSites.length * 5);
  reeds.name = 'pine-creek-reeds';
  for (const [index, [x, z, row]] of reedSites.entries()) {
    for (let blade = 0; blade < 5; blade++) {
      const angle = row + blade * 2.4, height = 0.22 + 0.43 * Math.abs(Math.sin(angle));
      const rx = x + Math.cos(angle) * 0.24, rz = z + Math.sin(angle) * 0.24;
      dummy.position.set(rx, groundAt(rx, rz) + height * 0.43, rz);
      dummy.rotation.set(0.19 * Math.cos(angle), angle, 0.19 * Math.sin(angle));
      dummy.scale.set(0.037, height, 0.037);
      dummy.updateMatrix();
      const instance = index * 5 + blade;
      reeds.setMatrixAt(instance, dummy.matrix);
      tint.setHSL(0.19 + blade * 0.015, 0.22, 0.29 + blade * 0.027);
      reeds.setColorAt(instance, tint);
    }
  }
  chunk.add(reeds);
  return dt => { if (chunk.visible) ripples.offset.y = (ripples.offset.y - dt * 0.13) % 1; };
}

export function buildPineFacade(THREE, building, addBox, mat, surfaces=null) {
  const root = new THREE.Group();
  root.position.set(building.x, terrainElevation(building.x, building.z), building.z);
  root.name = 'homefront-landmark:' + building.id;
  const store = building.finish === 'store';
  const wall = surfaces?surfaces.material('concrete',{color:store?0xc7a58b:0xd2d4cd}):mat(store ? 0x7a5e48 : 0xa4a394);
  const trim = mat(store ? 0xa18a68 : 0x4d6661);
  const timber = mat(0x51483a), glass = mat(0x273e41, 0.32), roof = mat(0x3e4643);
  const box = (w,h,d,x,y,z,material) => addBox(root,w,h,d,x,y,z,material);
  const shell = (...args) => {
    const mesh = box(...args);
    mesh.userData.pineCameraOccluder = true;
    return mesh;
  };
  box(9.6, 0.29, 4.8, 2.4, -0.16, 0, mat(0x575954));
  shell(9.6, 2.72, 0.16, 2.4, 0, -2.32, wall);
  for (const x of [-2.32,7.12]) shell(0.16, 2.72, 4.8, x, 0, 0, wall);
  // The entrance stays aligned with the interactive threshold in the room blueprint.
  shell(1.5, 2.72, 0.16, -1.65, 0, 2.32, wall);
  shell(6.3, 2.72, 0.16, 4.05, 0, 2.32, wall);
  shell(1.8, 0.54, 0.16, 0, 2.18, 2.32, wall);
  shell(1.58, 2.18, 0.06, 0, 0, 2.23, timber);
  for (const x of [-0.87,0.87]) box(0.12, 2.2, 0.16, x, 0, 2.43, trim);
  for (const x of [2.3,5.1]) {
    box(1.48, 1.14, 0.08, x, 0.9, 2.42, trim);
    box(1.24, 0.92, 0.09, x, 1.01, 2.47, glass);
    box(0.08, 0.92, 0.07, x, 1.01, 2.53, timber);
    box(1.52, 0.14, 0.07, x, 1.22, 2.55, timber).rotation.z = 0.15;
  }
  if (store) {
    for (const side of [-1,1]) {
      const panel = shell(10.1, 0.15, 2.76, 2.4, 3.04, side * 1.26, roof);
      panel.rotation.x = side * 0.24;
      box(10.15, 0.085, 0.11, 2.4, 2.8, side * 2.59, timber);
    }
    for (let y = 0.38; y < 2.55; y += 0.24) {
      box(1.46, 0.035, 0.036, -1.65, y, 2.414, timber);
      if (y < 0.86 || y > 2.05) box(6.29, 0.035, 0.036, 4.05, y, 2.414, timber);
    }
    const fadedCanvas = mat(0x854e39), fadedStripe = mat(0xbaa384);
    for (let i = 0; i < 9; i++) {
      box(0.51, 0.08, 1.02, -1.25 + i * 0.51, 2.19, 2.85, i % 2 ? fadedStripe : fadedCanvas).rotation.x = 0.19;
    }
    box(2.15, 0.12, 0.48, 4.99, 0.43, 2.71, timber);
    for (const x of [4.11, 5.87]) box(0.1, 0.43, 0.26, x, 0, 2.71, trim);
  } else {
    shell(9.87, 0.22, 4.99, 2.4, 2.73, 0, roof);
    for (const side of [-1, 1]) box(9.87, 0.27, 0.16, 2.4, 2.92, side * 2.41, wall);
    box(1.65, 0.32, 1.12, 5.95, 2.95, -0.98, trim);
    box(1.4, 0.035, 0.9, 5.95, 3.27, -0.98, roof);
    box(6.3, 0.18, 0.05, 4.05, 0.62, 2.43, trim);
    box(1.5, 0.18, 0.05, -1.65, 0.62, 2.43, trim);
    box(2.25, 0.12, 1.09, 0, 2.22, 2.86, trim);
    const plaque = mat(0xddd7bd), medicalGreen = mat(0x41655b);
    box(0.59, 0.59, 0.07, 6.39, 2.01, 2.44, plaque);
    box(0.13, 0.41, 0.03, 6.39, 2.10, 2.49, medicalGreen);
    box(0.41, 0.13, 0.03, 6.39, 2.24, 2.49, medicalGreen);
  }
  const plaque = signPlaque(THREE, building.sign, 3.05, store ? '#494139' : '#445557');
  plaque.position.set(2.25, 2.52, 2.44);
  root.add(plaque);
  return root;
}

function signPlaque(THREE, text, width, background) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#a89b81';
  ctx.lineWidth = 4;
  ctx.strokeRect(8, 8, 496, 80);
  ctx.fillStyle = '#dfd2b8';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 47px sans-serif';
  ctx.fillText(text, 256, 48, 470);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(width, width * 0.19), new THREE.MeshStandardMaterial({ map: texture }));
}
