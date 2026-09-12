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

### 2. Desktop topology v2 — retained baseline

**Repeated physical traversal passes on the current stacked dual-display host.** Broader topology coverage remains compatibility work rather than the current product blocker.

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

### 3. Spider Brain v1 — active work

The desktop pet is moving from direct cursor following to a real behaviour layer.

Current state model:

`REST <-> WANDER -> OBSERVE -> APPROACH -> STALK -> POUNCE`

Core contract:

- **the mouse is a stimulus, not the default destination**;
- ordinary or distant cursor motion does not make the spider chase;
- repeated nearby activity raises attention and may escalate behaviour;
- `OBSERVE` turns toward a stimulus without walking into it;
- `APPROACH` moves toward a stand-off distance rather than onto the cursor;
- `STALK` closes more carefully and can convert a fast sweep-and-stop into `POUNCE`;
- after a strike the spider reassesses instead of immediately resuming permanent follow;
- when uninterested, `REST` and short local `WANDER` bouts provide autonomous motion.

`src/brain.js` owns this state and emits only behavioural targets. It does not manipulate legs, footholds, host windows or screen coordinates.

Determinism:

- runtime may use normal randomness for autonomous choices;
- tests may reset Brain with a fixed seed;
- seeded choices must be reproducible;
- behavioural tests protect the important semantic rules, especially “default does not follow the mouse”.

Still required before Brain v1 is retained:

- local real-time visual smoke on the desktop host;
- tune trigger thresholds so normal computer use rarely causes unwanted pursuit;
- confirm deliberate nearby teasing reliably produces `OBSERVE -> APPROACH/STALK`;
- confirm pounce feels occasional and earned rather than twitchy;
- decide whether local wandering frequency/distance feels alive or distracting.

### 4. Repository hygiene

- `README.md`: what the project is and how to run it.
- `docs/current.md`: current version, priorities, known open problems.
- `docs/architecture.md`: durable runtime boundaries and accepted architectural direction.
- `docs/verification.md`: reproducible checks and pass criteria.
- `docs/agent-workflow.md`: coding-agent operating contract.
- `docs/glossary.md`: shared motion/animation vocabulary.
- `progress.md`: append-only historical record of verified experiments; never the current task list.

Remove stale TODOs, superseded claims, dead code and obsolete tests as the affected area is touched.

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

1. Brain v1 thresholds and cadence still need real-host perceptual tuning.
2. Other physical layouts (left/right, unequal scales, three screens) still need real traversal smoke.
3. Non-rectangular/partially overlapping screen layouts may eventually need topology-aware path routing so the pet does not walk through an off-screen gap in the desktop bounding box.
4. Locomotion may still have minor visual residuals such as transient adjacent-leg crossings, but its architecture is no longer the current blocker.
5. When displays use different backing scales, the spider may change apparent size while the moving window crosses between them; this is non-blocking visual polish.
