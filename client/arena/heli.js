// Helicopter finale client: low-poly chopper (one merged mesh), blur-disc rotors, searchlight cone, rotor-wash dust,
// two door miniguns, tracers, rotor + minigun audio and a runtime HUD. Pure view of the server's `h` snapshot:
// [state, secs left, boarded ids, votes, active count, gunner ids, spin x10, pad x, pad z, seat y]
// state 1 inbound, 2 boarding, 3 liftoff, 4 left-behind surge, 5 done. Draw calls: body 1, rotor 1, tail rotor 1, cone 1, dust 1, guns 2, tracers 1, beacon 1 = 9.
import * as THREE from 'three';
const add = THREE.AdditiveBlending;
function merge(parts) {   // [geometry, color, [x,y,z], [rx,ry,rz]] -> one non-indexed geometry with baked vertex shading (no lights needed)
  const pos = [], col = [], c = new THREE.Color(), m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), n = new THREE.Vector3(), L = new THREE.Vector3(0.4, 0.85, 0.3).normalize();
  for (const [g0, hex, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]] of parts) { const g = g0.toNonIndexed(); m.compose(new THREE.Vector3(...p), q.setFromEuler(e.set(...r)), new THREE.Vector3(...s)); g.applyMatrix4(m); g.computeVertexNormals();
    const P = g.attributes.position.array, N = g.attributes.normal.array; c.setHex(hex);
    for (let i = 0; i < P.length; i += 3) { pos.push(P[i], P[i + 1], P[i + 2]); n.set(N[i], N[i + 1], N[i + 2]); const k = 0.45 + 0.55 * Math.max(0, n.dot(L)) + 0.12 * Math.max(0, -n.y); col.push(c.r * k, c.g * k, c.b * k); } g.dispose(); g0.dispose(); }
  const G = new THREE.BufferGeometry(); G.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); G.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); return G; }
