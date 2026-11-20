// First-person camera for walk-in estate interiors (homes from #659/#660 and private rooms).
// Presentation only: the room's own motion resolver (resolveSecretRoomMotion, 0.35 m capsule)
// still owns where the player can stand; this module only places the eye, looks, aims and bobs.
//
//   const fp = createEstateFirstPerson({ THREE, camera, avatar, domElement, getYaw, setYaw, getPitch, setPitch });
//   fp.enter()                        // on entering an interior (saves fov/near/far, hides head via P.fp)
//   fp.tick({ layout, origin, local, yaw, pitch, dt, moved })  -> { aim }   // every frame while inside
//   fp.exit()                         // restores the previous third-person camera settings
//
// Pure helpers (unit-tested): eyeHeightFor, resolveEyeCollision, aimInteraction, headBob.

export const FP = Object.freeze({
  fov: 74,            // slightly wide for small rooms (city camera is 58)
  near: 0.05,         // close near plane so walls 0.3 m away never clip
  far: 160,           // interiors are small: tighter far plane = better depth precision
  pitchMax: 1.2,      // ~69°: look at floor/ceiling without flipping
  eyeRadius: 0.22,    // eye capsule radius (player capsule is 0.35, so this is a safety net)
  ceilingGap: 0.18,
  dwell: 0.25,        // seconds the reticle must rest on a target before its prompt opens
  reach: 2.4,         // how far the centre reticle can "touch" a door / stairs / tablet
  bobWalk: 0.022, bobRun: 0.034, bobSide: 0.012,
  defaultEye: 1.62
});

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const finite = v => Number.isFinite(v);

// Eye height from the current skin's world-space height (skins differ: kid/robot/tall avatars).
export function eyeHeightFor(height) {
  if (!finite(height) || height < 0.6 || height > 3.5) return FP.defaultEye;
  return clamp(height * 0.92, 1.05, 1.9);
}

// Preferred: the skin's own head pivot (walker / NFT skins expose userData.head). `headY` is the
// head centre above the feet; eyes sit just above it. Hats, halos and jetpacks don't count.
export function eyeFromHead(headY) {
  if (!finite(headY) || headY < 0.8 || headY > 2.4) return null;
  return clamp(headY + 0.03, 1.05, 1.95);
}

