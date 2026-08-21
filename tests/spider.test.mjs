// Deterministic browser suite for the spider: gait routes, pet behaviour,
// window projection, cross-screen follow, camera mapping, idle roaming.
// Run with `npm test` (needs a chromium binary; see findChromium below).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { serve } from "./serve.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const VIEW_Z_K = 0.8638; // must match app.js; camera test below asserts it

function findChromium() {
  if (process.env.CHROMIUM_PATH && existsSync(process.env.CHROMIUM_PATH)) return process.env.CHROMIUM_PATH;
  const cache = join(homedir(), "Library/Caches/ms-playwright");
  if (!existsSync(cache)) return null;
  for (const dir of readdirSync(cache).filter(d => /^chromium(_headless_shell)?-/.test(d)).sort().reverse()) {
    const bin = dir.startsWith("chromium_headless_shell")
      ? join(cache, dir, "chrome-headless-shell-mac-arm64/chrome-headless-shell")
      : join(cache, dir, "chrome-mac/Chromium.app/Contents/MacOS/Chromium");
    if (existsSync(bin)) return bin;
  }
  return null;
}

let server, base, browser;
before(async () => {
  server = serve(root);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  const execPath = findChromium();
  if (!execPath) throw new Error("chromium not found; install playwright or set CHROMIUM_PATH");
  browser = await chromium.launch({ executablePath: execPath });
});
after(async () => {
  await browser?.close();
  await new Promise(resolve => server?.close(resolve));
});

async function waitFor(fn, done, timeoutMs = 25000, stepMs = 200) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = await fn();
    if (done(last)) return last;
    await new Promise(r => setTimeout(r, stepMs));
  }
  throw new Error(`waitFor timed out, last: ${JSON.stringify(last)}`);
}

const newPage = () => browser.newPage();

test("static: JS syntax and Swift host build", () => {
  for (const f of ["app.js", "src/gait.js", "src/self-test.js", "src/bootstrap.js"]) {
    execFileSync("node", ["--check", join(root, f)], { stdio: "pipe" });
  }
  execFileSync("swiftc", ["-O", "-module-cache-path", "/tmp/clangmod-test", join(root, "desktop/HostGeometry.swift"), join(root, "desktop/SpiderPet.swift"), "-o", "/tmp/SpiderPet-test"], { stdio: "pipe" });
});

for (const name of ["straight", "curve", "reversal", "stress", "adversarial"]) {
  test(`gait route: ${name}`, async () => {
    const page = await newPage();
    await page.goto(`${base}/?selftest=${name}`);
    const result = await waitFor(
      () => page.evaluate(() => window.__spiderSelfTest),
      r => r && !r.running);
    assert.ok(result.passed, `route ${name} failed: ${JSON.stringify(result)}`);
    await page.close();
  });
}

test("pet: slow follow, sweep-and-stop strike, resume", async () => {
  const page = await newPage();
  await page.goto(`${base}/?pet=1`);
  await page.waitForTimeout(600);
  await page.evaluate(() => { window.__petFrame = { w: 1440, h: 900 }; window.__petMouse = { x: 0, z: 0 }; });
  const move = (fn, ms) => page.evaluate(fn).then(() => page.waitForTimeout(ms)).finally(() => page.evaluate(() => clearInterval(window.__mv)).catch(() => {}));
  await move(() => { let mx = 0; window.__mv = setInterval(() => { mx += 3; window.__petMouse = { x: mx, z: 0 }; }, 16); }, 2600);
  const pos = await page.evaluate(() => spider.position.x);
  assert.ok(pos > 80, `slow follow should walk forward, x=${pos}`);
  await move(() => { let mx = 200; window.__mv = setInterval(() => { mx += 100; window.__petMouse = { x: mx, z: 0 }; if (mx >= 500) clearInterval(window.__mv); }, 16); }, 300);
  const jumped = await page.evaluate(() => spider.jump !== null);
  assert.ok(jumped, "fast sweep then stop should strike");
  await page.waitForTimeout(2500);
  const after = await page.evaluate(() => ({ jump: spider.jump !== null, state: petState }));
  assert.equal(after.jump, false, "jump should land");
  assert.equal(after.state, "follow", "should resume following");
  await page.close();
});

