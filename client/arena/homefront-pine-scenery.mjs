import { PINE_CROSSING_ROUTES, PINE_CROSSING_TREES } from './homefront-pine-crossing.mjs';
import { terrainElevation } from './homefront-terrain-generation.mjs';

const ROAD_COLORS = { gravel: 0x766c56, dirt: 0x574933, asphalt: 0x414343 };
const ROAD_OFFSETS = { dirt: 0.085, gravel: 0.11, asphalt: 0.17 };

export function addPineCrossingScenery(THREE, chunkAt, groundAt) {
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
    const color = new THREE.Color(ROAD_COLORS[route.surface]);
    rows.forEach(([x,z], i) => {
      const [ax, az] = rows[Math.max(0, i - 1)], [bx, bz] = rows[Math.min(rows.length - 1, i + 1)];
      const dx = bx - ax, dz = bz - az;
      const span = Math.hypot(dx, dz);
      const half = route.width / 2;
      for (const side of [-1, -0.5, 0, 0.5, 1]) {
        const wx = x - dz / span * half * side, wz = z + dx / span * half * side;
        vertices.push(wx, groundAt(wx, wz) + ROAD_OFFSETS[route.surface], wz);
        const shade = 1 + Math.sin(i * 17.17) * 0.065 - Math.abs(side) * 0.15;
        colors.push(color.r * shade, color.g * shade, color.b * shade);
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
    const ribbon = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 1 }));
    ribbon.name = 'pine-road:' + route.id;
    chunkAt(...route.points[Math.floor(route.points.length / 2)]).add(ribbon);
  }

  const postGeometry = new THREE.BoxGeometry(0.13, 1.65, 0.13);
  const postMaterial = new THREE.MeshStandardMaterial({ color: 0x544b39, roughness: 1 });
  for (const [x,z,yaw,text] of [
    [-12,-79,Math.PI,'PINE CROSSING  →'],
    [-45,-46,Math.PI,'PINE CROSSING'],
    [-19.5,-45,0,'CREEK TRAIL  →'],
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
  const trunkGeometry = new THREE.CylinderGeometry(0.67, 1, 1, 6);
  const branchGeometry = new THREE.ConeGeometry(1, 1, 7);
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x514539, roughness: 1 });
  const needles = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  for (const [group, trees] of groups) {
    const trunks = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, trees.length);
    const crowns = new THREE.InstancedMesh(branchGeometry, needles, trees.length * 3);
    trunks.name = 'pine-trunks';
    crowns.name = 'pine-crowns';
    trees.forEach(({x,z,height,radius,variation}, i) => {
      const ground = terrainElevation(x,z);
      dummy.position.set(x, ground + height * 0.36, z);
      dummy.scale.set(radius, height * 0.72, radius);
      dummy.rotation.set(0, variation * Math.PI, 0);
      dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);
      for (let tier = 0; tier < 3; tier++) {
        const spread = height * (0.28 - tier * 0.057);
        dummy.position.set(x, ground + height * (0.52 + tier * 0.155), z);
        dummy.scale.set(spread, height * (0.49 - tier * 0.035), spread * (0.84 + variation * 0.25));
        dummy.rotation.y = (variation + tier * 0.23) * Math.PI * 2;
        dummy.updateMatrix();
        crowns.setMatrixAt(i * 3 + tier, dummy.matrix);
        color.setHSL(0.29 + variation * 0.08, 0.19 + variation * 0.14, 0.16 + tier * 0.035 + variation * 0.055);
        crowns.setColorAt(i * 3 + tier, color);
      }
    });
    trunks.computeBoundingSphere();
    crowns.computeBoundingSphere();
    group.add(trunks, crowns);
  }
}

export function buildPineFacade(THREE, building, addBox, mat) {
  const root = new THREE.Group();
  root.position.set(building.x, terrainElevation(building.x, building.z), building.z);
  root.name = 'homefront-landmark:' + building.id;
  const wall = mat(building.finish === 'store' ? 0x635449 : 0x7b8073);
  const trim = mat(building.finish === 'store' ? 0x917757 : 0x53686a);
  const timber = mat(0x51483a), glass = mat(0x273e41), roof = mat(0x363b39);
  const box = (w,h,d,x,y,z,material) => addBox(root,w,h,d,x,y,z,material);
  box(9.6, 0.16, 4.8, 2.4, -0.12, 0, timber);
  box(9.6, 2.72, 0.16, 2.4, 0, -2.32, wall);
  for (const x of [-2.32,7.12]) box(0.16, 2.72, 4.8, x, 0, 0, wall);
  // The entrance stays aligned with the interactive threshold in the room blueprint.
  box(1.5, 2.72, 0.16, -1.65, 0, 2.32, wall);
  box(6.3, 2.72, 0.16, 4.05, 0, 2.32, wall);
  box(1.8, 0.54, 0.16, 0, 2.18, 2.32, wall);
  box(1.58, 2.18, 0.06, 0, 0, 2.23, timber);
  for (const x of [-0.87,0.87]) box(0.12, 2.2, 0.16, x, 0, 2.43, trim);
  for (const x of [2.3,5.1]) {
    box(1.48, 1.14, 0.08, x, 0.9, 2.42, trim);
    box(1.24, 0.92, 0.09, x, 1.01, 2.47, glass);
    box(0.08, 0.92, 0.07, x, 1.01, 2.53, timber);
    box(1.52, 0.14, 0.07, x, 1.22, 2.55, timber).rotation.z = 0.15;
  }
  for (const side of [-1,1]) {
    const panel = box(10.1, 0.15, 2.76, 2.4, 3.04, side * 1.26, roof);
    panel.rotation.x = side * 0.24;
  }
  box(10.0, 0.4, 4.8, 2.4, 2.68, 0, timber);
  box(3.7, 0.13, 1.05, 0.36, 2.22, 2.89, trim).rotation.x = 0.08;
  const plaque = signPlaque(THREE, building.sign, 3.05, building.finish === 'store' ? '#494139' : '#445557');
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
