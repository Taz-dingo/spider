# Architecture

## Runtime boundaries

The app intentionally uses ordered classic scripts instead of a build system. This keeps the browser experiment runnable from a plain `index.html` or the desktop-pet shell while separating the largest behavioral concerns.

```text
index.html
  -> app.js              scene, body, renderer, render-loop helpers
  -> src/gait.js         locomotion / foothold logic
  -> src/self-test.js    deterministic route evaluator
  -> src/bootstrap.js    input listeners and startup
```

`app.js` owns shared scene state. Later scripts read the same lexical bindings and expose functions consumed by the render loop; `bootstrap.js` is deliberately last.

The zero-build browser core is a project constraint, not a claim that every future production asset must be procedural geometry.

## Motion architecture

### Current v0.1 implementation

The existing code is still largely **foot-authoritative**:

```text
pointer / route goal
  -> gait planner
  -> foot targets + swing/support constraints
  -> allowed body advance
  -> procedural FABRIK renderer
```

This architecture produced useful gait experiments and deterministic tests, but hard support/replant gates can also create mechanical pauses, twitch and run-in-place behavior.

### v0.2 target

Locomotion v2 moves toward **body-authoritative kinematic locomotion**:

```text
Behavior / target intent
  -> Motion Controller
     desired body velocity + heading
  -> Body trajectory
  -> Procedural gait
     stance/swing scheduling + predicted footholds
  -> Foot locking + IK
  -> Final pose
     -> procedural debug spider
     -> future production rigged mesh
```

Principles:

- body motion owns the continuous trajectory;
- planted feet are visually world-locked during stance;
- gait and IK explain the body motion rather than routinely vetoing it;
- reach, collision and support constraints correct body speed/footholds when needed, but should not collapse normal movement to `advance = 0` without a strong reason;
- perceptual realism is the objective; full biomechanical dynamics are not required.

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
