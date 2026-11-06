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
  if (!guestMode) await page.addInitScript(
    ({ TOKEN, ACCOUNT }) => {
      localStorage.bcToken = TOKEN;
      localStorage.bcAcct = ACCOUNT;
    },
    { TOKEN, ACCOUNT },
  );
  await page.route("**/*", (route) =>
    ["localhost", "127.0.0.1"].includes(new URL(route.request().url()).hostname)
      ? route.continue()
      : route.abort(),
  );
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

  await startWalking("s");
  await page.waitForFunction(
    () => Math.abs(window.__hfYard.player.z - 8.9) <= 1.8,
    null,
    { timeout: 20000 },
  );
  await stopWalking("s");
  await activate(page.locator("#homefrontInteractionPrompt button"));
  await page.waitForFunction(() =>
    document.body.classList.contains("rpg-mode-expedition"),
  );
  await page.waitForFunction(() =>
    document
      .getElementById("graveyard3dStatus")
      .textContent.includes("direct WASD"),
  );

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

  const pineCrossing = process.env.HOMEFRONT_EXPEDITION_PINE === '1';
  if (pineCrossing) {
    const route = id => PINE_CROSSING_ROUTES.find(item => item.id === id).points;
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
        throw Error('Pine Crossing walk blocked near ' + JSON.stringify([player.x, player.z]) + ' toward ' + JSON.stringify([x,z]));
      } finally {
        if (touchOrigin) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        else for (const key of held) await page.keyboard.up(key);
      }
    }
    for (const point of route('logging-road').slice(1)) await walkTo(point);
    if (process.env.HOMEFRONT_PINE_SCREENSHOT) {
      await page.screenshot({ path: process.env.HOMEFRONT_PINE_SCREENSHOT });
    }
    const action = page.locator('#homefrontContextAction');
    for (const building of PINE_CROSSING_BUILDINGS) {
      await walkTo([building.x, -43]);
      await walkTo([building.x, -45.5]);
      await page.waitForFunction(title => document.querySelector('#homefrontContextAction')?.textContent.includes('Enter ' + title),
        building.title);
      const entered = page.waitForResponse(response => response.url().endsWith(fixturePath('/api/homefront/world/interior/enter')));
      await activate(action);
      const interior = (await (await entered).json()).interior;
      assert.equal(interior.landmarkId, building.id);
      const item = building.finish === 'store' ? 'Dry goods shelf' : 'First-aid cabinet';
      await walkTo([building.x - 0.8, building.z - 0.2]);
      await page.waitForFunction(label => document.querySelector('#homefrontContextAction')?.textContent.includes(label), item);
      const searched = page.waitForResponse(response => response.url().endsWith(fixturePath('/api/homefront/world/interior/action')));
      await activate(action);
      const result = await (await searched).json();
      assert(result.interior.used.includes(building.id + '_search'));
      assert(result.interiorReward.some(drop => drop.amount > 0), item + ' yields a physical supply reward');
      await walkTo([building.x, building.z + 1.75]);
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

  await activate(page.locator("#homefrontContextAction"));
  await page.waitForFunction(() =>
    document.querySelector(".hf-event-toast")?.textContent.includes("Pack:"),
  );

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
    assert.equal((await (await entered).json()).interior.roomId, "dispatch");
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
  }
} finally {
  Homefront.handle = realHandle;
  await browser.close();
  await new Promise((ok) => server.close(ok));
}
