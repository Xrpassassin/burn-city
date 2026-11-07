import { readZombieStick } from './zombie-stick.mjs';
import { zombieMoveVector } from './zombie-locomotion.mjs';

// Homefront camera/view rules shared by the refuge yard and the Graveyard.
// Derrik (Oct 23, 2026): players switch between third-person and first-person at any time
// (button on touch, V on desktop) and the choice is remembered. The ONLY top-down view is
// base-building (construction) mode; exploring, farming, fighting and visits never use it.
export const VIEW_KEY = 'bcHomefrontView';
export const VIEW_MODES = Object.freeze(['third', 'first']);
const EYE_HEIGHT = 1.62;

export function readViewMode(storage = globalThis.localStorage) {
  try { const v = storage?.getItem(VIEW_KEY); return VIEW_MODES.includes(v) ? v : 'third'; } catch { return 'third'; }
}
export function writeViewMode(mode, storage = globalThis.localStorage) {
  const next = VIEW_MODES.includes(mode) ? mode : 'third';
  try { storage?.setItem(VIEW_KEY, next); } catch {}
  return next;
}
export function nextViewMode(mode) { return mode === 'first' ? 'third' : 'first'; }
export const viewLabel = mode => mode === 'first' ? '👁 First-person' : '🎥 Third-person';

// Camera pose for a character at (x, y, z) facing `heading` (radians, 0 = +Z).
// building=true is the only pose that looks straight down.
export function cameraPose({ mode = 'third', building = false, x = 0, y = 0, z = 0, heading = 0, pitch = 0, distance = 6, overhead = { x: 0, y: 29, z: 0.01, lookX: 0, lookY: 0, lookZ: 0 } } = {}) {
  if (building) return { kind: 'construction', px: overhead.x, py: overhead.y, pz: overhead.z, lx: overhead.lookX, ly: overhead.lookY, lz: overhead.lookZ };
  const fx = Math.sin(heading), fz = Math.cos(heading);
  if (mode === 'first') {
    const p = Math.max(-0.9, Math.min(0.7, pitch));
    const ey = y + EYE_HEIGHT;
    return { kind: 'first', px: x + fx * 0.15, py: ey, pz: z + fz * 0.15, lx: x + fx * Math.cos(p) * 10, ly: ey + Math.sin(p) * 10, lz: z + fz * Math.cos(p) * 10 };
  }
  const d = Math.max(2.5, Math.min(12, distance));
  const h = Math.max(1.4, Math.min(6, 2.6 + pitch * 6));
  return { kind: 'third', px: x - fx * d, py: y + h, pz: z - fz * d, lx: x, ly: y + 1.45 + 0.45, lz: z };
}

// Movement intent (joystick or WASD: x = strafe right, y = forward) rotated into world space by the camera heading.
export function worldMove(vec, heading, deadzone = 0.15) {
  const len = Math.hypot(vec.x || 0, vec.y || 0);
  if (len === 0 || len < deadzone) return null;
  const { x, z } = zombieMoveVector(vec.x || 0, vec.y || 0, heading);
  return { x, z };
}

// Direct walking keeps camera heading independent of the avatar's movement-facing yaw.
// Legacy movement retains the established actor-relative camera behavior.
export function walkingCameraHeading(actorYaw = 0, orbitYaw = 0, lookYaw = 0, direct = false) {
  return (direct ? 0 : actorYaw) + orbitYaw + lookYaw;
}
export function directSprintRequested(toggle = false, runPressed = false, aiming = false) {
  return !aiming && !!(toggle || runPressed);
}
export function releaseMovementControls(state) {
  if (!state) return;
  state.keys = { x: 0, y: 0 };
  state.joy = { x: 0, y: 0 };
  state.runKey = false;
  state.runTouch = false;
}

const KEYMAP = { w: [0, 1], arrowup: [0, 1], s: [0, -1], arrowdown: [0, -1], a: [-1, 0], arrowleft: [-1, 0], d: [1, 0], arrowright: [1, 0] };
let activeView = null;
const views = new Set();
const typing = t => t && (t.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(t.tagName || ''));
const modalOpen = () => typeof document !== 'undefined' &&
  !!document.querySelector('.hf-sheet:not([hidden]), .homefront-modal:not([hidden])');