function blurTex() { const cv = document.createElement('canvas'); cv.width = cv.height = 256; const x = cv.getContext('2d'), C = 128;
  const gr = x.createRadialGradient(C, C, 8, C, C, C); gr.addColorStop(0, 'rgba(40,40,40,0.9)'); gr.addColorStop(0.12, 'rgba(30,30,30,0.35)'); gr.addColorStop(0.9, 'rgba(25,25,25,0.22)'); gr.addColorStop(1, 'rgba(25,25,25,0)');
  x.fillStyle = gr; x.beginPath(); x.arc(C, C, C, 0, 7); x.fill();
  for (let b = 0; b < 4; b++) { const a = b * Math.PI / 2; for (let k = 0; k < 14; k++) { x.strokeStyle = `rgba(15,15,15,${0.5 * (1 - k / 14)})`; x.lineWidth = 10; x.beginPath(); x.arc(C, C, 70, a - k * 0.06, a - k * 0.06 - 0.05, true); x.lineTo(C, C); x.stroke(); } }   // smeared blade streaks
  x.strokeStyle = 'rgba(255,220,120,0.35)'; x.lineWidth = 3; x.beginPath(); x.arc(C, C, 124, 0, 7); x.stroke();   // painted blade tips
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; }
export function createHeli(scene, { low = false, gun = null } = {}) {
  const root = new THREE.Group(); root.visible = false; scene.add(root);
  const OL = 0x4a5a32, OD = 0x323d22, GL = 0x1a2a3a, BK = 0x1c1c1c, YE = 0xd8b030;
  const B = (w, h, d) => new THREE.BoxGeometry(w, h, d), Cy = (r0, r1, h, s = 8) => new THREE.CylinderGeometry(r0, r1, h, s);
  const body = new THREE.Mesh(merge([
    [B(2.4, 1.7, 4.6), OL, [0, 1.75, 0]], [B(2.2, 0.6, 4.2), OD, [0, 2.85, -0.1]], [B(2.0, 1.2, 1.4), GL, [0, 1.95, -2.9], [0.35, 0, 0]], [B(1.8, 0.8, 1.0), OL, [0, 1.25, -2.8]],
    [Cy(0.45, 0.22, 6, 6), OL, [0, 2.4, 4.9], [Math.PI / 2, 0, 0]], [B(0.15, 1.6, 1.0), OD, [0, 3.1, 7.6], [-0.3, 0, 0]], [B(2.4, 0.12, 0.6), OD, [0, 2.4, 7.2]],
    [Cy(0.28, 0.32, 0.5, 8), BK, [0, 3.35, 0]], [B(0.18, 0.18, 0.18), BK, [0, 3.65, 0]],
    [B(0.12, 0.12, 4.4), BK, [-1.2, 0.1, 0.1]], [B(0.12, 0.12, 4.4), BK, [1.2, 0.1, 0.1]], [B(0.1, 0.9, 0.1), BK, [-1.05, 0.5, -1.2], [0, 0, 0.3]], [B(0.1, 0.9, 0.1), BK, [1.05, 0.5, -1.2], [0, 0, -0.3]],
    [B(0.1, 0.9, 0.1), BK, [-1.05, 0.5, 1.4], [0, 0, 0.3]], [B(0.1, 0.9, 0.1), BK, [1.05, 0.5, 1.4], [0, 0, -0.3]],
    [B(0.9, 0.14, 0.7), OD, [-1.6, 1.6, 0.2]], [B(0.9, 0.14, 0.7), OD, [1.6, 1.6, 0.2]], [B(0.6, 0.3, 0.6), BK, [-1.95, 1.45, 0.2]], [B(0.6, 0.3, 0.6), BK, [1.95, 1.45, 0.2]],
    [B(2.42, 0.25, 0.08), YE, [0, 2.2, -2.32]], [Cy(0.22, 0.3, 0.35, 8), 0xeeeedd, [0.6, 0.85, -2.6], [0.4, 0, 0]], [B(1.2, 1.2, 0.05), 0x10141a, [-1.21, 1.9, 0.3], [0, Math.PI / 2, 0]]]),
    new THREE.MeshBasicMaterial({ vertexColors: true, fog: true })); root.add(body);
  const rotM = new THREE.MeshBasicMaterial({ map: blurTex(), transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true }); rotM.forceSinglePass = true;   // no back+front double pass
  const rotor = new THREE.Mesh(new THREE.CircleGeometry(6.2, low ? 20 : 32), rotM); rotor.rotation.x = -Math.PI / 2; rotor.position.y = 3.72; root.add(rotor);
  const tail = new THREE.Mesh(new THREE.CircleGeometry(1.0, 14), rotM); tail.rotation.y = Math.PI / 2; tail.position.set(0.18, 3.1, 7.7); root.add(tail);
  const gunGeo = merge([[Cy(0.12, 0.12, 0.6, 6), BK, [0, 0, 0.3], [Math.PI / 2, 0, 0]], ...[0, 1, 2, 3, 4, 5].map(k => [Cy(0.035, 0.035, 1.3, 4), 0x2a2a2a, [Math.cos(k) * 0.08, Math.sin(k) * 0.08, -0.55], [Math.PI / 2, 0, 0]]), [B(0.06, 0.25, 0.3), 0x2a2a2a, [0, -0.12, 0.6]]]),
    gunMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: true }), guns = [0, 1].map(i => { const m = new THREE.Mesh(gunGeo, gunMat); m.position.set(i ? 1.95 : -1.95, 1.75, -0.1); m.rotation.y = i ? -0.5 : 0.5; root.add(m); return m; });   // door miniguns swivel with their gunner
  // searchlight: open cone from the nose light, additive, fades with distance via vertex alpha baked into color
  const coneG = new THREE.ConeGeometry(4.5, 18, low ? 10 : 16, 1, true); coneG.translate(0, -9, 0); { const P = coneG.attributes.position, C = []; for (let i = 0; i < P.count; i++) { const k = 1 - Math.min(1, -P.getY(i) / 18); C.push(k, k * 0.92, k * 0.7); } coneG.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); }
  const cone = new THREE.Mesh(coneG, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.16, blending: add, depthWrite: false, side: THREE.DoubleSide, fog: false })); cone.material.forceSinglePass = true;
  cone.position.set(0.6, 0.85, -2.6); cone.rotation.x = 0.55; root.add(cone);
  // rotor wash dust (world space, on the pad)
  const DN = low ? 40 : 80, dP = new Float32Array(DN * 3), dV = new Float32Array(DN * 3), dustG = new THREE.BufferGeometry(); dustG.setAttribute('position', new THREE.BufferAttribute(dP, 3));
  const dust = new THREE.Points(dustG, new THREE.PointsMaterial({ color: 0x9a8a70, size: 0.5, transparent: true, opacity: 0.5, depthWrite: false, sizeAttenuation: true })); dust.frustumCulled = false; dust.visible = false; scene.add(dust);
  // tracers: one LineSegments pool
  const TN = 40, tP = new Float32Array(TN * 6), tC = new Float32Array(TN * 6), tL = new Float32Array(TN), trG = new THREE.BufferGeometry(); trG.setAttribute('position', new THREE.BufferAttribute(tP, 3)); trG.setAttribute('color', new THREE.BufferAttribute(tC, 3));
  const tracers = new THREE.LineSegments(trG, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: add, depthWrite: false })); tracers.frustumCulled = false; scene.add(tracers); let tI = 0;
  // pad beacon: pole + pulsing lamp (merged), visible while the quest/finale is on
  const beacon = new THREE.Mesh(merge([[Cy(0.06, 0.08, 2.2, 6), 0x333333, [0, 1.1, 0]], [B(0.4, 0.4, 0.4), 0xff3020, [0, 2.3, 0]]]), new THREE.MeshBasicMaterial({ vertexColors: true })); beacon.visible = false; scene.add(beacon);
  // ---------- audio (lazy; needs the page to have had a gesture, which joining a match already is) ----------
  let A = null; function audio() { if (A !== null) return A; try { const ctx = new (window.AudioContext || window.webkitAudioContext)(), nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource(); src.buffer = nb; src.loop = true; const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520; const chop = ctx.createGain(); chop.gain.value = 0.5; const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 11; const lg = ctx.createGain(); lg.gain.value = 0.45; lfo.connect(lg).connect(chop.gain);
      const vol = ctx.createGain(); vol.gain.value = 0; src.connect(lp).connect(chop).connect(vol).connect(ctx.destination); src.start(); lfo.start();
      const mg = ctx.createOscillator(); mg.type = 'sawtooth'; mg.frequency.value = 40; const mgf = ctx.createBiquadFilter(); mgf.type = 'bandpass'; mgf.frequency.value = 900; const mgv = ctx.createGain(); mgv.gain.value = 0; mg.connect(mgf).connect(mgv).connect(ctx.destination); mg.start();
      A = { ctx, vol, lfo, lp, mg, mgv, nb }; } catch { A = false; } return A; }
  function bang(k = 1) { const a = audio(); if (!a) return; const s = a.ctx.createBufferSource(); s.buffer = a.nb; const g = a.ctx.createGain(), hp = a.ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 700; const t0 = a.ctx.currentTime; g.gain.setValueAtTime(0.16 * k, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.06); s.connect(hp).connect(g).connect(a.ctx.destination); s.start(t0, Math.random(), 0.08); }
  // ---------- HUD (runtime elements, no markup / CSS file edits) ----------
  const mk = (id, css) => { let d = document.getElementById(id); if (!d) { d = document.createElement('div'); d.id = id; document.body.appendChild(d); } d.style.cssText = css; d.hidden = true; return d; };
  const hud = mk('heliHud', 'position:fixed;left:50%;top:calc(150px + env(safe-area-inset-top));transform:translateX(-50%);z-index:9;padding:6px 14px;border-radius:10px;background:rgba(10,14,8,.72);border:1px solid #7aff6a66;color:#e8ffe0;font:700 14px/1.35 system-ui,sans-serif;text-align:center;pointer-events:none;text-shadow:0 1px 2px #000;white-space:nowrap');
  const vote = document.getElementById('heliVote') || document.createElement('button'); vote.id = 'heliVote'; vote.hidden = true; vote.textContent = '🚁 VOTE TO LEAVE (V)'; document.body.appendChild(vote);
  vote.style.cssText = 'position:fixed;left:50%;top:calc(204px + env(safe-area-inset-top));transform:translateX(-50%);z-index:9;padding:10px 18px;border-radius:12px;border:2px solid #7aff6a;background:rgba(20,60,16,.85);color:#fff;font:800 15px system-ui,sans-serif;touch-action:manipulation';
  const gunP = mk('heliGun', 'position:fixed;left:50%;top:calc(258px + env(safe-area-inset-top));transform:translateX(-50%);z-index:9;padding:6px 12px;border-radius:8px;background:rgba(0,0,0,.6);color:#ffd27a;font:700 14px system-ui,sans-serif;pointer-events:none');
  const res = mk('heliRes', 'position:fixed;inset:0;z-index:30;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;color:#fff;font:700 16px system-ui,sans-serif;text-align:center;pointer-events:none;text-shadow:0 2px 6px #000');
  const wash = mk('heliWash', 'position:fixed;inset:0;z-index:7;pointer-events:none;background:radial-gradient(ellipse at center,transparent 45%,rgba(160,0,0,.45));');
  let voteQ = false; vote.onclick = e => { e.stopPropagation(); voteQ = true; vote.disabled = true; vote.textContent = '✅ VOTED'; };
  const onKey = e => { if (e.code === 'KeyV' && !e.repeat && !vote.hidden && !vote.disabled) vote.onclick(e); }; addEventListener('keydown', onKey);
  // ---------- state ----------
  let H = null, st = 0, tLoc = 0, outT = 0, lastSt = 0, myRes = null, leftT = 0, padY = 3.6, shake = 0; const tmp = new THREE.Vector3(), from = new THREE.Vector3();
  const fmt = s => `${Math.floor(s / 60)}:${String(Math.max(0, Math.floor(s % 60))).padStart(2, '0')}`;
  function showRes(e) { const x = e.r === 'x'; res.hidden = false;
    res.style.background = x ? 'radial-gradient(ellipse at center,rgba(20,70,20,.55),rgba(0,0,0,.85))' : 'radial-gradient(ellipse at center,rgba(90,0,0,.55),rgba(0,0,0,.9))';
    res.innerHTML = `<div style="font:900 clamp(40px,9vw,92px)/1 system-ui;letter-spacing:.06em;color:${x ? '#8aff7a' : '#ff4a3a'}">${x ? 'EXTRACTED' : 'LEFT BEHIND'}</div>
      <div style="opacity:.85">${x ? 'Kestrel-two is wheels up. You made it out of the Refinery.' : 'The bird is gone. The Refinery keeps you.'}</div>
      <div style="display:flex;gap:18px;margin-top:6px;font-size:18px"><span>🔥 ${e.pts} pts</span><span>☠️ ${e.kills} kills</span><span>🌊 wave ${e.wave}</span><span>⏱ ${fmt(e.secs || 0)}</span></div>
      <div style="opacity:.6;font-size:13px;margin-top:8px">${x ? 'Next: the flight to a new zone (coming soon)' : 'Next time: get to the pad'}</div>`; }
  return {
    get state() { return st; },
    aboard: (h, me) => !!(h && h[2] && h[2].includes(me)),
    takeVote() { const v = voteQ; voteQ = false; return v; },
    event(e, me) {
      if (e.e === 'heli') { if (e.s === 1) { shake = 0.3; } if (e.s === 3 && e.why) this.toast?.(e.why === 'vote' ? '🚁 Vote passed, lifting off!' : e.why === 'all' ? '🚁 Everyone aboard, lifting off!' : '🚁 Out of time, lifting off!'); }
      if (e.e === 'hres' && e.id === me) { myRes = e; if (e.r === 'x') showRes(e); }
      if (e.e === 'hleft' && e.id === me) { leftT = 1; wash.hidden = false; }
      if (e.e === 'gameover' && myRes && myRes.r === 'l') showRes(myRes);
      if (e.e === 'hgun' && e.id === me) audio(); },
    tracer(e, mine) { const i = tI++ % TN, o = i * 6; tP[o] = e.x; tP[o + 1] = (e.y || padY) + 1.75 - 0.4; tP[o + 2] = e.z; tP[o + 3] = e.tx; tP[o + 4] = e.ty ?? e.y; tP[o + 5] = e.tz; tL[i] = 1;
      if (root.visible) { tmp.set(0, 1.75, -1.6); tmp.x = e.g ? 1.95 : -1.95; root.localToWorld(tmp); tP[o] = tmp.x; tP[o + 1] = tmp.y; tP[o + 2] = tmp.z; }
      bang(mine ? 1 : 0.4); },
    update(dt, t, h, ctx) {   // ctx: { me, cam, quest }
      const q = ctx.quest; beacon.visible = !!(q && q[0] >= 6 && q[6] != null && ctx.hasPad); if (beacon.visible) { beacon.position.set(q[6], q[8] ? padY : 0, q[7]); beacon.children; beacon.material.color.setScalar(q[0] >= 10 || (Math.sin(t * 6) > 0) ? 1.6 : 0.5); }
      for (let i = 0; i < TN; i++) { if (tL[i] <= 0) continue; tL[i] -= dt * 9; const k = Math.max(0, tL[i]), o = i * 6; tC[o] = 1 * k; tC[o + 1] = 0.85 * k; tC[o + 2] = 0.45 * k; tC[o + 3] = 0.6 * k; tC[o + 4] = 0.3 * k; tC[o + 5] = 0.1 * k; if (k <= 0) for (let j = 0; j < 6; j++) tP[o + j] = 0; }
      trG.attributes.position.needsUpdate = true; trG.attributes.color.needsUpdate = true;
      if (leftT > 0) { leftT += dt; wash.style.opacity = 0.6 + 0.4 * Math.sin(t * 5); }
      if (!h && !myRes) { if (H) { root.visible = dust.visible = false; hud.hidden = vote.hidden = gunP.hidden = true; } H = null; st = 0; return; }
      if (!h) { hud.hidden = vote.hidden = gunP.hidden = true; root.visible = false; dust.visible = false; return; }
      H = h; const S = h[0], me = ctx.me; padY = h[9] - 0.4;
      if (S !== lastSt) { tLoc = h[1]; lastSt = S; if (S >= 4) outT = 0; } else tLoc = Math.min(h[1], Math.max(h[1] - 1, tLoc - dt));
      st = S; const px = h[7], pz = h[8];
      // flight path: inbound from the north-east, hover, settle; liftoff climbs; then flies off to the south-west
      let x = px, y = padY, z = pz, yaw = 0, tilt = 0, rs = 1;
      if (S === 1) { const u = Math.max(0, Math.min(1, 1 - tLoc / 20)), e = 1 - Math.pow(1 - u, 3); from.set(px + 110, padY + 55, pz - 140); const land = Math.max(0, (u - 0.8) / 0.2);
        x = from.x + (px - from.x) * e; z = from.z + (pz - from.z) * e; y = from.y + (padY + 6 - from.y) * e - 6 * land * land; yaw = Math.atan2(from.x - px, from.z - pz) * (1 - land); tilt = 0.25 * (1 - e); }
      else if (S === 2) y = padY + Math.sin(t * 2) * 0.04;
      else if (S === 3) { y = h[9] - 0.4 + Math.sin(t * 2) * 0.05; tilt = -0.05; }
      else { outT += dt; const u = outT; y = h[9] - 0.4 + u * 4 + u * u * 0.4; x = px - u * u * 2.5; z = pz + u * u * 3; tilt = Math.min(0.3, u * 0.08); yaw = 0.6; if (u > 14) root.visible = false; }
      root.visible = S < 4 || outT < 14; root.position.set(x, y, z); root.rotation.set(tilt, yaw, 0);
      rotor.rotation.z += dt * 38 * rs; tail.rotation.x += dt * 60; rotM.opacity = 0.85 + 0.15 * Math.sin(t * 50);
      cone.visible = S <= 3; cone.material.opacity = (low ? 0.11 : 0.16) * (0.85 + 0.15 * Math.sin(t * 3)); cone.rotation.z = Math.sin(t * 0.7) * 0.25;
      // rotor wash: dust ring near the pad whenever the bird is low
      const hgt = y - padY, washOn = hgt < 14 && S < 5; dust.visible = washOn;
      if (washOn) { const str = 1 - hgt / 14; for (let i = 0; i < DN; i++) { const o = i * 3; let r = Math.hypot(dP[o] - x, dP[o + 2] - z);
          if (dP[o + 1] <= 0 || r > 9 || dV[o] === 0) { const a = Math.random() * 6.28, rr = 1 + Math.random() * 2; dP[o] = x + Math.cos(a) * rr; dP[o + 1] = padY + 0.1 + Math.random() * 0.3; dP[o + 2] = z + Math.sin(a) * rr; const v = (4 + Math.random() * 5) * str; dV[o] = Math.cos(a) * v; dV[o + 1] = 0.6 + Math.random(); dV[o + 2] = Math.sin(a) * v; }
          dP[o] += dV[o] * dt; dP[o + 1] += (dV[o + 1] -= dt * 1.5) * dt; dP[o + 2] += dV[o + 2] * dt; if (dP[o + 1] < padY) dP[o + 1] = -1; }
        dustG.attributes.position.needsUpdate = true; dust.material.opacity = 0.55 * str; }
      // audio: rotor gets louder as it closes in; thump rate rises on liftoff
      const a = audio(); if (a) { const d = ctx.cam ? ctx.cam.position.distanceTo(root.position) : 50, v = root.visible ? Math.min(1, Math.pow(Math.max(0, 1 - d / 170), 2) * 1.1) * 0.55 : 0; a.vol.gain.setTargetAtTime(v, a.ctx.currentTime, 0.15); a.lfo.frequency.setTargetAtTime(S >= 3 ? 14 : 11, a.ctx.currentTime, 0.5); a.lp.frequency.value = 350 + 500 * v; }
      // HUD
      const on = h[2].includes(me), gi = h[5].indexOf(me), act = h[4] || 1, need = Math.floor(act / 2) + 1;
      if (a) { const sp = gi >= 0 ? (h[6][gi] || 0) / 10 : 0; a.mg.frequency.setTargetAtTime(40 + sp * 180, a.ctx.currentTime, 0.05); a.mgv.gain.setTargetAtTime(sp * 0.08, a.ctx.currentTime, 0.05); }
      h[5].forEach((id, i) => { const g = guns[i]; const p = id && ctx.players ? ctx.players.find(o => o.id === id) : null; const ty = p ? (id === me && ctx.yaw != null ? ctx.yaw : p.r) - root.rotation.y + Math.PI : (i ? -0.5 : 0.5), tp = p ? (id === me && ctx.pitch != null ? ctx.pitch : p.pi || 0) : 0;
        g.rotation.order = 'YXZ'; g.rotation.y += (Math.atan2(Math.sin(ty - g.rotation.y), Math.cos(ty - g.rotation.y))) * Math.min(1, dt * 14); g.rotation.x = tp; g.rotation.z += dt * 40 * (h[6][i] || 0) / 10; });
      if (gun) gun.visible = gun.visible && gi < 0;   // the door gun replaces the view-model while manning
      hud.hidden = S >= 4; vote.hidden = !(on && S === 2); if (vote.hidden) { vote.disabled = false; vote.textContent = '🚁 VOTE TO LEAVE (V)'; }
      if (S === 1) hud.innerHTML = `🚁 KESTREL-TWO INBOUND · ${fmt(tLoc)}<br><small style="opacity:.8">Hold the rooftop helipad</small>`;
      else if (S === 2 && h[10]) hud.innerHTML = `🚁 DEPARTING IN ${h[10]} · aboard ${h[2].length}/${act}<br><small style="opacity:.8">${on ? 'Man a minigun (USE) · vote to leave now' : 'Get on the pad NOW'}</small>`;
      else if (S === 2) hud.innerHTML = `🚁 BOARDING · ${fmt(tLoc)} · aboard ${h[2].length}/${act}<br><small style="opacity:.8">${on ? `Votes to leave ${h[3]}/${need} needed` : 'Stand on the helipad to board'}</small>`;
      else if (S === 3) hud.innerHTML = '🚁 LIFTING OFF';
      gunP.hidden = !on || S > 3; gunP.textContent = gi >= 0 ? `MINIGUN ${gi ? 'R' : 'L'} · hold FIRE to spin up · USE to let go` : h[5].includes(0) ? 'Press USE to man a door minigun' : 'Both miniguns manned';
      if (shake > 0) shake -= dt; },
    shakeAmt: () => Math.max(0, shake),
    get objs() { return [root, dust, tracers, beacon]; },   // perf checks: everything this module adds to the scene
    dispose() { removeEventListener('keydown', onKey); for (const o of [root, dust, tracers, beacon]) scene.remove(o); [hud, vote, gunP, res, wash].forEach(d => d.remove()); body.geometry.dispose(); gunGeo.dispose(); rotM.map.dispose(); try { A && A.ctx.close(); } catch {} }
  };
}
