Original prompt: 走路的时候还是有时候会卡住

TODO: make gait deadlocks reproducible with a deterministic route check.

2026-07-26: fallback stride candidates added for blocked foot placement; `?selftest=stress` passed 52 steps across five alternating turns with 10.77 px minimum foot separation.

2026-07-26: fast straight gait now swings a second safe leg from the same alternating tetrapod set; stress route passed with 10.32 px minimum foot separation.

2026-07-26: doubled fast-follow stride, body advance cap, and swing cadence; stress route still passed with 10.11 px minimum foot separation.

2026-07-26: moved all coxae to an anterior-to-posterior fan on the prosoma and sized the stance spread by P. regius leg-pair length; stress route passed with 10.00 px minimum foot separation.

2026-07-26: body now follows the scanned female P. regius 7.6:4.1 opisthosoma/prosoma length ratio, separated by a narrow pedicel; stress route passed with 10.04 px minimum foot separation.

2026-07-26: added the pair of short prosomal pedipalps, separate from the eight walking legs; stress route passed with 10.02 px minimum foot separation.

2026-07-26: abdomen now has independent pedicel sway, pedipalps alternate exploratory flicks, and leg radii are pair-specific and thicker; stress route passed with 10.01 px minimum foot separation.

2026-07-26: replaced the one-direction distal C-curve with a CT-inspired tibia–metatarsus counter-fold; added tapered segment meshes (femur/patella fuller, tarsus narrow) and paired tarsal claws. `?selftest=stress` passes deterministically: 60 steps, 10.03 px minimum planted-foot separation, no console errors.

2026-07-26: expanded only the first two pairs' forward placement sectors, retaining the reachable stride length after oversized front steps caused a straight-line stall. Removed the non-anatomical toe spheres; the terminal now ends in the paired claws. Straight, curve, reversal, and stress checks all pass (minimum gap 10.05 px; no console errors).

2026-07-26: added a touchdown-forwardness gate measured from the prosoma's front edge. It correctly fails the current straight gait: one first-pair landing is only +6.9 units forward and one second-pair landing is -3.2 behind the edge; tune the target only after this gate is in place.
