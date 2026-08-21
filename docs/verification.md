# Verification

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
```

An autonomous browser can read `window.render_game_to_text()` and advance a
route with `window.advanceTime(ms)`. A passing result reports `passed: true`.
It covers reach, landing sectors, planted-foot separation, distal crossing,
coxa shell placement, front-foot forwardness, and per-pair stepping.

## Automated suite

One command runs everything below with a zero-dependency static server and
headless Chromium:

```sh
npm install   # once; adds playwright-core as a dev dependency
npm test      # node:test + playwright-core, ~1 min
```

The browser binary is found automatically under
`~/Library/Caches/ms-playwright` (any `chromium*` install), or set
`CHROMIUM_PATH` to a specific executable.  The suite covers:

- static checks: `node --check` on every runtime JS file plus a `swiftc`
  build of `desktop/HostGeometry.swift` + `desktop/SpiderPet.swift`;
- all five deterministic gait routes (`straight`, `curve`, `reversal`,
  `stress`, `adversarial`) reporting `passed: true`;
- pet behaviour: slow-cursor follow, sweep-and-stop strike, jump recovery;
- window edge projection (offset window rects must not project, corrected
  rects must project and flatten);
- cross-screen follow: persists while walking, idles only after arrival;
- camera mapping: position/up, ground depth inside near/far, z mapped at
  `VIEW_Z_K` with zero x coupling;
- idle roam targets stay inside the desktop union bounds and occasionally
  cross screens.

The suite is layered so each layer only asserts what it actually runs:

- **L1 browser layer** (`tests/spider.test.mjs`): the page logic with
  simulated injection — gait, follow/pounce state machine, projection,
  camera.  Fast and deterministic, but it never runs the Swift host.
- **L2 host geometry layer** (`tests/host-geometry.test.mjs`): compiles
  `HostFixtureRunner.swift` (links `HostGeometry.swift`) and feeds it the
  arrangements in `tests/fixtures/screens.json` — single screen, secondary
  left/right/above, stacked-above-offset (a secondary overhanging the main),
  plus CGWindowList y-flip cases.  These are synthetic, device-independent
  arrangements: each is re-implemented as a formula in the test and must match
  the Swift output, so the layer stays valid on any machine without recording
  a specific device's screen geometry (no hard-coded golden values).  Also
  asserts the Swift `viewZ` and app.js `VIEW_Z_K` constants stay equal and the
  follow margin stays 90.  This layer catches every coordinate-convention
  regression in the host that L1 cannot see because it injects fake values.
- **L3 host integration layer** (`tests/host-integration.test.mjs`): builds
  and launches the real shell in probe mode (`--probe <out.json>`); see the
  probe contract below.  Needs a logged-in macOS session (a transparent
  window flashes for ~4 s).

### Host probe contract

`/tmp/SpiderPet <root> --probe <out.json>` runs the normal shell for a few
seconds, then writes one JSON report and exits.  The shell never asserts
anything; tests recompute expectations from the raw facts it dumps.  Report
fields:

- `phase1.windowFrame` / `phase1.coordinateFrame` — the pet window's Cocoa
  frame and the frame all injected coordinates are derived from (they must
  agree).
- `phase1.windowNumber`, `phase1.screens`, `phase1.mouseLocation`,
  `phase1.viewZ`.
- `phase1.page` — page readback: `petMode`, `innerWidth/Height`,
  `petFrame`, `petMouse`, `petWindows`.
- `sabotagedFrame` + `phase2` — after the probe moves the window off and
  posts `NSApplication.didChangeScreenParametersNotification`, the window
  must have re-homed over the main screen, its coordinate frame refreshed,
  and the page must keep receiving a fresh `__petFrame`.

Is "window spans the union" a pass condition?  No — and deliberately so.
Whether the window server keeps a union-sized borderless window or relocates
it to the origin of the screen it most overlaps varies by arrangement (some
arrangements accept the union unchanged, others land one main-screen-height
off and make the union unreachable).  No single arrangement can be assumed, so
the shell never hard-codes one: it requests candidate frames (the true raw
union first, then a union anchored at (0,0), then main-height, then the main
screen itself, which always sticks) and derives every injected coordinate from
the frame the server actually settled on.  The suite therefore asserts only
what is unconditionally true, and reports — rather than asserts — whether the
window happened to span the union.  Pass criteria (asserted in
`host-integration.test.mjs`):

1. The settled window fully covers the main screen, and `coordinateFrame`
   equals the window's actual frame (this invariant regressed in Aug 2026:
   coordinates came from the union while the window sat elsewhere, so the
   spider could not follow the cursor and walked off the visible area).
2. A separate `WindowListDump` process samples CGWindowList while the probe
   runs and must see the window at its settled frame at least once
   (cross-check from outside the app process).
3. The page runs in pet mode with a viewport and `__petFrame` equal to the
   actual window; `__petMouse` matches the shell's own conversion of the
   live cursor against `coordinateFrame` (loose tolerance for mouse motion);
   every injected window rect is finite with positive size.
4. After the sabotaged move + notification, the window re-covers the main
   screen, `coordinateFrame` follows, and the page still receives a fresh
   frame — the arrangement-change regression test.

Any AI iteration must leave `npm test` green before committing.

## Manual smoke check

At `http://127.0.0.1:4173`, verify:

1. Moving the pointer causes forward-facing walking.
2. Clicking produces a jump without ground-anchored vertical legs.
3. `Space` triggers the pose without stopping rendering.

Do not use a user's personal browser window for this check.
