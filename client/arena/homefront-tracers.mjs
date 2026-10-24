// Pooled tracer lines + one reusable muzzle flash for Homefront firearms.
// One LineSegments draw call with preallocated buffers: emitting a tracer never allocates
// geometry or materials, so sustained machine-gun bursts stay cheap on phones.
// Presentation only: tracers are drawn from server-confirmed hits.
export function createTracerPool(THREE, parent, { max = 24 } = {}) {
  const cap = Math.max(1, Math.min(64, max | 0));
  const positions = new Float32Array(cap * 6);
  const colors = new Float32Array(cap * 6);
  const life = new Float32Array(cap), maxLife = new Float32Array(cap), rgb = new Float32Array(cap * 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setDrawRange(0, 0);
  const material = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const lines = new THREE.LineSegments(geometry, material);
  lines.frustumCulled = false; lines.renderOrder = 5;
  parent.add(lines);
  const flash = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.9, depthWrite: false }));
  flash.visible = false; parent.add(flash);
  let flashLife = 0, next = 0, live = 0, high = 0;
  const color = new THREE.Color();
  function emit(from, to, hex = 0xffd27a, seconds = 0.12) {
    const i = next; next = (next + 1) % cap;
    const o = i * 6;
    positions[o] = from.x; positions[o + 1] = from.y; positions[o + 2] = from.z;
    positions[o + 3] = to.x; positions[o + 4] = to.y; positions[o + 5] = to.z;
    color.setHex(hex); rgb[i * 3] = color.r; rgb[i * 3 + 1] = color.g; rgb[i * 3 + 2] = color.b;
    if (life[i] <= 0) live++;
    life[i] = maxLife[i] = Math.max(0.02, seconds);
    high = Math.max(high, i + 1);
    geometry.setDrawRange(0, high * 2);
    geometry.attributes.position.needsUpdate = true;
    flash.position.set(from.x, from.y, from.z); flash.visible = true; flashLife = 0.06;
    return i;
  }
  function update(dt) {
    if (flashLife > 0) { flashLife -= dt; if (flashLife <= 0) flash.visible = false; }
    if (!live) return;
    for (let i = 0; i < high; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      const k = life[i] > 0 ? life[i] / maxLife[i] : 0;
      if (life[i] <= 0) live--;
      for (let v = 0; v < 2; v++) { const c = i * 6 + v * 3; colors[c] = rgb[i * 3] * k; colors[c + 1] = rgb[i * 3 + 1] * k; colors[c + 2] = rgb[i * 3 + 2] * k; }
    }
    geometry.attributes.color.needsUpdate = true;
    if (!live) { high = 0; geometry.setDrawRange(0, 0); }
  }
  return { emit, update, get live() { return live; }, capacity: cap, object: lines, flash };
}
