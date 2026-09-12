# Current state

This file is the source of truth for **what the project is doing now**. Historical experiments and old failures belong in `progress.md`; they are not current TODOs unless repeated here.

## v0.2 — Natural Motion

Goal: make Spider a visually believable desktop creature before adding product features or a production art pipeline.

### 1. Locomotion v2 — retained

The core migration from foot-authoritative motion toward **body-intent-first kinematic locomotion** is implemented and retained:

- `src/motion.js` owns desired body heading and speed;
- planted feet remain world-locked during stance;
- gait predicts near-future body pose and can trigger replants before a leg reaches its current limit;
- new footholds are chosen against the expected touchdown body pose;
- translation and heading use a soft comfort envelope plus a hard perceptual envelope instead of binary support permission;
- airborne turn batches keep stable plans/targets until landing;
- rendered procedural IK uses a bounded fixed-length solve rather than stretching bones to force a target;
- deterministic routes protect reach, sector, crossing and continuity over multiple frame rates.

This is the intended game-style balance: **Motion Controller owns intent; gait/geometry make that intent look physically believable.** It is not a full physics simulation.

Real visual review confirmed that straight pursuit and turning are materially more natural and cursor tracking is accurate. Further gait polish or adjacent-leg coordination should be driven by visible residuals, not by reopening the old foot-authoritative architecture.

The existing procedural spider remains the debug/reference representation.

### 2. Desktop topology v2 — verified baseline

**Repeated physical traversal now passes on the current stacked dual-display host.** The remaining priority is broader topology coverage, not reopening the global-coordinate design.

What is already trusted:

- `NSScreen` topology can be read;
- global mouse -> page/world coordinate conversion is accurate on the current machine;
- the spider follows the mouse accurately within the reachable display;
- a fixed 360x360 pet window can cross the current display seam without AppKit clamping it to one screen;
- a real A -> B -> A -> B smoke reached both displays repeatedly;
- synthetic topology fixtures remain useful evidence.

What is not trusted:

- a desktop-union-sized `NSWindow` / transparent `WKWebView` actually renders the spider across every physical display merely because its reported frame equals the union;
- one successful geometry/probe snapshot proves repeated physical traversal.
- arbitrary three-screen, unequal-scale, or non-rectangular layouts have been exercised.

Current Topology v2 experiment changes the host architecture:

```text
global NSScreen topology
  -> one stable global page/world coordinate system
  -> Motion / Gait / spider world pose
  -> page publishes spider world pose to native host
  -> HostGeometry pageToGlobal(...)
  -> one fixed-size transparent native pet window follows that global point
```

The WebGL viewport is now intended to be a small local window centred on the spider rather than one enormous transparent surface spanning the desktop. Mouse coordinates remain global and are independent of that moving window.

New evidence / diagnostics on `desktop-topology-v2`:

- exact `global -> page -> global` round-trip tests;
- deterministic pet-window placement from page/world position;
- L3 probe checks the small window centre against the published spider pose;
- `--trace` JSONL mode records mouse screen, spider screen, native window centre and coordinate errors;
- `desktop/analyze-trace.mjs` classifies which layer failed during A -> B -> A -> B.

The current host evidence is a real stacked dual-display run: mouse transitions 5, logical-pose transitions 3, maximum native-window follow error 1.184 points, and published-pose error 0. The four captured checkpoints showed the spider on A, B, A, and B. If a future layout reports that the logical spider and native window both cross in trace but pixels still disappear, investigate window-server/WebKit visual compositing rather than changing mouse mapping or locomotion.

### 3. Repository hygiene

- `README.md`: what the project is and how to run it.
- `docs/current.md`: current version, priorities, known open problems.
- `docs/architecture.md`: durable runtime boundaries and accepted architectural direction.
- `docs/verification.md`: reproducible checks and pass criteria.
- `docs/agent-workflow.md`: coding-agent operating contract.
- `docs/glossary.md`: shared motion/animation vocabulary.
- `progress.md`: append-only historical record of verified experiments; never the current task list.

Remove stale TODOs, superseded claims, dead code and obsolete tests as the affected area is touched.

### 4. Spider Brain v1

After desktop traversal is reliable, add a small seeded behavior layer:

`REST -> OBSERVE -> APPROACH -> STALK -> POUNCE`

The point is not random motion. Internal state should create observable hesitation, short movement bursts, stalking and occasional pounces so the spider does not feel like a continuous `followCursor()` loop. Tests use a fixed RNG seed; normal runtime may use a random seed.

## Model / animation direction

The project no longer assumes that the final visible spider must be procedural geometry.

Long-term split:

- **procedural motion** for locomotion, turning, footholds and IK;
- **authored/baked clips** for expressive one-off actions where that is simpler and better-looking;
- **lightweight physical/geometric constraints** as guardrails for perceptual plausibility;
- retain the procedural spider as a debug/reference rig;
- a future production rigged mesh may consume the same motion outputs.

The priority is **perceptual realism**, not a full biomechanical simulation.

## Explicitly out of scope for v0.2

- production Blender spider / final rigged asset;
- large authored-animation library;
- window-frame climbing;
- macOS packaging, launch-at-login or menu-bar settings;
- full rigid-body / muscle / hydraulic simulation.

## Known open problems

1. Other physical layouts (left/right, unequal scales, three screens) still need real traversal smoke.
2. Non-rectangular/partially overlapping screen layouts may eventually need topology-aware path routing so the pet does not walk through an off-screen gap in the desktop bounding box.
3. Locomotion may still have minor visual residuals such as transient adjacent-leg crossings, but its architecture is no longer the current blocker.
4. Current pet behavior is still too directly driven by cursor motion to feel autonomous.
