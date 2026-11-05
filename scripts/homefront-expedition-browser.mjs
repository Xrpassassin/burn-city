// Play a local Homefront expedition through the actual HTML, renderer and server.
// Synthetic accounts and an in-memory store keep gameplay isolated from production.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";

const localRequire = createRequire(import.meta.url);
const playwrightRequire = createRequire(
  (process.env.PLAYWRIGHT_DIR || process.cwd()) + "/package.json",
);
const { chromium } = playwrightRequire("playwright");
const World = localRequire("../server/homefront-world.js");
const Homefront = localRequire("../server/homefront.js");
const ACCOUNT = Array.from({ length: 50 }, (_, i) => "playtest-" + i).find(
  (account) =>
    World.chooseSafeSpawn(World.defaultWorld(), account).spawn.id ===
    "north_gate",
);
const TOKEN = "ui-three-token";
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
    if (url.pathname.startsWith("/api/homefront")) {
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
  await page.addInitScript(
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
    { timeout: 6000 },
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

  await startWalking("w");
  await page.waitForFunction(
    () =>
      document
        .getElementById("homefrontContextAction")
        .textContent.includes("Search"),
    null,
    { timeout: 12000 },
  );
  await stopWalking("w");

  await activate(page.locator("#homefrontContextAction"));
  await page.waitForFunction(() =>
    document.querySelector(".hf-event-toast")?.textContent.includes("Pack:"),
  );

  if (process.env.HOMEFRONT_EXPEDITION_INTERIOR === "1") {
    async function walkAxis(key, axis, target, direction) {
      await startWalking(key);
      try {
        const deadline = Date.now() + 15000;
        while (Date.now() < deadline) {
          const position = objects.get("homefront-world.json").players[ACCOUNT][
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
              objects.get("homefront-world.json").players[ACCOUNT],
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
      response.url().endsWith("/api/homefront/world/interior/enter"),
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
      response.url().endsWith("/api/homefront/world/interior/action"),
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

    await walkAxis("d", "x", -13, -1);
    await walkAxis("s", "z", -74, -1);
    await walkAxis("a", "x", -8, 1);
  }
  const attackResponse = page.waitForResponse((response) =>
    response.url().endsWith("/api/homefront/world/attack"),
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
    objects.get("homefront.json")[ACCOUNT].resources.ammo +
    objects.get("homefront-world.json").players[ACCOUNT].inventory.ammo;
  await startWalking("s");
  await page.waitForFunction(
    () =>
      document
        .getElementById("homefrontContextAction")
        .textContent.includes("Return to refuge"),
    null,
    { timeout: 12000 },
  );
  await stopWalking("s");
  await activate(page.locator("#homefrontContextAction"));
  await page.waitForFunction(() =>
    document.body.classList.contains("rpg-mode-home"),
  );
  assert.equal(objects.get("homefront-world.json").players[ACCOUNT], undefined);
  assert.equal(
    objects.get("homefront.json")[ACCOUNT].resources.ammo,
    expectedAmmo,
    "field ammo returns to camp stores",
  );
  console.log(
    "PLAYABLE EXPEDITION PASSED",
    JSON.stringify({
      mobile,
      interior: process.env.HOMEFRONT_EXPEDITION_INTERIOR === "1",
      startedAtGate: true,
      walkedToDepot: true,
      scavenged: true,
      serverConfirmedAttack: true,
      returnedHome: true,
      pageErrors: errors,
    }),
  );

  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await new Promise((ok) => server.close(ok));
}
