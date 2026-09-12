# Verification

Verification is layered. A green result proves only the layer that actually ran; in particular, synthetic cursor/screen injection does **not** prove repeated real macOS cross-screen visibility.

## Static check

```sh
node --check app.js
node --check src/motion.js
node --check src/gait.js
node --check src/self-test.js
node --check src/desktop-pet-v2.js
node --check src/bootstrap.js
node --check desktop/analyze-trace.mjs
```

## Deterministic gait routes

Serve the repository, then open one route at a time:

```sh
python3 -m http.server 4173
# http://127.0.0.1:4173/?selftest=straight
# http://127.0.0.1:4173/?selftest=curve
# http://127.0.0.1:4173/?selftest=reversal
# http://127.0.0.1:4173/?selftest=stress
# http://127.0.0.1:4173/?selftest=adversarial
```

An autonomous browser can read `window.render_game_to_text()` and advance a route with `window.advanceTime(ms)`. A passing result reports `passed: true`.

Locomotion v2 retains regression gates for reach, landing sectors, planted-foot separation, crossing, joint envelopes and continuity. These protect visible quality without making foot constraints the motion engine.

## Automated suite

```sh
npm install   # once; playwright-core is a dev dependency
npm test      # node:test + playwright-core
```

The browser binary is found automatically under `~/Library/Caches/ms-playwright`, or set `CHROMIUM_PATH`.

### Remote CI

`.github/workflows/verify.yml` runs repeatable browser/static checks on Ubuntu. `.github/workflows/host-verify.yml` isolates Swift/host geometry checks to macOS. Hosted runners are not evidence for the user's actual display topology/window-server behavior.

GitHub Actions execution has recently failed before workflow steps start in this repository; when that happens, do not reinterpret infrastructure failure as a code failure. Local macOS evidence remains required before merging Desktop Topology v2.

### L1 — browser / simulation

`tests/spider.test.mjs`

Covers page logic with synthetic inputs, including:

- deterministic gait routes across multiple frame rates;
- direct cursor tracking;
- pet follow / pounce / recovery;
- camera mapping;
- idle behavior;
- simulated long-distance follow.

L1 cannot prove that the native pet window visibly crossed a physical display seam.

### L2 — host geometry

`tests/host-geometry.test.mjs`

Compiles `desktop/HostFixtureRunner.swift` with `desktop/HostGeometry.swift` and checks arbitrary synthetic `NSScreen` layouts.

Topology v2 specifically protects:

1. `global Cocoa -> page/world` conversion;
2. the exact inverse `page/world -> global Cocoa` conversion;
3. round-trip equality for points on different screen arrangements;
4. fixed-size pet-window placement centred on a page/world point;
5. shared `viewZ / VIEW_Z_K` scale.

The crucial invariant is that native pet-window movement does **not** redefine the desktop/world coordinate origin.

The native shell uses a dedicated `PetWindow` whose `constrainFrameRect` returns the requested frame. This is required for a 360x360 borderless viewport to straddle a display seam on hosts with separate Spaces; without it AppKit can silently clamp the window back inside one screen's visible frame.

Older pure window-rect conversion helpers remain tested as regression history even though window-edge projection is no longer part of runtime cursor following.

### L3 — real macOS host probe

`tests/host-integration.test.mjs`

Builds and launches the real shell in probe mode:

```sh
/tmp/SpiderPet <root> --probe <out.json>
```

The probe now verifies the moving-window architecture rather than desktop-union window coverage.

It records:

- fixed native `windowFrame` / `windowCenter`;
- live `NSScreen` frames and desktop union;
- `NSScreen.screensHaveSeparateSpaces`;
- global mouse location and its page/world conversion;
- latest page-published spider pose;
- inverse world -> global expected spider point;
- which physical screen contains the mouse and spider point;
- page viewport, desktop metadata, injected mouse, spider and pointer state.

L3 asserts:

1. native pet window stays fixed at 360x360;
2. WebGL viewport is the same small local size;
3. page desktop metadata still describes the full `NSScreen` union;
4. mouse conversion uses the global desktop frame, not the moving window;
5. page-published spider pose matches page simulation state;
6. native window centre equals the spider pose converted back to Cocoa global coordinates;
7. a forced spider-pose change materially moves the native window without resizing the viewport.

A green probe proves the page/native coordinate bridge and window following. It still does **not** prove pixels appeared correctly across a physical display seam.

## Real cross-screen trace

This is the decisive Desktop Topology v2 acceptance evidence.

Run:

```sh
./desktop/run.sh --trace /tmp/spider-cross-screen.jsonl
```

Then deliberately move the cursor through a repeated sequence such as:

```text
A -> B -> A -> B
```

Keep the pet running long enough to visibly attempt each transition, then quit and analyze:

```sh
node desktop/analyze-trace.mjs /tmp/spider-cross-screen.jsonl
```

The trace records, at roughly 4 Hz:

- `mouseScreen`: physical screen containing the real cursor;
- `poseScreen`: physical screen containing the logical spider world point;
- `windowCenter` vs `expectedPoseGlobal`;
- page spider vs last native published pose;
- page pointer / injected mouse agreement;
- screen frames, scale factors and separate-Spaces state.

Interpretation:

- mouse crosses, spider never crosses -> target/locomotion/topology path issue;
- spider crosses, native window does not -> JS/native pose bridge or AppKit placement issue;
- spider and native window cross, but pixels are absent -> visual/window-server/WebKit compositor issue;
- all three cross visibly -> repeated physical traversal passes.

Do not claim multi-screen solved from coordinates alone. The user must actually see the spider appear and continue moving on the other panel.

The current stacked dual-display evidence (2026-09-13) is a passing reference run: 5 mouse-screen transitions, 3 logical-pose transitions, 1.184-point maximum window-follow error, and 0 published-pose error. The trace was paired with four desktop captures showing A -> B -> A -> B; retain the broader smoke matrix below for other hardware layouts.

## Real multi-screen smoke matrix

Before declaring Desktop Topology v2 solved, verify on real macOS hardware:

- one screen;
- left/right dual screens where available;
- vertical / offset dual screens;
- unequal resolutions/scales where available;
- repeated A -> B -> A -> B rather than one one-way transition;
- 3-screen traversal when hardware is available;
- cursor near external edges and overlap/overhang regions;
- display rearrangement / resolution change while the app is running.

For non-rectangular layouts, note whether the straight world trajectory passes through an off-screen gap. Do not fix such layouts with machine-specific coordinate offsets; if necessary, add topology-aware routing through shared screen edges.

## Perceptual locomotion smoke

Locomotion v2 has already received real visual review, but keep these scenarios for future regressions:

1. long straight pursuit;
2. shallow continuous curve;
3. 90° and near-180° turns;
4. stop -> reorient -> resume;
5. slow pursuit and fast pursuit.

Look for planted-foot sliding, body-speed discontinuities, run-in-place, replant pauses/twitch, obvious adjacent-leg crossings and overly clock-like cadence.

## Basic manual browser smoke

At `http://127.0.0.1:4173`, verify:

1. moving the pointer causes forward-facing walking;
2. clicking produces a jump without ground-anchored vertical legs;
3. `Space` triggers the pose without stopping rendering.

Do not use the user's personal browser session for automated checks.
