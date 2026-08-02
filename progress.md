2026-08-02: pet follow regression fix + strike redesign. Root cause of "not following": petMouseActive only refreshed on frame moves >2.5 units, so slow guiding (common) fell into idle after 6 s; any frame move >0 now keeps follow active. The pounce is redesigned so guiding is never interrupted: a strike needs a fast sweep (>22 units/frame) that then STOPS (next frame <3) with the cursor within 250 of the spider, plus the 2 s cooldown; a moving cursor always follows. Verified: 8 s of +1/frame move stays follow, fast continuous guiding follows without pouncing, sweep-then-stop near the spider pounces to the stopped cursor, slow move after a strike resumes follow.
2026-08-02: pet behaviour state machine + pounce fixes. (1) Pounce now needs two consecutive large cursor steps (frame move >22 with previous frame >8) plus a 2 s cooldown, so a normal mouse pickup/drop or slow move never triggers it; the jump target is the real clamped cursor, not the window-edge projection. (2) Behaviour states: follow (cursor moving, window-edge projection active) / idle (cursor resting >6 s: wander to random spots, rest 2-5 s, repeat; any cursor move returns to follow). (3) Window flatten is more visible: scaleY 0.62 and height 11 -> 5, only in pet mode (web page has no window injection). Verified in Playwright: slow move no-pounce, continuous fast sweep pounce, idle wander +220 units, flatten 0.69-on-approach/0.62-steady, unflatten on leave. Fixes two bugs found en route: pounce distance check used the stale pointer, and `moved` was scoped inside the petMouseLast guard (first-frame ReferenceError froze the pet render).
2026-08-02: desktop-pet interactions: a fast cursor sweep now pounces (motion >= 12 units/frame, pet page only, same jump as click) and the spider flattens against a window frame once within 46 units of the projected edge target (body scaleY 0.78, height 7, smoothed). Verified in Playwright: projection, pounce trigger, flatten on arrival all confirmed.

## 残余问题（详细版见 docs/bionics.md）

- 3-4 对足瞬时交叉（1-2 帧/路线，legCrossings 门非绿）：相邻腿步幅耦合几何问题，5 种调度修法已全部回退，需 planner 级按对分配步幅。
- 转向 replant 期间 advance=0（先站稳再转）：adversarial twitch ~1.07s 主要来源。
- gaitEfficiency 随大步幅上升、bodyPenetrations 非零：均为信息性指标。

2026-08-02: unified leg colour: both sides now use the dark 0x172123 material (was light-grey left / dark right via legMaterials[side > 0]); palp/body shell untouched.
2026-08-02: removed the rigged GLB model support entirely; the procedural spider is now the only model. Deleted src/rigged-spider.js, vendor/GLTFLoader.js, vendor/CCDIKSolver.js, the 16 MB assets/models GLB + ATTRIBUTION, and the Blender rig tools (prepare_rigged_spider, rig_scan, test_*_rig). Removed the M model-switch key, the rig self-test gate (rigBoneMotion/rigFootError/ikLegs), and the rig/endpointError state output; page still loads and syntax-checks with zero asset dependencies. The desktop-pet shell keeps serving the repo root via pet:// with the procedural model.
2026-08-02: added the desktop-pet shell (Swift + WKWebView, zero permissions/dependencies). The borderless, click-through, always-on-top window spans the screen and serves the repo root via a custom pet:// scheme; the page's ?pet=1 mode follows the global cursor (NSEvent.mouseLocation) and desktop window bounds (CGWindowList) injected at 60 Hz. A cursor inside any desktop window projects the target to that window's nearest edge +14 px, so the spider walks up to windows and creeps along their frames. Verified in Playwright that the projected targets land 580/600 within 14 px of the cursor and window-edge projections are exact; the Swift shell compiles (swiftc -O with /tmp module cache) but running the GUI shell needs a real desktop session.
Original prompt: 走路的时候还是有时候会卡住

TODO: make gait deadlocks reproducible with a deterministic route check.

2026-08-02: tetrapod gait over an 8-legged cycle, plus a landing reach guard.
The planner used to demand-trigger one or two legs per round: the middle legs
landed past the replant threshold (reach 58.7 vs 54) and re-triggered
instantly, and the rest of the batch waited past their trigger angle while
the advance check throttled the body to a quarter step.  Now a landing beyond
reach 54 is rejected (falls back to a shorter stride) and one over-extended
leg fires its whole tetrapod group at once, so every cycle leaves a fresh
support set on the ground.  Distant-cursor speed rose 35 → 65 units/s; route
elapsed: straight 1.47 → 0.97 s, curve 2.02 → 1.32, reversal 3.85 → 2.78,
stress 4.00 → 2.67, adversarial 6.43 → 4.73; straight/curve twitch is now 0.00
(was 0.25/0.23); all joint-angle, reach, sector, spacing, and rig gates stay
green (rig endpoint error 0.07).  A wider rear-pair landing sector (0.28 →
0.6) gained 3 units/s straight-line but regressed reversal/adversarial
twitch, so it was reverted.

2026-08-02: raised the turn rate cap to 5.2 rad/s (was 4.2). Live 2250-frame driving: frozen-turn frames 159 → 135; route penetrations also dropped (adversarial 1115 → 904, reversal 587 → 485). Corrected an earlier note: the rig IK "endpoint error 22.6" was a measurement artifact (swing targets are intentionally lifted 24 units off the ground foot); planted and swinging effectors both track their targets at 0.1 error, and the rig gate is green.

