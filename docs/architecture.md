# Architecture

## Runtime boundaries

The app intentionally uses ordered classic scripts instead of a build system. This keeps the browser experiment runnable from a plain `index.html` or the desktop-pet shell while separating the largest behavioral concerns.

```text
index.html
  -> app.js                 scene, body, renderer, render-loop helpers
  -> src/motion.js          body-level intent: target heading / speed
  -> src/gait.js            body correction, stance/swing, predicted footholds
  -> src/self-test.js       deterministic route evaluator
  -> src/desktop-pet-v2.js  pet-only camera / native pose bridge adapter
  -> src/bootstrap.js       input listeners and startup
```

`app.js` owns shared scene state. Later scripts read the same lexical bindings and expose functions consumed by the render loop; `bootstrap.js` is deliberately last.

The zero-build browser core is a project constraint, not a claim that every future production asset must be procedural geometry.

## Motion architecture

Locomotion v2 is structurally **body-intent-first**:

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
  -> global page/world mouse target
  -> Motion + Gait
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

- locomotion and global spider world pose;
- a pet-only camera centred on that world pose;
- publishing the rendered pose to native after each pet render.

The moving native window must never redefine mouse or world coordinates. This prevents a feedback loop where moving the window moves the coordinate origin under the cursor.

### Topology gaps

The desktop union is a bounding rectangle, while real multi-screen topology may be non-rectangular. Topology v2 first establishes reliable physical display crossing. If a layout has off-screen gaps between partially overlapping screens, later path planning may need to route through shared screen edges rather than moving straight through empty union space.

Multi-screen correctness must still be verified end-to-end on a real macOS host; synthetic geometry alone does not prove pixels appeared on another physical display.
