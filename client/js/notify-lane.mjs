// BURN City notification manager: ONE queue + ONE lane for every toast-style message.
//
// Why: toasts, city-incident pills, whale alerts, streak messages and event banners each had their
// own fixed element and timer, so they stacked on each other and popped over menus, sheets, the
// Xaman flow, the joystick and the loading screen. This module decides WHEN (priority, dedupe,
// rate limit, quiet mode) and WHERE (a lane that only uses screen space no tap target or HUD
// element is using). Visual style is unchanged: lane items reuse the existing `.toast` look.
//
//   notify({ text | html, color, priority: 'low'|'normal'|'critical', key, ttl, action, onClick })
//   notify.banner({ key, priority, duration, show })   // gate a custom surface (e.g. #evbanner)
//   notify.isQuiet() -> false | reason string
//
// Priorities
//   low      ambient feed (swaps, city incidents): rate-limited, deduped, dropped when stale.
//   normal   things the player triggered or earned: deferred while quiet, then shown calmly.
//   critical payment results / errors the player must act on: always shown, inline in the open
//            sheet when there is one (never on top of it), otherwise in the lane.

export const PRIORITY = Object.freeze({ low: 0, normal: 1, critical: 2 });
const prio = p => PRIORITY[p] ?? PRIORITY.normal;
const TTL = Object.freeze({ low: 3500, normal: 4500, critical: 7000 });

// ---------------------------------------------------------------------------------------------
// Pure queue (unit-tested): priority order, dedupe, low-priority rate limit, staleness, cap.
export function createNotifyQueue({ lowGapMs = 5000, dedupeMs = { low: 30000, normal: 4000, critical: 0 }, maxQueue = 8, maxLow = 3,
  staleMs = { low: 45000, normal: 120000, critical: 300000 } } = {}) {
  const items = [], recent = new Map(); // key -> last time shown or queued
  let lastLowShown = -Infinity, seq = 0;
  const keyOf = it => it.key || it.text || it.html || '';
  function push(item, t) {
    const it = { priority: 'normal', ...item }, key = keyOf(it);
    it.key = key; it.at = t; it.seq = seq++; it.count = 1;
    const queued = items.find(q => q.key === key);
    if (queued) { Object.assign(queued, { text: it.text, html: it.html, at: t }); queued.count++; return 'merged'; }
    if (t - (recent.get(key) ?? -Infinity) < (dedupeMs[it.priority] ?? 0)) return 'deduped';
    recent.set(key, t);
    items.push(it);
    // keep the low-priority backlog short: oldest ambient items go first
    const lows = items.filter(q => q.priority === 'low');
    while (lows.length > maxLow) items.splice(items.indexOf(lows.shift()), 1);
    while (items.length > maxQueue) {
      const victim = [...items].sort((a, b) => prio(a.priority) - prio(b.priority) || a.seq - b.seq)[0];
      if (victim.priority === 'critical') break;
      items.splice(items.indexOf(victim), 1);
    }
    if (recent.size > 200) for (const [k, v] of recent) if (t - v > dedupeMs.low) recent.delete(k);
    return 'queued';
  }
  function prune(t) {
    for (let i = items.length - 1; i >= 0; i--) if (t - items[i].at > (staleMs[items[i].priority] ?? staleMs.normal)) items.splice(i, 1);
  }
  // Next item allowed to show now; `onlyCritical` while quiet.
  function next(t, { onlyCritical = false } = {}) {
    prune(t);
    const order = [...items].sort((a, b) => prio(b.priority) - prio(a.priority) || a.seq - b.seq);
    for (const it of order) {
      if (onlyCritical && it.priority !== 'critical') continue;
      if (it.priority === 'low' && t - lastLowShown < lowGapMs) continue;
      items.splice(items.indexOf(it), 1);
      if (it.priority === 'low') lastLowShown = t;
      recent.set(it.key, t);
      return it;
    }
    return null;
  }
  // Put an item back at the front (e.g. no free space to show it right now).
  function requeue(it) { if (!items.includes(it)) items.unshift(it); if (it.priority === 'low') lastLowShown = -Infinity; }
  return { push, next, requeue, prune, get size() { return items.length; }, get items() { return items.slice(); } };
}