2026-08-02: adopted the bionic metachronal wave: within each alternating tetrapod, steps now propagate rear-to-front (Wilson 1966) instead of front-to-rear, giving a stretched rear leg replant priority over its forward neighbor. All five routes still complete with zero timeouts; adversarial stall 0.22 s → 0.12 s and twitch 3.13 s → 2.55 s, reversal stall 0.85 s → 0.45 s. The transient 3-4 leg crossing persists (1-2 frames per route, gate was already non-green): attempts to fix it by neighbor front-back ordering, wider adjacent clearance, and a lower rear replant trigger each regressed turns or stalled a route, so all three were reverted; the crossing is a stride-coupling geometry issue that needs planner-level adjacent-pair stride coordination, not a scheduling tweak.

2026-08-02: turn replants now swing every blocker leg with a mutually clear landing at once instead of one swing at a time, removing the multi-leg turn's serial foot-swapping pause. All five routes still complete with zero timeouts; adversarial stall dropped 0.43 s → 0.22 s and twitch 3.97 s → 3.13 s; a live 2250-frame driving session cut frozen-turn frames from 187 to 152. Attempted two crossing fixes and reverted both: a neighbor front-back order constraint deadlocked turns (adversarial stalled at step 1), and a 14-unit adjacent-pair foot clearance timed out the stress route; the remaining 1-2 transient leg crossings are frame-timing-dependent and the gate was already non-green.

2026-08-02: walker no longer freezes during turns or pumps in place. Body now creeps forward in an arc while heading is off by up to 1.2 rad (was: full stop until within 0.55 rad), and forward advance is fractional instead of all-or-nothing, so it glides as far as planted feet support. All five routes still complete with zero timeouts; adversarial stall dropped 1.52 s → 0.43 s and gait efficiency 20.0 → 13.3, reversal stall 1.15 s → 0.80 s. A 2250-frame random-driving session dropped frozen-turn frames from 273 to 187 and run-in-place from 1.8 s to 1.5 s. Remaining non-green gates unchanged in kind: one transient leg crossing (adversarial now peaks at 2) and the informational body-penetration count (adversarial 676 → 1083 from the arc walk); rig IK endpoint error is 22.6, identical to the pre-change 23.2 baseline.
2026-08-02: restored the missing local asset assets/models/spider_rigged_ccby.glb from the sibling checkout (gitignored, not committed). M model switching is verified again: procedural → rigged → procedural, 8 IK legs, rigged walk covers 280 units with no page errors.

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
2026-08-02: desktop pet cursor Y inversion fixed. Root cause: macOS global y points up, but the page camera shows world -z at the top of the screen, so `z = mouse.y - cy` moved the spider down when the mouse went up. The Swift host now negates the injected cursor z and derives the screen frame from the union of all `NSScreen` frames (`desktopFrame()`), which also makes cursor mapping correct on vertically stacked multi-monitor setups. Verified by swiftc build; needs a pet restart to take effect.
2026-08-02: desktop-pet performance pass. Removed the debug leftovers from `SpiderPet.swift` (full-screen `takeSnapshot` PNG every 2 s and a per-second `render_game_to_text` state dump), and cut the `CGWindowListCopyWindowInfo` window sweep from 60 Hz to 10 Hz (mouse injection stays 60 Hz). `app.js` now drops the pet render loop to ~15 fps when the spider is at rest (no jump/swing, cursor inactive for 1 s) and returns to 60 fps on any motion. Measured after restart: pet RSS 511→71 MB, WebKit GPU/WebContent ~250→~120 MB total, GPU CPU alternates 25% (walking) / ~2% (resting) instead of a constant ~30%. Pet pounce/follow suite still passes.
2026-08-02: fixed window-through and the pet's edge-creep projection. Root cause was a coordinate mismatch, not the camera tilt: the Swift window rect used `pz = -(y-minY)-height/2`, which expands to `-(y-midY)-height` — one full screen height off from the injected cursor convention `z=-(y-midY)` — and the page-side inside-test `z < wz && z > wz-wh` was inverted for the z-down world. Swift now injects the window top edge at `pz = -(y+h-midY)` (z-down, same as the cursor), and the page tests `z ∈ [wz, wz+wh]` with edge projection to `wz-14` / `wz+wh+14`. Playwright probe: old injection walks straight through to the cursor (flatten 0), corrected injection walks to the frame and flattens (flatten 1). Follow/pounce suite still passes.
2026-08-02: made the pet camera fully top-down at (0, 900, 0) with up (0,0,-1), replacing the tilted (0,360,330) view. Root cause of the "spider walks off the screen plane and vanishes": the tilted view mapped world z to only 0.676 screen px and clipped ground depth at z>722 (points beyond z=330 sit behind the camera, unreachable by any far plane). The vertical camera maps world x/z 1:1 to screen pixels (screen up = world -z), puts the whole ground plane at a constant depth of 900 (verified: all four corners inside near/far), so cursor/window injection needs no scaling and nothing can clip. Window flatten now also spreads the body in x/z (+12%) so it stays visible in the top-down view. Camera-projection probe, window-edge projection probe, and the follow/pounce suite all pass.