test("pet: window edge projection and flatten", async () => {
  const page = await newPage();
  await page.goto(`${base}/?pet=1`);
  await page.waitForTimeout(600);
  const run = win => page.evaluate(win => {
    spider.position.set(500, 0, 200); spider.speed = 0; spider.angle = 0;
    window.__petFrame = { w: 1920, h: 1080 };
    window.__petMouse = { x: -100, z: 0 }; // inside the left-half window, near its right edge
    window.__petWindows = [win];
    petState = "follow"; petMouseActive = performance.now() / 1000; petFlatten = 0;
    advanceTime(20000);
    return { pos: spider.position.toArray().map(v => Number(v.toFixed(0))), flatten: Number(petFlatten.toFixed(2)) };
  }, win);
  const offset = await run([-960, -1620, 960, 1080]); // one-screen-off old injection
  assert.equal(offset.flatten, 0, "offset window rect must not project");
  const fixed = await run([-960, -540, 960, 1080]);
  assert.equal(fixed.flatten, 1, "correctly-injected window must project and flatten");
  assert.ok(Math.abs(fixed.pos[0]) < 100, `spider should hug the frame edge, pos=${fixed.pos[0]}`);
  await page.close();
});

test("pet: cross-screen follow persists mid-trip, idles on arrival", async () => {
  const page = await newPage();
  await page.goto(`${base}/?pet=1`);
  await page.waitForTimeout(600);
  const mid = await page.evaluate(() => {
    spider.position.set(0, 0, 0); spider.speed = 0;
    window.__petFrame = { w: 1920, h: 2036 };
    window.__petMouse = { x: 0, z: 900 };
    petState = "follow"; petMouseActive = performance.now() / 1000;
    advanceTime(3000);
    petMouseActive = performance.now() / 1000 - 10; // cursor rested 10 s mid-trip
    advanceTime(1);
    return { state: petState, speed: Number(spider.speed.toFixed(1)) };
  });
  assert.equal(mid.state, "follow", "must not go idle while still walking");
  assert.ok(mid.speed > 50, `mid-trip speed expected high, got ${mid.speed}`);
  const arrived = await page.evaluate(() => {
    advanceTime(30000);
    return { pos: Number(spider.position.z.toFixed(0)), state: petState };
  });
  assert.ok(Math.abs(arrived.pos - 900) < 120, `spider should reach far screen, pos=${arrived.pos}`);
  const idle = await waitFor(
    () => page.evaluate(() => { petMouseActive = performance.now() / 1000 - 10; advanceTime(5000); return { state: petState, speed: Number(spider.speed.toFixed(1)) }; }),
    r => r.state === "idle" || r.speed < 0.5);
  assert.equal(idle.state, "idle", `arrived spider should idle, got ${JSON.stringify(idle)}`);
  await page.close();
});

test("camera: z maps to VIEW_Z_K with zero x coupling, full depth coverage", async () => {
  const page = await newPage();
  await page.goto(`${base}/?pet=1`);
  await page.waitForTimeout(600);
  const info = await page.evaluate(() => {
    const dir = camera.getWorldDirection(new THREE.Vector3());
    const zMax = 360 / 0.8638; // default page height 720 -> top 360
    const depths = [[-640, -zMax], [640, -zMax], [-640, zMax], [640, zMax]].map(([x, z]) => {
      const v = new THREE.Vector3(x, 0, z).sub(camera.position);
      return Number(v.dot(dir).toFixed(1));
    });
    const z = new THREE.Vector3(0, 0, 1).project(camera);
    const c = new THREE.Vector3(0, 0, 0).project(camera);
    return { pos: camera.position.toArray().map(v => Number(v.toFixed(0))), depths, dy: z.y - c.y, dx: z.x - c.x };
  });
  assert.deepEqual(info.pos, [0, 1200, 700], "camera must stay at (0,1200,700)");
  assert.ok(info.depths.every(d => d > 0.1 && d < 2000), `ground depths must stay inside near/far: ${info.depths}`);
  assert.ok(Math.abs(info.dy * 360 + VIEW_Z_K) < 0.01, `z mapping must equal VIEW_Z_K, dy=${info.dy}`);
  assert.equal(info.dx, 0, "z must not couple into screen x");
  await page.close();
});