// ---------------------------------------------------------------------------------------------
// Pure placement (unit-tested): first band of height h, scanning down from `top`, whose box does
// not intersect any reserved rect (inflated by `gap`). Returns {x,y} or null (no free space).
export function findLaneSlot(reserved, { vw, vh, w, h, align = 'right', top = 0, bottom = vh, edge = 12, gap = 8, step = 4 }) {
  w = Math.min(w, vw - 2 * edge);
  const x = align === 'center' ? Math.round((vw - w) / 2) : Math.round(vw - edge - w);
  const hit = y => reserved.some(r => r.width > 0 && r.height > 0 &&
    x < r.x + r.width + gap && x + w > r.x - gap && y < r.y + r.height + gap && y + h > r.y - gap);
  for (let y = Math.max(0, top); y + h <= Math.min(vh, bottom); y += step) {
    if (!hit(y)) return { x, y, w };
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// DOM manager (browser only).
const QUIET_SHEETS = [
  '#loader:not(.done)',                    // loading screen
  '#bcEstatesXaman', '#bcEstatesLivePrompt', // Xaman sign-in / QR; Estates lot, shop, cart, exit prompt
  '#bcMoveGamesPanel', '#more', '#vMenu', '#rPanel', '.jp-sheet', '#aegisModal', '#estateAccessDialog',
  '#wlModal', '.burn-tower-panel', '#aegisNews[data-expanded]',
  '[aria-modal="true"]', '[role="dialog"]', 'dialog[open]'
];
const RESERVED = [
  'button', 'a[href]', 'input', 'select', 'textarea', 'summary', '[role="button"]', '[tabindex]:not([tabindex="-1"])',
  '#joy', '#tbtns', '#touch', '#minimap', '#hud', '#status', '#wchip', '#live', '#aegisNews', '#btns',
  '#prompt', '#tip', '#tapTip', '#vHint', '#help', '#tourCap', '#chat', '#evbanner.show', '#rChip', '.alertPill',
  '#bcEstatesExit', '#bcEstatePropertyHint', '#bcEstatesWalkingGuidance', '[data-mobile-controls]', '#gearBar'
].join(',');
// HUD panels the lane must never cover, whatever their size (the 45%-of-screen "full-screen layer"
// exemption below does not apply to these): the daily City recap appears ~4s after load and used to
// land under an already-placed toast; info/music/bag/keys/rewards panels and the tower/estate HUDs too.
export const HUD_PANELS = [
  '#recap', '#info', '#music', '#bagList', '#keysBox', '#keysBtn', '#rPanel', '#fPanel', '#fUI', '#banner',
  '#perfHud', '#estateInteriorHud', '#bcFpReticle.on', '#bBar', '#webBtn', '#skGearBtn', '#skGear .sg-card', '#cityChat .cbody', '#rpBar',
  // HUD corner zones (hud-zones.mjs tags identity, currency, nav, minimap, ticker, recap, controls, gear and chat)
  '[data-hz-zone]'
];
const HUD_PANEL_SEL = HUD_PANELS.join(',');

function visible(el) {
  if (!el || !el.isConnected) return false;
  if (typeof el.checkVisibility === 'function' && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
  const cs = getComputedStyle(el);
  if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false;
  const r = el.getBoundingClientRect();
  return r.width > 2 && r.height > 2 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
}

export function installNotifyLane(win = globalThis.window) {
  if (!win?.document) return null;
  if (win.__bcNotify) return win.__bcNotify;
  const doc = win.document, now = () => win.performance.now();
  const queue = createNotifyQueue();
  const shown = new Set();
  let lane = null, lastPlace = -Infinity, lastShow = -Infinity, quietUntil = 0, wasQuiet = false, banner = null;
  const touches = new Set(); let lastTouch = -Infinity;

  const style = doc.createElement('style');
  style.id = 'bcNotifyLaneStyle';
  style.textContent = `
#bcNotifyLane{position:fixed;left:0;top:0;z-index:var(--z-pop,45);display:flex;flex-direction:column;gap:8px;pointer-events:none;
  visibility:hidden;contain:layout}
#bcNotifyLane.on{visibility:visible}
#bcNotifyLane>.toast{pointer-events:auto;cursor:pointer;touch-action:pan-y;user-select:none;-webkit-user-select:none;margin:0;max-width:100%;box-sizing:border-box}
#bcNotifyLane>.toast.bc-note-out{opacity:0!important;transform:translateX(var(--bc-swipe,16px))!important}
#bcNotifyLane>.toast .bc-note-n{opacity:.7;font-weight:700;margin-left:4px}
.bc-inline-note{display:flex;gap:8px;align-items:flex-start;margin:0 0 10px;padding:8px 10px;border-radius:10px;
  border:1px solid var(--c,#ff7a1a);background:rgba(10,12,18,.92);color:#fff;font:600 13px/1.35 system-ui,sans-serif;position:relative;z-index:1}
.bc-inline-note>span{flex:1}
.bc-inline-note>button{flex:none;background:none;border:0;color:inherit;font:inherit;min-width:32px;min-height:32px;cursor:pointer}
@media (prefers-reduced-motion:reduce){#bcNotifyLane>.toast{transition:none!important}}`;
  doc.head.append(style);

  function ensureLane() {
    if (lane?.isConnected) return lane;
    lane = doc.createElement('div'); lane.id = 'bcNotifyLane';
    lane.setAttribute('role', 'status'); lane.setAttribute('aria-live', 'polite');
    doc.body.append(lane);
    return lane;
  }
  const phone = () => win.innerWidth < 600 || doc.body.classList.contains('touch') && win.innerWidth < 820;
  const maxVisible = () => (phone() ? 1 : 2);

  // ---- quiet mode
  function quietSheet() {
    for (const sel of QUIET_SHEETS) {
      for (const el of doc.querySelectorAll(sel)) {
        if (lane && (el === lane || lane.contains(el))) continue;
        if (visible(el)) return el;
      }
    }
    return doc.body.classList.contains('bcMenuOpen') ? doc.body : null;
  }
  function isQuiet() {
    const sheet = quietSheet();
    if (sheet) return 'sheet:' + (sheet.id || sheet.className || sheet.tagName).toString().slice(0, 40);
    const a = doc.activeElement;
    if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || a.isContentEditable)) return 'typing';
    if (touches.size || now() - lastTouch < 700) return 'moving';
    if (doc.hidden) return 'hidden';
    return false;
  }
  const onDown = e => { if (e.pointerType === 'touch' && !(lane && lane.contains(e.target))) touches.add(e.pointerId); };
  const onUp = e => { if (touches.delete(e.pointerId)) lastTouch = now(); };
  win.addEventListener('pointerdown', onDown, true);
  win.addEventListener('pointerup', onUp, true);
  win.addEventListener('pointercancel', onUp, true);

  // ---- placement
  function reservedRects() {
    const out = [];
    for (const el of doc.querySelectorAll(RESERVED)) {
      if (lane && lane.contains(el)) continue;
      if (el.closest('#labels')) continue; // world-space labels move with the 3D scene
      if (el.closest('#loader')) continue;
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width * r.height > .45 * win.innerWidth * win.innerHeight) continue; // full-screen layers (canvas, touch surface)
      out.push({ x: r.left, y: r.top, width: r.width, height: r.height });
    }
    for (const el of doc.querySelectorAll(HUD_PANEL_SEL)) {
      if (lane && lane.contains(el)) continue;
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect();
      out.push({ x: r.left, y: r.top, width: r.width, height: r.height });
    }
    return out;
  }
  function place() {
    const l = ensureLane();
    if (!l.children.length) { l.classList.remove('on'); return true; }
    const vw = win.innerWidth, vh = win.innerHeight, isPhone = phone();
    const w = isPhone ? Math.min(340, vw - 24) : 300;
    l.style.width = w + 'px';
    const h = Math.max(32, l.getBoundingClientRect().height);
    const tick = doc.getElementById('aegisNews'), tickB = tick && visible(tick) ? tick.getBoundingClientRect().bottom : 0;
    const slot = findLaneSlot(reservedRects(), { vw, vh, w, h, align: isPhone ? 'center' : 'right',
      top: Math.max(tickB + 8, 8), bottom: isPhone ? vh * .62 : vh - 96, edge: isPhone ? 12 : 16 });
    if (!slot) { l.classList.remove('on'); return false; } // nowhere free: stay out of the way
    l.style.width = slot.w + 'px';
    l.style.transform = `translate(${slot.x}px,${slot.y}px)`;
    l.classList.add('on');
    return true;
  }

  // ---- rendering
  function dismiss(node, dir = 1) {
    if (!node || node._gone) return; node._gone = true;
    clearTimeout(node._t); shown.delete(node);
    node.style.setProperty('--bc-swipe', (dir * 40) + 'px');
    node.classList.add('bc-note-out'); node.classList.remove('in');
    setTimeout(() => { node.remove(); place(); }, 260);
  }
  function fill(node, it) {
    if (it.html != null) node.innerHTML = it.html; else node.textContent = it.text ?? '';
    if (it.count > 1) { const n = doc.createElement('span'); n.className = 'bc-note-n'; n.textContent = '×' + it.count; node.append(n); }
  }
  function showInLane(it) {
    const l = ensureLane();
    const node = doc.createElement('div');
    node.className = 'toast';
    node.dataset.priority = it.priority;
    node._key = it.key; node._it = it;
    if (it.priority === 'critical') node.setAttribute('role', 'alert');
    node.style.setProperty('--c', it.color || '#3cf3ff');
    fill(node, it);
    // tap = action (if any) then dismiss; horizontal swipe = dismiss
    let x0 = null;
    node.addEventListener('pointerdown', e => { x0 = e.clientX; e.stopPropagation(); });
    node.addEventListener('pointerup', e => {
      e.stopPropagation(); const dx = x0 == null ? 0 : e.clientX - x0; x0 = null;
      if (Math.abs(dx) > 36) { dismiss(node, Math.sign(dx)); return; }
      try { it.onClick?.(); } catch (err) { console.warn('[notify] action failed', err); }
      dismiss(node);
    });
    node.addEventListener('click', e => e.stopPropagation());
    node.addEventListener('mouseenter', () => clearTimeout(node._t));
    node.addEventListener('mouseleave', () => arm(node, 1500));
    l.prepend(node);
    const live = [...l.children].filter(n => !n._gone);
    for (const old of live.slice(maxVisible())) dismiss(old); // newest first; older ones slide out
    shown.add(node);
    if (!place()) { node.remove(); shown.delete(node); queue.requeue(it); return false; }
    win.requestAnimationFrame(() => node.classList.add('in'));
    // a deferred backlog drains a little quicker (never below 2.5s) instead of piling up
    node._ttl = it.ttl ?? Math.max(2500, (TTL[it.priority] ?? TTL.normal) - Math.min(2000, queue.size * 400));
    if (!it.persist) arm(node, node._ttl);
    return true;
  }
  function arm(node, ms) { clearTimeout(node._t); if (!node._gone) node._t = setTimeout(() => dismiss(node), ms); }

  function showInline(it, sheet) {
    let host = sheet.querySelector('[data-notify-inline]');
    if (!host) { // a full-screen backdrop: use its visible card, not the backdrop itself
      host = sheet;
      const area = r => r.width * r.height, vp = win.innerWidth * win.innerHeight;
      for (let guard = 0; guard < 4 && area(host.getBoundingClientRect()) > .7 * vp; guard++) {
        const card = [...host.children].find(c => visible(c) && area(c.getBoundingClientRect()) > 2000);
        if (!card) break; host = card;
      }
    }
    // after the sheet's header row when there is one, so the title stays on top
    const head = host.firstElementChild && /^(H[1-3]|HEADER)$|head/i.test(host.firstElementChild.tagName + ' ' + host.firstElementChild.className) ? host.firstElementChild : null;
    const note = doc.createElement('div');
    note.className = 'bc-inline-note'; note.setAttribute('role', 'alert');
    note.style.setProperty('--c', it.color || '#ff7a1a');
    const span = doc.createElement('span');
    if (it.html != null) span.innerHTML = it.html; else span.textContent = it.text ?? '';
    const x = doc.createElement('button'); x.type = 'button'; x.textContent = '✕'; x.setAttribute('aria-label', 'Dismiss');
    x.onclick = e => { e.stopPropagation(); note.remove(); };
    note.append(span, x);
    host.querySelectorAll(':scope > .bc-inline-note').forEach(n => n.remove());
    if (head) head.after(note); else host.prepend(note);
    note.scrollIntoView?.({ block: 'nearest' });
    setTimeout(() => note.remove(), (it.ttl ?? TTL.critical) + 2000);
    return true;
  }

  // ---- scheduler
  function pump() {
    const t = now(), quiet = isQuiet();
    if (quiet) { wasQuiet = true; quietUntil = t; }
    // never leave a lane toast over a sheet/loader/joystick: tuck the lane away while quiet
    if (lane) {
      if (quiet && shown.size) {
        for (const node of [...shown]) if (node.dataset.priority !== 'critical') { node._resume = true; clearTimeout(node._t); }
        lane.classList.remove('on');
      } else if (shown.size && (t - lastPlace > 500 || !lane.classList.contains('on'))) {
        lastPlace = t; // re-check for newly appeared buttons/prompts twice a second, not every tick
        if (place()) for (const node of shown) if (node._resume) { node._resume = false; arm(node, 2500); }
      }
    }
    // critical items: inline in the open sheet, else lane
    if (quiet) {
      const sheet = quiet.startsWith('sheet:') ? quietSheet() : null;
      let it;
      while ((it = queue.next(t, { onlyCritical: true }))) {
        if (sheet && sheet !== doc.body && !sheet.matches('#loader')) showInline(it, sheet);
        else if (!showInLane(it)) break;
        lastShow = t;
      }
      return;
    }
    // calm flush: wait a beat after quiet ends, then one at a time
    const calm = wasQuiet ? 1200 : 0;
    if (t - quietUntil < calm) return;
    if (wasQuiet && t - quietUntil >= calm) wasQuiet = false;
    if (shown.size >= maxVisible() || t - lastShow < 1100) return;
    if (banner && t < banner.until) return; // one attention-grabber at a time
    const it = queue.next(t);
    if (!it) return;
    if (it.kind === 'banner') {
      banner = { until: t + (it.duration || 4200) };
      try { it.show(); } catch (err) { console.warn('[notify] banner failed', err); }
      lastShow = t; return;
    }
    if (showInLane(it)) lastShow = t;
  }
  const timer = setInterval(pump, 250);

  function notify(opts) {
    const it = typeof opts === 'string' ? { text: opts } : { ...opts };
    if (!Object.hasOwn(PRIORITY, it.priority)) it.priority = 'normal';
    const key = it.key || it.text || it.html || '';
    // Same message already on screen: bump its counter instead of stacking a copy.
    for (const node of shown) if (!node._gone && node._key === key && it.kind !== 'banner') {
      const prev = node._it; prev.count = (prev.count || 1) + 1;
      if (it.text != null || it.html != null) Object.assign(prev, { text: it.text, html: it.html });
      fill(node, prev); arm(node, node._ttl); return 'bumped';
    }
    const r = queue.push(it, now());
    pump();
    return r;
  }
  notify.banner = ({ show, key, priority = 'low', duration = 4200 }) =>
    notify({ kind: 'banner', show, key: 'banner:' + (key || Math.random()), priority, duration });
  notify.isQuiet = isQuiet;
  notify.queue = queue;
  notify.place = place;
  notify.dispose = () => { clearInterval(timer); win.removeEventListener('pointerdown', onDown, true); win.removeEventListener('pointerup', onUp, true); win.removeEventListener('pointercancel', onUp, true); lane?.remove(); style.remove(); delete win.__bcNotify; };
  win.__bcNotify = notify;
  return notify;
}

export function notify(opts) {
  const n = globalThis.window?.__bcNotify || installNotifyLane();
  return n ? n(opts) : 'unavailable';
}