if (typeof window !== 'undefined') {
  const held = new Set();
  window.addEventListener('keydown', e => {
    if (typing(e.target) || modalOpen() || e.altKey || e.ctrlKey || e.metaKey) return;
    const k = e.key.toLowerCase();
    if (k === 'v' && !e.repeat) { setViewMode(nextViewMode(readViewMode())); return; }
    // Keys drive the canvas on screen: a hidden view (e.g. the Graveyard while at home) hands over to a visible one.
    if (activeView && !activeView.visible) { const shown = [...views].find(v => v.visible); if (shown) activeView = shown; }
    if (k === 'z' && !e.repeat) {
      const field = [...views].find(v => v.visible && v.toggleCrouch);
      if (field?.toggleCrouch()) e.preventDefault();
    }
    if (KEYMAP[k] && activeView) { held.add(k); activeView.keys = keyVector(held); e.preventDefault(); }
    // Shared Burn City movement keys (client/js/player-motion.mjs): Shift runs, Space jumps.
    if (k === 'shift' && activeView) activeView.runKey = true;
    if (k === ' ' && activeView && activeView.visible && !e.repeat) { activeView.jumpQueued = true; e.preventDefault(); }
  });
  window.addEventListener('keyup', e => { const k = e.key.toLowerCase(); if (k === 'shift') for (const v of views) v.runKey = false; if (!held.delete(k)) return; if (activeView) activeView.keys = keyVector(held); });
  const releaseHeld = () => { held.clear(); for (const v of views) releaseMovementControls(v); };
  window.addEventListener('blur', releaseHeld);
  document.addEventListener('visibilitychange', () => { if (document.hidden) releaseHeld(); });
}
function keyVector(held) { let x = 0, y = 0; for (const k of held) { x += KEYMAP[k][0]; y += KEYMAP[k][1]; } return { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) }; }
export function setViewMode(mode) {
  const next = writeViewMode(mode);
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('homefront:view', { detail: { mode: next } }));
  return next;
}

