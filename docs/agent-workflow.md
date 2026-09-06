# Agent workflow

Spider uses a small evidence-first harness for long-running coding-agent work. The useful idea borrowed from more composable agent runtimes such as DSH is to separate **current state** from the **trajectory of experiments**, and to make every iteration observable and replayable enough that a later agent does not have to reconstruct intent from chat history.

## Durable state vs trajectory

- `docs/current.md` = compact current state: version goal, active priorities, scope, known open problems.
- `progress.md` = append-only trajectory: what was tried, what was measured, what passed/failed/reverted.
- `docs/architecture.md` = durable decisions and ownership boundaries.
- `docs/verification.md` = executable evidence and pass criteria.

Never use `progress.md` as a task list. Historical statements may have been superseded by later experiments.

## Iteration loop

Treat one coding iteration as a state transition:

```text
current state
  -> inspect relevant boundary
  -> hypothesis
  -> smallest reversible change
  -> observations / tests
  -> decision: keep | refine | revert
  -> trajectory record
  -> updated current state only if priorities or architecture changed
```

### 1. Observe

- Read `AGENTS.md` and `docs/current.md` first.
- Inspect only the runtime boundary involved in the symptom.
- Reproduce the symptom or establish a baseline metric before changing code when practical.
- Distinguish what is observed on the real macOS host from what exists only in a synthetic fixture.

### 2. Hypothesize

Write down the causal claim being tested, not merely the intended edit. Example:

> Turn twitch is primarily caused by replant logic forcing body advance to zero.

A useful hypothesis predicts an observable result and can be falsified.

### 3. Change minimally

- Prefer one causal change at a time.
- Keep experiments reversible.
- Avoid “while here” refactors unless they are required to make the boundary testable.
- Do not add a second owner for the same responsibility.

### 4. Verify at the correct layer

Evidence has layers:

1. **L1 browser/simulation** — deterministic page logic, gait, seeded behavior and rendering.
2. **L2 host geometry** — pure Swift screen/cursor coordinate formulas.
3. **L3 real host integration** — actual macOS window placement and bridge values.
4. **Manual visual smoke** — perceptual realism and interaction quality.

A pass at one layer only proves that layer. In particular, never close a real multi-screen symptom using only synthetic injection.

For perceptual changes, combine a reproducible scenario with metrics where useful. Metrics are guardrails, not the product goal: a numerically better gait that looks worse should not be accepted automatically.

### 5. Decide explicitly

Every experiment ends as one of:

- **keep** — evidence supports the hypothesis and regressions remain acceptable;
- **refine** — direction looks correct but an identified issue remains;
- **revert** — the hypothesis failed or the tradeoff is worse.

Do not leave abandoned control paths or half-enabled experiments in the runtime.

### 6. Record evidence

A `progress.md` entry should contain only facts useful to a later agent:

- symptom / hypothesis;
- exact change;
- measurements or scenarios used;
- result and regressions;
- keep/refine/revert decision;
- remaining uncertainty if any.

Do not copy a full conversational plan into `progress.md`.

## Handoff contract

At any interruption point, another agent should be able to recover from the repository alone by reading:

1. `AGENTS.md`;
2. `docs/current.md`;
3. the relevant architecture/verification doc;
4. the latest relevant `progress.md` entries and commits.

If that is not sufficient, improve repository state rather than relying on hidden chat context.

## Context discipline

- Keep `docs/current.md` short enough to read every session.
- Keep durable rules close to the code in `AGENTS.md` / `docs/` rather than embedding them in one-off prompts.
- Search history only when a current decision needs its evidence; do not load the entire trajectory by default.
- Preserve uncertainty instead of compressing it into a false “solved” statement.

## Special rules for Spider

- The product objective is perceptual realism, not full biomechanical simulation.
- During Locomotion v2, body motion becomes authoritative and gait/IK should visually explain it; legacy foot-authoritative constraints are migration material, not sacred invariants.
- The procedural spider remains a debug/reference representation. Production art may later be a rigged mesh consuming the same motion outputs.
- Behavior randomness must be seedable for evaluation.
- Multi-screen claims require real-host evidence on the affected topology.
