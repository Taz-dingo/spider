import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { serve } from "./serve.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const BRAIN_DESKTOP_MARGIN = 120;
const VIEW_Z_K = 0.8638;

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

async function brainPage(seed = 123) {
  const page = await browser.newPage();
  await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
  await page.goto(`${base}/?pet=1&brain=1&brainseed=${seed}`);
  await page.evaluate(() => {
    renderer.render = () => {};
    window.__petFrame = { w: 1920, h: 1080 };
    spider.position.set(0, 0, 0);
    spider.speed = 0;
    spider.angle = 0;
    seedFeet();
    resetSpiderBrain(123);
  });
  return page;
}

test("brain: default state does not follow a distant moving cursor", async () => {
  const page = await brainPage();
  try {
    const result = await page.evaluate(() => {
      for (let i = 0; i < 100; i++) {
        window.__petMouse = { x: 650 + (i % 2) * 20, z: 0 };
        advanceTime(17);
      }
      return {
        state: spiderBrain.state,
        attention: spiderBrain.attention,
        distanceTravelled: spider.position.length(),
        pointerDistance: pointer.distanceTo(spider.position),
      };
    });
    assert.equal(result.state, "REST", JSON.stringify(result));
    assert.ok(result.attention < 0.1, JSON.stringify(result));
    assert.ok(result.distanceTravelled < 2, `distant cursor must not drag the spider: ${JSON.stringify(result)}`);
    assert.ok(result.pointerDistance < 12, `REST intent should stay local: ${JSON.stringify(result)}`);
  } finally { await page.close(); }
});

test("brain: nearby repeated activity escalates through observation into pursuit intent", async () => {
  const page = await brainPage();
  try {
    const result = await page.evaluate(() => {
      const seen = new Set();
      for (let i = 0; i < 80; i++) {
        window.__petMouse = { x: i % 2 ? 165 : 145, z: i % 4 < 2 ? 18 : -18 };
        advanceTime(17);
        seen.add(spiderBrain.state);
      }
      return {
        seen: [...seen],
        state: spiderBrain.state,
        attention: spiderBrain.attention,
        travelled: spider.position.length(),
        distance: spiderBrain.mouseDistance,
      };
    });
    assert.ok(result.seen.includes("OBSERVE"), JSON.stringify(result));
    assert.ok(result.seen.some(state => state === "APPROACH" || state === "STALK" || state === "POUNCE"), JSON.stringify(result));
    assert.ok(result.attention > 1, JSON.stringify(result));
    assert.ok(result.travelled > 5, `deliberate nearby stimulation should eventually cause movement: ${JSON.stringify(result)}`);
  } finally { await page.close(); }
});

test("brain: observation turns toward the cursor without walking into it", async () => {
  const page = await brainPage();
  try {
    const result = await page.evaluate(() => {
      window.__petMouse = { x: 180, z: 100 };
      spiderBrain.attention = 1;
      enterBrainState("OBSERVE");
      for (let i = 0; i < 25; i++) advanceTime(17);
      return {
        state: spiderBrain.state,
        targetDistance: pointer.distanceTo(spider.position),
        travelled: spider.position.length(),
        heading: spider.angle,
      };
    });
    assert.ok(result.state === "OBSERVE" || result.state === "REST", JSON.stringify(result));
    assert.ok(result.targetDistance < 12, `OBSERVE target must stay inside arrive distance: ${JSON.stringify(result)}`);
    assert.ok(result.travelled < 8, `OBSERVE should look, not chase: ${JSON.stringify(result)}`);
    assert.ok(Math.abs(result.heading) > 0.05, `OBSERVE should rotate toward stimulus: ${JSON.stringify(result)}`);
  } finally { await page.close(); }
});

test("brain: fast sweep then stop can trigger a pounce only after engagement", async () => {
  const page = await brainPage();
  try {
    const result = await page.evaluate(() => {
      spiderBrain.attention = 2.2;
      enterBrainState("STALK");
      spiderBrain.stateTime = .4;
      window.__petMouse = { x: 120, z: 0 };
      advanceTime(17);
      window.__petMouse = { x: 165, z: 0 };
      advanceTime(17);
      window.__petMouse = { x: 165, z: 0 };
      advanceTime(17);
      const strike = { state: spiderBrain.state, jumping: Boolean(spider.jump), fastStop: spiderBrain.fastStop };
      for (let i = 0; i < 120; i++) advanceTime(17);
      return { strike, after: spiderBrain.state, jumpingAfter: Boolean(spider.jump) };
    });
    assert.equal(result.strike.state, "POUNCE", JSON.stringify(result));
    assert.equal(result.strike.jumping, true, JSON.stringify(result));
    assert.equal(result.strike.fastStop, true, JSON.stringify(result));
    assert.equal(result.jumpingAfter, false, JSON.stringify(result));
    assert.notEqual(result.after, "APPROACH", "after a strike the spider should reassess rather than glue itself to the cursor");
  } finally { await page.close(); }
});

test("brain: seeded wander is deterministic and stays inside desktop bounds", async () => {
  const page = await brainPage(42);
  try {
    const result = await page.evaluate(() => {
      function pick() {
        resetSpiderBrain(42);
        enterBrainState("WANDER");
        chooseWanderTarget();
        return [spiderBrain.wanderTarget.x, spiderBrain.wanderTarget.z];
      }
      return { a: pick(), b: pick() };
    });
    assert.deepEqual(result.a.map(v => Number(v.toFixed(6))), result.b.map(v => Number(v.toFixed(6))), "same seed must reproduce the same autonomous choice");
    assert.ok(Math.abs(result.a[0]) <= 1920 / 2 - BRAIN_DESKTOP_MARGIN + 1, JSON.stringify(result));
    assert.ok(Math.abs(result.a[1]) <= 1080 / 2 / VIEW_Z_K - BRAIN_DESKTOP_MARGIN / VIEW_Z_K + 1, JSON.stringify(result));
  } finally { await page.close(); }
});
