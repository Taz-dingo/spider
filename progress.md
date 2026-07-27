Original prompt: 走路的时候还是有时候会卡住

TODO: make gait deadlocks reproducible with a deterministic route check.

2026-07-27: removed the transient body-collision render guard after it made individual procedural leg segments disappear during turns. Collision detection remains available to the route checks; rendering now keeps every leg continuous.

2026-07-27: added a native, live leg-tuning panel for all four pairs: effective length, coxa x/z, forward foothold, lateral spread, and sector. Changes immediately rebuild the matching two leg chains and stance; reset restores the verified defaults without reloading.

2026-07-27: calibrated the procedural effective lengths of pairs 1 and 4 to their reachable foothold radii (8.5/8.6 vs 8.4 for pairs 2/3) and set their minimum safe outer stances to 30/46 (12.65-unit planted-foot clearance). Their former excess length could only fold upward in the planar IK, producing the head-thorax penetration; a static browser check now finds zero penetrating segments for every pair. The renderer now also suppresses any transient segment the existing body-intersection helper identifies during a turn, so it cannot visibly pierce the body.

2026-07-27: moved the procedural walking pair 1 coxa roots from the eye-area centre to the anterior-lateral prosoma (`{x: 21, z: 12}`), so their visible coxae exit the carapace side rather than the head. The straight route completed 23 steps without timeout and kept coxa shell error at 8e-16; its pre-existing body-penetration gate remains non-green (385).

2026-07-27: confirmed the two upright, constantly moving front appendages in the procedural view are pedipalps, not walking pair 1. They now hold still during walking and retain only a small idle exploratory flick; isolated headless-browser smoke check confirmed stable local palp positions while the spider advances.

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

2026-07-26: moved the first/second-pair stance anchors forward and shortened their extra stride, so the feet land in front without exceeding support reach. All four route checks pass; straight-route forwardness is now +24/+24 for L1 and +18.9/+15.1 for L2 beyond the prosoma edge.

2026-07-26: turning now accepts up to 5.2 rad/s (was 3.4), and turn replants use the fast swing duration. The full reversal route fell from about 10.0 s to 8.1 s while straight, curve, reversal, and stress checks all retained reach, sector, and foot-gap passes.

2026-07-26: reordered the four stance lanes to match the coxae's lateral order (L1/L4 inner, L2/L3 outer) and added a 3D distal-leg collision check. The check only reports a crossing when projected segments meet at nearly the same height; crowded proximal segments sit inside the prosoma and are excluded. Straight, curve, reversal, and stress routes now have zero distal collisions.

2026-07-26: clipped the visible coxa segment to its exit point on the ventrolateral prosomal ellipsoid, so leg geometry starts at the shell rather than inside the body without perturbing the tested foot-placement sectors.

2026-07-26: route checks now also assert that every rendered coxa start lies on the prosomal shell, so a future gait change cannot silently restore body penetration.

2026-07-26: inspected the downloaded CC BY-NC Habronattus scan: 57 MB / 941.8k triangles, 0 skins and 0 animations. It is a useful anatomical reference, but not a viable direct replacement for the interactive rig without Blender retopology and manual skinning.

2026-07-26: Blender 5.2.0 LTS imported the scan successfully: 26 mesh chunks, 1.49M vertices, 931,974 polygons, and no armature. Preparing a decimated GLB is the first practical migration gate before rigging.

2026-07-26: prepared a first rigging probe: seven bones per leg plus a body bone and Blender envelope weights. This only tests whether the scan can become a skinned GLB; production quality still requires weight painting against the observed gait.

2026-07-26: the automatic-weight probe exported a 58-joint skin, but Blender heat weighting failed on several hairy/non-manifold scan chunks, leaving meshes without a skin. Do not integrate this rig test; the scan needs manual mesh cleanup/segmentation and weight painting.

2026-07-26: next probe joins the glTF export chunks before heat weighting, preserving the texture while removing the exporter-imposed object boundaries.

2026-07-26: joining reduced heat-weight failures to one but did not eliminate them. The next rigging probe replaces Blender heat weighting with deterministic nearest-bone weights; this creates a complete technical skin, not final artist-painted weights.

2026-07-26: deterministic nearest-bone weighting exported one mesh with a complete 57-joint skin (all primitives have JOINTS_0/WEIGHTS_0). A Blender pose render confirms a distal leg bone can deform the actual scan without vertex explosions, but the hard, proximity-based transitions are only a migration proof; do not substitute it for the procedural walking character until the leg regions are segmented and their weights are painted/tested through gait routes.

2026-07-26: added a Blender-only rig regression probe that rotates every leg joint and measures affected vertices, maximum displacement, and core-body drift without needing a screenshot. It currently fails: several terminal joints have zero influenced vertices, so the nearest-bone result is structurally a valid glTF skin but not a complete functional leg rig. This blocks browser integration until the scan can be retopologized/segmented and painted.

2026-07-26: surveyed replacements. The only clearly animated free spider found has walk/run/jump clips but carries a NoAI flag and CC BY-NC-ND, so it must not be used as an AI-project input. A CC BY rigged 5.4k-triangle spider is the cleanest browser-pipeline candidate, but it is not a jumping-spider anatomy match and needs its downloadable bundle inspected before adoption.