test("pet: follow keeps the spider body inside the desktop union", async () => {
  const page = await newPage();
  await page.goto(`${base}/?pet=1`);
  await page.waitForTimeout(600);
  const result = await page.evaluate(() => {
    window.__petFrame = { w: 1920, h: 2036 }; // two-screen union (stacked)
    petState = "follow"; petMouseActive = performance.now() / 1000;
    spider.position.set(0, 0, 0); spider.speed = 0; petIdleTarget = null;
    // Sweep the cursor across both screens and beyond the union: every
    // target must clamp, so the body must never leave the window.
    let mx = -1500, mz = -1600, dir = 1;
    for (let i = 0; i < 500; i++) {
      window.__petMouse = { x: mx, z: mz };
      advanceTime(33);
      mx += 12 * dir; mz += 9 * dir;
      if (mx > 1500 || mz > 1600) dir = -1;
      if (mx < -1500 && mz < -1600) dir = 1;
    }
    return { x: spider.position.x, z: spider.position.z, xMax: 1920 / 2, zMax: 2036 / 2 / VIEW_Z_K };
  });
  assert.ok(Math.abs(result.x) <= result.xMax + 1, `spider body left the union while following, x=${result.x}`);
  assert.ok(Math.abs(result.z) <= result.zMax + 1, `spider body left the union while following, z=${result.z}`);
  await page.close();
});

test("pet: cursor outside the union clamps target and body", async () => {
  const page = await newPage();
  await page.goto(`${base}/?pet=1`);
  await page.waitForTimeout(600);
  const result = await page.evaluate(() => {
    window.__petFrame = { w: 1920, h: 2036 };
    window.__petMouse = { x: 5000, z: 5000 }; // far outside the desktop
    petState = "follow"; petMouseActive = performance.now() / 1000;
    spider.position.set(0, 0, 0); spider.speed = 0;
    advanceTime(60000);
    return {
      pointer: [pointer.x, pointer.z], pos: [spider.position.x, spider.position.z],
      xMax: 1920 / 2, zMax: 2036 / 2 / VIEW_Z_K,
    };
  });
  assert.ok(Math.abs(result.pointer[0] - (1920 / 2 - 90)) < 1e-6, `x target must clamp to the margin, got ${result.pointer[0]}`);
  assert.ok(Math.abs(result.pointer[1] - (2036 / 2 / VIEW_Z_K - 90 / VIEW_Z_K)) < 1e-6, `z target must clamp to the margin, got ${result.pointer[1]}`);
  assert.ok(Math.abs(result.pos[0]) <= result.xMax + 1 && Math.abs(result.pos[1]) <= result.zMax + 1,
    `spider body must stay inside the union, pos=${result.pos}`);
  await page.close();
});

test("pet: idle roam targets stay inside desktop bounds", async () => {
  const page = await newPage();
  await page.goto(`${base}/?pet=1`);
  await page.waitForTimeout(600);
  const samples = await page.evaluate(() => {
    window.__petFrame = { w: 1920, h: 2036 };
    window.__petMouse = { x: 0, z: 0 };
    const out = [];
    for (let i = 0; i < 40; i++) {
      petState = "idle"; petIdleTarget = null; petIdleRestUntil = 0; spider.speed = 0;
      petMouseActive = performance.now() / 1000 - 10;
      advanceTime(1);
      out.push(petIdleTarget ? [petIdleTarget.x, petIdleTarget.z] : null);
    }
    return out;
  });
  assert.equal(samples.filter(Boolean).length, 40, "every idle pick should produce a target");
  const zMax = 2036 / 2 / VIEW_Z_K - 120, xMax = 1920 / 2 - 120;
  for (const [x, z] of samples) {
    assert.ok(Math.abs(x) <= xMax + 1 && Math.abs(z) <= zMax + 1, `roam target outside desktop: ${x},${z}`);
  }
  const crosses = samples.filter(([, z]) => Math.abs(z) > 500).length;
  assert.ok(crosses > 0, "roam should occasionally pick the other screen");
  await page.close();
});
