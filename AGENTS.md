# Spider project guidance

## Start here

1. Read `README.md`, then `docs/current.md`.
2. Read only the relevant durable reference: `docs/architecture.md`, `docs/verification.md`, `docs/glossary.md`, or `docs/agent-workflow.md`.
3. Inspect the affected runtime boundary before changing code. Do not infer the current task from old entries in `progress.md`.

`docs/current.md` is the source of truth for current priorities. `progress.md` is historical evidence only.

## Operating contract

Use an evidence-first loop:

`observe current state -> state a hypothesis -> make the smallest reversible change -> verify -> decide -> record evidence`

- Keep one iteration focused on one runtime concern when possible.
- Prefer a small experiment that can be measured and reverted over a broad rewrite based only on intuition.
- Record uncertainty explicitly. A synthetic green test is evidence for the layer it runs, not proof that a real desktop behavior is solved.
- Do not preserve old behavior merely because `progress.md` once described it as intentional; check `docs/current.md` and `docs/architecture.md` first.
- Do not add duplicate control paths. Put responsibility in the existing owner or create one clearly named boundary.

## Project rules

- Preserve the zero-build browser core unless the task explicitly changes that architecture.
- The current procedural spider is the debug/reference representation, not a permanent restriction on production rendering.
- v0.2 is migrating toward body-authoritative kinematic locomotion with procedural gait + IK. The current code may still contain foot-authoritative legacy logic during the migration.
- A future rigged production mesh is allowed behind a clean motion/render boundary; do not introduce it as part of v0.2 unless `docs/current.md` changes.
- Behavior randomness must be seedable so automated tests remain deterministic.
- Do not use or control the user's personal browser session. Browser checks use a separate local/headless browser against `localhost`.
- The desktop product runs in macOS `WKWebView`; Playwright Chromium is test-only. Never run `playwright install` or `playwright-core install`; use an already-installed local Chrome/Chromium executable for browser checks, and report the missing executable instead of downloading another version.
- Never move or synthesize the user's system cursor during verification (including `CGWarpMouseCursorPosition`); use isolated browser `window.__petMouse` inputs for Brain interaction and reserve the native host for passive/idle traces.
- Make focused Git commits for completed iterations. Repository writes must not leave successful work only in an unpushed local checkout.

## Verification truth levels

Use the narrowest relevant layer, and never overclaim what it proves:

- **L1 browser/simulation**: gait, behavior and rendering logic with synthetic inputs.
- **L2 host geometry**: deterministic Swift coordinate/topology formulas.
- **L3 real host integration**: actual macOS window, screen and cursor bridge.
- **Manual visual smoke**: perceptual quality that metrics do not fully capture.

For core motion or desktop-host changes, run the relevant checks in `docs/verification.md`; before declaring an iteration complete, the full regression suite should be green unless the work is explicitly an exploratory experiment that is reverted or clearly recorded as unresolved.

For visual changes, pair metrics with a reproducible visual scenario. A screenshot or “looks better” judgment alone is not a regression test.

## Documentation ownership

- `README.md`: project identity, run instructions and code map.
- `docs/current.md`: current version, priorities, scope and known open problems.
- `docs/architecture.md`: durable runtime boundaries and accepted architectural direction.
- `docs/verification.md`: reproducible checks and pass criteria.
- `docs/agent-workflow.md`: detailed coding-agent operating loop and handoff rules.
- `docs/glossary.md`: shared motion/animation vocabulary.
- `docs/bionics.md`: biological references and reusable observations, not current priorities.
- `progress.md`: append-only dated trajectory of verified experiments and outcomes.

Nested `AGENTS.md` files, if introduced later, override this file for their subtree.