2026-07-26: the candidate's public download endpoint requires an authenticated Sketchfab session. Do not use the user's personal Arc session; inspect the candidate only after a copy is supplied locally or the in-app browser is signed in.

2026-07-26: received the CC BY Spider - Rigged FBX. It has one 2.7k-face skinned mesh and a 155-bone armature (including four L/R leg chains and pedipalps), but no pre-authored actions. The eight leg-root bone checks pass. Exported a 16 MB textured GLB locally and added attribution; it is visually valid and suitable for browser-side bone-driven gait work.

2026-07-26: browser integration now loads the textured rigged GLB and maps the existing step state to each of its eight leg-root bones. Deterministic straight, curve, reversal, and stress routes all pass with the rigged renderer. Browsers block GLB fetches from file://, so the real-model path is intentionally served through localhost; file:// keeps the procedural fallback with an on-screen explanation.

2026-07-26: visually inspected the browser-rendered model during walking and mid-pounce. The pounce state reports `jumping: true` while the rigged model remains active; the file:// fallback reports `procedural` and shows the localhost explanation without model-load errors.

2026-07-26: fixed the browser animation mapping: the legacy loader removes `.` from Blender bone names, so the first integration found no leg roots and produced zero motion. The eight roots now resolve as `Bone001_*` through `Bone004_*`; walking drives their base, knee, and distal joints plus the pedipalps. Stress now requires and records at least 0.2 rad of real rig rotation (observed 0.379 rad) in addition to the existing gait checks.

2026-07-26: replaced root-bone waving with browser-side CCD IK. The real model's eight terminal bones now solve directly to the gait planner's planted contact targets; the asset's short first chain was identified as a pedipalp, so its `.005–.011` sibling is used as walking leg 1. The old procedural claws are hidden while the rig is active, eliminating the misleading black second set of feet. The autonomous route suite now measures real terminal-bone contact error: straight 4.17, curve 4.49, reversal 9.74, stress 6.03 (all below the 12-unit threshold) with no crossings.

2026-07-26: confirmed the apparent extra front limbs are not mapped as walking legs: walking pair 1 is the `.005–.011` chain, while the short sibling chain remains a palp. Real IK targets now lift 24 units during a swing instead of sliding across the floor. Route self-checks also count completed steps per walking pair; straight recorded [8, 5, 6, 6], proving the fourth pair is scheduled and completes steps.

2026-07-26: fixed the remaining visible front-limb deformation: the source rig's named target bones have mesh weights, so repositioning them pulled short facial appendages. CCD now uses detached, unskinned scene targets instead. Straight, curve, reversal, and stress pass with all four walking pairs stepping; stress recorded [23, 15, 15, 15], 5.93 maximum contact error, and zero crossings.

2026-07-26: corrected the actual walking-chain map after inspecting per-chain mesh weights rather than bone names. `Bone.001` and its `.005` branch are front short appendages, not walking pair 1. The real four pairs are now `Bone.002`, `Bone.003`, `Bone.004`, and rear `Bone_L/R`. Curve contact error dropped from 4.49 to 0.12 after the remap, and all eight real terminal bones resolve to their targets.

2026-07-26: jump no longer holds feet to ground targets: the rig restores its natural pose while airborne, removing the vertical-strut failure. Walking joints now derive their hinge axis from each source chain's rest-pose three-joint plane instead of sharing a guessed global axis; curve contact error is 3.17 and the visual fold remains in the source limb plane.

2026-07-26: reverted the later Bone.002–Bone_L/R remap and automatic hinge experiment after it visibly regressed into cross-body tangling. The pre-regression mapping uses the `.005` front branch with Bone.002/.003/.004 and remains the more stable rendered pose; curve passes again with 4.49 terminal error and zero crossings.

2026-07-26: restored the anatomical map after that rollback proved incorrect: the four walking pairs are Bone.002, Bone.003, Bone.004, and rear Bone_L/R; neither Bone.001 front chain is in the IK list. Curve terminal error is 0.13 with all eight real terminals resolving to their assigned contacts.

2026-07-26: added `M` model switching. It toggles between the textured rigged spider and the prior procedural seven-segment spider without rendering both leg sets; browser verification confirmed rigged → procedural → rigged transitions.

2026-07-26: split the runtime into gait, self-test, rig-adapter, and bootstrap scripts while retaining the no-build browser entrypoint. Added `AGENTS.md` plus architecture, verification, and agent-workflow documentation so future iterations have explicit ownership boundaries and reproducible checks.

2026-07-26: restored the procedural spider as the default model. Its leg renderer now suppresses any segment that analytically crosses the enlarged prosoma/abdomen envelopes. The stable gait is advanced twice per rendered frame, doubling movement and turn rate while preserving its existing foothold rules; self-tests now reset heading and turn state before each route.

2026-07-27: added deterministic adversarial turning coverage plus measurable gait penalties: foot travel per body travel, foot motion without goal progress (twitch time), and longest stalled interval. Added `window.evaluateGaitCandidates(candidates)` to run five routes for each candidate and rank them without manual screenshots. Initial four-candidate search found that avoiding the adversarial timeout can increase twitch time, so no candidate is promoted automatically.
2026-07-27: prevented tuning-panel pointerdown events from reaching the pounce handler; slider clicks and drags now leave the spider's jump state unchanged.
