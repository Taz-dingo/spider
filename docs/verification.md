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
  left/right/above, stacked-above-offset (the real desktop), plus
  CGWindowList y-flip cases.  Each fixture must produce the same result as
  the formula reimplemented in the test, and the real-machine fixture is
  pinned to absolute golden values measured live.  Also asserts the Swift
  `viewZ` and app.js `VIEW_Z_K` constants stay equal and the follow margin
  stays 90.  This layer catches every coordinate-convention regression in
  the host that L1 cannot see because it injects fake values.

Any AI iteration must leave `npm test` green before committing.

## Manual smoke check

At `http://127.0.0.1:4173`, verify:

1. Moving the pointer causes forward-facing walking.
2. Clicking produces a jump without ground-anchored vertical legs.
3. `Space` triggers the pose without stopping rendering.

Do not use a user's personal browser window for this check.
