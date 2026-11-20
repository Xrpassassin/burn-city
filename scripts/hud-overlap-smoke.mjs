// HUD overlap smoke (t449u): the always-on and contextual HUD must never overlap, at arrival and in Explore.
//   PLAYWRIGHT_DIR=/path/with/node_modules node scripts/hud-overlap-smoke.mjs http://127.0.0.1:8080 [outDir]
// Checks HUD element bounding boxes pairwise at 360x640, 390x844, 430x932, 844x390, 768x1024, 1280x800 and 1920x1080,
// that the HUD covers a modest share of the screen, and that every function stays reachable (bar or ⋯ menu).
// Read-only: no wallet, payment or server writes.
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire((process.env.PLAYWRIGHT_DIR || process.cwd()) + '/node_modules/');
const { chromium } = require('playwright');
const BASE = (process.argv[2] || 'http://127.0.0.1:8080').replace(/\/$/, '');
const OUT = process.argv[3] || '';
if (OUT) fs.mkdirSync(OUT, { recursive: true });
const ONLY = process.env.HUD_VIEWPORTS ? process.env.HUD_VIEWPORTS.split(',') : null;
const VIEWPORTS = [
  { name: 'phone-360', width: 360, height: 640, mobile: true },
  { name: 'phone-390', width: 390, height: 844, mobile: true },
  { name: 'phone-430', width: 430, height: 932, mobile: true },
  { name: 'landscape-844', width: 844, height: 390, mobile: true },
  { name: 'tablet-768', width: 768, height: 1024, mobile: true },
  { name: 'desktop-1280', width: 1280, height: 800, mobile: false },
  { name: 'desktop-1920', width: 1920, height: 1080, mobile: false },
].filter(v => !ONLY || ONLY.includes(v.name));
// Every HUD element that owns screen space. A container's own box stands for its children (#btns holds the nav buttons).
const HUD = ['#hud', '#rChip', '#btns', '#moreBtn', '#status', '#minimap', '#aegisNews', '#recap', '#joy', '#tJump', '#tRun', '#tUse',
  '#tUp', '#tDown', '#gearBar', '#cityChat', '#keysBtn', '#banner', '#vHint', '#tapTip', '#help', '#skGearBtn', '#bcNotifyLane'];
// Functions that must stay reachable from the HUD: on the bar, as a visible control, or as an entry in the ⋯ menu.
const REACH = [['Movement & games', '#bcMoveGamesOpen', '#hzGames'], ['Estates', '#estatesPreviewLink', '#hzEstates'],
  ['Rewards', '#rChip', '#hzRewards'], ['Music', null, '#musicBtn'], ['Sound', null, '#audio'], ['Social', null, '#socialBtn'],
  ['How to read the city', null, '#guideBtn'], ['Copy link', null, '#copyLink'], ['Settings', null, '#hzSettings'], ['Market weather', '#wchip', '#hzMarket']];
// Max share of the screen the persistent HUD may cover (before the triage: 40/28/24/32/32/27/15% in Explore).
const SHARE_MAX = { 'phone-360': 40, 'phone-390': 30, 'phone-430': 26, 'landscape-844': 33, 'tablet-768': 20, 'desktop-1280': 20, 'desktop-1920': 12 };

