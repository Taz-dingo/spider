/* global THREE */

// Foot placement and body locomotion.  This file deliberately works with the
// scene state declared by app.js so the app can stay dependency-free.

const gaitTuning = { strideBase: 30, strideGait: 26, swingBase: .16, swingGait: .045, reachLand: 57, reachTrigger: 62, blockReach: 64, supportReach: 63, hardReach: 66, hardSector: .9, supportBlend: .35, turnBlend: .4, advanceSpeed: 102, arcSpeed: 72, predictionTime: .09, predictionDistance: 10 };
// This is the comfort envelope.  Crossing it no longer means "body must stop";
// it means gait should correct and body motion should be reduced.  hardSector
// / hardReach remain the actual geometric guardrails.
const stanceSectorLimit = .82;

function seedFeet() {
  for (const leg of legs) {
    const foot = localToWorld({ x: footForward[leg.pair], z: leg.side * footSpread[leg.pair] });
    foot.y = 0; leg.foot.copy(foot); leg.start.copy(foot); leg.target.copy(foot); leg.swing = null;
  }
}

function worldFromBodyPose(local, position = spider.position, angle = spider.angle, y = 0) {
  const c = Math.cos(angle), s = Math.sin(angle);
  return new THREE.Vector3(position.x + local.x * c - local.z * s, y, position.z + local.x * s + local.z * c);
}

function bodyRelativeAt(world, position = spider.position, angle = spider.angle) {
  const dx = world.x - position.x, dz = world.z - position.z;
  const c = Math.cos(angle), s = Math.sin(angle);
  return { x: dx * c + dz * s, z: -dx * s + dz * c };
}

function desiredFoot(leg, stride, angle = spider.angle, offset = 0, position = spider.position) {
  const raw = { x: footForward[leg.pair] + stride * ([.22, .32, .52, .45][leg.pair]), z: leg.side * footSpread[leg.pair] };
  const base = leg.root;
  const relativeAngle = Math.atan2(raw.z - base.z, raw.x - base.x);
  const limited = clamp(relativeAngle + offset, leg.sector - stepSector[leg.pair], leg.sector + stepSector[leg.pair]);
  const radius = Math.hypot(raw.x - base.x, raw.z - base.z);
  return worldFromBodyPose({ x: base.x + Math.cos(limited) * radius, z: base.z + Math.sin(limited) * radius }, position, angle, 0);
}

function footPlanIsClear(leg, target, reserved = []) {
  return reserved.every(other => target.distanceTo(other) > 10) && legs.every(other => other === leg || target.distanceTo(other.foot) > 10);
}

function availableFootTarget(leg, stride, angle, reserved = [], pose = null) {
  const landingAngle = pose?.angle ?? angle ?? spider.angle;
  const landingPosition = pose?.position ?? spider.position;
  for (const nextStride of [stride, stride + 16, stride - 16, stride * .5]) {
    for (const offset of [0, .12, -.12, .24, -.24]) {
      const target = desiredFoot(leg, nextStride, landingAngle, offset, landingPosition);
      // Validate the target against the body pose expected near touchdown, not
      // only the body pose that happened to start the swing.  This is the key
      // game-style cheat: feet prepare for where the body is going.
      const rel = bodyRelativeAt(target, landingPosition, landingAngle);
      if (Math.hypot(rel.x - leg.root.x, rel.z - leg.root.z) > gaitTuning.reachLand) continue;
      if (footPlanIsClear(leg, target, reserved)) return target;
    }
  }
  return null;
}

function stepStateAt(leg, position = spider.position, angle = spider.angle, foot = leg.foot) {
  const base = rootAt(leg, position, angle);
  const reach = foot.distanceTo(base);
  const relative = bodyRelativeAt(foot, position, angle);
  const fromRoot = Math.atan2(relative.z - leg.root.z, relative.x - leg.root.x);
  return { reach, sector: Math.abs(angleDelta(leg.sector, fromRoot)) };
}

function needsStep(leg, prediction = null) {
  const current = stepStateAt(leg);
  if (current.reach > gaitTuning.reachTrigger || current.sector > stepSector[leg.pair] + .08) return true;
  if (!prediction) return false;
  const future = stepStateAt(leg, prediction.position, prediction.angle);
  return future.reach > gaitTuning.reachTrigger || future.sector > stepSector[leg.pair] + .08;
}

