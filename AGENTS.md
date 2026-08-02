# Spider project guidance

## Start here

1. Read [README.md](README.md), then the relevant document in `docs/`.
2. Keep a change within one runtime concern when possible: procedural geometry,
   gait, desktop-pet shell, or verification.
3. Verify the behavior that changed before committing. Update `progress.md` with
   factual results, not an intention.

## Project rules

- Preserve the dependency-free browser setup. Do not add a bundler or framework
  merely to move code between files.
- The procedural gait is the planner and the only model; do not reintroduce
  imported assets or a rig adapter.
- Do not use or control the user's personal browser session. Browser checks use
  a separate local/headless browser against `localhost`.
- Make one focused Git commit for every completed iteration, including an
  experiment that is intentionally retained or reverted.
- Immediately push every successful commit to `origin/main`, then verify the
  local branch tracks the pushed remote commit. Do not leave committed work
  only on this machine.

## Required checks

Run the relevant commands from `docs/verification.md`. At a minimum, syntax
check every changed JavaScript file and run the deterministic route that covers
the changed behavior. A visual change also needs a local browser check.

## Documentation ownership

- `docs/architecture.md`: runtime boundaries and data flow.
- `docs/verification.md`: reproducible checks and pass criteria.
- `docs/agent-workflow.md`: operating contract for coding agents.
- `progress.md`: dated, concise record of verified behavior changes.

Nested `AGENTS.md` files, if introduced later, override this file for their
subtree.
