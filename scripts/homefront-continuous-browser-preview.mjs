// CI-only WebGL smoke test for the actual Homefront #547 3D scene.
// Runs against real Homefront world/movement handlers with in-memory storage.
// Uses fake account IDs; never calls live Fly.io, wallets, or production secrets.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { mkdirSync } from 'node:fs';

const require = createRequire(import.meta.url);
const playwrightRequire = createRequire((process.env.PLAYWRIGHT_DIR || process.cwd()) + '/package.json');
const { chromium } = playwrightRequire('playwright');
const World = require('../server/homefront-world.js');
const Homefront = require('../server/homefront.js');
const Collision = require('../server/homefront-collision.js');
const Terrain = require('../server/homefront-terrain.js');
const A = 'browser-preview-a', B = 'browser-preview-b';
const files = new Map();
const copy = x => structuredClone(x);
const store = {
  load(name, fallback) { return files.has(name) ? copy(files.get(name)) : fallback; },
  save(name, value) { files.set(name, copy(value)); }
};
let state = World.enter(World.defaultWorld(), A, Date.now() - 10000).world;
state = World.enter(state, B, Date.now() - 9900).world;
const spawn = { x: state.players[A].x, z: state.players[A].z };
state.players[B].x = spawn.x + 0.8;
state.players[B].z = spawn.z + 0.8;
store.save('homefront-world.json', state);
const directions = [
  { key: 'w', x: 0, z: 1 }, { key: 's', x: 0, z: -1 },
  { key: 'a', x: 1, z: 0 }, { key: 'd', x: -1, z: 0 }
];
const dir = directions.find(d =>
  Terrain.canTraverse(spawn.x, spawn.z, spawn.x + 3 * d.x, spawn.z + 3 * d.z) &&
  Collision.canTraverse(spawn.x, spawn.z, spawn.x + 3 * d.x, spawn.z + 3 * d.z, { bounds: World.WORLD_SIZE }));
assert(dir, 'spawn has at least one clear 3-unit walking direction');

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.css': 'text/css', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.glb': 'model/gltf-binary',
  '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };
const root = resolve('client');
const previewHTML = '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<script type="importmap">{"imports":{"three":"./vendor/three.module.min.js"}}</script>' +
  '<style>body{margin:0;background:#111;color:white;font:14px sans-serif}' +
  '#graveyard3d{position:relative;width:100vw;height:80vh;min-height:420px;overflow:hidden}' +
  '#graveyard3d canvas{display:block;width:100%;height:100%}</style></head><body>' +
  '<div id="graveyard3d"></div><div id="graveyard3dStatus">Loading</div>' +
  '<div id="explorationObjective"></div>' +
  '<script type="module" src="./homefront-graveyard-3d.js"></script></body></html>';