function predictBodyPose() {
  const travel = Math.min(spider.speed * gaitTuning.predictionTime, gaitTuning.predictionDistance);
  return {
    position: spider.position.clone().add(new THREE.Vector3(Math.cos(spider.angle) * travel, 0, Math.sin(spider.angle) * travel)),
    angle: spider.angle,
  };
}

function startNextStep(gait, plan = null, quick = false, prediction = null) {
  if (legs.some(leg => leg.swing)) return;
  const stride = plan ? 0 : gaitTuning.strideBase + gait * gaitTuning.strideGait;
  const candidates = plan ? gaitOrder.filter(leg => plan.legs.has(leg) && !plan.moved.has(leg)) : gaitOrder.slice(spider.step).concat(gaitOrder.slice(0, spider.step));
  if (plan) {
    const movable = candidates.filter(leg => availableFootTarget(leg, stride, plan.angle));
    if (!movable.length) return;
    const movers = [{ leg: movable[0], target: availableFootTarget(movable[0], stride, plan.angle) }];
    // Turn replants swing every blocker that has a mutually clear landing at
    // once, so a multi-leg turn no longer stalls one swing at a time.
    for (const leg of movable.slice(1)) {
      const target = availableFootTarget(leg, stride, plan.angle, movers.map(move => move.target));
      if (target) movers.push({ leg, target });
    }
    for (const { leg, target } of movers) {
      leg.start.copy(leg.foot); leg.target.copy(target);
      leg.swing = { progress: 0, duration: quick ? .10 - gait * .015 : gaitTuning.swingBase - gait * gaitTuning.swingGait, plan };
    }
    spider.step = (gaitOrder.indexOf(movers[0].leg) + 1) % gaitOrder.length;
    return;
  }
  // Walking replants are triggered from current OR near-future body stress.
  // That makes the feet react before the root reaches a hard support limit.
  const trigger = candidates.find(leg => needsStep(leg, prediction) && availableFootTarget(leg, stride, undefined, [], prediction));
  if (!trigger) return;
  if (testRun && prediction && !needsStep(trigger)) testRun.predictiveReplants++;
  const movers = [];
  for (const leg of gaitOrder.filter(candidate => candidate.group === trigger.group)) {
    const target = availableFootTarget(leg, stride, undefined, movers.map(move => move.target), prediction);
    if (target) movers.push({ leg, target });
  }
  if (!movers.length) return;
  for (const { leg, target } of movers) {
    leg.start.copy(leg.foot); leg.target.copy(target);
    leg.swing = { progress: 0, duration: quick ? .10 - gait * .015 : gaitTuning.swingBase - gait * gaitTuning.swingGait, plan };
  }
  spider.step = (gaitOrder.indexOf(trigger) + 1) % gaitOrder.length;
}

function updateFeet(delta, gait, plan, quick, prediction = null) {
  const active = legs.filter(leg => leg.swing);
  if (!active.length) { startNextStep(gait, plan, quick, prediction); return; }
  for (const leg of active) {
    leg.swing.progress = Math.min(1, leg.swing.progress + delta / leg.swing.duration);
    leg.foot.lerpVectors(leg.start, leg.target, ease(leg.swing.progress));
    leg.foot.y = 0;
    if (leg.swing.progress === 1) {
      leg.foot.copy(leg.target);
      if (testRun && leg.pair < 2) {
        const side = leg.side > 0 ? 1 : 0;
        testRun.frontTouchdown[leg.pair][side] = Math.max(testRun.frontTouchdown[leg.pair][side], bodyRelative(leg.foot).x - 28);
      }
      leg.swing.plan?.moved.add(leg);
      leg.swing = null;
      if (testRun) { testRun.steps++; testRun.pairSteps[leg.pair]++; }
    }
  }
}

function sectorError(leg) {
  const relative = bodyRelative(leg.foot);
  return Math.abs(angleDelta(leg.sector, Math.atan2(relative.z - leg.root.z, relative.x - leg.root.x)));
}

function segmentsCollide(a, b, c, d) {
  const rx = b.x - a.x, rz = b.z - a.z, sx = d.x - c.x, sz = d.z - c.z;
  const cross = rx * sz - rz * sx;
  if (Math.abs(cross) < .001) return false;
  const qx = c.x - a.x, qz = c.z - a.z;
  const t = (qx * sz - qz * sx) / cross, u = (qx * rz - qz * rx) / cross;
  if (t <= 0 || t >= 1 || u <= 0 || u >= 1) return false;
  const ay = a.y + (b.y - a.y) * t, by = c.y + (d.y - c.y) * u;
  return Math.abs(ay - by) < 4;
}

