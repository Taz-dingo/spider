import { test, before } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// L2: deterministic checks of the Swift host's pure geometry functions.
// Compiles HostFixtureRunner (which links HostGeometry.swift), feeds it
// screen-arrangement fixtures, and compares its output against the same
// formulas reimplemented here.  Catches coordinate-convention regressions
// (cursor z negation, CGWindowList y flip, viewZ scaling, union handling)
// that the browser layer can never exercise because it injects fake values
// straight into the page, bypassing the host entirely.

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const runner = "/tmp/HostFixtureRunner";
const VIEW_Z_K = 0.8638;

before(() => {
  execFileSync("swiftc", ["-O", "-module-cache-path", "/tmp/clangmod-test",
    join(root, "desktop/HostGeometry.swift"), join(root, "desktop/HostFixtureRunner.swift"),
    "-o", runner], { stdio: "pipe" });
});

const close = (a, b, tol = 1e-6) => Math.abs(a - b) < tol;
const unionOf = screens => {
  const [x0, y0, x1, y1] = screens.reduce(([ax, ay, bx, by], [x, y, w, h]) =>
    [Math.min(ax, x), Math.min(ay, y), Math.max(bx, x + w), Math.max(by, y + h)],
    [Infinity, Infinity, -Infinity, -Infinity]);
  return [x0, y0, x1 - x0, y1 - y0];
};
const mouseToPage = (mouse, frame) => [mouse[0] - frame[0] - frame[2] / 2, -(mouse[1] - frame[1] - frame[3] / 2) / VIEW_Z_K];
const windowRectToPage = (rect, mainH, frame) => {
  const topCocoaY = mainH - rect[1];
  return [rect[0] - frame[0] - frame[2] / 2, -(topCocoaY - frame[1] - frame[3] / 2) / VIEW_Z_K, rect[2], rect[3] / VIEW_Z_K];
};
const clampedTarget = (target, frame) => [
  Math.min(Math.max(target[0], -frame[2] / 2 + 90), frame[2] / 2 - 90),
  Math.min(Math.max(target[1], -frame[3] / 2 / VIEW_Z_K + 90 / VIEW_Z_K), frame[3] / 2 / VIEW_Z_K - 90 / VIEW_Z_K),
];

const fixtures = JSON.parse(readFileSync(join(root, "tests/fixtures/screens.json"), "utf8"));

for (const fixture of fixtures) {
  test(`host geometry: ${fixture.name}`, () => {
    const result = JSON.parse(execFileSync(runner, { input: JSON.stringify(fixture) }).toString());
    const frame = unionOf(fixture.screens);
    assert.deepEqual(result.union.map(v => Number(v.toFixed(6))), frame.map(v => Number(v.toFixed(6))), "union must match");
    if (fixture.mouse) {
      const expected = mouseToPage(fixture.mouse, frame);
      assert.ok(close(result.mouseToPage[0], expected[0]) && close(result.mouseToPage[1], expected[1]),
        `mouseToPage ${result.mouseToPage} != ${expected}`);
    }
    if (fixture.windows) {
      const expected = fixture.windows.map(w => windowRectToPage(w, fixture.mainScreenHeight, frame));
      result.windowRects.forEach((r, i) => {
        for (let k = 0; k < 4; k++) assert.ok(close(r[k], expected[i][k]), `windowRect[${i}][${k}] ${r[k]} != ${expected[i][k]}`);
      });
    }
    if (fixture.target) {
      const expected = clampedTarget(fixture.target, frame);
      assert.ok(close(result.clampedTarget[0], expected[0]) && close(result.clampedTarget[1], expected[1]),
        `clampedTarget ${result.clampedTarget} != ${expected}`);
    }
  });
}

// Absolute goldens measured on the real stacked-above-offset arrangement
// (main 1728x1117 + secondary 1920x1080 at x=-83 above it): the exact
// conversion the shell produced live on this machine, independent of the
// formula reimplementation above.
test("host geometry: real-machine golden values", () => {
  const f = fixtures.find(fixture => fixture.name === "stacked-above-offset");
  const result = JSON.parse(execFileSync(runner, { input: JSON.stringify(f) }).toString());
  assert.ok(close(result.union[0], -83, 1e-9) && close(result.union[1], 0, 1e-9) && close(result.union[2], 1920, 1e-9) && close(result.union[3], 2197, 1e-9),
    `union ${result.union} must be the real desktop union`);
  assert.ok(close(result.mouseToPage[0], -314.17578125, 1e-6), `golden mouse x ${result.mouseToPage[0]} != -314.17578125`);
  assert.ok(close(result.mouseToPage[1], 490.65539, 1e-3), `golden mouse z ${result.mouseToPage[1]} != 490.65539`);
});

// The Swift viewZ and app.js VIEW_Z_K are two copies of the same constant;
// a drift here silently misplaces every injected z on screen, and only a
// cross-language check can catch it.
test("host geometry: viewZ and VIEW_Z_K stay in sync", () => {
  const swift = readFileSync(join(root, "desktop/HostGeometry.swift"), "utf8");
  const js = readFileSync(join(root, "app.js"), "utf8");
  const swiftZ = Number(swift.match(/viewZ: Double = ([\d.]+)/)[1]);
  const jsZ = Number(js.match(/VIEW_Z_K = ([.\d]+)/)[1]);
  assert.ok(close(swiftZ, jsZ, 1e-9), `viewZ ${swiftZ} != VIEW_Z_K ${jsZ}`);
  const margin = Number(js.match(/const margin = (\d+)/)[1]);
  assert.equal(margin, 90, "petPointer margin must stay 90");
});