// Per-canvas controller: toggle button, touch joystick, drag-to-look, pinch/wheel zoom, keyboard focus,
// and offscreen detection so a hidden canvas can skip rendering (mobile perf).
export function attachViewControls(host, { canLook = () => true, onTap = null, joystick = true, wheel = true, rightDrag = false, canCrouch = null } = {}) {
  const state = { mode: readViewMode(), yaw: 0, pitch: 0, distance: 6.2, joy: { x: 0, y: 0 }, keys: { x: 0, y: 0 }, visible: true, dragging: false, runKey: false, runTouch: false, jumpQueued: false };
  views.add(state); if (!activeView) activeView = state;
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'hf-viewbtn'; btn.setAttribute('aria-label', 'Toggle first-person / third-person view (V)');
  btn.style.cssText = 'position:absolute;top:8px;right:8px;z-index:3;min-height:40px;padding:6px 10px;border-radius:10px;border:1px solid #ff8b3d88;background:#1b1512dd;color:#ffe0c0;font:700 13px system-ui;cursor:pointer';
  const paint = () => { btn.textContent = viewLabel(state.mode) + (coarse ? '' : ' · V'); btn.setAttribute('aria-pressed', String(state.mode === 'first')); };
  btn.addEventListener('click', e => { e.stopPropagation(); setViewMode(nextViewMode(state.mode)); });
  btn.addEventListener('pointerdown', e => e.stopPropagation());
  host.append(btn); paint();
  window.addEventListener('homefront:view', e => { state.mode = e.detail.mode; paint(); });
  let knob = null, pad = null;
  if (joystick && coarse) {
    pad = document.createElement('div');
    pad.className = 'hf-joy'; pad.setAttribute('aria-label', 'Movement joystick');
    pad.style.cssText = 'position:absolute;left:12px;bottom:12px;width:104px;height:104px;border-radius:50%;border:2px solid #ffb06088;background:radial-gradient(#ff660022,#0000 70%);z-index:3;touch-action:none';
    knob = document.createElement('i');
    knob.style.cssText = 'position:absolute;left:36px;top:36px;width:32px;height:32px;border-radius:50%;background:#ffb060aa;pointer-events:none';
    pad.append(knob); host.append(pad);
    let jid = null;
    const setJoy = e => {
      const rect = pad.getBoundingClientRect();
      const stick = readZombieStick(e.clientX - rect.left - rect.width / 2, e.clientY - rect.top - rect.height / 2, rect.width / 2);
      state.joy = { x: stick.x, y: -stick.y };
      knob.style.transform = `translate(${stick.knobX * 34}px,${stick.knobY * 34}px)`;
    };
    pad.addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); if (jid !== null || (e.pointerType === 'mouse' && e.button !== 0)) return; activeView = state; jid = e.pointerId; try { pad.setPointerCapture(jid); } catch {} setJoy(e); });
    pad.addEventListener('pointermove', e => { if (e.pointerId === jid) setJoy(e); });
    const endJoy = e => { if (e.pointerId !== jid) return; jid = null; state.joy = { x: 0, y: 0 }; knob.style.transform = ''; };
    for (const n of ['pointerup', 'pointercancel', 'lostpointercapture']) pad.addEventListener(n, endJoy);
    // A suspended tab or interrupted gesture must never leave movement held down.
    const resetJoy = () => { jid = null; releaseMovementControls(state); knob.style.transform = ''; };
    window.addEventListener('blur', resetJoy);
    document.addEventListener('visibilitychange', () => { if (document.hidden) resetJoy(); });
  }
  // Touch action buttons (Burn City joystick layout): Jump (tap) and Run (hold), bottom-right, thumb-sized.
  const actionBtns = [];
  if (joystick && coarse) {
    const mk = (label, bottom, onDown, onUp) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'hf-act'; b.textContent = label; b.setAttribute('aria-label', label);
      b.style.cssText = `position:absolute;right:12px;bottom:${bottom}px;width:58px;height:58px;border-radius:50%;border:2px solid #ffb06088;background:#1b1512cc;color:#ffe0c0;font:800 12px system-ui;z-index:3;touch-action:none`;
      b.addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); activeView = state; onDown(); });
      for (const n of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(n, () => onUp && onUp());
      host.append(b); actionBtns.push(b); return b;
    };
    mk('JUMP', 12, () => { state.jumpQueued = true; });
    mk('RUN', 78, () => { state.runTouch = true; }, () => { state.runTouch = false; });
  }
  if (canCrouch) {
    const stance = document.createElement('button');
    stance.type = 'button';
    stance.className = 'hf-act hf-crouch';
    stance.style.cssText = `position:absolute;left:12px;bottom:${coarse ? 128 : 12}px;min-width:58px;min-height:44px;padding:0 10px;border-radius:22px;border:2px solid #ffb06088;background:#1b1512ee;color:#ffe0c0;font:800 12px system-ui;z-index:3;touch-action:manipulation`;
    let crouched = false;
    const paintStance = () => {
      stance.textContent = crouched ? 'Stand' : 'Crouch';
      if (!coarse) stance.textContent += ' · Z';
      stance.setAttribute('aria-pressed', String(crouched));
      stance.setAttribute('aria-label', 'Crouch');
    };
    state.toggleCrouch = () => {
      if (!canCrouch() || modalOpen()) return false;
      crouched = !crouched;
      paintStance();
      return true;
    };
    state.resetCrouch = () => { if (crouched) { crouched = false; paintStance(); } };
    state.crouching = () => crouched && canCrouch();
    state.refreshCrouch = () => {
      const hidden = !canCrouch();
      if (stance.hidden !== hidden) stance.hidden = hidden;
    };
    stance.addEventListener('pointerdown', e => { activeView = state; e.stopPropagation(); });
    stance.addEventListener('click', e => { e.stopPropagation(); state.toggleCrouch(); });
    host.append(stance);
    paintStance();
    state.refreshCrouch();
  }
  // Drag to look (left mouse or one finger) and pinch/wheel zoom. A press that never moves is a tap.
  const pts = new Map(); let start = null, pinch0 = 0, dist0 = 0;
  const look = (dx, dy) => {
    state.yaw -= dx * 0.006;
    state.pitch = Math.max(-0.9, Math.min(0.7, state.pitch - dy * 0.004));
  };
  if (rightDrag) {
    let orbit = null;
    const stopOrbit = e => {
      if (orbit && (!e || e.pointerId === orbit.id)) orbit = null;
    };
    host.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'mouse' || e.button !== 2 || e.target.tagName !== 'CANVAS' ||
          !canLook() || modalOpen()) return;
      orbit = { id: e.pointerId, x: e.clientX, y: e.clientY };
      try { e.target.setPointerCapture(e.pointerId); } catch {}
      e.preventDefault();
    });
    host.addEventListener('pointermove', e => {
      if (!orbit || orbit.id !== e.pointerId) return;
      if (!(e.buttons & 2) || !state.visible || !canLook() || modalOpen()) {
        stopOrbit(e);
        return;
      }
      look(e.clientX - orbit.x, e.clientY - orbit.y);
      orbit.x = e.clientX;
      orbit.y = e.clientY;
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) host.addEventListener(type, stopOrbit);
    window.addEventListener('blur', () => stopOrbit());
  }
  host.addEventListener('pointerdown', e => {
    activeView = state;
    if (e.target !== host && e.target.tagName !== 'CANVAS') return;
    if (e.pointerType === 'mouse' && e.button !== 0) return; // right-drag orbit is handled by the scene
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 1) start = { x: e.clientX, y: e.clientY, id: e.pointerId, moved: false, button: e.button, type: e.pointerType };
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); dist0 = state.distance; if (start) start.moved = true; }
  });
  host.addEventListener('pointermove', e => {
    const p = pts.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (pts.size === 2) { const [a, b] = [...pts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch0 > 0) state.distance = Math.max(3.5, Math.min(10.5, dist0 * pinch0 / Math.max(20, d))); return; }
    if (!start || e.pointerId !== start.id || !canLook() || modalOpen()) return;
    if (!start.moved && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 8) { start.moved = true; state.dragging = true; }
    if (start.moved) look(dx, dy);
  });
  const up = e => {
    if (!pts.delete(e.pointerId)) return;
    if (start && e.pointerId === start.id) { const tap = !start.moved && e.type === 'pointerup'; const s = start; start = null; setTimeout(() => { state.dragging = false; }, 0); if (tap && onTap) onTap({ clientX: e.clientX, clientY: e.clientY, button: s.button, pointerType: s.type }); }
    if (pts.size < 2) pinch0 = 0;
  };
  host.addEventListener('pointerup', up); host.addEventListener('pointercancel', up);
  if (wheel) host.addEventListener('wheel', e => { if (state.mode !== 'third') return; state.distance = Math.max(3.5, Math.min(10.5, state.distance + Math.sign(e.deltaY) * 0.65)); e.preventDefault(); }, { passive: false });
  if (typeof IntersectionObserver !== 'undefined') new IntersectionObserver(entries => { for (const en of entries) state.visible = en.isIntersecting; }).observe(host);
  state.move = () => {
    if (modalOpen()) { releaseMovementControls(state); return { x: 0, y: 0 }; }
    const v = Math.hypot(state.joy.x, state.joy.y) > Math.hypot(state.keys.x, state.keys.y) ? state.joy : state.keys; return v; };
  state.setControlsHidden = hidden => { btn.hidden = hidden; if (pad) pad.hidden = hidden; for (const b of actionBtns) b.hidden = hidden; };
  state.running = () => !modalOpen() && !!(state.runKey || state.runTouch);
  state.takeJump = () => { const j = state.jumpQueued && !modalOpen(); state.jumpQueued = false; return j; };
  return state;
}
