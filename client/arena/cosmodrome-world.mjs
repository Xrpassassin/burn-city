// Visual dressing for The Ashen Cosmodrome: ember launch complex, Kenney Space Kit (CC0) props,
// a stacked BURN rocket, spin well, and Ash Pad trams. Collision stays on the server obst list.
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/three/examples/jsm/loaders/GLTFLoader.js';

const ASSET = n => new URL(`./assets/cosmo/kenney-${n}.glb`, import.meta.url).href;
const CACHE = new Map();
const loader = new GLTFLoader();

function loadModel(name) {
  if (!CACHE.has(name)) {
    CACHE.set(name, loader.loadAsync(ASSET(name)).then(g => {
      const root = g.scene || g.scenes[0];
      root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(root);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      return { root, size, center };
    }).catch(() => null));
  }
  return CACHE.get(name);
}

function tint(obj, hex, ember = 0.18) {
  const c = new THREE.Color(hex);
  obj.traverse(o => {
    if (!o.isMesh || !o.material) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const next = mats.map(m => {
      // The Zombies world is unlit MeshBasic. Kenney GLBs ship as Standard/PBR
      // and would otherwise render black, hiding the BURN-1 stack and props.
      const n = new THREE.MeshBasicMaterial({
        map: m.map || null,
        color: m.color ? m.color.clone().lerp(c, ember) : c.clone(),
        transparent: !!m.transparent,
        opacity: m.opacity ?? 1,
        side: THREE.FrontSide,
        fog: true
      });
      return n;
    });
    o.material = next.length === 1 ? next[0] : next;
    o.castShadow = o.receiveShadow = false;
  });
}

function stamp(template, x, y, z, rotY, scale) {
  const inst = template.root.clone(true);
  inst.position.set(x - template.center.x * scale, y - template.center.y * scale, z - template.center.z * scale);
  inst.rotation.y = rotY || 0;
  inst.scale.setScalar(scale);
  return inst;
}

