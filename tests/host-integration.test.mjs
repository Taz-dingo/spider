import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// L3: end-to-end checks of the real Swift host.  Builds and launches the
// actual shell in probe mode: it opens its normal borderless window for a
// few seconds, dumps raw facts (window frame, placement coordinate frame,
// screen union, page readback) to a JSON file, deliberately moves the
// window off, posts the screen-parameters notification, and dumps again.
// The assertions below recompute expectations from the dumps; the shell
// never asserts itself.
//
// The invariant this layer guards is: every injected coordinate derives
// from the window's ACTUAL frame (the window server may relocate a
// multi-screen window to the origin of the screen it most overlaps — on
// the stacked+overhang arrangement the raw union request lands one
// main-screen-height off).  If coordinates ever come from a frame the
// window does not really occupy, the spider cannot follow the cursor and
// walks off the visible area — the Aug 2026 regression.  Needs a logged-in
// macOS session: the probe window flashes on screen for ~4 s.  A second
// instance of the pet may be running; the test identifies the probe window
// by its window number.

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const round = a => a.map(v => Math.round(v * 100) / 100);

test("host: window covers the main screen, bridge matches its actual frame, re-homes on screen change", { timeout: 120000 }, async () => {
  execFileSync("swiftc", ["-O", "-module-cache-path", "/tmp/clangmod-test",
    join(root, "desktop/HostGeometry.swift"), join(root, "desktop/SpiderPet.swift"),
    "-o", "/tmp/SpiderPet-probe"], { stdio: "pipe" });
  execFileSync("swiftc", ["-O", "-module-cache-path", "/tmp/clangmod-test",
    join(root, "desktop/WindowListDump.swift"), "-o", "/tmp/WindowListDump"], { stdio: "pipe" });

  const out = join("/tmp", `spider-probe-${process.pid}.json`);
  rmSync(out, { force: true });
  // Run the probe in the background and sample CGWindowList while its
  // window is alive (the window disappears when the probe process exits).
  const probe = spawn("/tmp/SpiderPet-probe", [root, "--probe", out], { stdio: "ignore" });
  const captures = [];
  const deadline = Date.now() + 60000;
  while (probe.exitCode === null && Date.now() < deadline) {
    try {
      const text = execFileSync("/tmp/WindowListDump", ["SpiderPet"]).toString().trim();
      if (text) captures.push(text.split("\n").filter(Boolean).map(line => line.split(/\s+/)));
    } catch { /* window list can transiently fail; keep sampling */ }
    await new Promise(r => setTimeout(r, 400));
  }
  if (probe.exitCode === null) { probe.kill(); throw new Error("probe timed out"); }
  assert.ok(captures.length > 0, "CGWindowList samples must be captured while the probe runs");
  const report = JSON.parse(readFileSync(out, "utf8"));
  const p1 = report.phase1, p2 = report.phase2;
  assert.ok(p1 && p2, "probe must produce both phases");

  const main = p1.screens.find(s => s[0] === 0 && s[1] === 0);
  assert.ok(main, "a main screen at origin (0,0) must exist");
  const [mw, mh] = [main[2], main[3]];

  // 1. Placement: the window must really cover the main screen AND the whole
  //    desktop union's centre, and the coordinate frame the shell injects
  //    from must be the window's actual frame (they agree, and both differ
  //    from the union only when the window server refused the union).  The
  //    union-centre check is the cross-screen regression: if the window is
  //    anchored at (0,0) instead of the true union origin (a left/right
  //    secondary overhang), the window misses that overhang and the spider
  //    cannot reach a cursor there (pins at the seam).
  const [wx, wy, ww, wh] = p1.windowFrame;
  assert.ok(wx <= 0 && wy <= 0 && wx + ww >= mw && wy + wh >= mh,
    `window ${p1.windowFrame} must fully cover the main screen ${main}`);
  assert.deepEqual(round(p1.windowFrame), round(p1.coordinateFrame),
    "coordinate frame must be the window's actual frame");
  const [ux, uy, uw, uh] = p1.desktopFrame;
  const [ucx, ucy] = [ux + uw / 2, uy + uh / 2];
  assert.ok(ucx >= wx && ucx <= wx + ww && ucy >= wy && ucy <= wy + wh,
    `window ${p1.windowFrame} must cover the desktop union centre (${ucx},${ucy}) so the spider can reach every screen; desktopFrame=${p1.desktopFrame}`);

  // 2. Independent cross-check: another process samples CGWindowList while
  //    the probe runs and must see the same window, in the same place, on
  //    screen.  Display coords are y-down from the main screen's top;
  //    convert to Cocoa y-up.  Samples during the placement phase can catch
  //    transient server-relocated frames, so at least one sample must match
  //    the FINAL frame (the settled window stays on screen for seconds).
  const samples = captures.flat().filter(parts => Number(parts[0]) === p1.windowNumber);
  assert.ok(samples.length > 0, `probe window #${p1.windowNumber} must be listed on screen by CGWindowList`);
  const cocoa = samples.map(([, , x, y, w, h]) => round([Number(x), mh - (Number(y) + Number(h)), Number(w), Number(h)]));
  assert.ok(cocoa.some(rect => round(p1.windowFrame).every((v, i) => Math.abs(v - rect[i]) < 2)),
    `no CGWindowList sample matches the settled frame ${p1.windowFrame}; samples: ${JSON.stringify(cocoa)}`);

  // 3. Page bridge: pet mode on, viewport and injected frame equal to the
  //    actual window; injected cursor matches the shell's own conversion
  //    of the live mouse against the coordinate frame (loose tolerance for
  //    mouse motion during the probe — a one-screen-off conversion error
  //    is an order of magnitude larger); window rects finite and sane.
  assert.equal(p1.page.petMode, true, "page must run in pet mode");
  assert.deepEqual(round([p1.page.innerWidth, p1.page.innerHeight]), round([ww, wh]),
    "page viewport must equal the actual window");
  assert.deepEqual(round([p1.page.petFrame.w, p1.page.petFrame.h]), round([ww, wh]),
    "__petFrame must equal the actual window");
  assert.ok(Number.isFinite(p1.page.petMouse.x) && Number.isFinite(p1.page.petMouse.z), "__petMouse must be finite");
  const expected = [p1.mouseLocation[0] - p1.coordinateFrame[0] - p1.coordinateFrame[2] / 2,
    -(p1.mouseLocation[1] - p1.coordinateFrame[1] - p1.coordinateFrame[3] / 2) / p1.viewZ];
  // 500 z-units ~ 430 screen px: fast cursor motion during the ~4 s probe
  // can shift the mouse between the shell's tick and the readback, while a
  // wrong coordinate frame (the regression class) is a full screen off
  // (>= 1000 z-units).
  assert.ok(Math.abs(p1.page.petMouse.x - expected[0]) < 500 && Math.abs(p1.page.petMouse.z - expected[1]) < 500,
    `__petMouse ${[p1.page.petMouse.x, p1.page.petMouse.z]} must match the shell conversion ${expected}`);
  for (const rect of p1.page.petWindows) {
    assert.ok(Array.isArray(rect) && rect.length === 4 && rect.every(Number.isFinite), "injected window rects must be finite");
    assert.ok(rect[2] > 0 && rect[3] > 0, `injected window rect must have positive size, got ${rect}`);
  }

  // 4. Screen-arrangement regression: after the probe moved the window off
  //    and posted the notification, the app must have re-homed the window
  //    over the main screen again, refreshed its coordinate frame, and the
  //    page must keep receiving a fresh __petFrame for the new window.
  const [qx, qy, qw, qh] = p2.windowFrame;
  assert.ok(qx <= 0 && qy <= 0 && qx + qw >= mw && qy + qh >= mh,
    `window must re-cover the main screen after a screen change, got ${p2.windowFrame}`);
  const [qcx, qcy] = [p2.desktopFrame[0] + p2.desktopFrame[2] / 2, p2.desktopFrame[1] + p2.desktopFrame[3] / 2];
  assert.ok(qcx >= qx && qcx <= qx + qw && qcy >= qy && qcy <= qy + qh,
    `re-homed window ${p2.windowFrame} must cover the desktop union centre (${qcx},${qcy})`);
  assert.deepEqual(round(p2.windowFrame), round(p2.coordinateFrame),
    "coordinate frame must follow the re-homed window");
  assert.deepEqual(round([p2.page.petFrame.w, p2.page.petFrame.h]), round([qw, qh]),
    "page __petFrame must refresh after repositioning");
});
