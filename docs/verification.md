# Verification

Verification is layered. A green result proves only the layer that actually ran; in particular, synthetic cursor/screen injection does **not** prove repeated real macOS cross-screen visibility or that autonomous behaviour feels natural.

## Static check

```sh
node --check app.js
node --check src/motion.js
node --check src/brain.js
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

GitHub Actions execution has recently failed before workflow steps start in this repository; when that happens, do not reinterpret infrastructure failure as a code failure. Local macOS evidence remains authoritative for real-host behaviour.

### L1 — locomotion browser harness

`tests/spider.test.mjs`

The plain browser `?pet=1` path deliberately remains a continuous-follow **test harness**, not the desktop product behaviour. It protects low-level locomotion independently of Brain, including:

- deterministic gait routes across multiple frame rates;
- direct cursor-target tracking;
- pounce / recovery plumbing;
- camera mapping;
- target clamping and idle target bounds.

This separation is intentional: Brain should not make a locomotion regression disappear by deciding not to move.

### Brain — deterministic behaviour semantics

`tests/brain.test.mjs`

Browser Brain tests opt in with:

```text
?pet=1&brain=1&brainseed=<seed>
```

Important semantic gates:

1. **default non-follow** — distant ordinary cursor motion must not drag the spider;
2. **attention escalation** — repeated nearby activity must pass through `OBSERVE` before approach/stalk intent;
3. **observe means look, not chase** — `OBSERVE` keeps the movement target inside Motion Controller's arrival distance while allowing heading change;
4. **earned pounce** — fast sweep-and-stop may trigger `POUNCE` after engagement, not from every ordinary cursor move;
5. **post-strike reassessment** — after landing, the spider must not immediately become a permanent follower;
6. **seeded autonomy** — the same seed must reproduce the same wander choice;
7. autonomous targets stay inside desktop bounds.

These tests protect behaviour meaning, not one exact second-by-second animation timeline.

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

The probe verifies the moving-window architecture rather than desktop-union window coverage.

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

## Real Spider Brain smoke

Run the normal host:

```sh
./desktop/run.sh
```

The product Brain is enabled automatically in WKWebView. Do not judge Brain from the plain browser `?pet=1` follow harness.

Use ordinary computer-like mouse motion first, then deliberately tease the spider nearby.

Expected qualitative behaviour:

- default: often rests or makes a short local wander; does not trail normal mouse use;
- distant mouse movement: usually ignored;
- one nearby pass: may produce a look/turn but should not guarantee pursuit;
- repeated nearby motion: should visibly escalate into observation and sometimes approach/stalk;
- approach: should stop short rather than sit exactly under the cursor;
- stalk: slower/closer than approach;
- fast sweep-and-stop after engagement: can pounce;
- after pounce: pauses/reassesses instead of permanently following;
- transitions should feel hesitant and legible, not random-state flicker.

The main tuning question is annoyance rate: **normal use should rarely trigger unwanted pursuit.** If unsure, prefer less reactivity and strengthen only deliberate interaction signals.

`--trace` page snapshots also include `page.brain` (state, attention, cursor
distance, and fast-stop detection) so a visual surprise can be separated from
stimulus interpretation.

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

For topology regression testing, use the low-level follow harness / explicit target control rather than relying on Brain to decide whether crossing is interesting.

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

- mouse crosses, spider never crosses under an explicit traversal command -> target/locomotion/topology path issue;
- spider crosses, native window does not -> JS/native pose bridge or AppKit placement issue;
- spider and native window cross, but pixels are absent -> visual/window-server/WebKit compositor issue;
- all three cross visibly -> repeated physical traversal passes.

Do not claim multi-screen solved from coordinates alone. The user must actually see the spider appear and continue moving on the other panel.

The current stacked dual-display evidence (2026-09-13) is a passing reference run: 5 mouse-screen transitions, 3 logical-pose transitions, 1.184-point maximum window-follow error, and 0 published-pose error. The trace was paired with four desktop captures showing A -> B -> A -> B; retain the broader smoke matrix below for other hardware layouts.

## Real multi-screen smoke matrix

For broader compatibility, verify on real macOS hardware when available:

- one screen;
- left/right dual screens;
- vertical / offset dual screens;
- unequal resolutions/scales;
- repeated A -> B -> A -> B;
- 3-screen traversal;
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

1. moving the pointer causes forward-facing walking in the browser harness;
2. clicking produces a jump without ground-anchored vertical legs;
3. `Space` triggers the pose without stopping rendering.

Do not use the user's personal browser session for automated checks.
