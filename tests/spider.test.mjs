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
  for (const f of ["app.js", "src/motion.js", "src/gait.js", "src/self-test.js", "src/bootstrap.js"]) {
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

test("locomotion: fixed-frame routes preserve landing envelopes and continuity", async () => {
  const page = await newPage();
  try {
    await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
    await page.goto(base);
    const results = await page.evaluate(() => {
      // Exercise the full planner/IK/metric path without wall-clock or GPU
      // scheduling. The existing live routes still exercise WebGL rendering.
      renderer.render = () => {};
      return [1 / 120, 1 / 60, 1 / 30, .04].flatMap(delta => Object.keys(testCases).map(name => {
        spider.position.set(0, 0, 0); spider.height = 11; spider.gaitClock = 0; spider.step = 0;
        startSelfTest(name);
        let maxRenderedStanceError = 0;
        for (let frame = 0; frame < 2400 && !testRun.complete; frame++) {
          render(delta);
          for (const leg of legs) if (!leg.swing) maxRenderedStanceError = Math.max(maxRenderedStanceError, leg.renderFoot.distanceTo(leg.foot));
        }
        return { delta, maxRenderedStanceError, ...window.__spiderSelfTest };
      }));
    });
    for (const result of results) {
      assert.ok(result.passed, JSON.stringify(result));
      assert.ok(result.maxRenderedStanceError < 18, JSON.stringify(result));
    }
  } finally { await page.close(); }
});

test("locomotion: airborne turn batch keeps its plan and targets when intent changes", async () => {
  const page = await newPage();
  try {
    await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
    await page.goto(base);
    const result = await page.evaluate(() => {
      renderer.render = () => {};
      spider.position.set(0, 0, 0); seedFeet(); pointer.set(-500, 0, 15);
      for (let frame = 0; frame < 600 && !legs.some(leg => leg.swing?.plan); frame++) render(1 / 120);
      const batch = legs.filter(leg => leg.swing?.plan);
      if (!batch.length) return { error: "no turn batch exercised" };
      const plan = batch[0].swing.plan, angle = plan.angle;
      const targets = batch.map(leg => leg.target.clone());
      let frames = 0, changed = 0, drift = 0;
      while (batch.some(leg => leg.swing) && frames < 120) {
        pointer.copy(spider.position).add(new THREE.Vector3(frames % 2 ? 500 : -500, 0, frames % 2 ? -200 : 200));
        const planted = legs.filter(leg => !leg.swing).map(leg => [leg, leg.foot.clone()]);
        render(1 / 120);
        if (turnPlan !== plan || plan.angle !== angle) changed++;
        batch.forEach((leg, index) => { if (!leg.target.equals(targets[index]) || (leg.swing && leg.swing.plan !== plan)) changed++; });
        planted.forEach(([leg, foot]) => { drift = Math.max(drift, leg.foot.distanceTo(foot)); });
        frames++;
      }
      pointer.copy(spider.position).add(new THREE.Vector3(400, 0, -300));
      for (let frame = 0; frame < 1200; frame++) render(1 / 60);
      return { changed, drift, frames, landed: batch.every(leg => !leg.swing), finishError: spider.position.distanceTo(pointer) };
    });
    assert.ok(!result.error, result.error);
    assert.ok(result.frames >= 3 && result.frames < 120, `batch must fly and land: ${JSON.stringify(result)}`);
    assert.equal(result.changed, 0, "airborne plan and landing targets must stay immutable");
    assert.equal(result.drift, 0, "planted feet must remain world-locked");
    assert.ok(result.landed && result.finishError < 26, `must resume toward the new intent: ${JSON.stringify(result)}`);
  } finally { await page.close(); }
});

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
  const strike = await page.evaluate(() => ({
    jump: spider.jump !== null,
    position: [Number(spider.position.x.toFixed(1)), Number(spider.position.z.toFixed(1))],
    mouse: window.__petMouse ? [window.__petMouse.x, window.__petMouse.z] : null,
    petMouseLast,
    petPrevMoved,
    speed: Number(spider.speed.toFixed(1)),
    state: petState,
    distance: window.__petMouse ? Number(Math.hypot(window.__petMouse.x - spider.position.x, window.__petMouse.z - spider.position.z).toFixed(1)) : null,
  }));
  assert.ok(strike.jump, `fast sweep then stop should strike: ${JSON.stringify(strike)}`);
  await page.waitForTimeout(2500);
  const after = await page.evaluate(() => ({ jump: spider.jump !== null, state: petState }));
  assert.equal(after.jump, false, "jump should land");
  assert.equal(after.state, "follow", "should resume following");
  await page.close();
});

test("pet: follows the cursor exactly, ignores window rect projection", async () => {
  const page = await newPage();
  await page.goto(`${base}/?pet=1`);
  await page.waitForTimeout(600);
  const run = win => page.evaluate(win => {
    const frame = { w: 1920, h: 2036 };
    spider.position.set(0, 0, 0); spider.speed = 0; spider.angle = 0;
    window.__petFrame = frame;
    window.__petWindows = win ? [win] : [];
    // Cursor inside the given window (or plain), well off the window edges.
    window.__petMouse = { x: -100, z: -300 };
    petState = "follow"; petMouseActive = performance.now() / 1000;
    advanceTime(30000);
    return { pos: spider.position.toArray().map(v => Number(v.toFixed(0))) };
  }, win);
  // No window rects at all.
  const plain = await run(null);
  assert.ok(Math.abs(plain.pos[0] - (-100)) < 60 && Math.abs(plain.pos[2] - (-300)) < 60,
    `spider must land on the cursor without projection, pos=${plain.pos}`);
  // A window rect covering the cursor must NOT pull the spider to its edge: the
  // contract is to track the cursor, not slide to a window frame.
  const win = await run([-960, -540, 960, 1080]); // covers x∈[-960,0], z∈[-540,540] (cursor inside)
  assert.ok(Math.abs(win.pos[0] - (-100)) < 60 && Math.abs(win.pos[2] - (-300)) < 60,
    `window rect must not project the goal; spider should stay on the cursor, pos=${win.pos}`);
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
