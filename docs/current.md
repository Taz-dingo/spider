# Current state

This file is the source of truth for **what the project is doing now**. Historical experiments and old failures belong in `progress.md`; they are not current TODOs unless repeated here.

## v0.2 — Natural Motion

Goal: make Spider a visually believable desktop creature before adding product features or a production art pipeline.

### 1. Locomotion v2 — first priority

The core migration from foot-authoritative motion toward **body-intent-first kinematic locomotion** is now implemented in code:

- `src/motion.js` owns desired body heading and speed;
- planted feet remain world-locked during stance;
- gait predicts near-future body pose and can trigger replants before a leg reaches its current limit;
- new footholds are chosen against the expected touchdown body pose rather than only the pose that launched the step;
- translation uses a soft comfort envelope plus a hard perceptual envelope instead of a discrete support permission switch;
- heading uses the same correction model: legs can slow/correct turning, while only the hard envelope may fully veto it;
- deterministic routes gate against visible hard freezes with support/heading stop-time metrics.

This is the intended game-style balance: **Motion Controller owns intent; gait/geometry make that intent look physically believable.** It is not a full physics simulation.

Still required before Locomotion v2 is considered visually finished:

- real perceptual smoke for long straight pursuit, shallow curves, 90°/near-180° turns, stop/reorient/resume, slow and fast pursuit;
- tune any remaining mechanical cadence or body/foot timing found visually;
- reduce the remaining transient adjacent-leg crossings with foothold / adjacent-pair coordination rather than reintroducing body freezes.

The existing procedural spider remains the debug/reference representation while this is developed.

### 2. Desktop topology v2

Treat real multi-display behavior as unsolved until verified on the host, even if synthetic tests are green.

Required direction:

- model arbitrary `NSScreen` layouts rather than one recorded dual-screen arrangement;
- keep a diagnosable chain from screen topology -> actual pet window frame -> global cursor -> page/world coordinates;
- support repeated transitions across 2+ screens, not only one main-to-secondary crossing;
- cover offsets, unequal resolutions, Retina/scaling differences, display rearrangement and edge reachability;
- synthetic geometry tests remain useful, but a real macOS smoke test is required before claiming multi-screen behavior is solved.

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

After locomotion and desktop mapping are reliable, add a small seeded behavior layer:

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

1. Locomotion's architectural migration is in place, but final perceptual tuning and the remaining occasional adjacent-leg crossings still need work.
2. Real multi-screen cursor mapping/reachability is still not trusted across arbitrary layouts and repeated crossings.
3. Historical docs contain superseded failures and TODOs that must not be mistaken for current state.
4. Current pet behavior is still too directly driven by cursor motion to feel autonomous.