function sameSideCrossings() {
  let count = 0;
  for (const side of [-1, 1]) {
    const sideLegs = legs.filter(leg => leg.side === side);
    for (let first = 0; first < sideLegs.length; first++) for (let second = first + 1; second < sideLegs.length; second++) {
      // An airborne leg may pass above the support polygon; only two planted
      // limbs at the same height are a walking collision.
      if (sideLegs[first].swing || sideLegs[second].swing) continue;
      const a = sideLegs[first].nodes, b = sideLegs[second].nodes;
      if (!a || !b) continue;
      for (let ai = 3; ai < a.length - 1; ai++) for (let bi = 3; bi < b.length - 1; bi++) {
        if (segmentsCollide(a[ai], a[ai + 1], b[bi], b[bi + 1])) {
          count++;
          if (testRun) testRun.crossingPairs.add(`${side}:${sideLegs[first].pair + 1}-${sideLegs[second].pair + 1}`);
        }
      }
    }
  }
  return count;
}

function headingIsSupported(nextAngle) {
  return legs.filter(leg => !leg.swing).every(leg => !blocksHeading(leg, nextAngle));
}

function blocksHeading(leg, nextAngle) {
  const base = rootFor(leg, nextAngle);
  const relative = bodyRelative(leg.foot, nextAngle);
  const legAngle = Math.atan2(relative.z - leg.root.z, relative.x - leg.root.x);
  return leg.foot.distanceTo(base) >= gaitTuning.blockReach || Math.abs(angleDelta(leg.sector, legAngle)) >= .68;
}

function poseFitsEnvelope(position, angle, planted, reachLimit, sectorLimit) {
  return planted.every(leg => {
    const state = stepStateAt(leg, position, angle, leg.swing ? leg.target : leg.foot);
    return state.reach < reachLimit && state.sector < sectorLimit;
  });
}

function maxBodyAdvanceFraction(proposed, planted, reachLimit, sectorLimit) {
  const allowed = fraction => poseFitsEnvelope(spider.position.clone().lerp(proposed, fraction), spider.angle, planted, reachLimit, sectorLimit);
  if (allowed(1)) return 1;
  if (!allowed(0)) return 0;
  let low = 0, high = 1;
  for (let i = 0; i < 7; i++) {
    const mid = (low + high) * .5;
    if (allowed(mid)) low = mid;
    else high = mid;
  }
  return low;
}

function maxBodyTurnFraction(requestedAngle, planted, reachLimit, sectorLimit) {
  const turn = angleDelta(spider.angle, requestedAngle);
  if (Math.abs(turn) < .0001) return 1;
  const allowed = fraction => poseFitsEnvelope(spider.position, spider.angle + turn * fraction, planted, reachLimit, sectorLimit);
  if (allowed(1)) return 1;
  if (!allowed(0)) return 0;
  let low = 0, high = 1;
  for (let i = 0; i < 7; i++) {
    const mid = (low + high) * .5;
    if (allowed(mid)) low = mid;
    else high = mid;
  }
  return low;
}

function blendedCorrectionFraction(comfortFraction, hardFraction, blend = gaitTuning.supportBlend) {
  return Math.min(hardFraction, comfortFraction + Math.max(0, hardFraction - comfortFraction) * blend);
}

function updateWalk(delta) {
  return updateWalkStep(delta * 2);
}

