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
  -> src/rigged-spider.js GLB loader + CCD IK adapter
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
  -> rig adapter (when enabled) -> GLB CCD IK
```

The procedural foot targets are authoritative. The rig adapter must only map
them to imported bones; model-specific experimentation belongs there rather
than in the planner unless the physical gait rule itself changes.

## Assets

The rigged asset is local and ignored by Git. Its provenance is documented in
`assets/models/ATTRIBUTION.md`. The procedural spider is the zero-asset,
offline fallback.
