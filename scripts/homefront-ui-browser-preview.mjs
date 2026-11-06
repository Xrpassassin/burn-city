// Homefront UI-only Chromium smoke. Loads the real HTML markup and HUD module,
// but no game logic, remote HTTP APIs, wallets, or authenticated player data.
// All "server" interactions are fakes living inside disposable CI Chromium.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';

const requirePlaywright = createRequire((process.env.PLAYWRIGHT_DIR || process.cwd()) + '/package.json');
const { chromium } = requirePlaywright('playwright');
const sourceHTML = await readFile('client/arena/homefront.html', 'utf8');
const markup = sourceHTML.slice(0, sourceHTML.indexOf('<script type="module">'));
assert(markup.includes('<div id="game" hidden>'), 'must use actual original Homefront HTML');
const bootstrap = String.raw`
import { createHud } from './homefront-hud.mjs';
const status = document.getElementById('status');
const game = document.getElementById('game');
game.hidden = false;
document.body.classList.add('rpg-mode-home');
const canvas = document.createElement('canvas');
canvas.setAttribute('aria-label', '3D test-world placeholder');
canvas.style.cssText = 'display:block;width:100%;height:100%;background:#252e27';
document.getElementById('world').append(canvas);
// Layout-only controls: the actual scene adds equivalent overlays at runtime.
// They let Chromium reject positions that would cover the thumb joystick.
const camera = document.createElement('button');
camera.className = 'hf-viewbtn';
camera.textContent = 'Third-person · V';
camera.style.cssText = 'position:absolute;top:8px;right:8px;z-index:3;min-height:40px';
document.getElementById('world').append(camera);
if (matchMedia('(pointer: coarse)').matches) {
  const joystick = document.createElement('div');
  joystick.className = 'hf-joy';
  joystick.setAttribute('aria-label', 'Movement joystick');
  joystick.style.cssText = 'position:absolute;left:12px;bottom:12px;width:104px;height:104px;border:2px solid orange;z-index:3';
  document.getElementById('world').append(joystick);
}
const sheetData = { level: 1, xpThisLevel: 0, xpNextLevel: 100,
  attributePoints: 0, skillPoints: 0, perkPoints: 0,
  attributes: [], skills: [], perks: [], gameplayEffects: null,
  equipment: { weapon: 'pipe_blade' }, slots: [], items: [], quests: [], log: [] };
window.__test = { mode: 'home', travelCount: 0, arenaCount: 0, accountCount: 0,
  requests: [], status };
document.getElementById('back').onclick = () => window.__test.arenaCount++;
document.getElementById('signin').onclick = () => window.__test.accountCount++;
const setMode = m => {
  window.__test.mode = m;
  document.body.classList.remove('rpg-mode-home','rpg-mode-workshop','rpg-mode-management','rpg-mode-expedition');
  document.body.classList.add('rpg-mode-' + m);
};
const buildChoice = document.createElement('button');
buildChoice.type = 'button';
buildChoice.id = 'testChoosePlacement';
buildChoice.textContent = 'Choose placement';
buildChoice.onclick = () => window.__test.placementClicks = (window.__test.placementClicks || 0) + 1;
document.getElementById('buildings').append(buildChoice);
window.__test.hud = createHud({
  request: async (path, method = 'GET', payload) => {
    window.__test.requests.push({path, method, payload});
    if (method === 'POST') throw new Error('UI smoke must not mutate a server');
    return { sheet: sheetData };
  },
  getWorld: () => null,
  getBase: () => ({level:1}),
  getMode: () => window.__test.mode,
  setMode,
  travel: { open: () => { window.__test.travelCount++; } },
  signedIn: () => true,
  message: () => {}
});
window.__test.ready = true;
`;
const fixture = markup + '<script type="module">' + bootstrap + '</script></body></html>';
const mime = { '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml' };
const root = resolve('client');
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    if (url.pathname === '/arena/homefront-ui-smoke.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(fixture); return;
    }
    const path = resolve(root, '.' + decodeURIComponent(url.pathname));
    if (!path.startsWith(root + sep)) { res.writeHead(403); res.end(); return; }
    const bytes = await readFile(path);
    res.writeHead(200, {'Content-Type': mime[extname(path)] || 'application/octet-stream'});
    res.end(bytes);
  } catch (error) {
    res.writeHead(404); res.end('Fixture missing: ' + String(error));
  }
});
const out = process.env.HOMEFRONT_UI_ARTIFACTS || 'homefront-ui-browser-output';
await mkdir(out, { recursive: true });
let browser;
try {
  const port = await new Promise((ok, fail) => {
    server.once('error', fail);
    server.listen(0, '127.0.0.1', () => ok(server.address().port));
  });
  browser = await chromium.launch({ executablePath:process.env.HOMEFRONT_CHROMIUM_PATH||undefined, headless:true, args:[
    '--no-sandbox','--no-zygote','--use-gl=angle','--use-angle=swiftshader',
    '--enable-unsafe-swiftshader'
  ]});
  const browserErrors = [];
  async function openFixture(context, name) {
    const page = await context.newPage();
    page.on('pageerror', error => browserErrors.push(name + ': ' + error.message));
    await page.goto('http://127.0.0.1:' + port + '/arena/homefront-ui-smoke.html',
      { waitUntil:'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => window.__test?.ready &&
      document.body.classList.contains('hf-playing'), { timeout: 20000 });
    return page;
  }
  const desktop = await browser.newContext({ viewport:{width:1366,height:850}});
  const page = await openFixture(desktop,'desktop');
  const world = page.locator('#world');
  const initial = await world.boundingBox();
  assert(initial, 'Homefront scene has a physical render box');
  assert(initial.width > 1300 && initial.height > 800,
    '3D scene fills desktop viewport: ' + JSON.stringify(initial));
  assert.equal(await page.locator('header').evaluate(node => getComputedStyle(node).display),
    'none', 'old webpage header hidden during full-screen game');
  assert(await page.locator('#hfHud').isVisible(), 'in-world HUD visible');
  await page.screenshot({path:out+'/desktop-world.png'});

  await page.locator('#hfHud .hf-menu').click();
  assert(await page.locator('#hfSheet').isVisible(),'single menu overlay opens');
  await page.locator('#hfSheet .hf-tabs button').filter({hasText:'Build'}).click();
  assert.equal(await page.evaluate(() => window.__test.mode),'workshop',
    'Build selects existing workshop mode');
  assert(await page.locator('#hfSheet #buildPanel').isVisible(),
    'original building workshop is inside unified menu');
  assert(await world.isVisible(),'3D canvas remains visible behind Build');
  assert.equal(await page.locator('#buildPanel').count(),1,'Build controls never duplicated');
  const buildBox = await world.boundingBox();
  assert(Math.abs(buildBox.width-initial.width)<1 && Math.abs(buildBox.height-initial.height)<1,
    'opening Build does not resize or recreate the 3D scene');
  await page.screenshot({path:out+'/desktop-build-menu.png'});
  // A construction selection must close the drawer WITHOUT reverting to
  // normal play: the real handler keeps a pendingBuilding ghost in that mode.
  await page.locator('#hfSheet #testChoosePlacement').click();
  await page.waitForFunction(() => document.getElementById('hfSheet').hidden);
  assert.equal(await page.evaluate(() => window.__test.mode),'workshop',
    'a chosen structure keeps protected in-world placement active');
  assert.equal(await page.evaluate(() => window.__test.placementClicks),1);
  await page.locator('.hf-build-exit').waitFor({state:'visible'});
  await page.locator('.hf-build-exit').click();
  assert.equal(await page.evaluate(() => window.__test.mode),'home',
    'Finish building exits protected placement and restores normal exploration');
  await page.locator('#hfHud .hf-menu').click();
  await page.locator('#hfSheet .hf-tabs button').filter({hasText:'Build'}).click();

  await page.locator('#hfSheet .hf-tabs button').filter({hasText:'Manage'}).click();
  assert.equal(await page.evaluate(() => window.__test.mode),'home',
    'switching from Build to Manage returns to normal exploration');
  assert.equal(await page.locator('#buildPanel').count(),1);
  assert.equal(await page.locator('#game #buildPanel').count(),1,
    'Build original node restored before Manage');
  assert(await world.isVisible(),'3D scene still present behind Manage');
  const manageTabs = page.locator('#hfSheet .hf-mtabs button');
  assert(await manageTabs.count() >= 4, 'Management has separate scrollable subcategories');
  await manageTabs.filter({hasText:'Refuge access'}).click();
  assert(await page.locator('#hfSheet #privacyPanel').isVisible(),
    'original settlement access controls displayed inside menu');
  assert.equal(await page.locator('#privacyPanel').count(),1);
  await page.screenshot({path:out+'/desktop-manage-menu.png'});

  // A moving DOM panel must retain existing button event listeners. The UI
  // fixture handler does not invoke a game mutation.
  await page.evaluate(() => {
    window.__test.localClicks = 0;
    document.querySelector('#makePrivate').addEventListener('click',
      () => window.__test.localClicks++);
  });
  await page.locator('#hfSheet #makePrivate').click();
  assert.equal(await page.evaluate(() => window.__test.localClicks),1,
    'original management controls retain event listeners after DOM reparent');

  // Escape closes one menu and restores panels to the original game DOM.
  await page.keyboard.press('Escape');
  assert(await page.locator('#hfSheet').isHidden(),'Escape closes menu');
  assert.equal(await page.locator('#game #privacyPanel').count(),1,
    'original management DOM restored');
  assert(await world.isVisible(),'world remains ready after closing menu');

  // Opening menu cannot leave a movement key held behind an overlay.
  await page.evaluate(() => {
    window.__test.blurEvents = 0;
    window.addEventListener('blur', () => window.__test.blurEvents++);
  });
  await page.locator('#hfHud .hf-menu').click();
  assert((await page.evaluate(() => window.__test.blurEvents)) >= 1,
    'opening menu releases held avatar controls by triggering focus loss');
  await page.keyboard.press('w');
  assert(await page.locator('#hfSheet').isVisible(),'movement key does not close modal');
  const reqs = await page.evaluate(() => window.__test.requests.filter(r => r.method === 'POST'));
  assert.equal(reqs.length,0,'UI-only navigation never mutated the fake server');

  // City and account remain available after hiding the old HTML header.
  assert.equal(await page.getByRole('link',{name:'Return to BURN City'}).getAttribute('href'),'../');
  await page.locator('#hfSheet .hf-panel-header button').filter({hasText:'Account'}).click();
  assert.equal(await page.evaluate(() => window.__test.accountCount),1);
  await page.locator('#hfHud .hf-menu').click();
  await page.locator('#hfSheet .hf-tabs button').filter({hasText:'Travel'}).click();
  assert.equal(await page.evaluate(() => window.__test.travelCount),1,
    'Travel still uses original travel controller');
  assert(await page.locator('#hfSheet').isHidden(),
    'Travel does not stack an unrelated second tabbed menu');

  const mobileContext = await browser.newContext({
    viewport:{width:390,height:844}, isMobile:true,hasTouch:true,
    deviceScaleFactor:1,serviceWorkers:'block'
  });
  const mobile = await openFixture(mobileContext,'mobile');
  const mworld = await mobile.locator('#world').boundingBox();
  assert(mworld.width > 385 && mworld.height > 805,
    'world fills mobile viewport, including safe areas: '+JSON.stringify(mworld));
  assert(await mobile.locator('#hfHud .hf-menu').isVisible(),
    'menu remains accessible on phone viewport');
  const rects = await mobile.evaluate(() => {
    const bounds = selector => {
      const {x,y,width,height} = document.querySelector(selector).getBoundingClientRect();
      return {x,y,width,height};
    };
    return {hud:bounds('#hfHud'),camera:bounds('#world .hf-viewbtn'),
      status:bounds('#status'),joystick:bounds('#world .hf-joy')};
  });
  const intersects = (a,b) => a.x < b.x+b.width && a.x+a.width > b.x &&
    a.y < b.y+b.height && a.y+a.height > b.y;
  assert(!intersects(rects.hud,rects.camera),
    'mobile HUD must not cover first-/third-person camera control');
  assert(!intersects(rects.status,rects.joystick),
    'persistent status notices must not block mobile movement joystick');
  assert(!intersects(rects.hud,rects.joystick),
    'mobile HUD must leave the bottom-left touch thumb area clear');
  await mobile.screenshot({path:out+'/mobile-world.png'});
  await mobile.locator('#hfHud .hf-menu').click();
  assert(await mobile.locator('#hfSheet').isVisible());
  await mobile.locator('#hfSheet .hf-tabs button').filter({hasText:'Build'}).click();
  assert(await mobile.locator('#hfSheet #buildPanel').isVisible(),
    'Build is reachable from small mobile menu');
  const drawer = await mobile.locator('#hfSheet .hf-card').boundingBox();
  assert(drawer && drawer.width <= 391 && drawer.height <= 690 && drawer.y > 120,
    'menu leaves part of the phone world visible');
  await mobile.screenshot({path:out+'/mobile-build-menu.png'});
  await mobile.locator('#hfSheet .hf-tabs button').filter({hasText:'Manage'}).click();
  assert(await mobile.locator('#hfSheet .hf-mtabs button').count() >= 4,
    'mobile Manage categories accessible');
  await mobile.screenshot({path:out+'/mobile-manage-menu.png'});
  assert.deepEqual(browserErrors,[], 'no uncaught browser errors');
  console.log('HOMEFRONT IMMERSIVE UI CHROMIUM PASSED');
  console.log(JSON.stringify({desktopWorld:{w:initial.width,h:initial.height},
    mobileWorld:{w:mworld.width,h:mworld.height},
    manageCategories:await manageTabs.count(),
    buildReusesOriginalNode:true,manageReusesOriginalNode:true,
    selectionKeepsWorldPlacementMode:true,
    arenaAccountTravelAccessible:true,worldPersistsBehindMenus:true,
    mobileHudNoControlOverlap:true, browserErrors}));
  await mobileContext.close();
  await desktop.close();
} finally {
  if(browser) await browser.close();
  await new Promise(ok => server.close(ok));
}