// Keep the eye inside the room and out of solid furniture (axis-aligned obstacle footprints,
// already inflated for rotation by the layout). Returns a corrected {x,z}.
export function resolveEyeCollision(layout, p, r = FP.eyeRadius) {
  if (!layout?.bounds || !finite(p?.x) || !finite(p?.z)) return p;
  let x = clamp(p.x, -layout.bounds.x + r, layout.bounds.x - r), z = clamp(p.z, -layout.bounds.z + r, layout.bounds.z - r);
  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    for (const o of layout.obstacles || []) {
      const dx = x - o.x, dz = z - o.z, px = o.halfX + r - Math.abs(dx), pz = o.halfZ + r - Math.abs(dz);
      if (px > 0 && pz > 0) { // inside: push out along the shallower axis
        if (px < pz) x += Math.sign(dx || 1) * px; else z += Math.sign(dz || 1) * pz;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return { x, z };
}

// Ray (from the eye, along the view direction) against each interaction, modelled as a vertical
// cylinder from the floor to 2.3 m. Solid furniture between the eye and the target blocks it
// (3D slab test using each solid item's height). Returns the nearest hit interaction or null.
export function aimInteraction(layout, eye, dir, reach = FP.reach) {
  if (!layout?.interactions?.length || ![eye?.x, eye?.y, eye?.z, dir?.x, dir?.y, dir?.z].every(finite)) return null;
  const solids = (layout.obstacles || []).map(o => {
    const it = (layout.items || []).find(i => i.id === o.id);
    const y0 = it ? it.y - it.h / 2 : 0, y1 = it ? it.y + it.h / 2 : 3;
    return { minX: o.x - o.halfX, maxX: o.x + o.halfX, minY: y0, maxY: y1, minZ: o.z - o.halfZ, maxZ: o.z + o.halfZ };
  });
  const slab = b => {
    let t0 = 0, t1 = reach;
    for (const [o, d, lo, hi] of [[eye.x, dir.x, b.minX, b.maxX], [eye.y, dir.y, b.minY, b.maxY], [eye.z, dir.z, b.minZ, b.maxZ]]) {
      if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return Infinity; continue; }
      let a = (lo - o) / d, c = (hi - o) / d; if (a > c) [a, c] = [c, a];
      t0 = Math.max(t0, a); t1 = Math.min(t1, c); if (t0 > t1) return Infinity;
    }
    return t0;
  };
  let best = null, bestT = Infinity;
  for (const it of layout.interactions) {
    const r = clamp((it.radius || .6) * .75, .35, .7);
    // ray vs infinite vertical cylinder in XZ
    const ox = eye.x - it.x, oz = eye.z - it.z, a = dir.x * dir.x + dir.z * dir.z;
    let t;
    // standing on it already: the proximity trigger handles that, the reticle only aims ahead
    if (ox * ox + oz * oz <= r * r || a < 1e-9) continue;
    {
      const b = 2 * (ox * dir.x + oz * dir.z), c = ox * ox + oz * oz - r * r, disc = b * b - 4 * a * c;
      if (disc < 0) continue;
      t = (-b - Math.sqrt(disc)) / (2 * a);
      if (t < 0) continue;
    }
    if (t > reach) continue;
    const y = eye.y + dir.y * t;
    if (y < 0 || y > 2.3) continue;
    if (solids.some(b => slab(b) < t - 1e-3)) continue; // something solid in the way
    if (t < bestT) { bestT = t; best = it; }
  }
  return best;
}

// Gentle head-bob from distance walked. Returns {y, side} offsets in metres (0 when reduced motion).
export function headBob(phase, speed, reduced) {
  if (reduced || !finite(phase) || !(speed > 0.15)) return { y: 0, side: 0 };
  const k = clamp(speed / 4.5, 0, 1.6), amp = speed > 5.5 ? FP.bobRun : FP.bobWalk;
  return { y: Math.abs(Math.sin(phase)) * amp * Math.min(1, k) - amp * .5 * Math.min(1, k), side: Math.sin(phase) * FP.bobSide * Math.min(1, k) };
}

export function createEstateFirstPerson({ THREE, camera, avatar, domElement = null, getYaw, setYaw, getPitch = () => 0, setPitch = () => {}, doc = globalThis.document, win = globalThis.window } = {}) {
  let aimFor = 0, saved = null, eye = FP.defaultEye, phase = 0, bobBlend = 0, reticle = null, dragging = null, lastAim = null;
  const mq = win?.matchMedia?.('(prefers-reduced-motion: reduce)'), reduced = () => !!mq?.matches; // live, read once per frame
  const dir = { x: 0, y: 0, z: -1 };

  function measureEye() {
    try {
      const head = avatar?.userData?.head;
      if (head?.getWorldPosition && THREE?.Vector3) {
        avatar.updateMatrixWorld?.(true);
        const e = eyeFromHead(head.getWorldPosition(new THREE.Vector3()).y - avatar.position.y);
        if (e) return e;
      }
      if (!THREE?.Box3 || !avatar) return FP.defaultEye;
      const was = avatar.visible; avatar.visible = true;
      const box = new THREE.Box3().setFromObject(avatar); avatar.visible = was;
      return eyeHeightFor(box.max.y - box.min.y);
    } catch { return FP.defaultEye; }
  }
  function ensureReticle() {
    if (!doc?.body) return null;
    if (reticle?.isConnected) return reticle;
    reticle = doc.createElement('div'); reticle.id = 'bcFpReticle'; reticle.setAttribute('aria-hidden', 'true');
    reticle.innerHTML = '<i></i><span></span>'; doc.body.append(reticle);
    return reticle;
  }
  // Desktop: left-drag looks; a click without dragging asks for pointer lock (Esc releases it).
  const onDown = e => {
    if (!saved || e.pointerType !== 'mouse' || e.button !== 0) return;
    dragging = { x: e.clientX, y: e.clientY, moved: false };
  };
  const onMove = e => {
    if (!dragging || doc?.pointerLockElement) return;
    const dx = e.clientX - dragging.x, dy = e.clientY - dragging.y;
    if (!dragging.moved && Math.hypot(dx, dy) < 4) return;
    dragging.moved = true; dragging.x = e.clientX; dragging.y = e.clientY;
    setYaw(getYaw() - dx * .0042); setPitch(clamp(getPitch() - dy * .0042, -FP.pitchMax, FP.pitchMax));
  };
  const onUp = e => {
    if (!dragging) return; const click = !dragging.moved; dragging = null;
    if (click && saved && e.pointerType === 'mouse' && !doc?.pointerLockElement) domElement?.requestPointerLock?.();
  };

  function enter() {
    if (saved) return;
    saved = { fov: camera.fov, near: camera.near, far: camera.far };
    camera.fov = FP.fov; camera.near = FP.near; camera.far = Math.max(FP.far, Math.min(camera.far, FP.far));
    camera.updateProjectionMatrix?.();
    eye = measureEye(); phase = 0; bobBlend = 0;
    setPitch(clamp(getPitch(), -.25, .15)); // level-ish gaze on arrival
    const r = ensureReticle(); if (r) { r.classList.add('on'); r.classList.remove('hot'); }
    domElement?.addEventListener('pointerdown', onDown);
    win?.addEventListener('pointermove', onMove); win?.addEventListener('pointerup', onUp);
  }
  function exit() {
    if (!saved) return;
    camera.fov = saved.fov; camera.near = saved.near; camera.far = saved.far; camera.updateProjectionMatrix?.();
    saved = null; dragging = null; lastAim = null;
    if (doc?.pointerLockElement) doc.exitPointerLock?.();
    reticle?.classList.remove('on', 'hot'); const lbl = reticle?.querySelector('span'); if (lbl) lbl.textContent = '';
    domElement?.removeEventListener('pointerdown', onDown);
    win?.removeEventListener('pointermove', onMove); win?.removeEventListener('pointerup', onUp);
  }
  // Place the eye. `local` is the resolved player position in room space, `moved` metres this frame.
  function tick({ layout, origin, local, dt = 1 / 60, moved = 0 }) {
    if (!saved || !layout || !origin || !local) return { aim: null };
    const yaw = getYaw();
    let pitch = getPitch();
    if (Math.abs(pitch) > FP.pitchMax) { pitch = clamp(pitch, -FP.pitchMax, FP.pitchMax); setPitch(pitch); }
    const step = clamp(dt, 0, .1), speed = step > 0 ? moved / step : 0;
    phase += moved * 2.4;
    bobBlend += ((speed > .15 ? 1 : 0) - bobBlend) * (1 - Math.exp(-step * 8));
    const bob = headBob(phase, speed, reduced());
    const ceiling = finite(layout.height) ? layout.height - FP.ceilingGap : 2.6;
    const floorY = layout.walkHeight || 0, eyeY = floorY + Math.min(eye, ceiling - floorY) + bob.y * bobBlend; // room space
    // side sway is perpendicular to the view direction
    const sx = Math.cos(yaw) * bob.side * bobBlend, sz = -Math.sin(yaw) * bob.side * bobBlend;
    const at = resolveEyeCollision(layout, { x: local.x + sx, z: local.z + sz });
    dir.x = -Math.sin(yaw) * Math.cos(pitch); dir.y = Math.sin(pitch); dir.z = -Math.cos(yaw) * Math.cos(pitch);
    const wy = origin.y + eyeY;
    camera.position.set(origin.x + at.x, wy, origin.z + at.z);
    camera.lookAt(origin.x + at.x + dir.x, wy + dir.y, origin.z + at.z + dir.z);
    const aim = aimInteraction(layout, { x: at.x, y: eyeY, z: at.z }, dir);
    if (aim !== lastAim) {
      lastAim = aim; aimFor = 0;
      if (reticle) { reticle.classList.toggle('hot', !!aim); reticle.querySelector('span').textContent = aim?.title || ''; }
    } else aimFor += step;
    // a short dwell so sweeping the view across the room doesn't flash prompts
    return { aim: aim && aimFor >= FP.dwell ? aim : null, hover: aim };
  }
  return { enter, exit, tick, get active() { return !!saved; }, get eye() { return eye; } };
}
