# Agent workflow

This repository uses a small, evidence-first harness for iterative animation
work. It follows the useful Codex guidance pattern: durable repository
instructions in `AGENTS.md`, narrowly scoped tools/instructions, and repeated
evaluation of representative tasks rather than unmeasured prompt or code
changes.

## Loop

1. Read the relevant local guidance and inspect only the affected boundary.
2. State the hypothesis and make the smallest reversible change.
3. Run static and route checks; use a separate local browser for visual smoke
   testing when appearance or interaction changed.
4. Record verified outcomes and remaining uncertainty in `progress.md`.
5. Commit the iteration with a focused message, immediately push it to
   `origin/main`, and verify the local branch tracks the pushed commit.

## Guardrails

- A green procedural route does not prove imported-rig anatomy is correct;
  inspect both the planner metrics and the enabled model.
- Keep test thresholds explicit. New failures should add a measured condition,
  not a screenshot-only judgment.
- Avoid accumulating duplicate control paths. Put a new responsibility in the
  existing module that owns it, or create one clearly named module.
- Treat external model provenance and license as release constraints.

The [OpenAI Codex customization guidance](https://developers.openai.com/codex/concepts/customization#agents-guidance)
places durable repository conventions and verification near the code; the model
guidance also recommends lean, task-specific instructions and representative
evaluation after changes. This project applies those principles without
introducing an agent runtime dependency.
