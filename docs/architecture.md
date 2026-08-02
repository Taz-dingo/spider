# Architecture

## Runtime boundaries

The app intentionally uses ordered classic scripts instead of a build system.
This keeps it runnable from a small local HTTP server while separating the
largest behavioral concerns.

```text
index.html
  -> app.js              scene, body, renderer, render loop helpers
  -> src/gait.js         foothold planner and turning
  -> src/self-test.js    deterministic route evaluator
  -> src/bootstrap.js    input listeners and startup
```

`app.js` owns the shared scene state. Later scripts read the same lexical
bindings and expose functions consumed by the render loop; `bootstrap.js` is
therefore deliberately last.

## Motion data flow

```text
pointer / route goals
  -> gait planner
  -> eight foot targets + swing state
  -> procedural FABRIK renderer
```

The procedural foot targets are authoritative. The procedural spider is the
zero-asset, offline-renderable model; desktop-pet mode (`?pet=1`) reuses the
same planner with the global cursor and window bounds injected by the Swift
shell (`desktop/SpiderPet.swift`) instead of page pointer events.
