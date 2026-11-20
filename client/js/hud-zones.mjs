// BURN City HUD zones (t449u): one calm, triaged HUD.
//  - Tags every HUD element with its corner zone (data-hz-zone) so the CSS places it and the notify lane avoids it.
//  - Measures the zones (CSS variables) so stacked items never guess each other's size.
//  - Regroups the ⋯ menu into categories, with shortcuts to every function that left the always-on HUD.
//  - Condenses the daily recap into a small dismissable pill that expands on tap.
//  - Staggers the HUD in once the city is ready.
// Only moves/labels existing elements and adds shortcuts that click the original controls: no game logic.
import { iconSvg } from './ui-forge.mjs';

// Tiers (plain English): always-on essentials, contextual (shown only when relevant), one tap away (the ⋯ menu).
export const HZ_ZONES = {
  'top-left': ['#hud', '#rChip'],                       // identity + currency
  'top-right': ['#btns', '#moreBtn', '#status', '#minimap'], // navigation, menu, map
  'top-center': ['#aegisNews', '#banner'],              // slim ticker; district banner (contextual)
  'bottom-left': ['#joy', '#keysBtn', '#recap'],        // joystick (touch) / keys (desktop); recap pill on arrival
  'bottom-right': ['#tbtns', '#gearBar', '#cityChat'],  // actions; Board/Web (explore only); chat
};

// The ⋯ menu, by category. Existing menu buttons keep their ids and handlers; `hz*` entries are shortcuts that
// click the original control, so everything that left the always-on HUD stays one tap away.
export const HZ_MENU = [
  { cat: 'Play & games', items: [
    { id: 'hzGames', icon: 'device-gamepad-2', label: 'Movement & games', target: '#bcMoveGamesOpen' },
    { id: 'hzArena', icon: 'sword', label: 'Play arena', target: '#playBtn' },
    { id: 'tour' }] },
  { cat: 'Estates', items: [
    { id: 'hzEstates', icon: 'home', label: 'Estates', target: '#estatesPreviewLink' }] },
  { cat: 'Social & chat', items: [
    { id: 'hzChat', icon: 'message-circle', label: 'City chat', target: '#cityChat .cch', when: '#cityChat.on' },
    { id: 'socialBtn' }] },
  { cat: 'Inventory', items: [
    { id: 'bagBtn' },
    { id: 'hzKeys', icon: 'info-circle', label: 'Keyboard controls', target: '#keysBtn', desktop: true }] },
  { cat: 'Rewards', items: [
    { id: 'hzRewards', icon: 'gift', label: 'Rewards & streak', target: '#rChip' }] },
  { cat: 'Settings & music', items: [
    { id: 'musicBtn' }, { id: 'audio' },
    { id: 'hzSettings', icon: 'settings', label: 'Graphics, weather & time', action: 'settings' }] },
  { cat: 'Info & help', items: [
    { id: 'guideBtn' },
    { id: 'hzMarket', icon: 'chart-line', label: 'Market weather', target: '#wchip', mirror: '#wchip' },
    { id: 'hzLive', info: true, mirror: '#live span' },
    { id: 'copyLink' }, { id: 'installBtn' }] },
];

// Flat order of menu children (headers + entries), used to re-sort after other modules append items.
export function menuOrder(menu = HZ_MENU) {
  const out = [];
  for (const g of menu) { out.push('hzcat:' + g.cat); for (const it of g.items) out.push(it.id); }
  return out;
}

// Pure placement check used by the overlap smoke and unit test: returns the overlapping pairs.
export function overlaps(rects, slack = 1) {
  const out = [];
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    const a = rects[i], b = rects[j];
    const w = Math.min(a.right, b.right) - Math.max(a.left, b.left), h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    if (w > slack && h > slack) out.push([a.name, b.name, Math.round(w), Math.round(h)]);
  }
  return out;
}

