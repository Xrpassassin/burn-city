// Blacktide NPC vessel prototypes.
// Small procedural ships avoid external model dependencies and can be replaced
// by licensed art later without changing fleet/combat contracts.

function material(THREE, color, roughness = 0.82, metalness = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, flatShading: true });
}

export function createFleet(THREE, scene) {
  const specs = [
    { id: 'merchant-cinder', kind: 'merchant', x: -28, z: -48, color: 0x75513a, sail: 0xc8bca0, speed: 2.8,
      route: [[-28, -48], [-4, -75], [20, -58], [4, -30]] },
    { id: 'patrol-salt', kind: 'patrol', x: 78, z: 5, color: 0x343d49, sail: 0x8f9eaa, speed: 3.8,
      route: [[78, 5], [103, 24], [137, 12], [120, -10]] },
    { id: 'merchant-gallows', kind: 'merchant', x: -98, z: 82, color: 0x5c4532, sail: 0xd4c7a4, speed: 2.4,
      route: [[-98, 82], [-120, 62], [-153, 83], [-142, 111]] }
  ];

  return specs.map((spec, index) => {
    const group = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.CapsuleGeometry(1.35, 4.2, 3, 7), material(THREE, spec.color));
    hull.rotation.x = Math.PI / 2;
    hull.scale.set(1, 0.72, 1);
    hull.position.y = 0.1;
    group.add(hull);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(2.45, 0.32, 4.2), material(THREE, 0x806044));
    deck.position.y = 0.55;
    group.add(deck);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 5.3, 6), material(THREE, 0x493022));
    mast.position.set(0, 3.15, -0.15);
    group.add(mast);
    const sail = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 2.9), new THREE.MeshStandardMaterial({
      color: spec.sail, side: THREE.DoubleSide, roughness: 1, flatShading: true
    }));
    sail.position.set(0, 3.45, -0.3);
    group.add(sail);
    const pennant = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.75, 4), material(THREE, spec.kind === 'patrol' ? 0xb44c32 : 0xd4a45d));
    pennant.position.set(0, 5.95, -0.15);
    pennant.rotation.z = Math.PI / 2;
    group.add(pennant);
    group.position.set(spec.x, 0, spec.z);
    group.rotation.y = Math.atan2(-(spec.route[1][0] - spec.x), -(spec.route[1][1] - spec.z));
    scene.add(group);
    return {
      ...spec, group, health: spec.kind === 'patrol' ? 140 : 80,
      maxHealth: spec.kind === 'patrol' ? 140 : 80,
      radius: spec.kind === 'patrol' ? 4.5 : 4,
      routeIndex: 1, phase: index * 1.9, alive: true
    };
  });
}

// Lightweight local prototype; combat authority and loot belong server-side.
export function updateFleet(fleet, dt, time, sampleOceanHeight, active = true) {
  for (const boat of fleet) {
    if (!boat.alive) continue;
    const group = boat.group;
    if (active) {
      const target = boat.route[boat.routeIndex];
      const dx = target[0] - group.position.x;
      const dz = target[1] - group.position.z;
      const distance = Math.hypot(dx, dz);
      if (distance < 2.5) boat.routeIndex = (boat.routeIndex + 1) % boat.route.length;
      else {
        const step = Math.min(distance, boat.speed * dt);
        group.position.x += dx / distance * step;
        group.position.z += dz / distance * step;
        group.rotation.y = Math.atan2(-dx, -dz);
      }
    }
    group.position.y = sampleOceanHeight(group.position.x, group.position.z, time) + Math.sin(time * 1.1 + boat.phase) * 0.045;
    group.rotation.z = Math.sin(time * 0.72 + boat.phase) * 0.018;
    group.rotation.x = Math.cos(time * 0.61 + boat.phase) * 0.012;
  }
}

export function removeVessel(scene, vessel) {
  vessel.alive = false;
  scene.remove(vessel.group);
  vessel.group.traverse(object => {
    if (!object.isMesh) return;
    object.geometry.dispose();
    if (Array.isArray(object.material)) object.material.forEach(m => m.dispose());
    else object.material.dispose();
  });
}
