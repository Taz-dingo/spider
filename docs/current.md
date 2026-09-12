# Current state

This file is the source of truth for **what the project is doing now**. Historical experiments and old failures belong in `progress.md`; they are not current TODOs unless repeated here.

## v0.0.001 — first public playable baseline

Spider now has a retained baseline for locomotion, real desktop traversal, and stateful behavior. This is deliberately a very early release: good enough to use and evaluate as a desktop creature, but not yet a packaged product or production-art build.

The current priority is no longer to reopen foundational movement work unless a visible regression appears. Future iterations should build on the retained boundaries below.

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

This is the intended game-style balance: **Motion Controller owns movement intent; gait/geometry make that intent look physically believable.** It is not a full physics simulation.

Real visual review confirmed that straight pursuit and turning are materially more natural. Further gait polish or adjacent-leg coordination should be driven by visible residuals, not by reopening the old foot-authoritative architecture.

The existing procedural spider remains the debug/reference representation.

### 2. Desktop topology v2 — retained

**Repeated physical traversal passes on the current stacked dual-display host.** Broader topology coverage is compatibility work rather than a blocker for this baseline.

Trusted on the current host:

- global mouse -> page/world mapping is accurate;
- a fixed 360x360 transparent pet window follows the spider through global desktop space;
- AppKit seam clamping is disabled only for the dedicated click-through `PetWindow`;
- real A -> B -> A -> B traversal repeatedly reached both physical displays;
- synthetic topology fixtures and `--trace` remain available for regression diagnosis.

Still not broadly exercised:

- left/right physical layouts;
- unequal backing scales;
- three-screen traversal;
- non-rectangular display gaps.

Do not reopen mouse mapping or locomotion merely because a future physical layout fails; use the existing trace chain first.

### 3. Spider Brain v1 — retained

The desktop pet no longer treats the cursor as a permanent locomotion target.

Current state model:

`REST <-> WANDER -> OBSERVE -> APPROACH -> STALK -> POUNCE`

Core contract:

- **the mouse is a stimulus, not the default destination**;
- ordinary or distant cursor motion does not make the spider chase;
- repeated nearby activity raises attention and may escalate behavior;
- `OBSERVE` turns toward a stimulus without walking into it;
- `APPROACH` moves toward a stand-off distance rather than onto the cursor;
- `STALK` closes more carefully and can convert a fast sweep-and-stop into `POUNCE`;
- after a strike the spider reassesses instead of immediately resuming permanent follow;
- when uninterested, `REST` and short local `WANDER` bouts provide autonomous motion.

`src/brain.js` owns behavior state and emits behavioral targets. It does not manipulate legs, footholds, host windows, or screen coordinates.

Determinism:

- runtime may use normal randomness for autonomous choices;
- tests may reset Brain with a fixed seed;
- seeded choices must be reproducible;
- behavioral tests protect semantic rules, especially “default does not follow the mouse”.

Real-host review accepted the current cadence and trigger balance as sufficient for the first `v0.0.001` baseline. Future Brain changes are product polish unless a clear behavioral regression appears.

### 4. Repository hygiene

- `README.md`: public overview, capabilities, how to run, and current limitations.
- `docs/current.md`: current version, priorities, known open problems.
- `docs/architecture.md`: durable runtime boundaries and accepted architectural direction.
- `docs/verification.md`: reproducible checks and pass criteria.
- `docs/agent-workflow.md`: coding-agent operating contract.
- `docs/glossary.md`: shared motion/animation vocabulary.
- `progress.md`: append-only historical record of verified experiments; never the current task list.

Remove stale TODOs, superseded claims, dead code, and obsolete tests as the affected area is touched.

## Model / animation direction

The project no longer assumes that the final visible spider must be procedural geometry.

Long-term split:

- **procedural motion** for locomotion, turning, footholds, and IK;
- **authored/baked clips** for expressive one-off actions where that is simpler and better-looking;
- **lightweight physical/geometric constraints** as guardrails for perceptual plausibility;
- retain the procedural spider as a debug/reference rig;
- a future production rigged mesh may consume the same motion outputs.

The priority is **perceptual realism**, not a full biomechanical simulation.

## Explicitly out of scope for v0.0.001

- production Blender spider / final rigged asset;
- large authored-animation library;
- window-frame climbing;
- packaged/signed `.app`, launch-at-login, or menu-bar settings;
- full rigid-body / muscle / hydraulic simulation.

## Known open problems

1. Other physical layouts (left/right, unequal scales, three screens) still need real traversal smoke.
2. Non-rectangular/partially overlapping screen layouts may eventually need topology-aware path routing so the pet does not walk through an off-screen gap in the desktop bounding box.
3. Locomotion may still have minor visual residuals such as transient adjacent-leg crossings, but its architecture is no longer the current blocker.
4. Different display backing scales may change apparent spider size during a crossing; this remains non-blocking visual polish.
5. The native macOS shell still needs normal productization work such as packaging, signing, settings, and launch-at-login if the project moves beyond the experimental phase.