const collect = (HUD) => {
  const vis = el => {
    if (!el || !el.isConnected) return false;
    if (typeof el.checkVisibility === 'function' && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
    const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < .05) return false;
    const r = el.getBoundingClientRect(); return r.width > 2 && r.height > 2 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
  };
  const rects = [];
  // the nav bar is checked item by item: a right-aligned flex row can overflow to the left past its own box
  const els = [];
  for (const s of HUD) { const el = document.querySelector(s); if (!el) continue;
    if (s === '#btns') { for (const c of el.children) if (!HUD.includes('#' + c.id)) els.push(['#btns>' + (c.id || c.className || c.tagName).toString().split(' ')[0], c]); }
    else els.push([s, el]); }
  for (const [name, el] of els) { if (!vis(el)) continue; const r = el.getBoundingClientRect();
    rects.push({ name, el, left: r.left, top: r.top, right: r.right, bottom: r.bottom }); }
  const out = [];
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    const a = rects[i], b = rects[j];
    const A = a.el, B = b.el;
    if ((A.contains(B) && getComputedStyle(B).position !== 'fixed') || (B.contains(A) && getComputedStyle(A).position !== 'fixed')) continue; // nested in the same box
    const w = Math.min(a.right, b.right) - Math.max(a.left, b.left), h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    if (w > 1 && h > 1) out.push(`${a.name} × ${b.name} (${Math.round(w)}×${Math.round(h)})`);
  }
  const offscreen = rects.filter(r => r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1).map(r => r.name);
  // share of the screen covered: all HUD, and the persistent part (without one-shot hints, banners, toasts and the recap)
  const TRANSIENT = ['#banner', '#vHint', '#tapTip', '#bcNotifyLane', '#help', '#recap'];
  const share = list => { const G = 8, cols = Math.ceil(innerWidth / G), rows = Math.ceil(innerHeight / G), grid = new Uint8Array(cols * rows);
    for (const r of list) for (let y = Math.max(0, Math.floor(r.top / G)); y < Math.min(rows, Math.ceil(r.bottom / G)); y++)
      for (let x = Math.max(0, Math.floor(r.left / G)); x < Math.min(cols, Math.ceil(r.right / G)); x++) grid[y * cols + x] = 1;
    return +(100 * grid.reduce((a, v) => a + v, 0) / grid.length).toFixed(1); };
  return { overlaps: out, offscreen, share: share(rects), core: share(rects.filter(r => !TRANSIENT.includes(r.name))), names: rects.map(r => r.name.replace(/^#btns>.*/, '#btns')).filter((n, i, a) => a.indexOf(n) === i) };
};

const fails = [];
const shot = (page, o) => page.screenshot({ ...o, timeout: 60000 }).catch(e => console.warn('screenshot skipped:', e.message.split('\n')[0]));
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.mobile, hasTouch: vp.mobile, serviceWorkers: 'block' });
    await ctx.addInitScript(() => { try { localStorage.setItem('bc_guide', '1'); } catch {} });
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', e => errs.push(e.message.slice(0, 160)));
    await page.goto(BASE + '/?recap=1&hubtest=1', { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(() => window.__ready, null, { timeout: 120000 }).catch(() => {});
    await page.waitForFunction(() => document.documentElement.classList.contains('hz') && !document.documentElement.classList.contains('hz-pre'), null, { timeout: 20000 })
      .catch(() => fails.push(vp.name + ': HUD never finished its arrival'));
    // seed the AEGIS ticker so the top strip is part of the layout (as ui-v8-smoke does)
    await page.evaluate(async () => { try { const m = await import('./js/aegis-news.mjs'); m.updateAegisNewsFeed({ level: 1, lines: ['City Watch update one', 'City Watch update two'] }); } catch {} });
    await page.waitForTimeout(5000); // recap pill arrives ~4s after load
    const states = [['arrival', await page.evaluate(collect, HUD)]];
    if (OUT) await shot(page, { path: `${OUT}/${vp.name}-arrival.png` });
    // the recap expands without covering anything else
    const exp = await page.evaluate(() => { const h = document.querySelector('#recap h3[role=button]'); if (!h) return false; h.click(); return true; });
    if (exp) { await page.waitForTimeout(400); states.push(['recap-open', await page.evaluate(collect, HUD)]);
      if (OUT) await shot(page, { path: `${OUT}/${vp.name}-recap-open.png` });
      await page.evaluate(() => document.querySelector('#recap h3[role=button]')?.click()); }
    // reachability: every function is on the bar, visible, or in the ⋯ menu
    const reach = await page.evaluate(REACH => REACH.filter(([, bar, menu]) => {
      const on = s => { const el = s && document.querySelector(s); if (!el) return false; const cs = getComputedStyle(el); return cs.display !== 'none' && !el.hidden && el.getBoundingClientRect().width > 0; };
      const inMenu = s => { const el = s && document.querySelector('#more ' + s); return !!el && !el.hidden; };
      return !on(bar) && !inMenu(menu);
    }).map(r => r[0]), REACH);
    if (reach.length) fails.push(`${vp.name}: not reachable: ${reach.join(', ')}`);
    // Explore: controls, gear and hints
    await page.evaluate(() => { document.getElementById('recap')?.remove(); document.querySelector('[data-m="explore"]')?.click(); });
    await page.waitForTimeout(2500);
    states.push(['explore', await page.evaluate(collect, HUD)]);
    if (OUT) await shot(page, { path: `${OUT}/${vp.name}-explore.png` });
    for (const [state, r] of states) {
      console.log(`${vp.name} ${state}: share ${r.share}% (persistent ${r.core}%) · ${r.names.join(' ')}${r.overlaps.length ? ' · OVERLAPS ' + r.overlaps.join('; ') : ''}`);
      if (r.overlaps.length) fails.push(`${vp.name} ${state}: ${r.overlaps.join('; ')}`);
      if (r.offscreen.length) fails.push(`${vp.name} ${state}: off-screen ${r.offscreen.join(', ')}`);
      if (r.core > SHARE_MAX[vp.name]) fails.push(`${vp.name} ${state}: persistent HUD covers ${r.core}% (max ${SHARE_MAX[vp.name]}%)`);
    }
    if (errs.length) console.warn(vp.name, 'page errors:', errs.slice(0, 3).join(' | '));
    await ctx.close();
  }
} finally { await browser.close(); }
if (fails.length) { console.error('HUD overlap smoke FAILED:\n - ' + fails.join('\n - ')); process.exit(1); }
console.log('HUD overlap smoke passed: no overlaps across', VIEWPORTS.length, 'viewports');
