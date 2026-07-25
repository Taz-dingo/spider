Original prompt: 走路的时候还是有时候会卡住

TODO: make gait deadlocks reproducible with a deterministic route check.

2026-07-26: fallback stride candidates added for blocked foot placement; `?selftest=stress` passed 52 steps across five alternating turns with 10.77 px minimum foot separation.

2026-07-26: fast straight gait now swings a second safe leg from the same alternating tetrapod set; stress route passed with 10.32 px minimum foot separation.

2026-07-26: doubled fast-follow stride, body advance cap, and swing cadence; stress route still passed with 10.11 px minimum foot separation.
