# Current state

This file is the source of truth for **what the project is doing now**. Historical experiments and old failures belong in `progress.md`; they are not current TODOs unless repeated here.

## v0.2 — Natural Motion

Goal: make Spider a visually believable desktop creature before adding product features or a production art pipeline.

### 1. Locomotion v2 — first priority

Migrate from the current foot-authoritative planner toward **body-authoritative kinematic locomotion**:

- motion controller owns desired body velocity and heading;
- planted feet stay visually locked to the ground during stance;
- gait schedules replants and predicts footholds from body motion;
- IK solves the visible leg pose;
- reach/collision/support constraints correct the motion or foothold instead of routinely vetoing body movement;
- straight walking and large-angle turns should remain continuous rather than falling into replant pauses or run-in-place;
- reduce visible adjacent-leg crossings and overly mechanical timing.

First retained v0.2 migration step: turn replants may now make a small support-checked body translation instead of forcing `advance = 0`. Heading remains stable while feet are in flight; an earlier experiment that also rotated during swing caused repeated replants and was rejected. Deterministic routes now gate against restoring the hard freeze via `turnReplantTravel`.

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

1. Straight gait and turning still need perceptual tuning beyond the first no-hard-freeze migration step; occasional adjacent-leg crossings remain.
2. Real multi-screen cursor mapping/reachability is still not trusted across arbitrary layouts and repeated crossings.
3. Historical docs contain superseded failures and TODOs that must not be mistaken for current state.
4. Current pet behavior is still too directly driven by cursor motion to feel autonomous.
