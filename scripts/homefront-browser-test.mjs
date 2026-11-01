// Local-only browser harness: real Homefront handlers, isolated in-memory saves.
// Test account selection exists only on this loopback server, never in production.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const require = createRequire(import.meta.url);
const { handle } = require('../server/homefront');
const Core = require('../server/homefront-core');
const World = require('../server/homefront-world');
const root = path.resolve(fileURLToPath(new URL('../client/', import.meta.url)));
const files = new Map();
const store = {
  load: (name, fallback) => structuredClone(files.get(name) ?? fallback),
  save: (name, value) => files.set(name, structuredClone(value))
};
const priorFlag = process.env.HOMEFRONT_CONTINUOUS_MOVEMENT;
process.env.HOMEFRONT_CONTINUOUS_MOVEMENT = '1';
const bases = {};
let world = World.defaultWorld();
for (const acct of ['browser-desktop', 'browser-touch']) {
  bases[acct] = Core.createBase(acct);

}
store.save('homefront.json', bases);
store.save('homefront-world.json', world);
const movement = [];
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const acct = req.headers.authorization?.replace(/^Bearer /, '');
    if (url.pathname.startsWith('/api/homefront')) {
      const handled = await handle(req, res, url, {
        json: (_res, status, data) => {
          if (url.pathname.endsWith('/move-input')) movement.push({ acct, status, data });
          res.writeHead(status, { 'content-type': 'application/json' });
          res.end(JSON.stringify(data));
        },
        who: () => Object.hasOwn(bases, acct) ? { acct } : null,
        gate: () => false, ip: '127.0.0.1', store,
        body: async () => { let body = ''; for await (const chunk of req) body += chunk; return JSON.parse(body || '{}'); }
      });
      if (handled) return;
    }
    if (url.pathname.startsWith('/api/')) {
      res.writeHead(200, { 'content-type': 'application/json' }); res.end('{}'); return;
    }
    const filename = path.resolve(root, '.' + decodeURIComponent(url.pathname));
    if (!filename.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
    const content = await fs.readFile(filename);
    const type = { '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.glb':'model/gltf-binary', '.png':'image/png' }[path.extname(filename)] || 'application/octet-stream';
    res.writeHead(200, { 'content-type': type }); res.end(content);
  } catch (error) {
    res.writeHead(error.code === 'ENOENT' ? 404 : 500); res.end(String(error));
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://localhost:${server.address().port}`;
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
try {
  for (const [acct, viewport, touch] of [
    ['browser-desktop', { width:1280, height:800 }, false],
    ['browser-touch', { width:390, height:844 }, true]
  ]) {
    const context = await browser.newContext({ viewport, isMobile:touch, hasTouch:touch });
    await context.addInitScript(account => {
      localStorage.setItem('bcToken', account);
      localStorage.setItem('bcAcct', account);
      localStorage.setItem('bcHomefrontTutorial:' + account, 'seen');
    }, acct);
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    page.on('pageerror', error => { errors.push(error.message); console.error(error.message); });
    page.on('console', msg => { if (msg.type() === 'error' || msg.type() === 'warning') console.log(msg.text()); });
    await page.goto(origin + '/arena/homefront.html');
    await page.waitForFunction(() => window.__hfHud && document.querySelector('#world canvas'));
    // Dismiss any first-visit narrative, then enter through the real travel flow.
    await page.evaluate(async () => { document.querySelector('#homefrontModal').hidden = true; await window.__hfTravel.open(); });
    await page.locator('#homefrontModalActions button').filter({ hasText:/alone|solo|enter|wastes|graveyard/i }).first().click();
    await page.waitForFunction(() => document.body.classList.contains('rpg-mode-expedition'));
    await page.waitForSelector('#graveyard3d canvas');
    await page.waitForFunction(() => !document.querySelector('.hf-sheet:not([hidden]), .homefront-modal:not([hidden])'));
    const size = await page.locator('#graveyard3d').boundingBox();
    assert.ok(Math.abs(size.width - viewport.width) < 2 && Math.abs(size.height - viewport.height) < 2, JSON.stringify(size));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.waitForTimeout(1200); // Server-owned spawn cooldown, never a client bypass.
    const before = movement.length;
    if (touch) {
      const pad = await page.locator('#graveyard3d .hf-joy').boundingBox();
      await page.mouse.move(pad.x + pad.width/2, pad.y + pad.height/2);
      await page.mouse.down();
      await page.mouse.move(pad.x + pad.width/2, pad.y + 8);
    } else await page.keyboard.down('w');
    await page.waitForTimeout(900);
    if (touch) await page.mouse.up();
    else await page.keyboard.up('w');
    await page.waitForTimeout(250);
    const sent = movement.slice(before).filter(m => m.acct === acct);
    assert.ok(sent.some(m => m.status === 200), JSON.stringify(sent));
    assert.ok(sent.every(m => m.status === 200), JSON.stringify(sent));
    const positions = sent.map(m => m.data.inputAck);
    assert.ok(positions.some(p => Math.hypot(p.x-positions[0].x,p.z-positions[0].z)>0.2), 'accepted walking must actually change authoritative position');
    if (touch) {
      const hud = await page.locator('.hf-hud').boundingBox();
      for (const control of await page.locator('#graveyard3d .hf-act, #graveyard3d .hf-joy').all()) {
        const box = await control.boundingBox();
        assert.ok(box.y + box.height <= hud.y, 'mobile walking controls must clear the HUD');
      }
    }
    await page.evaluate(() => window.__hfHud.open('inventory'));
    const paused = movement.length;
    await page.keyboard.down('w'); await page.waitForTimeout(400); await page.keyboard.up('w');
    assert.equal(movement.length, paused, 'inventory must own movement input');
    await page.evaluate(() => window.__hfHud.hide());
    await fs.mkdir('homefront-browser-preview', { recursive:true });
    await page.screenshot({ path:`homefront-browser-preview/${touch ? 'mobile' : 'desktop'}.png` });
    console.log(`${acct}: full viewport, direct movement, inventory input isolation passed`);
    await context.close();
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
  if (priorFlag === undefined) delete process.env.HOMEFRONT_CONTINUOUS_MOVEMENT;
  else process.env.HOMEFRONT_CONTINUOUS_MOVEMENT = priorFlag;
}
