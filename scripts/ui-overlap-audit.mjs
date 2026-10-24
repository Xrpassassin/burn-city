// UI overlap audit (manual helper, not part of npm test: needs Playwright, which is not a repo dependency).
//   PLAYWRIGHT_DIR=/path/with/node_modules node scripts/ui-overlap-audit.mjs http://localhost:8080 TAG [pages] [devices]
// pages:   city,ioshint (one-time iOS install hint, injected),tour,island,hf-home,hf-build,hf-manage,hf-world,zombies,lobby   (hf-* need HF_TOKEN=<signed token>)
// devices: port (iPhone 13 portrait), land (iPhone 13 landscape), se (iPhone SE), desk (1280x800)
// Service workers are blocked and env(safe-area-inset-*) is rewritten to emulated insets in served CSS/JS/HTML.
// Writes <OUT>/<TAG>/overlaps.json and screenshots; prints a count per page/device.
import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire((process.env.PLAYWRIGHT_DIR || process.cwd()) + '/node_modules/');
const { chromium, devices } = require('playwright');
const { uiOverlapCollect } = createRequire(import.meta.url)('./ui-overlap-collect.js');
const [BASE, TAG = 'run', PAGES = 'city,tour,island,hf-home,hf-build,hf-manage,hf-world,zombies,lobby', DEVS = 'port,land,se,desk'] = process.argv.slice(2);
const OUT = (process.env.OUT || './ui-audit') + '/' + TAG; fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ip = devices['iPhone 13'], se = devices['iPhone SE'];
const DEV = {
  port: { ctx: { ...ip }, ins: { top: 47, bottom: 34, left: 0, right: 0 } },
  land: { ctx: { ...ip, viewport: { width: 844, height: 390 }, screen: { width: 844, height: 390 } }, ins: { top: 0, bottom: 21, left: 47, right: 47 } },
  se: { ctx: { ...se }, ins: { top: 20, bottom: 0, left: 0, right: 0 } },
  desk: { ctx: { viewport: { width: 1280, height: 800 } }, ins: { top: 0, bottom: 0, left: 0, right: 0 } },
};
const TOKEN = process.env.HF_TOKEN || '', ACCT = process.env.HF_ACCT || 'rOvTestHark1';
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const SRC = `(${uiOverlapCollect.toString()})`;
// deliberate layering per page: lobby scene art (stars/pad/helicopter), Zombies crosshair + hit marker + anonymous damage-direction marks
const IGNORE = { lobby: '.stars,.pad,#heli', zombies: '#xh,#hitMk,:anon' };
const audit = (p, d, pg) => p.evaluate(`${SRC}(${JSON.stringify(DEV[d].ins)}, ${JSON.stringify(IGNORE[pg] || '')})`);
async function page(ctx, d, errs) {
  const p = await ctx.newPage(); const I = DEV[d].ins;
  p.on('pageerror', e => errs.push(e.message.slice(0, 140)));
  await p.route(u => /^https?:\/\/(localhost|127\.0\.0\.1)/.test(u.href) && /\.(css|js|mjs|html)(\?|$)|\/(\?|$)/.test(u.pathname + u.search), async route => {
    try { const resp = await route.fetch(); const ct = resp.headers()['content-type'] || ''; if (!/css|javascript|html/.test(ct)) return route.fulfill({ response: resp });
      const body = (await resp.text()).replace(/env\(\s*safe-area-inset-(top|bottom|left|right)\s*(,[^)]*)?\)/g, (_, s) => I[s] + 'px'); route.fulfill({ response: resp, body }); } catch { route.continue().catch(() => {}); }
  });
  return p;
}
const cityUrl = () => BASE + '/?noguide=1&recap=1&citysrv=' + encodeURIComponent(BASE);
async function cityReady(p) { await p.goto(cityUrl(), { timeout: 90000, waitUntil: 'domcontentloaded' }); await p.waitForFunction(() => window.__city && window.__ready, null, { timeout: 150000 }); await p.waitForFunction(() => document.getElementById('recap'), null, { timeout: 20000 }).catch(() => {}); await sleep(5000); }
const STEPS = {
  async city(p) { await cityReady(p); return [['city', null]]; },
  async tour(p) { await cityReady(p); await p.evaluate(async () => { const ids = Object.keys(window.__estateRooms || {}); await window.__estateEnter(ids.includes('mansion-01') ? 'mansion-01' : ids[0]); }); await sleep(2500); return [['tour', null]]; },
  async island(p) { await cityReady(p); await p.evaluate(() => { window.__setBurnMode('explore'); }); await sleep(1500);
    await p.evaluate(() => { window.__city.P.pos.set(445, 0.1, 188); }); await sleep(2500);
    await p.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /Enter Estates Island/.test(x.textContent)); b && b.click(); }); await sleep(3000); return [['island', null]]; },
  async hf(p, mode) { await p.goto(BASE + '/arena/homefront.html?noguide=1', { timeout: 90000, waitUntil: 'domcontentloaded' }); await sleep(9000);
    if (mode === 'build') await p.evaluate(() => document.getElementById('rpgWorkshop')?.click());
    if (mode === 'manage') await p.evaluate(() => document.getElementById('rpgManagement')?.click());
    if (mode === 'world') { await p.evaluate(() => document.getElementById('enterExpedition')?.click()); await sleep(6000); }
    await sleep(2500); return [['hf-' + mode, null]]; },
  async ioshint(p) { await cityReady(p); await p.evaluate(() => { if (document.getElementById('iosHint')) return; const h = document.createElement('div'); h.id = 'iosHint'; h.innerHTML = 'Install Burn City: tap <b>Share</b> <span aria-hidden="true">⎋</span> then <b>Add to Home Screen</b> <button aria-label="Dismiss">✕</button>'; document.body.appendChild(h); }); await sleep(500); return [['ioshint', null]]; },
  async zombies(p) { await p.goto(BASE + '/arena/?mode=zombie&noguide=1', { timeout: 60000, waitUntil: 'domcontentloaded' }); await sleep(18000); return [['zombies', null]]; },
  async lobby(p) { await p.goto(BASE + '/arena/flight-lobby.html?noguide=1', { timeout: 60000, waitUntil: 'domcontentloaded' }); await sleep(6000); return [['lobby', null]]; },
};
const res = {}; let total = 0;
for (const d of DEVS.split(',')) {
  for (const pg of PAGES.split(',')) {
    if (pg === 'zombies' && d === 'port') continue; // Zombies is a landscape game on phones
    if (pg === 'ioshint' && d === 'desk') continue; // the install hint only shows on iOS
    const ctx = await browser.newContext({ ...DEV[d].ctx, serviceWorkers: 'block' });
    await ctx.addInitScript(([t, a]) => { try { localStorage.bc_guide = '1'; if (t) { localStorage.bcToken = t; localStorage.bcAcct = a; localStorage.setItem('bcHomefrontTutorial:' + a, 'seen'); } } catch {} }, [TOKEN, ACCT]);
    const errs = []; const key = d + ':' + pg;
    try {
      const p = await page(ctx, d, errs);
      const [step, arg] = pg.startsWith('hf-') ? ['hf', pg.slice(3).replace('home', 'home')] : [pg, null];
      await STEPS[step](p, arg);
      await p.screenshot({ path: `${OUT}/${d}_${pg}.png`, timeout: 60000 }).catch(() => {});
      const r = await audit(p, d, pg); r.errors = errs.slice(0, 4); res[key] = r; total += r.overlaps.length + r.unsafe.length; r.count = r.overlaps.length + r.unsafe.length;
      console.log(key, 'overlaps', r.overlaps.length, 'unsafe', r.unsafe.length);
    } catch (e) { res[key] = { fatal: e.message.slice(0, 200) }; console.log(key, 'FATAL', e.message.slice(0, 120)); }
    await ctx.close();
    fs.writeFileSync(OUT + '/overlaps.json', JSON.stringify(res, null, 1));
  }
}
fs.writeFileSync(OUT + '/overlaps.json', JSON.stringify(res, null, 1));
console.log('TOTAL', total);
await browser.close();