function updateWalkStep(delta) {
  const intent = bodyMotionIntent(delta);
  const { distance, heading, requestedAngle } = intent;
  const stepping = legs.some(leg => leg.swing);
  // A turn-replant batch owns the plan captured when those feet lifted.  Do
  // not replace it until the batch lands, otherwise the body starts chasing a
  // moving heading while the airborne feet are still targeting the old pose.
  const swingTurnPlan = legs.find(leg => leg.swing?.plan)?.swing.plan || null;
  const needsTurnStep = distance > 25 && Math.abs(angleDelta(spider.angle, heading)) > .001 && !headingIsSupported(requestedAngle);
  if (needsTurnStep) {
    const planned = spider.angle + clamp(angleDelta(spider.angle, heading), -.25, .25);
    const blockers = new Set(legs.filter(leg => !leg.swing && blocksHeading(leg, requestedAngle)));
    if (!swingTurnPlan && (!turnPlan || Math.abs(angleDelta(turnPlan.angle, planned)) > .08 || [...turnPlan.legs].every(leg => turnPlan.moved.has(leg)))) {
      turnPlan = { angle: planned, legs: blockers, moved: new Set() };
    }
  } else if (!swingTurnPlan) {
    turnPlan = null;
  }
  if (testRun) testRun.turnBlocked ||= needsTurnStep;
  // Keep the target used by the current turn-replant batch stable until those
  // feet land.  Motion Controller still owns the final desired heading, but
  // gait stages that intent through the pose the active footholds were built
  // to support instead of making them chase a moving heading every frame.
  const activeTurnPlan = swingTurnPlan || turnPlan || null;
  // Spread rotation across the fixed batch's remaining flight, instead of
  // snapping to its heading and waiting there for the feet to finish.
  const remainingSwing = legs.find(leg => leg.swing?.plan)?.swing;
  const turnTime = remainingSwing ? remainingSwing.duration * (1 - remainingSwing.progress) : gaitTuning.swingBase;
  const turnTarget = activeTurnPlan
    ? spider.angle + angleDelta(spider.angle, activeTurnPlan.angle) * Math.min(1, delta / turnTime)
    : requestedAngle;

  // Heading is body intent with leg correction, not a gait-owned on/off switch.
  // Even while feet are in flight the body may rotate toward the active plan;
  // the hard envelope is the only absolute geometric veto.
  const turnPlanted = legs.filter(leg => !leg.swing);
  const commandedTurn = distance > 2 ? angleDelta(spider.angle, turnTarget) : 0;
  if (Math.abs(commandedTurn) > .0001) {
    const comfortTurn = maxBodyTurnFraction(turnTarget, turnPlanted, gaitTuning.supportReach, stanceSectorLimit);
    // Airborne targets must still fit when they land, including a walking
    // batch launched just before the pointer requested a turn.
    const hardTurn = maxBodyTurnFraction(turnTarget, legs, gaitTuning.hardReach, gaitTuning.hardSector);
    const turnFraction = blendedCorrectionFraction(comfortTurn, hardTurn, gaitTuning.turnBlend);
    const actualTurn = commandedTurn * turnFraction;
    spider.angle += actualTurn;
    if (testRun) {
      testRun.commandedBodyTurn += Math.abs(commandedTurn);
      testRun.turnCorrection += Math.max(0, Math.abs(commandedTurn) - Math.abs(actualTurn));
      if (Math.abs(actualTurn) < .001 && Math.abs(commandedTurn) > .01) testRun.hardTurnStopTime += delta;
    }
  }

  const motion = resolveBodyMotion(intent, spider.angle);
  updateBodySpeed(motion, delta);
  const { straight } = motion;
  const gait = Math.max(clamp(spider.speed / 160, 0, 1), needsTurnStep ? .26 : 0);
  const prediction = !activeTurnPlan && !needsTurnStep && spider.speed > 1 ? predictBodyPose() : null;
  // Preserve the former 60 Hz non-swing speed limits, in units/second.
  // Lifting a foot must not switch the body's speed cap or depend on FPS.
  const advance = Math.min(spider.speed, straight ? gaitTuning.advanceSpeed : gaitTuning.arcSpeed) * delta;
  const proposed = spider.position.clone().add(new THREE.Vector3(Math.cos(spider.angle) * advance, 0, Math.sin(spider.angle) * advance));
  const planted = legs.filter(leg => !leg.swing);

  // Translation uses the same two-envelope rule as heading: comfort pressure
  // slows the body continuously, while only the hard visual envelope can stop.
  const comfortFraction = maxBodyAdvanceFraction(proposed, planted, gaitTuning.supportReach, stanceSectorLimit);
  const hardFraction = maxBodyAdvanceFraction(proposed, legs, gaitTuning.hardReach, gaitTuning.hardSector);
  const fraction = blendedCorrectionFraction(comfortFraction, hardFraction);
  const beforeAdvance = spider.position.clone();
  if (fraction > .001) spider.position.lerp(proposed, fraction);
  const actualTravel = spider.position.distanceTo(beforeAdvance);
  if (testRun && advance > .001) {
    testRun.commandedBodyTravel += advance;
    testRun.supportCorrectionTravel += Math.max(0, advance - actualTravel);
    if (actualTravel < .01 && advance > .05) testRun.hardSupportStopTime += delta;
  }
  if (testRun && stepping && activeTurnPlan) testRun.turnReplantTravel += actualTravel;
  spider.gaitClock += delta * (.8 + gait * 1.2);
  updateFeet(delta, gait, turnPlan, straight || Boolean(turnPlan), prediction);
  return gait;
}