export function addCosmodromeWorld(root, L, { low, g, basic, label, scene }) {
  const CELL = L.cell, GW = L.gw, GH = L.gh;
  const WX = c => (c - GW / 2) * CELL + 1, WZ = r => (r - GH / 2) * CELL + 1;
  const group = new THREE.Group();
  group.name = 'ashen-cosmodrome';
  root.add(group);
  const zones = L.zones.map((z, i) => {
    const [c0, c1, r0, r1] = z.r;
    const g0 = new THREE.Group();
    g0.userData = { zone: i, cx: (WX(c0) + WX(c1)) / 2, cz: (WZ(r0) + WZ(r1)) / 2 };
    group.add(g0);
    return g0;
  });
  const always = new THREE.Group();
  group.add(always);

  const hull = basic(0xb8c0c7), nose = basic(0xc74b36), tower = basic(0x454b52);
  const hazard = basic(0xe3a33b), padMat = basic(0x30343a), ember = basic(0xff6a22);
  const rust = basic(0x6b3928), concrete = basic(0x555652);

  // Landmark rocket on the Launch Pad (zone 7) — Kenney parts if they load, primitives otherwise.
  const rocketPos = (() => {
    const rocket = (L.obst || []).find(o => o[5] === 'rocket');
    if (!rocket) return { x: WX(35.5), z: WZ(9) };
    return { x: (WX(rocket[0]) + WX(rocket[1])) / 2, z: (WZ(rocket[2]) + WZ(rocket[3])) / 2 };
  })();
  const launch = new THREE.Group();
  launch.position.set(rocketPos.x, 0, rocketPos.z);
  always.add(launch);
  const rocketViz = new THREE.Group();
  launch.add(rocketViz);
  const primitiveRocket = () => {
    const body = new THREE.Mesh(g(new THREE.CylinderGeometry(1.15, 1.45, 14.5, low ? 6 : 10)), hull);
    body.position.y = 8.4; rocketViz.add(body);
    const tip = new THREE.Mesh(g(new THREE.ConeGeometry(1.15, 3.2, low ? 6 : 10)), nose);
    tip.position.y = 17.2; rocketViz.add(tip);
    const band = new THREE.Mesh(g(new THREE.CylinderGeometry(1.5, 1.5, 0.4, low ? 6 : 10)), hazard);
    band.position.y = 4.2; rocketViz.add(band);
    const bell = new THREE.Mesh(g(new THREE.CylinderGeometry(0.7, 1.05, 1.4, low ? 6 : 10)), basic(0x22262b));
    bell.position.y = 0.85; rocketViz.add(bell);
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2;
      const fin = new THREE.Mesh(g(new THREE.BoxGeometry(0.18, 2.2, 1.6)), nose);
      fin.position.set(Math.cos(a) * 1.35, 2.0, Math.sin(a) * 1.35);
      fin.rotation.y = -a; rocketViz.add(fin);
    }
    const stripe = new THREE.Mesh(g(new THREE.BoxGeometry(0.08, 8.5, 0.35)), ember);
    stripe.position.y = 8.4; rocketViz.add(stripe);
    const tag = label('BURN-1', '#ffb060', 512, 3.2);
    tag.position.set(0, 12.4, 1.6); rocketViz.add(tag);
  };
  primitiveRocket();
  if (!low) {
    Promise.all(['rocket_baseA', 'rocket_fuelA', 'rocket_sidesA', 'rocket_finsA', 'rocket_topA'].map(loadModel))
      .then(([base, fuel, sides, fins, top]) => {
        if (!base || !fuel || !top) return;
        rocketViz.clear();
        const stack = [base, fuel, fuel, fuel, sides, fins, top];
        let y = 0;
        const s = 2.15;
        for (const part of stack) {
          if (!part) continue;
          // stamp() pins the bounding-box center at y, which buried the first
          // segment and collapsed the stack. Sit each part on the previous rim.
          const inst = part.root.clone(true);
          inst.position.set(-part.center.x * s, y - (part.center.y - part.size.y / 2) * s, -part.center.z * s);
          inst.scale.setScalar(s);
          tint(inst, 0xc45a20, 0.22);
          rocketViz.add(inst);
          y += part.size.y * s * 0.98;
        }
        if (y < 8 || y > 36) { rocketViz.clear(); primitiveRocket(); return; }
        const tag = label('BURN-1', '#ffb060', 512, 3.2);
        tag.position.set(0, y * 0.72, 2.0); rocketViz.add(tag);
        const glow = new THREE.Mesh(g(new THREE.SphereGeometry(1.4, 8, 6)), basic(0xff6a22, { transparent: true, opacity: 0.35, depthWrite: false }));
        glow.position.y = 0.8; rocketViz.add(glow);
      }).catch(() => {});
  }

  // Gantry frame around the rocket (always-on silhouette).
  const postGeo = g(new THREE.BoxGeometry(0.28, 16, 0.28));
  for (const x of [-4.2, 4.2]) for (const z of [-3.2, 3.2]) {
    const post = new THREE.Mesh(postGeo, tower); post.position.set(x, 8, z); launch.add(post);
  }
  for (const y of [3, 8, 13.5]) {
    const beam = new THREE.Mesh(g(new THREE.BoxGeometry(8.6, 0.24, 0.24)), tower);
    beam.position.set(0, y, -3.2); launch.add(beam);
  }

  // Spin well in Ember Well.
  const spinObst = (L.obst || []).find(o => o[5] === 'spinner');
  const spin = new THREE.Group();
  if (spinObst) {
    spin.position.set((WX(spinObst[0]) + WX(spinObst[1])) / 2, 0, (WZ(spinObst[2]) + WZ(spinObst[3])) / 2);
    const core = new THREE.Mesh(g(new THREE.CylinderGeometry(2.1, 2.3, 2.2, low ? 8 : 14)), rust);
    core.position.y = 1.1; spin.add(core);
    const rim = new THREE.Mesh(g(new THREE.TorusGeometry(2.35, 0.08, 4, low ? 12 : 20)), hazard);
    rim.rotation.x = Math.PI / 2; rim.position.y = 2.15; spin.add(rim);
    const armGeo = g(new THREE.BoxGeometry(4.6, 0.18, 0.35));
    for (let i = 0; i < 3; i++) {
      const arm = new THREE.Mesh(armGeo, ember);
      arm.position.y = 1.85; arm.rotation.y = i * Math.PI * 2 / 3; spin.add(arm);
    }
    const wellTag = label('SPIN WELL', '#ffb060', 512, 2.4);
    wellTag.position.y = 3.1; spin.add(wellTag);
    zones[0].add(spin);
  }

  // Ash Pad decks + tram cars.
  const pads = (L.landers || []).map((s, i) => {
    const g0 = new THREE.Group();
    g0.position.set(s.x, 0, s.z);
    const deck = new THREE.Mesh(g(new THREE.CylinderGeometry(2.4, 2.4, 0.16, low ? 8 : 14)), padMat);
    deck.position.y = 0.1; g0.add(deck);
    const ring = new THREE.Mesh(g(new THREE.TorusGeometry(2.15, 0.05, 4, low ? 12 : 20)), hazard);
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.2; g0.add(ring);
    const tag = label(s.name + (i ? '\n250 pts · ride to Ember Well' : '\n250 pts · ride to an open pad'), '#ffd27a', 640, 2.6);
    tag.position.y = 2.4; g0.add(tag);
    const car = new THREE.Group();
    const hullM = new THREE.Mesh(g(new THREE.BoxGeometry(2.4, 0.7, 1.5)), hull);
    hullM.position.y = 0.7; car.add(hullM);
    const cab = new THREE.Mesh(g(new THREE.BoxGeometry(1.1, 0.55, 1.35)), basic(0x1a2a30, { transparent: true, opacity: 0.7 }));
    cab.position.set(0.7, 1.2, 0); car.add(cab);
    car.visible = false; g0.add(car);
    (zones[s.zone] || always).add(g0);
    return { def: s, group: g0, car };
  });
  loadModel('platform_large').then(m => {
    if (!m) return;
    for (const p of pads) {
      const inst = stamp(m, 0, 0, 0, 0, 2.4 / Math.max(m.size.x, m.size.z));
      tint(inst, 0xc45a20, 0.15);
      inst.position.y = 0.02;
      p.group.add(inst);
    }
  }).catch(() => {});
  loadModel('monorail_trainCargo').then(m => {
    if (!m) return;
    for (const p of pads) {
      p.car.clear();
      const inst = stamp(m, 0, 0.15, 0, 0, 1.6 / Math.max(m.size.x, 0.01));
      tint(inst, 0xff8a3a, 0.2);
      p.car.add(inst);
    }
  }).catch(() => {});

  // Zone signs.
  const sign = (textLabel, zone, c, r, rot = 0) => {
    const plate = new THREE.Group();
    const back = new THREE.Mesh(g(new THREE.BoxGeometry(3.2, 0.7, 0.12)), basic(0xb5a77d));
    const bar = new THREE.Mesh(g(new THREE.BoxGeometry(3.0, 0.12, 0.14)), basic(0x9e3328));
    bar.position.y = 0.24; plate.add(back, bar);
    const tag = label(textLabel, '#d8cba5', 512, 1.3);
    tag.position.set(0, -0.05, 0.1); tag.scale.set(2.6, 0.34, 1); plate.add(tag);
    plate.position.set(WX(c), 3.05, WZ(r)); plate.rotation.y = rot;
    (zones[zone] || always).add(plate);
  };
  sign('EMBER WELL', 0, 35, 36, Math.PI);
  sign('ASH WALK', 1, 59, 36, Math.PI);
  sign('TELEMETRY HALL', 2, 12, 36, Math.PI);
  sign('MOTOR POOL', 3, 12, 19, Math.PI);
  sign('POWER CORE', 4, 35, 19, Math.PI);
  sign('BLAST COURT', 5, 12, 3, Math.PI);
  sign('FUEL FARM', 6, 59, 3, Math.PI);
  sign('LAUNCH PAD · BURN-1', 7, 35, 3, Math.PI);

  // Instance Kenney props onto authored obst of matching types (visual only).
  const kindMap = {
    tank: 'machine_barrelLarge',
    furnace: 'machine_generator',
    vehicle: 'craft_cargoA',
    scaffold: 'supports_high',
    pipe: 'pipe_straight',
    crate: 'barrel',
    support: 'supports_high'
  };
  const jobs = [];
  for (const [c0, c1, r0, r1, h, st] of (L.obst || [])) {
    const name = kindMap[st];
    if (!name) continue;
    const x = (WX(c0) + WX(c1)) / 2, z = (WZ(r0) + WZ(r1)) / 2;
    const foot = Math.max((c1 - c0 + 1) * CELL, (r1 - r0 + 1) * CELL);
    const zi = L.zones.findIndex(z => c0 >= z.r[0] && c1 <= z.r[1] && r0 >= z.r[2] && r1 <= z.r[3] && !z.lv);
    jobs.push({ name, x, z, y: 0, h, foot, zone: zi < 0 ? 0 : zi });
  }
  const used = low ? jobs.filter((_, i) => i % 2 === 0) : jobs;
  const byName = new Map();
  for (const job of used) {
    if (!byName.has(job.name)) byName.set(job.name, []);
    byName.get(job.name).push(job);
  }
  for (const [name, list] of byName) {
    loadModel(name).then(m => {
      if (!m) return;
      for (const job of list) {
        const s = Math.max(0.6, job.foot / Math.max(m.size.x, m.size.z, 0.01) * 0.9);
        const inst = stamp(m, job.x, job.y, job.z, (job.x + job.z) * 0.13, s);
        tint(inst, 0xc45a20, 0.16);
        (zones[job.zone] || always).add(inst);
      }
    }).catch(() => {});
  }

  // Perimeter hangars and telemetry dishes (outside the walkable grid, skyline only).
  const skyline = low ? 2 : 4;
  loadModel('hangar_smallA').then(m => {
    if (!m) return;
    const spots = [[WX(8), WZ(-2)], [WX(63), WZ(-2)], [WX(-2), WZ(26)], [WX(74), WZ(26)]].slice(0, skyline);
    for (const [x, z] of spots) {
      const inst = stamp(m, x, 0, z, 0, 4.5 / Math.max(m.size.x, 0.01));
      tint(inst, 0x8a4a20, 0.2);
      always.add(inst);
    }
  }).catch(() => {});
  loadModel('satelliteDish').then(m => {
    if (!m) return;
    for (const [c, r] of [[8, 36], [16, 36], [60, 4]]) {
      const inst = stamp(m, WX(c), 0, WZ(r), 0.4, 2.2 / Math.max(m.size.y, 0.01));
      tint(inst, 0xc45a20, 0.12);
      always.add(inst);
    }
  }).catch(() => {});

  // Ember lamps along unlocked-looking routes (culled with their zone).
  const lampGeo = g(new THREE.CylinderGeometry(0.07, 0.1, 3.6, low ? 4 : 6));
  const glowGeo = g(new THREE.SphereGeometry(0.16, 6, 5));
  const glowMat = basic(0xff7a2a, { transparent: true, opacity: 0.7, depthWrite: false });
  const lampSpots = [[28, 40], [44, 40], [12, 44], [60, 40], [12, 26], [36, 26], [60, 26], [12, 8], [36, 4], [60, 8]];
  const lamps = (low ? lampSpots.filter((_, i) => i % 2 === 0) : lampSpots).map(([c, r]) => {
    const g0 = new THREE.Group();
    const pole = new THREE.Mesh(lampGeo, tower); pole.position.y = 1.8; g0.add(pole);
    const gl = new THREE.Mesh(glowGeo, glowMat); gl.position.y = 3.55; g0.add(gl);
    g0.position.set(WX(c), 0, WZ(r));
    always.add(g0);
    return gl;
  });

  let lastMe = null;
  function cull(me) {
    lastMe = me || lastMe;
    if (!lastMe) return;
    const open = lastMe.open ?? 0xffff;
    for (const z of zones) {
      const d = Math.hypot(lastMe.x - z.userData.cx, lastMe.z - z.userData.cz);
      const unlocked = (open >> z.userData.zone) & 1;
      z.visible = d < (low ? 48 : 72) || z.userData.zone === 7;
      z.traverse(o => { if (o.isMesh) o.visible = z.visible && (unlocked || d < 36 || z.userData.zone === 7); });
    }
  }

  return {
    setMe(me) { cull(me); },
    update(dt, m, t) {
      if (spin) spin.rotation.y += dt * 0.55;
      for (const gl of lamps) gl.material.opacity = 0.45 + 0.3 * Math.abs(Math.sin((t || 0) * 3 + gl.id));
      const ln = m && m[4];
      if (pads.length) {
        const here = ln ? ln[0] : 0, st = ln ? ln[1] : 0, from = ln ? ln[2] : 0, to = ln ? ln[3] : 0, uT = ln ? ln[4] : 0;
        for (const p of pads) {
          p.car.visible = st === 0 && p.def.id === here;
          p.car.position.set(0, 0, 0);
        }
        if (st === 2 && pads[from] && pads[to]) {
          const dur = 4.2, u = Math.min(1, (uT || 0) / dur);
          const a = pads[from].def, b = pads[to].def;
          const car = pads[from].car;
          car.visible = true;
          car.position.set((b.x - a.x) * u, Math.sin(u * Math.PI) * 8, (b.z - a.z) * u);
        } else if (st === 1 && pads[from] && pads[to]) {
          const dur = 3.2, u = Math.min(1, (uT || 0) / dur);
          const a = pads[from].def, b = pads[to].def;
          const car = pads[from].car;
          car.visible = true;
          car.position.set((b.x - a.x) * u, 1.2 + Math.sin(u * Math.PI) * 3, (b.z - a.z) * u);
        }
      }
      if (lastMe && m) lastMe.open = m[0];
      cull(lastMe);
    },
    dispose() { group.removeFromParent(); }
  };
}
