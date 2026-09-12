# Architecture

## Runtime boundaries

The app intentionally uses ordered classic scripts instead of a build system. This keeps the browser experiment runnable from a plain `index.html` or the desktop-pet shell while separating the largest behavioral concerns.

```text
index.html
  -> app.js              scene, body, renderer, render-loop helpers
  -> src/motion.js       body-level intent: target heading / speed
  -> src/gait.js         body correction, stance/swing, predicted footholds
  -> src/self-test.js    deterministic route evaluator
  -> src/bootstrap.js    input listeners and startup
```

`app.js` owns shared scene state. Later scripts read the same lexical bindings and expose functions consumed by the render loop; `bootstrap.js` is deliberately last.

The zero-build browser core is a project constraint, not a claim that every future production asset must be procedural geometry.

## Motion architecture

Locomotion v2 is now structurally **body-intent-first**:

```text
Behavior / pointer / route goal
  -> Motion Controller (`src/motion.js`)
     desired heading + desired speed
  -> body pose request
  -> soft gait correction (`src/gait.js`)
     comfort envelope -> slow/correct
     hard perceptual envelope -> absolute guardrail
  -> predictive gait
     stance/swing scheduling + future-pose footholds
  -> planted-foot lock + procedural IK/rendering
  -> Final pose
     -> procedural debug spider
     -> future production rigged mesh
```

### Ownership

**Motion Controller owns intent.** It does not know which leg is planted, which foot needs to move, or whether a support polygon is comfortable. It answers where the creature wants to face and how fast it wants to move.

**Gait owns visual explanation and correction.** It keeps planted feet in world space, predicts near-future body pose, schedules replants before a leg reaches its limit, chooses footholds for the expected touchdown pose, and solves the remaining geometric constraints.

**Constraints are guardrails, not the engine.** Reach and stance-sector checks are split into two bands:

- a comfort envelope: pressure here reduces/corrects body motion continuously and encourages replants;
- a hard perceptual envelope: only this may veto motion completely because continuing would create an obviously implausible leg pose.

This replaces the old pattern where one unsupported quarter-step could collapse body motion directly to zero.

### Current compromises

- Turn plans still identify blocker legs and coordinate turn-specific replants; they no longer own the desired heading.
- The current procedural leg solver/rendering remains the debug/reference implementation rather than the future production character rig.
- Transient adjacent-leg crossings are still a known visual residual and need foothold/adjacent-pair coordination rather than stricter body freezing.
- Automated tests protect reach, sector, crossing, support continuity and heading continuity, but perceptual quality still requires real visual smoke tests.

## Animation ownership

A future rig may combine several controllers over the same skeleton:

- **procedural**: locomotion, turning, footholds, leg IK and responsive body motion;
- **authored/baked clips**: expressive one-off actions such as threat, grooming or special idle poses;
- **secondary motion / lightweight physics**: subtle body, abdomen or appendage response where it improves visible plausibility;
- **blending**: smooth handoff between these sources.

The existing procedural spider remains valuable as a deterministic debug/reference representation even after a production rig exists.

## Desktop-pet boundary

Desktop mode (`?pet=1`) reuses the same page locomotion/rendering code but receives host data from `desktop/SpiderPet.swift`.

The host layer owns:

- live `NSScreen` topology and actual settled pet-window frame;
- global cursor coordinates;
- conversion into the page coordinate frame;
- re-homing/recalculation when display parameters change.

The page layer owns locomotion and rendering from those injected coordinates. Multi-screen correctness must be verified end-to-end on a real macOS host; synthetic browser injection alone does not prove the host bridge.
