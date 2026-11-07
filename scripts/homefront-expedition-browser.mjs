// Play a local Homefront expedition through the actual HTML, renderer and server.
// Synthetic accounts and an in-memory store keep gameplay isolated from production.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { PINE_CROSSING_BUILDINGS, PINE_CROSSING_ROUTES } from '../client/arena/homefront-pine-crossing.mjs';

const localRequire = createRequire(import.meta.url);
const playwrightRequire = createRequire(
  (process.env.PLAYWRIGHT_DIR || process.cwd()) + "/package.json",
);
const { chromium } = playwrightRequire("playwright");
const World = localRequire("../server/homefront-world.js");
const Homefront = localRequire("../server/homefront.js");
const guestMode = process.env.HOMEFRONT_EXPEDITION_GUEST === "1";
const fixturePath = path => guestMode ? path.replace('/api/homefront','/api/homefront/guest') : path;
let ACCOUNT = "playtest-first-refuge";
const TOKEN = "ui-three-token";
const guest = localRequire('../server/homefront-guest.js').createGuestHandler();
let guestStore;
// Observe, but do not replace, the authority's real per-session RAM store.
// This lets the same end-to-end assertions inspect wallet and guest fixtures.
const realHandle = Homefront.handle;
Homefront.handle = async (req, res, url, context) => {
  const account = context.who()?.acct;
  if (guestMode && account?.startsWith('guest_')) {
    ACCOUNT = account;
    guestStore = context.store;
  }
  return realHandle(req, res, url, context);
};
const REFUGE_ACCOUNT = "ui-refuge-test-only";
const REFUGE_TOKEN = "ui-refuge-token";
const objects = new Map();
const store = {
  load(key, fallback) {
    return objects.has(key) ? structuredClone(objects.get(key)) : fallback;
  },
  save(key, value) {
    objects.set(key, structuredClone(value));
  },
};
const testState = key => guestMode ? guestStore?.load(key, undefined) : objects.get(key);
const initialWorld = World.defaultWorld();
store.save("homefront-world.json", initialWorld);
const original = await readFile("client/arena/homefront.html", "utf8");
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".glb": "model/gltf-binary",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".woff2": "font/woff2",
};
const clientRoot = resolve("client");
const observed = [];
const json = (res, status, payload) => {
  res.writeHead(status, {
    "content-type": "application/json",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(payload));
};
const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://localhost");
  try {
    // Real Homefront requests the jetpack status on refuge load. This route
    // is deliberately a harmless read-only fixture, not a payment backend.
    if (url.pathname === "/api/jetpack") {
      if (req.method !== "GET")
        return json(res, 405, { error: "read_only_test_fixture" });
      return json(res, 200, {
        owned: { homefront: false },
        payments: false,
        prices: { homefront: { xrp: 0 } },
      });
    }
    if (guestMode && url.pathname.startsWith('/api/homefront/guest')) {
      assert.equal(req.headers.authorization, undefined, 'guest gameplay never sends a wallet bearer');
      const received=[]; for await (const chunk of req) received.push(chunk);
      const raw=Buffer.concat(received).toString('utf8');
      const context={json,gate:()=>false,ip:'127.0.0.1',body:async()=>raw?JSON.parse(raw):{}};
      observed.push({path:url.pathname.replace('/guest',''),method:req.method,guest:true});
      await guest.handle(req,res,url,context);return;
    }
    if (url.pathname.startsWith("/api/homefront")) {
      if (guestMode) throw Error('Guest expedition attempted wallet API '+url.pathname);
      const token = String(req.headers.authorization || "").replace(
        /^Bearer\s+/i,
        "",
      );
      const account =
        token === TOKEN
          ? ACCOUNT
          : token === REFUGE_TOKEN
            ? REFUGE_ACCOUNT
            : null;
      observed.push({ path: url.pathname, method: req.method, account });
      if (
        req.method !== "GET" &&
        !url.pathname.startsWith("/api/homefront/world/")
      )
        return json(res, 405, { error: "test_world_only" });
      const received = [];
      for await (const p of req) received.push(p);
      const raw = Buffer.concat(received).toString("utf8");
      const served = await Homefront.handle(req, res, url, {
        json,
        gate: () => false,
        ip: "127.0.0.1",
        who: () => (account ? { acct: account } : null),
        body: async () => (raw ? JSON.parse(raw) : {}),
        store,
      });
      if (!served) json(res, 404, { error: "test_endpoint_not_found" });
      return;
    }
    if (
      url.pathname === "/arena/homefront-real-ui.html" ||
      url.pathname === "/arena/homefront-real-refuge.html"
    ) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(original);
      return;
    }
    if (url.pathname === '/') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<h1>BURN City local exit fixture</h1>');
      return;
    }
    const path = resolve(clientRoot, "." + decodeURIComponent(url.pathname));
    if (!path.startsWith(clientRoot + sep)) {
      res.writeHead(403);
      res.end();
      return;
    }
    const bytes = await readFile(path);
    res.writeHead(200, {
      "content-type": mime[extname(path)] || "application/octet-stream",
    });
    res.end(bytes);
  } catch (e) {
    console.error("Local expedition test server", String(e));
    if (!res.headersSent) json(res, 500, { error: "test_server_failed" });
    else res.end();
  }
});