const apiResponses = [];
// Optional response delay models WAN acknowledgements, only in this isolated
// in-memory CI server; requests still use the real Homefront world handler.
let movementAckDelayMs = 0;
const responseWithLatency = (res, code, value) => {
  if (movementAckDelayMs && res.previewAccount === A &&
      res.previewPath === '/api/homefront/world/move-input') {
    setTimeout(() => json(res, code, value), movementAckDelayMs);
  } else json(res, code, value);
};
const json = (res, code, value) => {
  if (res.previewPath) apiResponses.push({ path: res.previewPath, acct: res.previewAccount, status: code, error: value?.error || null, ack: value?.inputAck?.sequence });
  res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(value));
};
const apiCalls = [];
const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/homefront')) {
      const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      const acct = token === 'preview-token-a' ? A : token === 'preview-token-b' ? B : null;
      const chunks = [];
      for await (const part of req) chunks.push(part);
      const raw = Buffer.concat(chunks).toString('utf8');
      apiCalls.push({ acct, method: req.method, pathname: url.pathname });
      res.previewPath = url.pathname; res.previewAccount = acct;
      const served = await Homefront.handle(req, res, url, {
        json: responseWithLatency, ip: '127.0.0.1', gate: () => false,
        who: () => acct ? { acct } : null,
        body: async () => raw ? JSON.parse(raw) : {},
        store
      });
      if (!served) json(res, 404, { error: 'unknown_test_route' });
      return;
    }
    if (url.pathname === '/arena/homefront-browser-test.html') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(previewHTML);
      return;
    }
    const path = resolve(root, '.' + decodeURIComponent(url.pathname));
    if (!path.startsWith(root + sep)) { res.writeHead(403); res.end(); return; }
    const data = await readFile(path);
    res.writeHead(200, { 'content-type': mime[extname(path)] || 'application/octet-stream' });
    res.end(data);
  } catch (error) {
    console.error('isolated server failure', String(error));
    if (!res.headersSent) json(res, 500, { error: 'isolated_test_error' });
    else res.end();
  }
});
const output = process.env.HOMEFRONT_BROWSER_OUTPUT || 'homefront-browser-output';
mkdirSync(output, { recursive: true });
// This server process exists only in a disposable CI runner, not Fly.io.
process.env.HOMEFRONT_CONTINUOUS_MOVEMENT = '1';
let browser;
try {
  const port = await new Promise((ok, fail) => {
    server.once('error', fail);
    server.listen(0, '127.0.0.1', () => ok(server.address().port));
  });
  const address = 'http://localhost:' + port + '/arena/homefront-browser-test.html?movement=continuous';
  browser = await chromium.launch({ headless: true, args: [
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist', '--no-sandbox', '--no-zygote'
  ] });
  // Independent BrowserContexts are mandatory: separate pages in one context
  // share localStorage and would overwrite each other's fake bearer identity.
  const desktopA = await browser.newContext({ viewport: { width: 1280, height: 850 } });
  const desktopB = await browser.newContext({ viewport: { width: 1280, height: 850 } });
  const pageErrors = [];
  async function openPage(context, token, name) {
    const page = await context.newPage();
    page.on('pageerror', error => pageErrors.push(name + ': ' + error.message));
    await page.addInitScript(t => { localStorage.setItem('bcToken', t); window.__testKeys = []; window.addEventListener('keydown', e => window.__testKeys.push(e.key), true); }, token);
    const response = await page.goto(address, { waitUntil: 'domcontentloaded', timeout: 60000 });
    assert.equal(response?.status(), 200);
    await page.waitForFunction(() => document.getElementById('graveyard3dStatus')
      ?.textContent?.includes('direct WASD/joystick walking (preview)'), { timeout: 60000 });
    assert(await page.locator('#graveyard3d canvas').first().isVisible(), name + ' real WebGL canvas rendered');
    assert((await page.locator('#graveyard3dStatus').innerText()).includes('2 explorers'),
      name + ' sees two test users in one world');
    await page.screenshot({ path: output + '/' + name + '-initial.png' });
    return page;
  }
  const first = await openPage(desktopA, 'preview-token-a', 'desktop-a');
  const second = await openPage(desktopB, 'preview-token-b', 'desktop-b');
  const view = first.locator('#graveyard3d .hf-viewbtn');
  assert(await view.isVisible(), 'actual camera toggle rendered');
  await view.click();
  assert(/first-person/i.test(await view.innerText()), 'first-person selected');
  await view.click();
  assert(/third-person/i.test(await view.innerText()), 'third-person restored');
  const before = store.load('homefront-world.json').players[A];
  await first.keyboard.down(dir.key);
  await first.waitForTimeout(1350);
  await first.keyboard.up(dir.key);
  await first.waitForTimeout(400);
  const after = store.load('homefront-world.json').players[A];
  const moved = Math.hypot(after.x - before.x, after.z - before.z);
  console.log('HOMEFRONT_BROWSER_DIAGNOSTICS', JSON.stringify({
    moved, dir, after, before, keys: await first.evaluate(() => window.__testKeys),
    status: await first.locator('#graveyard3dStatus').innerText(),
    inputs: apiCalls.filter(c => c.pathname.endsWith('move-input')),
    responses: apiResponses.filter(c => c.path.endsWith('move-input')),
    errors: pageErrors
  }));
  assert(moved > 0.15, 'holding WASD must advance real server position; observed ' + moved);
  assert(moved < 15, 'server movement budget prevents giant teleport');
  await first.screenshot({ path: output + '/desktop-a-walked.png' });
  const sent = apiCalls.filter(c => c.acct === A && c.pathname === '/api/homefront/world/move-input');
  assert(sent.length >= 2, 'multiple authoritative movement packets accepted from browser');
  assert(!apiCalls.some(c => c.acct === A && c.pathname === '/api/homefront/world/move'),
    'direct walking does not invoke legacy destination movement');
  const remote = World.snapshot(store.load('homefront-world.json'), B, Date.now());
  assert(remote.players.some(player => player.id !== remote.self.id),
    'remote test account can see the walking player in the authoritative snapshot');
  // Prove the SECOND browser actually consumes an updated player snapshot.
  // This checks live in-browser multiplayer polling rather than only calling
  // World.snapshot from Node and claiming client synchronization.
  let remoteAvatarPosition = null;
  for (let attempt = 0; attempt < 2 && !remoteAvatarPosition; attempt++) {
    const response = await second.waitForResponse(r =>
      new URL(r.url()).pathname === '/api/homefront/world' &&
      r.request().method() === 'GET' && r.status() === 200,
      { timeout: 14500 });
    const snapshot = await response.json();
    const other = snapshot.players?.find(p => p.label !== 'You');
    if (other && Math.hypot(other.x - after.x, other.z - after.z) < 0.06) {
      remoteAvatarPosition = { x: other.x, z: other.z };
    }
  }
  assert(remoteAvatarPosition, 'second live browser receives first player updated authoritative position');
  const canvas = first.locator('#graveyard3d canvas').first();
  const bounds = await canvas.boundingBox();
  assert(bounds, 'real 3D canvas has a box for right-button orbit');
  // Camera orbit must visibly change the actual rendered pixels. Exclude
  // scene animation from the verdict by sampling a no-drag control interval.
  const beforeOrbit = await first.screenshot();
  await first.waitForTimeout(180);
  const idleOrbit = await first.screenshot();
  await first.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await first.mouse.down({ button: 'right' });
  await first.mouse.move(bounds.x + bounds.width / 2 + 150, bounds.y + bounds.height / 2 - 40, { steps: 10 });
  await first.mouse.up({ button: 'right' });
  const afterOrbit = await first.screenshot({ path: output + '/desktop-a-orbit.png' });
  const orbitMetrics = await first.evaluate(async images => {
    const pixels = async base64 => {
      const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width; canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0);
      return { width: canvas.width, height: canvas.height,
        values: ctx.getImageData(0, 0, canvas.width, canvas.height).data };
    };
    const frames = await Promise.all(images.map(pixels));
    const contrast = (left, right) => {
      let samples = 0, changed = 0;
      const width = Math.min(left.width, right.width);
      const height = Math.min(left.height, right.height);
      for (let y = 80; y < height * .72; y += 12) {
        for (let x = width * .15; x < width * .85; x += 12) {
          const ix = (Math.floor(y) * left.width + Math.floor(x)) * 4;
          const jx = (Math.floor(y) * right.width + Math.floor(x)) * 4;
          const a = left.values, b = right.values;
          const difference = Math.abs(a[ix] - b[jx]) +
            Math.abs(a[ix + 1] - b[jx + 1]) + Math.abs(a[ix + 2] - b[jx + 2]);
          samples++;
          if (difference > 42) changed++;
        }
      }
      return changed / Math.max(1, samples);
    };
    return { idle: contrast(frames[0], frames[1]),
      afterRightDrag: contrast(frames[1], frames[2]) };
  }, [beforeOrbit, idleOrbit, afterOrbit].map(b => b.toString('base64')));
  assert(orbitMetrics.afterRightDrag > Math.max(0.045, orbitMetrics.idle + 0.025),
    'right-button orbit must produce a measurable rendered camera change: ' +
    JSON.stringify(orbitMetrics));
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block'
  });
  const touch = await openPage(mobile, 'preview-token-b', 'mobile-b');
  assert(await touch.locator('#graveyard3d .hf-viewbtn').isVisible(), 'touch camera button renders');
  const joystick = touch.locator('#graveyard3d .hf-joy');
  assert(await joystick.isVisible(), 'mobile virtual joystick is visible');
  const beforeTouch = store.load('homefront-world.json').players[B];
  const mobileDirection = directions.find(d =>
    Terrain.canTraverse(beforeTouch.x, beforeTouch.z, beforeTouch.x + 2 * d.x, beforeTouch.z + 2 * d.z) &&
    Collision.canTraverse(beforeTouch.x, beforeTouch.z, beforeTouch.x + 2 * d.x, beforeTouch.z + 2 * d.z, { bounds: World.WORLD_SIZE }));
  assert(mobileDirection, 'mobile test player has an unobstructed movement direction');
  // Isolated synthetic touch/pointer sequence through the real joystick DOM
  // listener. The player never uses client-supplied coordinates as authority.
  const directionToPad = {
    w: { dx: 0, dy: -32 }, s: { dx: 0, dy: 32 },
    a: { dx: -32, dy: 0 }, d: { dx: 32, dy: 0 }
  };
  await touch.evaluate(({ dx, dy }) => {
    const pad = document.querySelector('#graveyard3d .hf-joy'), box = pad.getBoundingClientRect();
    pad.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch',
      pointerId: 23, clientX: box.left + box.width / 2 + dx, clientY: box.top + box.height / 2 + dy }));
  }, directionToPad[mobileDirection.key]);
  await touch.waitForTimeout(1350);
  await touch.evaluate(() => {
    document.querySelector('#graveyard3d .hf-joy').dispatchEvent(new PointerEvent('pointerup',
      { bubbles: true, pointerType: 'touch', pointerId: 23 }));
  });
  await touch.waitForTimeout(400);
  const afterTouch = store.load('homefront-world.json').players[B];
  const mobileMoved = Math.hypot(afterTouch.x - beforeTouch.x, afterTouch.z - beforeTouch.z);
  const mobileSends = apiCalls.filter(c => c.acct === B && c.pathname === '/api/homefront/world/move-input');
  assert(mobileSends.length >= 2, 'mobile touch joystick sent repeated actual movement packets');
  assert(mobileMoved > 0.12, 'mobile joystick moves authoritative player position; observed ' + mobileMoved);
  await touch.screenshot({ path: output + '/mobile-b-walked.png' });
  // Simulate a bounded 220ms movement-ACK delay, not a fake position or
  // a bypass to World.moveInput. No other account is affected.
  // Reinitialize the scene after the orbit check: its right-drag heading is
  // intentionally changed, so reusing the original WASD direction could walk
  // straight into a wall and falsely blame network delay. The server state
  // remains persistent and authoritative across the local browser reload.
  await first.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await first.waitForFunction(() => document.getElementById('graveyard3dStatus')
    ?.textContent?.includes('direct WASD/joystick walking (preview)'), { timeout: 60000 });
  const beforeLag = store.load('homefront-world.json').players[A];
  const lagDir = directions.find(d =>
    Terrain.canTraverse(beforeLag.x, beforeLag.z, beforeLag.x + 3 * d.x, beforeLag.z + 3 * d.z) &&
    Collision.canTraverse(beforeLag.x, beforeLag.z, beforeLag.x + 3 * d.x, beforeLag.z + 3 * d.z, { bounds: World.WORLD_SIZE }));
  assert(lagDir, 'lag simulation starts with an unobstructed 3-unit direction');
  movementAckDelayMs = 220;
  const priorPackets = apiCalls.filter(c => c.acct === A &&
    c.pathname === '/api/homefront/world/move-input').length;
  await first.keyboard.down(lagDir.key);
  await first.waitForTimeout(1100);
  await first.keyboard.up(lagDir.key);
  await first.waitForTimeout(500);
  movementAckDelayMs = 0;
  const afterLag = store.load('homefront-world.json').players[A];
  const lagMovement = Math.hypot(afterLag.x - beforeLag.x, afterLag.z - beforeLag.z);
  const lagPackets = apiCalls.filter(c => c.acct === A &&
    c.pathname === '/api/homefront/world/move-input').length - priorPackets;
  console.log('HOMEFRONT_DELAYED_ACK_DIAGNOSTICS', JSON.stringify({
    lagDirection: lagDir, lagMovement, lagPackets,
    inputResponses: apiResponses.filter(c =>
      c.acct === A && c.path === '/api/homefront/world/move-input').slice(-9),
    browserKeys: await first.evaluate(() => window.__testKeys),
    before: { x: beforeLag.x, z: beforeLag.z },
    after: { x: afterLag.x, z: afterLag.z },
    pageErrors
  }));
  assert(lagPackets >= 2, '220ms delayed ACK still allows repeated real walking inputs');
  assert(lagMovement > 0.12 && lagMovement < 14,
    'delayed-ACK phase moves an authoritative actor within bounds: ' + lagMovement);
  assert.deepEqual(pageErrors, [], 'desktop and mobile have no uncaught JS errors');
  console.log('HOMEFRONT ISOLATED CHROMIUM SMOKE PASSED');
  console.log(JSON.stringify({ distance: Number(moved.toFixed(3)), movementPackets: sent.length,
    mobileDistance: Number(mobileMoved.toFixed(3)), mobileMovementPackets: mobileSends.length,
    realServerMovement: true, desktopCameraToggle: true, pointerOrbitExercised: true,
    visibleRemoteTestPlayer: true, remoteBrowserObservedPosition: remoteAvatarPosition,
    cameraOrbitPixelDifference: orbitMetrics, delayedAckMs: 220,
    delayedAckMovement: Number(lagMovement.toFixed(3)), delayedAckPackets: lagPackets,
    mobileCanvasLoaded: true, mobileJoystickExercised: true, pageErrors: [] }));
  await mobile.close();
  await desktopA.close();
  await desktopB.close();
} finally {
  if (browser) await browser.close();
  await new Promise(ok => server.close(ok));
}
