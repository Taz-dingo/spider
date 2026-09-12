import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("desktop topology: page adapter and trace analyzer have valid JS syntax", () => {
  for (const path of ["src/desktop-pet-v2.js", "desktop/analyze-trace.mjs"]) {
    execFileSync("node", ["--check", join(root, path)], { stdio: "pipe" });
  }
});

test("desktop topology: pet viewport is decoupled from desktop bounds", () => {
  const adapter = readFileSync(join(root, "src/desktop-pet-v2.js"), "utf8");
  const host = readFileSync(join(root, "desktop/SpiderPet.swift"), "utf8");
  assert.match(adapter, /const width = innerWidth, height = innerHeight;/,
    "pet renderer must size itself from the small native viewport");
  assert.doesNotMatch(adapter, /renderer\.setSize\([^\n]*__petFrame/,
    "desktop bounds must never size the WebGL viewport");
  assert.match(host, /petWindowSize = NSSize\(width: 360, height: 360\)/,
    "native pet window size must stay explicit and regression-visible");
  assert.match(host, /mouseToPage\(mouse, frame: desktopFrame/,
    "mouse mapping must use global desktop coordinates, not the moving window");
  assert.match(host, /pageToGlobal\(x: lastPagePose\.x, z: lastPagePose\.z, frame: desktopFrame/,
    "diagnostics must expose the inverse world->global mapping");
});
