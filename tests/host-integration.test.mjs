import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// L3: real Swift host check for Desktop Topology v2.
//
// The old host tried to prove that one desktop-sized transparent WKWebView
// covered the NSScreen union. That was not sufficient: a window could report a
// union-sized frame while real cross-display rendering still failed.
//
// The new invariant is simpler and directly testable:
//   global desktop <-> page/world is stable,
//   the WebGL viewport stays small/fixed,
//   the native window centre follows the exact page/world spider pose.
//
// Actual repeated physical A -> B -> A -> B visibility remains a manual L3
// smoke because only a human/visual capture can prove pixels appeared on the
// other physical panel.

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const round = a => a.map(v => Math.round(v * 100) / 100);
const close = (a, b, tol = 2) => Math.abs(a - b) <= tol;

function expectedGlobal(snapshot) {
  const [dx, dy, dw, dh] = snapshot.desktopFrame;
  const [x, z] = snapshot.lastPagePose;
  return [dx + dw / 2 + x, dy + dh / 2 - z * snapshot.viewZ];
}

function assertPhase(phase, label) {
  assert.equal(phase.page.petMode, true, `${label}: page must run in pet mode`);
  assert.ok(phase.page.petMouse, `${label}: cursor bridge must be live`);
  assert.ok(phase.page.petDesktop, `${label}: desktop bridge must be live`);
  assert.ok(phase.page.petViewport, `${label}: viewport bridge must be live`);

  const [wx, wy, ww, wh] = phase.windowFrame;
  assert.ok(close(ww, 360, .5) && close(wh, 360, .5), `${label}: native pet window must stay fixed at 360x360, got ${phase.windowFrame}`);
  assert.ok(close(phase.page.innerWidth, 360, 1) && close(phase.page.innerHeight, 360, 1),
    `${label}: WebGL page viewport must be the small pet window, got ${phase.page.innerWidth}x${phase.page.innerHeight}`);
  assert.ok(close(phase.page.petViewport.w, 360, .5) && close(phase.page.petViewport.h, 360, .5),
    `${label}: injected viewport must stay fixed`);

  assert.deepEqual(round([phase.page.petDesktop.x, phase.page.petDesktop.y, phase.page.petDesktop.w, phase.page.petDesktop.h]), round(phase.desktopFrame),
    `${label}: page desktop bounds must describe the real NSScreen union`);

  const expected = expectedGlobal(phase);
  assert.ok(close(phase.expectedPoseGlobal[0], expected[0]) && close(phase.expectedPoseGlobal[1], expected[1]),
    `${label}: host world->global conversion mismatch ${phase.expectedPoseGlobal} != ${expected}`);
  assert.ok(close(phase.windowCenter[0], expected[0]) && close(phase.windowCenter[1], expected[1]),
    `${label}: native window centre ${phase.windowCenter} must follow spider global position ${expected}`);
  assert.ok(close(wx + ww / 2, expected[0]) && close(wy + wh / 2, expected[1]),
    `${label}: window frame itself must be centred on spider`);

  assert.ok(close(phase.page.spider[0], phase.lastPagePose[0], 3) && close(phase.page.spider[1], phase.lastPagePose[1], 3),
    `${label}: page spider pose and last published native pose diverged`);

  // Mouse conversion is against the DESKTOP frame, never the moving pet
  // window. Otherwise moving the window would move the target under the mouse.
  const [dx, dy, dw, dh] = phase.desktopFrame;
  const expectedMouse = [phase.mouseLocation[0] - dx - dw / 2,
    -(phase.mouseLocation[1] - dy - dh / 2) / phase.viewZ];
  assert.ok(Math.abs(phase.page.petMouse.x - expectedMouse[0]) < 500 && Math.abs(phase.page.petMouse.z - expectedMouse[1]) < 500,
    `${label}: __petMouse ${[phase.page.petMouse.x, phase.page.petMouse.z]} must use desktop coordinates ${expectedMouse}`);
}

test("host: small pet window follows global spider pose without redefining mouse/world coordinates", { timeout: 120000 }, async () => {
  execFileSync("swiftc", ["-O", "-module-cache-path", "/tmp/clangmod-test",
    join(root, "desktop/HostGeometry.swift"), join(root, "desktop/SpiderPet.swift"),
    "-o", "/tmp/SpiderPet-probe"], { stdio: "pipe" });

  const out = join("/tmp", `spider-probe-${process.pid}.json`);
  rmSync(out, { force: true });
  const probe = spawn("/tmp/SpiderPet-probe", [root, "--probe", out], { stdio: "ignore" });
  const deadline = Date.now() + 60000;
  while (probe.exitCode === null && Date.now() < deadline) await new Promise(r => setTimeout(r, 250));
  if (probe.exitCode === null) { probe.kill(); throw new Error("probe timed out"); }

  const report = JSON.parse(readFileSync(out, "utf8"));
  const p1 = report.phase1, p2 = report.phase2;
  assert.ok(p1 && p2, "probe must produce both phases");
  assertPhase(p1, "phase1");
  assertPhase(p2, "phase2");

  // Probe deliberately teleports the simulated spider before phase2. The native
  // window must therefore move materially while retaining its fixed viewport.
  const moved = Math.hypot(p2.windowCenter[0] - p1.windowCenter[0], p2.windowCenter[1] - p1.windowCenter[1]);
  assert.ok(moved > 20, `probe must exercise native window movement, moved only ${moved}`);

  console.log(`[host-integration] screens=${JSON.stringify(p1.screens)} separateSpaces=${p1.screensHaveSeparateSpaces}`);
});