export function installHudZones(win = globalThis.window) {
  const doc = win?.document; if (!doc || win.__bcHudZones) return win?.__bcHudZones;
  const $ = s => doc.querySelector(s), root = doc.documentElement, body = doc.body;
  root.classList.add('hz', 'hz-pre');
  const api = { zones: HZ_ZONES, menu: HZ_MENU };
  win.__bcHudZones = api;

  // ---- 1) zone tags (re-applied: several elements are created late by other modules)
  const tag = () => {
    for (const [zone, sels] of Object.entries(HZ_ZONES)) for (const s of sels) { const el = $(s); if (el && el.dataset.hzZone !== zone) el.dataset.hzZone = zone; }
  };

  // ---- 2) measured zone variables
  const px = v => Math.round(v) + 'px';
  const shown = el => { if (!el || !el.isConnected) return false; const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return false; const r = el.getBoundingClientRect(); return r.width > 2 && r.height > 2; };
  let lastVars = '';
  const measure = () => {
    const hud = $('#hud'), hdr = $('#hudToggle'), btns = $('#btns'), st = $('#status'), more = $('#moreBtn');
    const hr = hud && shown(hud) ? hud.getBoundingClientRect() : null;
    const hh = hdr && shown(hdr) ? hdr.getBoundingClientRect() : hr;
    let trb = 0; for (const el of [btns, st, more]) if (shown(el)) trb = Math.max(trb, el.getBoundingClientRect().bottom);
    // right column bottom (minimap, then the Explore gear column) — City chat hangs under it on touch
    let rcb = 0; for (const s of ['#minimap', '#gearBar']) { const el = $(s); if (shown(el)) rcb = Math.max(rcb, el.getBoundingClientRect().bottom); }
    const vars = {
      '--hz-id-w': px(hr ? hr.width : 0),            // identity pill width (row 1, next to the currency pill)
      '--hz-id-b': px(hr ? hr.bottom : 0),           // identity block bottom (desktop: currency goes under it)
      '--hz-id-h': px(hh ? hh.height : 44),
      '--hz-tr-b': px(trb),                          // top-right stack bottom (minimap goes under it)
      '--hz-rc-b': px(rcb || trb),
    };
    const s = JSON.stringify(vars); if (s === lastVars) return; lastVars = s;
    for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  };

  // ---- 3) brand "live" dot mirrors the connection pill (the pill itself folds into the menu on phones)
  const live = () => { const l = $('#live'); if (l) root.dataset.hzLive = l.className || 'connecting'; };

  // ---- 4) categorised ⋯ menu
  const menu = () => $('#more');
  const made = new Map();
  const mkItem = it => {
    if (made.has(it.id) && made.get(it.id).isConnected) return made.get(it.id);
    let el;
    if (it.info) { el = doc.createElement('div'); el.className = 'hz-info'; el.setAttribute('role', 'presentation'); el.append(iconSvg('bolt', doc), doc.createElement('span')); }
    else {
      el = doc.createElement('button'); el.type = 'button'; el.setAttribute('role', 'menuitem');
      el.dataset.l = it.label; el.append(iconSvg(it.icon, doc)); el.className = 'hz-short';
      el.addEventListener('click', e => {
        e.stopPropagation();
        if (it.action === 'settings') { const hud = $('#hud'), sec = $('#secSettings'); if (sec) sec.open = true; hud?.classList.add('open'); sec?.querySelector('summary')?.focus?.(); }
        else { const t = $(it.target); if (t) t.click(); }
        setTimeout(() => { const m = menu(); if (m?.classList.contains('open')) $('#moreBtn')?.click(); }, 60);
      });
    }
    el.id = it.id; made.set(it.id, el); return el;
  };
  const header = cat => { let h = made.get('hzcat:' + cat); if (!h?.isConnected) { h = doc.createElement('div'); h.className = 'hz-cat'; h.setAttribute('role', 'presentation'); h.textContent = cat; made.set('hzcat:' + cat, h); } return h; };
  let sorting = false;
  const buildMenu = () => {
    const m = menu(); if (!m || sorting) return;
    sorting = true;
    try {
      const want = [];
      for (const g of HZ_MENU) {
        want.push(header(g.cat));
        for (const it of g.items) { const el = it.label || it.info ? mkItem(it) : doc.getElementById(it.id); if (el && (el.parentElement === m || it.label || it.info)) want.push(el); }
      }
      const extras = [...m.children].filter(c => !want.includes(c)); // anything else other modules add stays, at the end
      const order = [...want, ...extras];
      const cur = [...m.children];
      if (order.length !== cur.length || order.some((x, i) => cur[i] !== x)) order.forEach(x => m.append(x));
    } finally { sorting = false; }
    syncMenu();
  };
  const syncMenu = () => {
    const m = menu(); if (!m) return;
    const touch = body.classList.contains('touch');
    for (const g of HZ_MENU) for (const it of g.items) {
      const el = made.get(it.id); if (!el) continue;
      let hide = false;
      if (it.when && !$(it.when)) hide = true;
      if (it.desktop && touch) hide = true;
      if (it.target && !$(it.target)) hide = true;
      if (it.mirror) { const src = $(it.mirror), txt = (src?.textContent || '').replace(/\s+/g, ' ').trim(); if (!txt) hide = true;
        if (it.info) el.querySelector('span').textContent = txt; else el.dataset.l = txt || it.label; }
      el.hidden = hide;
    }
    // a category header shows only while one of its entries can be used
    let h = null, any = false;
    const flush = () => { if (h) h.hidden = !any; };
    for (const c of m.children) {
      if (c.classList.contains('hz-cat')) { flush(); h = c; any = false; continue; }
      if (!c.hidden && getComputedStyle(c).display !== 'none') any = true;
    }
    flush();
  };

  // ---- 5) compact recap: a pill that expands on tap, never over the controls
  const recap = () => {
    const r = $('#recap'); if (!r || r.dataset.hz) return;
    r.dataset.hz = '1'; r.dataset.hzZone = 'bottom-left';
    const h3 = r.querySelector('h3'); if (!h3) return;
    r.classList.add('hz-mini');
    h3.setAttribute('role', 'button'); h3.tabIndex = 0; h3.setAttribute('aria-expanded', 'false');
    const toggle = () => { const mini = r.classList.toggle('hz-mini'); h3.setAttribute('aria-expanded', String(!mini)); };
    h3.addEventListener('click', toggle);
    h3.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
  };

  // ---- 6) calm arrival: stagger the HUD in once the city is ready (fallback after 12 s)
  let arrived = false;
  const arrive = () => {
    if (arrived) return; arrived = true;
    root.classList.remove('hz-pre'); root.classList.add('hz-in');
    setTimeout(() => root.classList.remove('hz-in'), 1600);
  };
  // the loader fades out after __ready: start as it lifts so the corners settle in view, not under the loader
  const waitReady = () => { const l = $('#loader'); if (!l || l.classList.contains('done')) setTimeout(arrive, 150); else if (!arrived) setTimeout(waitReady, 120); };
  waitReady(); setTimeout(arrive, 12000);

  const tick = () => { tag(); measure(); live(); recap(); };
  const mo = new win.MutationObserver(() => { if (!sorting) buildMenu(); });
  const hookMenu = () => { const m = menu(); if (!m) return setTimeout(hookMenu, 300); buildMenu(); mo.observe(m, { childList: true }); $('#moreBtn')?.addEventListener('click', syncMenu, true); };
  hookMenu();
  tick(); setInterval(tick, 400); win.addEventListener('resize', measure);
  if (win.ResizeObserver) { const ro = new win.ResizeObserver(measure); const obs = () => { for (const s of ['#hud', '#btns', '#status']) { const el = $(s); if (el && !el._hzRo) { el._hzRo = 1; ro.observe(el); } } }; obs(); setInterval(obs, 2000); }
  api.measure = measure; api.buildMenu = buildMenu; api.syncMenu = syncMenu; api.arrive = arrive;
  return api;
}

if (typeof window !== 'undefined' && window.document) installHudZones(window);
