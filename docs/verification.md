# Verification

Verification is layered. A green result proves only the layer that actually ran; in particular, synthetic cursor/screen injection does **not** prove arbitrary real macOS multi-screen behavior.

## Static check

```sh
node --check app.js
node --check src/gait.js
node --check src/self-test.js
node --check src/bootstrap.js
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

The legacy v0.1 gates cover reach, landing sectors, planted-foot separation, distal crossing, coxa shell placement, front-foot forwardness and per-pair stepping. During Locomotion v2 these metrics remain regression evidence, but they are not sacred invariants: body-authoritative locomotion may replace gates whose only effect was to make movement mechanically stop.

## Automated suite

```sh
npm install   # once; playwright-core is a dev dependency
npm test      # node:test + playwright-core
```

The browser binary is found automatically under `~/Library/Caches/ms-playwright` (any `chromium*` install), or set `CHROMIUM_PATH`.

### L1 — browser / simulation

`tests/spider.test.mjs`

Covers page logic with synthetic inputs, including:

- all deterministic gait routes;
- slow-cursor follow, sweep-and-stop strike and jump recovery;
- direct cursor tracking (the old window-edge projection is gone);
- simulated cross-screen follow / arrival behavior;
- camera mapping;
- idle-roam bounds.

L1 is fast and deterministic, but it does not run the Swift host. It cannot prove that a real `NSScreen` arrangement, pet window and global cursor map correctly end-to-end.

### L2 — host geometry

`tests/host-geometry.test.mjs`

Compiles `desktop/HostFixtureRunner.swift` with `desktop/HostGeometry.swift` and checks synthetic screen arrangements such as single-screen, left/right/above secondary displays and stacked/offset unions.

These fixtures validate coordinate formulas independently of one recorded machine. Some older CGWindowList conversion helpers may remain covered as regression history even though window-edge projection is no longer part of the runtime follow path.

L2 also guards shared constants such as `viewZ` / `VIEW_Z_K` and follow margins where applicable.

### L3 — real macOS host integration

`tests/host-integration.test.mjs`

Builds and launches the real shell in probe mode:

```sh
/tmp/SpiderPet <root> --probe <out.json>
```

This requires a logged-in macOS session; a transparent window flashes briefly.

The probe records raw facts rather than asserting inside the app:

- actual `windowFrame` and `coordinateFrame`;
- live `NSScreen` frames and desktop union;
- global mouse location;
- page readback of `petMode`, viewport, `__petFrame` and `__petMouse`;
- a second phase after deliberately moving the window and posting a screen-parameters-change notification.

The current probe still serializes a legacy `petWindows` field as an empty/readback diagnostic; window-rect projection is no longer used by runtime cursor following and no pass criterion should depend on it.

L3 asserts:

1. the settled pet window at least covers the main screen;
2. `coordinateFrame` equals the window's actual settled frame;
3. an independent CGWindowList sampler sees that real window at the settled frame;
4. page viewport and `__petFrame` match the actual window;
5. `__petMouse` is finite and consistent with the host conversion within tolerance for live mouse motion;
6. after a simulated display-arrangement change, the window re-homes and the page bridge stays live.

Whether a borderless window spans the entire desktop union is currently diagnostic because macOS window-server behavior varies with layout. For v0.2, that means **multi-screen remains an open product requirement**: do not interpret a green L3 probe that only covers the main screen as proof that every display is reachable.

## Real multi-screen smoke matrix

Before declaring Desktop Topology v2 solved, verify on real macOS hardware in addition to L1/L2/L3 automation:

- one screen;
- left/right dual screens;
- vertical and offset dual screens;
- unequal resolutions/scales where available;
- repeated crossings rather than one main -> secondary transition;
- 3-screen traversal when hardware is available;
- cursor reach near display edges and overhang regions;
- rearrange/change display parameters and verify re-home/remapping.

Capture the actual screen frames, window frame and cursor/page coordinates when a topology fails. Do not promote one machine's absolute coordinates into a universal golden fixture.

## Perceptual locomotion smoke

Metrics do not fully represent the product goal. For Locomotion v2 use reproducible visual scenarios as well:

1. long straight pursuit;
2. shallow continuous curve;
3. 90° and near-180° turns;
4. stop -> reorient -> resume;
5. slow pursuit and fast pursuit.

Look specifically for planted-foot sliding, body-speed discontinuities, run-in-place, replant pauses/twitch, obvious adjacent-leg crossings and overly clock-like cadence.

## Basic manual browser smoke

At `http://127.0.0.1:4173`, verify:

1. moving the pointer causes forward-facing walking;
2. clicking produces a jump without ground-anchored vertical legs;
3. `Space` triggers the pose without stopping rendering.

Do not use the user's personal browser session for automated checks.
