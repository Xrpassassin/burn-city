// Homefront jetpack: basic flight with fuel in your refuge yard, on the city jetpack's physics
// (client/js/player-motion.mjs JETPACK, jetHorizontal/jetVertical) at yard scale.
// Ownership comes from the server (GET /api/jetpack → owned.homefront); this module is presentation only.
// Controls: J or the JET button toggles it; hold Space / the JUMP button to climb, C to descend,
// release to hover-glide down slowly. Never changes the camera (overhead stays build-mode only).
import { JETPACK, MOTION, jetHorizontal, jetVertical, stepFuel } from '../js/player-motion.mjs';

export const YARD_JET = Object.freeze({ scale: 0.3, ceiling: 5.5, glide: -1.2 });

// Pure step (testable). m = {y, vy, onGround}, v = {x, z} horizontal velocity, j = {on, fuel, flying}.
// input = {mx, mz, up, down, boost}. Returns true while airborne under jet control.
export function stepYardJet(j, m, v, dt, floor, input) {
  const s = YARD_JET.scale;
  const thrust = j.on && j.fuel > 0 && !!input.up;
  j.flying = j.on && (thrust || m.y > floor + 0.02);
  if (!j.flying) { v.x = 0; v.z = 0; if (m.y - floor <= 0.02) { m.y = floor; m.vy = 0; m.onGround = true; } j.fuel = stepFuel(j.fuel, dt, false, true); return false; }
  jetHorizontal(v, dt, input.mx || 0, input.mz || 0, !!input.boost, s, 1);
  if (thrust) m.vy = jetVertical(m.vy, dt, true, false, s);
  else if (input.down) m.vy = jetVertical(m.vy, dt, false, true, s);
  else m.vy += (YARD_JET.glide - m.vy) * (1 - Math.exp(-dt * JETPACK.lift));   // out of fuel / released: slow glide down
  m.y += m.vy * dt;
  if (m.y > floor + YARD_JET.ceiling) { m.y = floor + YARD_JET.ceiling; if (m.vy > 0) m.vy = 0; }
  if (m.y <= floor) { m.y = floor; m.vy = 0; m.onGround = true; j.flying = false; } else m.onGround = false;
  j.fuel = stepFuel(j.fuel, dt, thrust, m.onGround);
  return j.flying;
}

// DOM controller for the yard. host = the yard's view container (where the joystick/JUMP buttons live).
export function createYardJetpack({ host, view, coarse = false }) {
  const j = { on: false, fuel: 1, flying: false, owned: false }, v = { x: 0, z: 0 };
  let held = false, down = false;
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'hf-act hf-jet'; btn.textContent = 'JET'; btn.hidden = true; btn.setAttribute('aria-label', 'Toggle jetpack (J)'); btn.setAttribute('aria-pressed', 'false');
  // iPhone-safe: thumb-sized, stacked above RUN on the right edge, clear of the joystick and the view toggle.
  btn.style.cssText = 'position:absolute;right:12px;bottom:144px;width:58px;height:58px;border-radius:50%;border:2px solid #ffb06088;background:#1b1512cc;color:#ffe0c0;font:800 12px system-ui;z-index:3;touch-action:none';
  const bar = document.createElement('div'); bar.className = 'hf-jetfuel'; bar.hidden = true;
  bar.style.cssText = 'position:absolute;right:12px;bottom:' + (coarse ? 208 : 12) + 'px;width:58px;height:7px;border-radius:4px;background:#ffffff22;overflow:hidden;z-index:3;pointer-events:none';
  const fill = document.createElement('i'); fill.style.cssText = 'display:block;height:100%;width:100%;background:linear-gradient(90deg,#ff6a1a,#ffd36a)'; bar.append(fill);
  const toggle = () => { if (!j.owned) return; j.on = !j.on; btn.setAttribute('aria-pressed', String(j.on)); btn.style.background = j.on ? '#7a2a08e0' : '#1b1512cc'; };
  btn.addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); toggle(); });
  host.append(btn, bar);
  // Hold-to-climb: Space (desktop) or the existing JUMP button (touch); C/Ctrl descends.
  const jump = [...host.querySelectorAll('.hf-act')].find(b => b.textContent === 'JUMP');
  if (jump) { jump.addEventListener('pointerdown', () => { held = true; }); for (const n of ['pointerup', 'pointercancel', 'pointerleave']) jump.addEventListener(n, () => { held = false; }); }
  const typing = t => /INPUT|TEXTAREA|SELECT/.test(t?.tagName || '');
  addEventListener('keydown', e => { if (typing(e.target)) return; if (e.code === 'KeyJ' && !e.repeat) toggle(); if (e.code === 'Space') held = true; if (e.code === 'KeyC' || e.code === 'ControlLeft') down = true; });
  addEventListener('keyup', e => { if (e.code === 'Space') held = false; if (e.code === 'KeyC' || e.code === 'ControlLeft') down = false; });
  return {
    state: j,
    setOwned(owned) { j.owned = !!owned; if (!j.owned) j.on = false; btn.hidden = !j.owned; },
    setHidden(hidden) { btn.hidden = hidden || !j.owned; if (hidden) { j.on = false; btn.setAttribute('aria-pressed', 'false'); btn.style.background = '#1b1512cc'; } },
    // Returns null when the jet is off (walk normally) or the horizontal velocity to apply this frame.
    step(dt, m, floor, step, boost) {
      bar.hidden = !j.on; fill.style.width = Math.round(j.fuel * 100) + '%';
      if (!j.on) { j.flying = false; if (j.fuel < 1) j.fuel = stepFuel(j.fuel, dt, false, true); return null; }
      const flying = stepYardJet(j, m, v, dt, floor, { mx: step?.x || 0, mz: step?.z || 0, up: held || view?.jumpQueued, down, boost });
      if (view) view.jumpQueued = false;
      return flying ? v : null;
    }
  };
}
export { MOTION };