process.env.HOMEFRONT_CONTINUOUS_MOVEMENT = "1";
if(process.env.HOMEFRONT_EXPEDITION_ROVER==='1')process.env.HOMEFRONT_VEHICLES_ENABLED='1';
const port = await new Promise((ok) =>
  server.listen(0, "127.0.0.1", () => ok(server.address().port)),
);
const browser = await chromium.launch({
  executablePath: process.env.HOMEFRONT_CHROMIUM_PATH || undefined,
  headless: true,
  args: [
    "--no-sandbox",
    "--no-zygote",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
try {
  const mobile = process.env.HOMEFRONT_EXPEDITION_MOBILE === "1";
  const context = await browser.newContext({
    viewport: mobile
      ? { width: 390, height: 844 }
      : { width: 1280, height: 800 },
    isMobile: mobile,
    hasTouch: mobile,
  });
  const page = await context.newPage();
  const cdp = mobile ? await context.newCDPSession(page) : null;
  async function startWalking(key) {
    if (!mobile) {
      await page.keyboard.down(key);
      return;
    }
    const host = await page
      .locator("body")
      .evaluate((body) =>
        body.classList.contains("rpg-mode-expedition")
          ? "#graveyard3d"
          : "#world",
      );
    const box = await page.locator(host + " .hf-joy").boundingBox();
    const x = box.x + box.width / 2,
      y = box.y + box.height / 2;
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y }],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        {
          x: x + (key === "d" ? 46 : key === "a" ? -46 : 0),
          y: y + (key === "w" ? -46 : key === "s" ? 46 : 0),
        },
      ],
    });
  }
  async function stopWalking(key) {
    if (!mobile) {
      await page.keyboard.up(key);
      return;
    }
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
  }
  async function activate(locator) {
    if (mobile) await locator.tap();
    else await locator.click();
  }
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let pineRockLoaded = false;
  page.on('response', response => {
    if (response.url().endsWith('/pine-crossing/rock-small.glb')) pineRockLoaded = response.ok();
  });
  if (!guestMode) await page.addInitScript(
    ({ TOKEN, ACCOUNT }) => {
      localStorage.bcToken = TOKEN;
      localStorage.bcAcct = ACCOUNT;
    },
    { TOKEN, ACCOUNT },
  );
  let inputDelayMs = Number(process.env.HOMEFRONT_TEST_INPUT_DELAY_MS) || 0;
  await page.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (!["localhost", "127.0.0.1"].includes(url.hostname)) return route.abort();
    if (inputDelayMs > 0 && url.pathname.endsWith('/world/move-input')) {
      await new Promise(resolve => setTimeout(resolve, inputDelayMs));
    }
    return route.continue();
  });
  await page.goto(
    "http://localhost:" +
      port +
      "/arena/homefront-real-refuge.html?movement=continuous&debug=1",
  );
  await page.waitForFunction(
    () => document.body.classList.contains("hf-playing") && window.__hfYard,
  );
  const beforeIntroMove = await page.evaluate(() => window.__hfYard.player.z);
  await page.keyboard.down("s");
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        let frames = 0;
        const step = () =>
          ++frames === 12 ? resolve() : requestAnimationFrame(step);
        requestAnimationFrame(step);
      }),
  );
  await page.keyboard.up("s");
  assert.equal(
    await page.evaluate(() => window.__hfYard.player.z),
    beforeIntroMove,
    "tutorial blocks walking",
  );
  await page
    .locator("#homefrontModal button")
    .filter({ hasText: "Skip" })
    .click();

  // First complete the real refuge-to-world gate transition. Before this,
  // we're still inside the private Homefront and world rover controls do not
  // exist yet; the vehicle test must never skip that crossing.
  await startWalking("s");
  await page.waitForFunction(
    () => Math.abs(window.__hfYard.player.z - 8.9) <= 1.8,
    null,
    { timeout: 20000 },
  );
  await stopWalking("s");

  expeditionRun: {
    if(process.env.HOMEFRONT_EXPEDITION_ROVER==='1'){
      assert.equal(guestMode,false,'shared vehicle acceptance uses wallet-authenticated world fixture');
      // Reaching the Homefront exit is not entering the shared overworld.
      // The separate existing expedition path explicitly clicks this gate.
      await activate(page.locator('#homefrontInteractionPrompt button'));
      await page.waitForFunction(()=>document.body.classList.contains('rpg-mode-expedition')&&
        document.querySelector('#graveyard3d')?.getClientRects().length>0);
      // Loading the container isn't proof that the Three.js module has
      // finished booting and installed its controls; require active gameplay.
      await page.waitForFunction(()=>document.querySelector('#graveyard3dStatus')?.
        textContent.includes('direct WASD'),null,{timeout:20000});
      const built=page.waitForResponse(response=>response.request().method()==='POST'&&
        response.url().endsWith('/api/homefront/world/vehicle/build'),{timeout:12000});
      await page.keyboard.press('b');
      const builtResult=await built.then(response=>response.json()).catch(async error=>{
        console.error('ROVER_BUILD_DIAGNOSTICS',JSON.stringify({
          error:String(error),observed:observed.slice(-16),
          world:testState('homefront-world.json')?.players?.[ACCOUNT],
          ui:await page.evaluate(()=>({
            mode:document.body.className,
            status:document.querySelector('#graveyard3dStatus')?.textContent,
            prompt:document.querySelector('#homefrontContextAction')?.textContent,
            visible:!!document.querySelector('#graveyard3d')?.getClientRects().length,
            pending:document.querySelector('.hf-movement-status')?.textContent
          }))
        }));
        throw error;
      });
      assert.equal(builtResult.vehicle?.type,'scrap_rover','B assembles a real salvage rover');
      assert.ok(builtResult.world.vehicles.some(v=>v.mine),'the rover mesh receives authoritative physical state');
      // Move the disposable test account next to its own vehicle only for
      // touch/keyboard UI acceptance. This fixture is NOT a production teleport API.
      const state=store.load('homefront-world.json',null);
      Object.assign(state.players[ACCOUNT],{x:builtResult.vehicle.x,z:builtResult.vehicle.z,lastSeen:Date.now()});
      store.save('homefront-world.json',state);
      await page.waitForFunction(()=>document.getElementById('homefrontContextAction')?.textContent.includes('Board scrap rover'),
        null,{timeout:15000});
      const boarded=page.waitForResponse(response=>response.request().method()==='POST'&&
        response.url().endsWith('/api/homefront/world/vehicle/board'));
      await activate(page.locator('#homefrontContextAction'));
      const boarding=await (await boarded).json();
      assert.equal(boarding.selfVehicle?.id,'rover:'+ACCOUNT);
      await page.waitForFunction(()=>getComputedStyle(document.querySelector('#graveyard3d .hf-rover-pad'))?.display==='grid',
        null,{timeout:5000});
      const firstPoint={x:boarding.self.x,z:boarding.self.z};
      const driving=page.waitForResponse(response=>response.request().method()==='POST'&&
        response.url().endsWith('/api/homefront/world/vehicle/drive'),{timeout:12000});
      if(mobile){
        const pad=page.getByRole('button',{name:'Rover KeyW'});
        const bounds=await pad.boundingBox();
        const at={x:bounds.x+bounds.width/2,y:bounds.y+bounds.height/2};
        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[at]});
        await new Promise(resolve=>setTimeout(resolve,450));
        await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      }else{
        await page.keyboard.down('w');
        await new Promise(resolve=>setTimeout(resolve,450));
        await page.keyboard.up('w');
      }
      const driven=await (await driving).json();
      assert.equal(driven.vehicle?.sequence,0);
      assert.ok(Math.hypot(driven.self.x-firstPoint.x,driven.self.z-firstPoint.z)<1.5,
        'server controls the first rover movement budget');
      assert.ok(driven.vehicle.charge<100,'real driving consumes battery charge');
      const park=page.waitForResponse(response=>response.request().method()==='POST'&&
        response.url().endsWith('/api/homefront/world/vehicle/dismount'));
      await page.waitForFunction(()=>document.getElementById('homefrontContextAction')?.textContent.includes('Park rover'),
        null,{timeout:5000});
      await activate(page.locator('#homefrontContextAction'));
      assert.equal((await (await park).json()).selfVehicle,null);
      assert.equal(store.load('homefront-world.json',null).vehicles[ACCOUNT].driver,null);
      // The mobile player must be able to recharge without a hardware keyboard.
      const scrapBeforeCharge=store.load('homefront.json',{})[ACCOUNT].resources.scrap;
      const recharge=page.locator('#homefrontRoverRecharge');
      await recharge.waitFor({state:'visible',timeout:10000});
      const charged=page.waitForResponse(response=>response.request().method()==='POST'&&
        response.url().endsWith('/api/homefront/world/vehicle/charge'));
      await activate(recharge);
      const charging=await (await charged).json();
      assert.equal(charging.vehicle?.charge,100,'nearby garage tops up the driven battery');
      assert.equal(store.load('homefront.json',{})[ACCOUNT].resources.scrap,scrapBeforeCharge-2,
        'touch recharge consumes the same server-owned materials as keyboard recharge');
      await recharge.waitFor({state:'hidden',timeout:5000});
      // Move only the disposable account to the same authored rescue site.
      // A survivor on the far side of the solid bus must not expose an E action.
      const rescueState=store.load('homefront-world.json',null);
      Object.assign(rescueState.players[ACCOUNT],{x:32.3,z:-42,lastSeen:Date.now()});
      const blockedSnapshot=page.waitForResponse(async response=>{
        if(response.request().method()!=='GET'||!response.url().endsWith('/api/homefront/world'))return false;
        const data=await response.json().catch(()=>null);
        return data?.self?.x===32.3&&data?.world?.rescues?.stranded_bus?.reachable===false;
      },{timeout:15000});
      store.save('homefront-world.json',rescueState);
      await blockedSnapshot;
      await page.waitForFunction(()=>document.querySelector('#homefrontContextAction')?.hidden||
        document.querySelector('#homefrontContextAction')?.textContent.includes('Board scrap rover')===false,
        null,{timeout:15000});
      assert.equal(await page.locator('#homefrontContextAction').evaluate(el=>!el.hidden&&el.textContent.includes('Help the stranded driver')),false,
        'the blocked survivor does not offer an interaction through the bus');
      const physicalRescue=store.load('homefront-world.json',null);
      Object.assign(physicalRescue.players[ACCOUNT],{x:39,z:-42,lastSeen:Date.now()});
      physicalRescue.players[ACCOUNT].inventory.food=2;
      physicalRescue.players[ACCOUNT].inventory.ammo=1;
      const survivorCount=store.load('homefront.json',{})[ACCOUNT].survivors.length;
      store.save('homefront-world.json',physicalRescue);
      await page.waitForFunction(()=>!document.querySelector('#homefrontContextAction')?.hidden&&
        document.querySelector('#homefrontContextAction')?.textContent.includes('Help the stranded driver'),
        null,{timeout:15000});
      const rescued=page.waitForResponse(response=>response.request().method()==='POST'&&
        response.url().endsWith('/api/homefront/world/rescue'));
      await activate(page.locator('#homefrontContextAction'));
      const rescueResult=await (await rescued).json();
      assert.equal(rescueResult.encounter?.rescued,true,'physical E/touch action recruits the shared survivor');
      assert.equal(store.load('homefront.json',{})[ACCOUNT].survivors.length,survivorCount+1);
      assert.equal(rescueResult.selfInventory.food,0,'rescue uses carried field food');
      assert.equal(rescueResult.selfInventory.ammo,0,'rescue uses carried field ammo');
      await page.waitForFunction(()=>document.querySelector('#homefrontContextAction')?.hidden||
        document.querySelector('#homefrontContextAction')?.textContent.includes('Help the stranded driver')===false,null,{timeout:10000});
      assert.deepEqual(errors,[]);
      console.log('SHARED ROVER PLAYTEST PASSED',JSON.stringify({mobile,assembled:true,boarded:true,
        serverCappedDrive:true,chargeUsed:true,parked:true,recharged:true,physicalRescue:true}));
      break expeditionRun;
    }

  const pineCrossing = process.env.HOMEFRONT_EXPEDITION_PINE === '1';
  if (pineCrossing) await page.evaluate(async () => {
    const { sfx } = await import('/arena/sfx.js');
    const { Object3D, PerspectiveCamera } = await import('/arena/vendor/three.module.min.js');
    const lookAt = PerspectiveCamera.prototype.lookAt;
    PerspectiveCamera.prototype.lookAt = function (...args) {
      lookAt.apply(this, args);
      if (this.fov === 48) window.pineCameraPosition = { x: this.position.x, z: this.position.z };
    };
    const environment = window.pineEnvironmentProbe = {};
    const expected = new Set(['pine-deadfall', 'pine-abandoned-pickup', 'pine-evacuation-barrier', 'pine-relay-station',
      'pine-cracked-asphalt', 'pine-roadside-grass', 'pine-crows',
      'loot_pine_logging_kit:closed', 'loot_pine_logging_kit:searched', 'loot_pine_creek_pack:closed',
      'loot_pine_relay_spares:closed']);
    const add = Object3D.prototype.add;
    Object3D.prototype.add = function (...objects) {
      const result = add.apply(this, objects);
      if(this.isScene)window.pineSurfaceScene=this;
      for (const object of objects) if (expected.delete(object?.name)) environment[object.name] = object.count ?? true;
      if (expected.size === 0) Object3D.prototype.add = add;
      return result;
    };
    const probe = window.fieldAudioProbe = { surfaces: [], cues: [], windStarts: 0, windStops: 0, creekPeak: 0, creekStops: 0 };
    const cue = sfx.fieldCue;
    sfx.fieldCue = (kind, ...position) => {
      const played = cue(kind, ...position);
      if (played && position.every(Number.isFinite)) probe.cues.push(kind);
      return played;
    };
    const wind = sfx.fieldWind;
    sfx.fieldWind = () => {
      const loop = wind();
      if (!loop) return null;
      probe.windStarts++;
      const stop = loop.stop;
      loop.stop = () => { probe.windStops++; stop(); };
      return loop;
    };
    const creek = sfx.fieldCreek;
    sfx.fieldCreek = () => {
      const loop = creek();
      if (!loop) return null;
      const { set, stop } = loop;
      return {
        set(level, ...position) {
          if (position.every(Number.isFinite)) probe.creekPeak = Math.max(probe.creekPeak, level);
          set(level, ...position);
        },
        stop() { probe.creekStops++; stop(); }
      };
    };
    const step = sfx.fieldStep;
    sfx.fieldStep = (surface, sprint) => {
      probe.surfaces.push(surface);
      step(surface, sprint);
    };
  });
  await activate(page.locator("#homefrontInteractionPrompt button"));
  await page.waitForFunction(() =>
    document.body.classList.contains("rpg-mode-expedition"),
  );
  await page.waitForFunction(() =>
    document
      .getElementById("graveyard3dStatus")
      .textContent.includes("direct WASD"),
  );
  if (pineCrossing) {
    const stance = page.locator('#graveyard3d .hf-crouch');
    await stance.waitFor({ state: 'visible' });
    const toggle = () => mobile ? stance.tap() : page.keyboard.press('z');
    for (const crouched of [true, false]) {
      await toggle();
      await page.waitForFunction(expected =>
        document.querySelector('#graveyard3d .hf-crouch')?.getAttribute('aria-pressed') === String(expected) &&
        document.querySelector('.hf-survival-readout')?.textContent.includes('Crouched') === expected, crouched);
      assert.equal(testState('homefront-world.json').players[ACCOUNT].crouched, crouched);
    }
  }

  // Place a living infected within reach in the disposable store. Stand still
  // and let the real browser poll the server. No attack or movement is sent.
  const contactStore = guestMode ? guestStore : store;
  const contactWorld = testState("homefront-world.json");
  const contactPlayer = contactWorld.players[ACCOUNT];
  assert.equal(contactPlayer.spawn, 'north_gate', 'the first Homefront enters at Pine Crossing’s North Gate');
  const contactEncounter = contactWorld.encounters[ACCOUNT];
  const attacker = {
    ...contactEncounter.members[0], x: contactPlayer.x, z: contactPlayer.z
  };
  Object.assign(contactEncounter, { x: attacker.x, z: attacker.z, members: [attacker], damage: 2 });
  contactPlayer.survival.health = 100;
  delete contactPlayer.infectedHit;
  const plantedAt = Date.now();
  const bitten = page.waitForResponse(async response => {
    if (response.request().method() !== 'GET' ||
        !response.url().endsWith(fixturePath('/api/homefront/world'))) return false;
    const data = await response.json().catch(() => null);
    return data?.selfInfectedHit?.at >= plantedAt && data.selfInfectedHit.sourceId === attacker.id;
  }, { timeout: 15000 });
  contactStore.save("homefront-world.json", contactWorld);
  const bite = await (await bitten).json();
  await page.waitForFunction(() =>
    document.querySelector(".hf-event-toast")?.textContent.includes("Bitten"),
    null, { timeout: 10000 },
  );
  assert.ok(bite.selfSurvival.health < 100, "the stationary survivor takes authoritative infected damage");
  assert.ok(!observed.some(entry => entry.path.endsWith("/world/attack")),
    "the bite happens before the survivor attacks");

  if (pineCrossing) {
    const route = id => PINE_CROSSING_ROUTES.find(item => item.id === id).points;
    const inputTrace = [];
    page.on('response', async response => {
      if (!response.url().endsWith(fixturePath('/api/homefront/world/move-input'))) return;
      const request = response.request();
      const command = request.postDataJSON();
      const payload = await response.json().catch(() => null);
      inputTrace.push({ command, status: response.status(), ack: payload?.inputAck, error: payload?.error });
      if (inputTrace.length > 12) inputTrace.shift();
    });
    let touchOrigin;
    if (mobile) {
      const box = await page.locator('#graveyard3d .hf-joy').boundingBox();
      touchOrigin = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    }
    async function walkTo([x, z]) {
      const held = new Set();
      if (touchOrigin) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touchOrigin] });
      }
      try {
        const deadline = Date.now() + 14000;
        while (Date.now() < deadline) {
          const player = testState('homefront-world.json').players[ACCOUNT];
          const dx = x - player.x, dz = z - player.z;
          const distance = Math.hypot(dx, dz);
          if (distance < 0.8) return;
          if (touchOrigin) {
            const scale = 46 / Math.max(2, distance);
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [
              { x: touchOrigin.x - dx * scale, y: touchOrigin.y - dz * scale }
            ] });
          } else {
            const keys = new Set([
              ...(Math.abs(dx) > 0.56 ? [dx > 0 ? 'a' : 'd'] : []),
              ...(Math.abs(dz) > 0.56 ? [dz > 0 ? 'w' : 's'] : [])
            ]);
            for (const key of held) if (!keys.has(key)) { await page.keyboard.up(key); held.delete(key); }
            for (const key of keys) if (!held.has(key)) { await page.keyboard.down(key); held.add(key); }
          }
          await new Promise(resolve => setTimeout(resolve, 85));
        }
        const player = testState('homefront-world.json').players[ACCOUNT];
        console.error('Pine Crossing input trace', JSON.stringify({ held: [...held], inputTrace,
          browser: await page.evaluate(() => ({ hidden: document.hidden, focused: document.hasFocus(),
            active: document.activeElement?.id, status: document.querySelector('#graveyard3dStatus')?.textContent,
            modal: document.querySelector('.hf-sheet:not([hidden]), .homefront-modal:not([hidden])')?.className })), errors }));
        throw Error('Pine Crossing walk blocked near ' + JSON.stringify([player.x, player.z]) + ' toward ' + JSON.stringify([x,z]));
      } finally {
        if (touchOrigin) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        else for (const key of held) await page.keyboard.up(key);
      }
    }
    const action = page.locator('#homefrontContextAction');
    for (const point of route('logging-road').slice(1)) {
      await walkTo(point);
      if (inputDelayMs > 0) {
        assert.ok(inputTrace.some(entry => entry.ack?.elapsedMs > 0 && entry.command.x < 0),
          'delayed desktop input makes authoritative progress');
        inputDelayMs = 0;
      }
      if (point[0] === -29) {
        await page.waitForFunction(() => window.fieldAudioProbe.cues.includes('canopy'), null, { timeout: 6000 });
      }
      if (point[0] !== -43) continue;
      await page.waitForFunction(() => document.querySelector('#explorationObjective')?.textContent.includes('Risk 2/5'));
      await page.waitForFunction(() => document.querySelector('#homefrontContextAction')?.textContent.includes('Logging Bend Crew Kit'));
      const searched = page.waitForResponse(response => response.url().endsWith(fixturePath('/api/homefront/world/loot')));
      await activate(action);
      const result = await (await searched).json();
      assert.equal(result.loot.node.id, 'loot_pine_logging_kit');
      assert.ok(result.loot.accepted.length || (result.loot.overflow.length && result.loot.overflowDestination === 'refuge'),
        'the road shoulder yields supplies between buildings');
    }
    await walkTo([-36.5, -43]);
    await page.waitForFunction(() => {
      const camera = window.pineCameraPosition;
      return camera && camera.x > -39 && camera.x < -35 && camera.z > -46.45 && camera.z < -44.5;
    }, null, { timeout: 6000 });
    await page.waitForFunction(()=>{
      const maps=new Map();
      window.pineSurfaceScene?.traverse(object=>{
        const mat=object.material;if(!mat?.name?.startsWith('homefront-surface:'))return;
        for(const slot of ['map','normalMap','roughnessMap']){
          const map=mat[slot];if(map?.userData.loaded)maps.set(mat.name+':'+slot,[map.image?.width,map.image?.height]);
        }
      });
      window.pineSurfaceProbe={maps:Object.fromEntries(maps)};
      return maps.size===9;
    },null,{timeout:15000});
    const surfaceProbe=await page.evaluate(()=>window.pineSurfaceProbe);
    assert.ok(Object.values(surfaceProbe.maps).every(([w,h])=>w===512&&h===512),'all three scanned materials decode their colour, normal and roughness maps at the mobile budget');
    console.log('HOMEFRONT SURFACE PACK LOADED',JSON.stringify(surfaceProbe));
    if (process.env.HOMEFRONT_PINE_SCREENSHOT) await page.screenshot({ path: process.env.HOMEFRONT_PINE_SCREENSHOT });
    await page.waitForFunction(() => window.fieldAudioProbe.cues.includes('canvas'), null, { timeout: 6000 });
    for (const building of PINE_CROSSING_BUILDINGS) {
      await walkTo([building.x, -43]);
      await walkTo([building.x, -45.5]);
      await page.waitForFunction(title => document.querySelector('#homefrontContextAction')?.textContent.includes('Enter ' + title),
        building.title);
      const entered = page.waitForResponse(response => response.url().endsWith(fixturePath('/api/homefront/world/interior/enter')));
      await activate(action);
      const interior = (await (await entered).json()).interior;
      assert.equal(interior.landmarkId, building.id);
      await page.waitForFunction(kind => window.fieldAudioProbe.cues.includes(kind),
        building.finish === 'store' ? 'timber' : 'metal', { timeout: 6000 });
      const item = building.finish === 'store' ? 'Dry goods shelf' : 'First-aid cabinet';
      await walkTo([building.x - 0.8, building.z - 0.2]);
      await page.waitForFunction(label => document.querySelector('#homefrontContextAction')?.textContent.includes(label), item);
      const searched = page.waitForResponse(response => response.url().endsWith(fixturePath('/api/homefront/world/interior/action')));
      await activate(action);
      const result = await (await searched).json();
      assert(result.interior.used.includes(building.id + '_search'));
      assert(result.interiorReward.some(drop => drop.amount > 0 ||
        (drop.overflow > 0 && result.overflowDestination === 'refuge')), item + ' yields a physical supply reward');
      await walkTo([building.x, building.z + 1.95]);
      await page.waitForFunction(() => document.querySelector('#homefrontContextAction')?.textContent.includes('Step outside'));
      await activate(action);
      await page.waitForFunction(() => document.querySelector('#interiorStatus')?.textContent.includes('Returned to the street'));
      await walkTo([building.x, -43]);
    }
    for (const point of route('creek-trail')) await walkTo(point);
    await walkTo([-8, -82]);
    await page.waitForFunction(() => document.querySelector('#homefrontContextAction')?.textContent.includes('Return to refuge'));
    await activate(action);
    await page.waitForFunction(() => document.body.classList.contains('rpg-mode-home'));
    assert.equal(testState('homefront-world.json').players[ACCOUNT], undefined);
    await page.waitForFunction(() => window.fieldAudioProbe.windStops > 0);
    const audio = await page.evaluate(() => window.fieldAudioProbe);
    assert.ok(pineRockLoaded, 'the creek loads its bundled bank rock model');
    assert.ok(audio.windStarts > 0, 'outdoor wind starts in the field');
    assert.ok(audio.creekPeak > 0.14, 'creek grows audible on the return trail');
    assert.ok(audio.creekStops > 0, 'creek audio stops at the refuge');
    const environment = await page.evaluate(() => window.pineEnvironmentProbe);
    for (const site of ['pine-deadfall', 'pine-abandoned-pickup', 'pine-evacuation-barrier', 'pine-relay-station', 'pine-cracked-asphalt']) {
      assert.equal(environment[site], true, site + ' was attached to the world scene');
    }
    assert.ok(environment['pine-roadside-grass'] > 0, 'shoulder growth is instanced in the scene');
    assert.equal(environment['pine-crows'], 8, 'four crows use a single wing batch');
    assert.equal(environment['loot_pine_logging_kit:closed'], true, 'the full crew kit is visible on the trail');
    assert.equal(environment['loot_pine_logging_kit:searched'], true, 'scavenging leaves the kit visibly open');
    assert.equal(environment['loot_pine_creek_pack:closed'], true, 'the first-aid case is visible on the creek trail');
    assert.equal(environment['loot_pine_relay_spares:closed'], true, 'the radio-relay salvage case is visibly grounded in the woods');
    for (const surface of ['gravel', 'asphalt', 'dirt', 'wood']) {
      assert.ok(audio.surfaces.includes(surface), 'footsteps respond to ' + surface);
    }
    assert.deepEqual(errors, []);
    console.log('PINE CROSSING PLAYTEST PASSED', JSON.stringify({ mobile, guest: guestMode, woods: true, store: true, clinic: true, creekReturn: true }));
  } else {

  if (!mobile) {
    // Observe the real camera after lookAt, including its smoothed pitch.
    await page.evaluate(async () => {
      const { PerspectiveCamera, Vector3 } = await import("/arena/vendor/three.module.min.js");
      const lookAt = PerspectiveCamera.prototype.lookAt;
      const direction = new Vector3();
      PerspectiveCamera.prototype.lookAt = function (...args) {
        lookAt.apply(this, args);
        if (this.fov === 48) {
          this.getWorldDirection(direction);
          window.fieldLookDirection = { x: direction.x, y: direction.y };
        }
      };
    });
    const canvas = await page.locator("#graveyard3d canvas").boundingBox();
    const x = canvas.x + canvas.width / 2;
    const y = canvas.y + canvas.height / 2;
    const attacksBeforeLook = observed.filter(entry => entry.path.endsWith("/world/attack")).length;
    async function rightDrag(fromX, fromY, toX, toY) {
      await page.mouse.move(fromX, fromY);
      await page.mouse.down({ button: "right" });
      await page.mouse.move(toX, toY, { steps: 5 });
      await page.mouse.up({ button: "right" });
    }
    for (const mode of ["Third-person", "First-person"]) {
      if (mode === "First-person") await page.keyboard.press("v");
      await page.waitForFunction(
        label => document.querySelector("#graveyard3d .hf-viewbtn")?.textContent.includes(label),
        mode,
      );
      await page.waitForFunction(() => {
        const direction = window.fieldLookDirection;
        return direction && Math.abs(direction.x) < 0.03 && Math.abs(direction.y) < 0.03;
      });
      await rightDrag(x, y, x + 90, y - 60);
      await page.waitForFunction(() =>
        window.fieldLookDirection?.x < -0.2 && window.fieldLookDirection.y > 0.07,
      );
      await rightDrag(x + 90, y - 60, x, y);
    }
    await page.keyboard.press("v");
    await page.waitForFunction(() =>
      Math.abs(window.fieldLookDirection?.x) < 0.03 && Math.abs(window.fieldLookDirection?.y) < 0.03,
    );
    assert.equal(observed.filter(entry => entry.path.endsWith("/world/attack")).length,
      attacksBeforeLook, "right-drag does not fire the weapon");
  }

  await startWalking("w");
  await page.waitForFunction(
    () =>
      document
        .getElementById("homefrontContextAction")
        .textContent.includes("Search"),
    null,
    { timeout: 30000 },
  ).catch(async error => {
    console.error('EXPEDITION_WALK_DIAGNOSTICS',JSON.stringify({
      state:await page.evaluate(()=>({
        status:document.getElementById('graveyard3dStatus')?.textContent,
        action:document.getElementById('homefrontContextAction')?.textContent,
        mode:document.body.className,
        movement:document.querySelector('.hf-movement-status')?.textContent
      })),world:store.load('homefront-world.json',null),errors,
      requests:observed.slice(-10)
    }));
    throw error;
  });
  await stopWalking("w");

  const looted=page.waitForResponse(response=>response.request().method()==='POST'&&
    response.url().endsWith(fixturePath('/api/homefront/world/loot')),{timeout:15000});
  await activate(page.locator("#homefrontContextAction"));
  const lootResponse=await looted;
  const lootResult=await lootResponse.json();
  assert.equal(lootResponse.status(),200,JSON.stringify(lootResult));
  // A later world poll replaces the confirmation with "already searched",
  // and nearby bites can replace the toast. Verify the real action result and
  // shared stored cooldown, both of which survive those presentation updates.
  assert.ok(lootResult.loot?.accepted?.length||lootResult.loot?.overflow?.length,
    'in-world search grants carried supplies or the documented refuge overflow');
  const claimed=testState('homefront-world.json').lootNodes[lootResult.loot.node.id];
  assert.equal(claimed.claimedBy,ACCOUNT.slice(0,24),'stored claim metadata matches the server\'s bounded account label');
  assert.ok(claimed.readyAt>Date.now(),'successful scavenging persists the shared container cooldown');
  assert.ok(lootResult.world.lootNodes.some(node=>node.id===lootResult.loot.node.id&&!node.available),
    'the same response marks the physical container unavailable');

  if (process.env.HOMEFRONT_EXPEDITION_INTERIOR === "1") {
    async function walkAxis(key, axis, target, direction) {
      await startWalking(key);
      try {
        const deadline = Date.now() + 30000;
        while (Date.now() < deadline) {
          const position = testState("homefront-world.json").players[ACCOUNT][
            axis
          ];
          if ((position - target) * direction >= 0) return;
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        throw new Error(
          "Walking blocked before " +
            axis +
            "=" +
            target +
            " at " +
            JSON.stringify(
              testState("homefront-world.json").players[ACCOUNT],
            ),
        );
      } finally {
        await stopWalking(key);
      }
    }
    await walkAxis("d", "x", -13, -1);
    await walkAxis("w", "z", -61, 1);
    await walkAxis("a", "x", -8, 1);
    await page.waitForFunction(() =>
      document
        .getElementById("homefrontContextAction")
        .textContent.includes("Enter"),
    );
    const entered = page.waitForResponse((response) =>
      response.url().endsWith(fixturePath("/api/homefront/world/interior/enter")),
    );
    await activate(page.locator("#homefrontContextAction"));
    const enterResponse = await entered.catch(async error => {
      console.error('EXPEDITION_DOORWAY_DIAGNOSTICS', JSON.stringify({
        mobile, lastRequests:observed.slice(-14), errors,
        ui:await page.evaluate(() => ({
          prompt: document.getElementById('homefrontContextAction')?.textContent,
          hidden: document.getElementById('homefrontContextAction')?.hidden,
          interior: document.getElementById('interiorStatus')?.textContent,
          movement: document.querySelector('.hf-movement-status')?.textContent,
          mode:document.body.className
        })),
        player:testState('homefront-world.json')?.players?.[ACCOUNT]
      }));
      throw error;
    });
    assert.equal((await enterResponse.json()).interior.roomId, "dispatch");
    await walkAxis("s", "z", -64.3, -1);
    await page.waitForFunction(() =>
      document
        .getElementById("homefrontContextAction")
        .textContent.includes("Dispatch drawer"),
    );
    const searched = page.waitForResponse((response) =>
      response.url().endsWith(fixturePath("/api/homefront/world/interior/action")),
    );
    await activate(page.locator("#homefrontContextAction"));
    const searchResult = await (await searched).json();
    assert(
      searchResult.interior.used.includes("dispatch_drawer"),
      "drawer search is saved",
    );
    assert(
      searchResult.interiorReward.some((drop) => drop.amount > 0),
      "drawer gives carried supplies",
    );
    await walkAxis("w", "z", -62.8, 1);
    await page.waitForFunction(() =>
      document
        .getElementById("homefrontContextAction")
        .textContent.includes("Step outside"),
    );
    await activate(page.locator("#homefrontContextAction"));
    await page.waitForFunction(() =>
      document
        .getElementById("interiorStatus")
        .textContent.includes("Returned to the street"),
    );

    // Clear the south doorway before turning along the building frontage.
    // Exit placement can resolve to a nearby safe point beside the jamb.
    await walkAxis("w", "z", -59, 1);
    await walkAxis("d", "x", -13, -1);
    await walkAxis("s", "z", -74, -1);
    await walkAxis("a", "x", -8, 1);
  }
  const attackResponse = page.waitForResponse((response) =>
    response.url().endsWith(fixturePath("/api/homefront/world/attack")),
  );
  if (mobile)
    await page
      .getByRole("button", { name: /^(Attack|Fire)/, exact: false })
      .filter({ visible: true })
      .last()
      .tap();
  else
    await page
      .locator("#graveyard3d canvas")
      .click({ position: { x: 640, y: 400 } });
  const attack = await (await attackResponse).json();
  assert(
    attack.combat && (attack.combat.missed || attack.combat.damage > 0),
    "the click resolves through server combat: " + JSON.stringify(attack),
  );
  const expectedAmmo =
    testState("homefront.json")[ACCOUNT].resources.ammo +
    testState("homefront-world.json").players[ACCOUNT].inventory.ammo;
  await startWalking("s");
  await page.waitForFunction(
    () =>
      document
        .getElementById("homefrontContextAction")
        .textContent.includes("Return to refuge"),
    null,
    { timeout: 30000 },
  );
  await stopWalking("s");
  await activate(page.locator("#homefrontContextAction"));
  await page.waitForFunction(() =>
    document.body.classList.contains("rpg-mode-home"),
  );
  assert.equal(testState("homefront-world.json").players[ACCOUNT], undefined);
  assert.equal(
    testState("homefront.json")[ACCOUNT].resources.ammo,
    expectedAmmo,
    "field ammo returns to camp stores",
  );
  // Re-enter the same mounted scene, then use its spawn return marker. This
  // catches controls/camera that fail to resume after the hidden-world pause.
  await page.waitForFunction(()=>!document.getElementById('homefrontInteractionPrompt')?.hidden);
  await activate(page.locator('#homefrontInteractionPrompt button'));
  await page.waitForFunction(()=>document.body.classList.contains('rpg-mode-expedition'));
  await page.waitForFunction(()=>document.getElementById('homefrontContextAction')?.textContent.includes('Return to refuge'));
  await activate(page.locator('#homefrontContextAction'));
  await page.waitForFunction(()=>document.body.classList.contains('rpg-mode-home'));
  assert.equal(testState('homefront-world.json').players[ACCOUNT],undefined);
  if (guestMode) assert.equal(await page.evaluate(()=>localStorage.getItem('bcToken')),null,'the complete expedition required no wallet');
  await activate(page.locator('#hfHud .hf-menu'));
  await activate(page.getByRole('link', { name: 'Return to BURN City' }));
  await page.waitForURL('http://localhost:' + port + '/');
  assert.match(await page.locator('h1').innerText(), /BURN City/);
  console.log(
    "PLAYABLE EXPEDITION PASSED",
    JSON.stringify({
      mobile,
      guest: guestMode,
      interior: process.env.HOMEFRONT_EXPEDITION_INTERIOR === "1",
      startedAtGate: true,
      walkedToDepot: true,
      scavenged: true,
      serverConfirmedAttack: true,
      stationaryInfectedBite: true,
      returnedHome: true,
      repeatedGateTransition: true,
      cityExit: true,
      pageErrors: errors,
    }),
  );

  assert.deepEqual(errors, []);
  } // expeditionRun
  }
} finally {
  Homefront.handle = realHandle;
  await browser.close();
  await new Promise((ok) => server.close(ok));
}
