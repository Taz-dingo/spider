# Architecture

## Runtime boundaries

The app intentionally uses ordered classic scripts instead of a build system. This keeps the browser experiment runnable from a plain `index.html` or the desktop-pet shell while separating the largest behavioral concerns.

```text
index.html
  -> app.js                 scene, body, renderer, render-loop helpers
  -> src/motion.js          body-level intent: target heading / speed
  -> src/brain.js           desktop-pet behaviour state + stimulus interpretation
  -> src/gait.js            body correction, stance/swing, predicted footholds
  -> src/self-test.js       deterministic route evaluator
  -> src/desktop-pet-v2.js  pet-only camera / native pose bridge adapter
  -> src/bootstrap.js       input listeners and startup
```

`app.js` owns shared scene state. Later scripts read the same lexical bindings and expose functions consumed by the render loop; `bootstrap.js` is deliberately last.

The zero-build browser core is a project constraint, not a claim that every future production asset must be procedural geometry.

## Behaviour architecture

Spider Brain v1 sits above Motion Controller. The desktop cursor is **perception input**, not a permanent locomotion target.

```text
Desktop stimuli
  -> Brain (`src/brain.js`)
     REST / WANDER / OBSERVE / APPROACH / STALK / POUNCE
     attention + short-lived state
  -> behavioural target
  -> Motion Controller
  -> Gait / IK
```

### Brain ownership

**Brain owns what the spider wants to do next.** It may ignore a stimulus, look toward it, approach to a stand-off distance, stalk more closely, pounce, rest, or wander locally.

Brain must not:

- manipulate individual legs or footholds;
- override stance foot locking;
- place the native pet window;
- convert screen coordinates;
- implement its own walking physics.

The important product contract is that mouse motion is not equivalent to `followCursor()`. Ordinary or distant cursor motion should usually have no locomotion effect. Repeated nearby motion can accumulate enough attention to escalate behaviour.

### Determinism

Autonomous choices may use normal randomness at runtime, but Brain accepts a fixed seed for tests. Tests should protect semantic properties rather than one exact animation timeline: default non-follow, observe-before-chase, stand-off approach, earned pounce, deterministic seeded choices.

The plain browser `?pet=1` path remains an explicit continuous-follow locomotion harness for older low-level regression tests. The real WKWebView host enables Brain by default through its native `petPose` bridge; browser Brain tests opt in with `?brain=1`. Product behaviour is Brain-owned, not the harness path.

## Motion architecture

Locomotion v2 is structurally **body-intent-first**:

```text
Brain / pointer / route goal
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

**Motion Controller owns movement intent.** It does not know which leg is planted, which foot needs to move, or whether a support polygon is comfortable. It answers where the creature wants to face and how fast it wants to move toward the behavioural target.

**Gait owns visual explanation and correction.** It keeps planted feet in world space, predicts near-future body pose, schedules replants before a leg reaches its limit, chooses footholds for the expected touchdown pose, and solves the remaining geometric constraints.

**Constraints are guardrails, not the engine.** Reach and stance-sector checks are split into two bands:

- a comfort envelope: pressure here reduces/corrects body motion continuously and encourages replants;
- a hard perceptual envelope: only this may veto motion completely because continuing would create an obviously implausible leg pose.

This replaces the old pattern where one unsupported quarter-step could collapse body motion directly to zero.

### Current compromises

- Turn plans still identify blocker legs and coordinate turn-specific replants; they no longer own the desired heading.
- The current procedural leg solver/rendering remains the debug/reference implementation rather than the future production character rig.
- Transient adjacent-leg crossings remain a possible visual residual and should be solved with foothold/adjacent-pair coordination rather than stricter body freezing.
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

### Desktop Topology v2 principle

**The desktop world is global; the render window is local.**

Do not use the native window frame as the coordinate system for locomotion. `NSScreen` topology defines one stable page/world frame for the whole desktop. The pet window is only a viewport centred on the spider.

```text
NSScreen frames
  -> desktop union (global Cocoa points)
  -> HostGeometry.mouseToPage(...)
  -> global page/world mouse stimulus
  -> Brain -> Motion + Gait
  -> global page/world spider pose
  -> JS petPose bridge
  -> HostGeometry.pageToGlobal(...)
  -> fixed-size transparent NSWindow centred on spider
```

This intentionally replaces the old design:

```text
one giant transparent desktop-union NSWindow/WKWebView
```

A reported union-sized window frame was not sufficient evidence that WebKit pixels actually traversed physical displays. A normal-sized window moving through AppKit display topology gives a much smaller, more observable boundary.

### Host ownership

The host layer owns:

- live `NSScreen` topology and desktop union;
- global cursor coordinates;
- global Cocoa <-> page/world conversion;
- fixed-size native pet-window placement from the page-published spider pose;
- display-change recalculation;
- real-host trace/probe evidence.

The page layer owns:

- perception interpretation and behaviour state;
- locomotion and global spider world pose;
- a pet-only camera centred on that world pose;
- publishing the rendered pose to native after each pet render.

The moving native window must never redefine mouse or world coordinates. This prevents a feedback loop where moving the window moves the coordinate origin under the cursor.

`PetWindow` overrides `constrainFrameRect` and returns the requested frame unchanged. AppKit otherwise constrains this borderless floating window to the active display's visible frame when displays use separate Spaces; that silently pins the viewport at a seam even though the page/world coordinates are correct. The override is limited to this dedicated click-through pet window so normal AppKit windows retain their usual screen constraints.

### Topology gaps

The desktop union is a bounding rectangle, while real multi-screen topology may be non-rectangular. Topology v2 first establishes reliable physical display crossing. If a layout has off-screen gaps between partially overlapping screens, later path planning may need to route through shared screen edges rather than moving straight through empty union space.

Multi-screen correctness must still be verified end-to-end on a real macOS host; synthetic geometry alone does not prove pixels appeared on another physical display.
