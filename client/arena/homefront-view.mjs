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
export function worldMove(vec, heading) {
  const len = Math.hypot(vec.x || 0, vec.y || 0);
  if (len < 0.15) return null;
  const s = Math.min(1, len) / len, fx = Math.sin(heading), fz = Math.cos(heading);
  const f = (vec.y || 0) * s, r = (vec.x || 0) * s;
  // right vector is forward rotated -90° about Y: (-fz, fx) for heading measured from +Z toward +X.
  return { x: fx * f - fz * r, z: fz * f + fx * r };
}

const KEYMAP = { w: [0, 1], arrowup: [0, 1], s: [0, -1], arrowdown: [0, -1], a: [-1, 0], arrowleft: [-1, 0], d: [1, 0], arrowright: [1, 0] };
let activeView = null;
const views = new Set();
const typing = t => t && (t.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(t.tagName || ''));
if (typeof window !== 'undefined') {
  const held = new Set();
  window.addEventListener('keydown', e => {
    if (typing(e.target) || e.altKey || e.ctrlKey || e.metaKey) return;
    const k = e.key.toLowerCase();
    if (k === 'v' && !e.repeat) { setViewMode(nextViewMode(readViewMode())); return; }
    // Keys drive the canvas on screen: a hidden view (e.g. the Graveyard while at home) hands over to a visible one.
    if (activeView && !activeView.visible) { const shown = [...views].find(v => v.visible); if (shown) activeView = shown; }
    if (KEYMAP[k] && activeView) { held.add(k); activeView.keys = keyVector(held); e.preventDefault(); }
    // Shared Burn City movement keys (client/js/player-motion.mjs): Shift runs, Space jumps.
    if (k === 'shift' && activeView) activeView.runKey = true;
    if (k === ' ' && activeView && activeView.visible && !e.repeat) { activeView.jumpQueued = true; e.preventDefault(); }
  });
  window.addEventListener('keyup', e => { const k = e.key.toLowerCase(); if (k === 'shift') for (const v of views) v.runKey = false; if (!held.delete(k)) return; if (activeView) activeView.keys = keyVector(held); });
  window.addEventListener('blur', () => { held.clear(); for (const v of views) { v.keys = { x: 0, y: 0 }; v.runKey = false; } });
}
function keyVector(held) { let x = 0, y = 0; for (const k of held) { x += KEYMAP[k][0]; y += KEYMAP[k][1]; } return { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) }; }
export function setViewMode(mode) {
  const next = writeViewMode(mode);
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('homefront:view', { detail: { mode: next } }));
  return next;
}

// Per-canvas controller: toggle button, touch joystick, drag-to-look, pinch/wheel zoom, keyboard focus,
// and offscreen detection so a hidden canvas can skip rendering (mobile perf).
export function attachViewControls(host, { canLook = () => true, onTap = null, joystick = true, wheel = true } = {}) {
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
    const setJoy = e => { const r = pad.getBoundingClientRect(); let dx = (e.clientX - r.left - r.width / 2) / (r.width / 2), dy = (e.clientY - r.top - r.height / 2) / (r.height / 2); const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; } state.joy = { x: dx, y: -dy }; knob.style.transform = `translate(${dx * 34}px,${dy * 34}px)`; };
    pad.addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); if (jid !== null || (e.pointerType === 'mouse' && e.button !== 0)) return; activeView = state; jid = e.pointerId; try { pad.setPointerCapture(jid); } catch {} setJoy(e); });
    pad.addEventListener('pointermove', e => { if (e.pointerId === jid) setJoy(e); });
    const endJoy = e => { if (e.pointerId !== jid) return; jid = null; state.joy = { x: 0, y: 0 }; knob.style.transform = ''; };
    for (const n of ['pointerup', 'pointercancel', 'lostpointercapture']) pad.addEventListener(n, endJoy);
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
  // Drag to look (left mouse or one finger) and pinch/wheel zoom. A press that never moves is a tap.
  const pts = new Map(); let start = null, pinch0 = 0, dist0 = 0;
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
    if (!start || e.pointerId !== start.id || !canLook()) return;
    if (!start.moved && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 8) { start.moved = true; state.dragging = true; }
    if (start.moved) { state.yaw -= dx * 0.006; state.pitch = Math.max(-0.9, Math.min(0.7, state.pitch - dy * 0.004)); }
  });
  const up = e => {
    if (!pts.delete(e.pointerId)) return;
    if (start && e.pointerId === start.id) { const tap = !start.moved && e.type === 'pointerup'; const s = start; start = null; setTimeout(() => { state.dragging = false; }, 0); if (tap && onTap) onTap({ clientX: e.clientX, clientY: e.clientY, button: s.button, pointerType: s.type }); }
    if (pts.size < 2) pinch0 = 0;
  };
  host.addEventListener('pointerup', up); host.addEventListener('pointercancel', up);
  if (wheel) host.addEventListener('wheel', e => { if (state.mode !== 'third') return; state.distance = Math.max(3.5, Math.min(10.5, state.distance + Math.sign(e.deltaY) * 0.65)); e.preventDefault(); }, { passive: false });
  if (typeof IntersectionObserver !== 'undefined') new IntersectionObserver(entries => { for (const en of entries) state.visible = en.isIntersecting; }).observe(host);
  state.move = () => { const v = Math.hypot(state.joy.x, state.joy.y) > Math.hypot(state.keys.x, state.keys.y) ? state.joy : state.keys; return v; };
  state.setControlsHidden = hidden => { btn.hidden = hidden; if (pad) pad.hidden = hidden; for (const b of actionBtns) b.hidden = hidden; };
  state.running = () => !!(state.runKey || state.runTouch);
  state.takeJump = () => { const j = state.jumpQueued; state.jumpQueued = false; return j; };
  return state;
}
