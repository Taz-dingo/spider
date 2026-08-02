# Verification

## Static check

```sh
node --check app.js
node --check src/gait.js
node --check src/self-test.js
node --check src/bootstrap.js
```

## Deterministic gait routes

Serve the repository, then open one route at a time:

```sh
python3 -m http.server 4173
# http://127.0.0.1:4173/?selftest=straight
# http://127.0.0.1:4173/?selftest=curve
# http://127.0.0.1:4173/?selftest=reversal
# http://127.0.0.1:4173/?selftest=stress
```

An autonomous browser can read `window.render_game_to_text()` and advance a
route with `window.advanceTime(ms)`. A passing result reports `passed: true`.
It covers reach, landing sectors, planted-foot separation, distal crossing,
coxa shell placement, front-foot forwardness, and per-pair stepping.

## Manual smoke check

At `http://127.0.0.1:4173`, verify:

1. Moving the pointer causes forward-facing walking.
2. Clicking produces a jump without ground-anchored vertical legs.
3. `Space` triggers the pose without stopping rendering.

Do not use a user's personal browser window for this check.
