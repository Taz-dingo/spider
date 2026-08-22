/* global THREE */

// Foot placement and body locomotion.  This file deliberately works with the
// scene state declared by app.js so the app can stay dependency-free.

const gaitTuning = { strideBase: 30, strideGait: 26, swingBase: .16, swingGait: .045, reachLand: 57, reachTrigger: 62, blockReach: 64, supportReach: 63, advanceStep: 1.8, advanceArc: 1.0 };
// Stance sector limit: a planted foot may trail at most this far past its
// neutral sector before the advance check refuses to push the body further.
const stanceSectorLimit = .82;

function seedFeet() {
  for (const leg of legs) {
    const foot = localToWorld({ x: footForward[leg.pair], z: leg.side * footSpread[leg.pair] });
    foot.y = 0; leg.foot.copy(foot); leg.start.copy(foot); leg.target.copy(foot); leg.swing = null;
  }
}

function desiredFoot(leg, stride, angle = spider.angle, offset = 0) {
  const raw = { x: footForward[leg.pair] + stride * ([.22, .32, .52, .45][leg.pair]), z: leg.side * footSpread[leg.pair] };
  const base = leg.root;
  const relativeAngle = Math.atan2(raw.z - base.z, raw.x - base.x);
  const limited = clamp(relativeAngle + offset, leg.sector - stepSector[leg.pair], leg.sector + stepSector[leg.pair]);
  const radius = Math.hypot(raw.x - base.x, raw.z - base.z);
  return localToWorld({ x: base.x + Math.cos(limited) * radius, z: base.z + Math.sin(limited) * radius }, angle, 0);
}

function footPlanIsClear(leg, target, reserved = []) {
  return reserved.every(other => target.distanceTo(other) > 10) && legs.every(other => other === leg || target.distanceTo(other.foot) > 10);
}

function availableFootTarget(leg, stride, angle, reserved) {
  for (const nextStride of [stride, stride + 16, stride - 16, stride * .5]) {
    for (const offset of [0, .12, -.12, .24, -.24]) {
      const target = desiredFoot(leg, nextStride, angle, offset);
      // A landing beyond the replant threshold would instantly re-trigger
      // needsStep, so the leg swings again before the body can advance on it.
      // Keep every landing inside the support envelope.
      const rel = bodyRelative(target);
      if (Math.hypot(rel.x - leg.root.x, rel.z - leg.root.z) > gaitTuning.reachLand) continue;
      if (footPlanIsClear(leg, target, reserved)) return target;
    }
  }
  return null;
}

function needsStep(leg) {
  const base = rootFor(leg);
  const reach = leg.foot.distanceTo(base);
  const relative = bodyRelative(leg.foot);
  const fromRoot = Math.atan2(relative.z - leg.root.z, relative.x - leg.root.x);
  // Fire a frame or so before the stance sector limit so the leg is already
  // swinging before the advance check would refuse to push the body further.
  return reach > gaitTuning.reachTrigger || Math.abs(angleDelta(leg.sector, fromRoot)) > stepSector[leg.pair] + .08;
}

function startNextStep(gait, plan = null, quick = false) {
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
  // Walking: one leg of the tetrapod over-extends and fires the whole group.
  // Swinging the group together keeps a fresh set of support legs on the
  // ground every cycle; demand-triggering one leg at a time left the rest
  // parked past their trigger angle, and the advance check throttled the
  // body to a quarter step while they waited their turn.
  const trigger = candidates.find(leg => needsStep(leg) && availableFootTarget(leg, stride));
  if (!trigger) return;
  const movers = [];
  for (const leg of gaitOrder.filter(candidate => candidate.group === trigger.group)) {
    const target = availableFootTarget(leg, stride, undefined, movers.map(move => move.target));
    if (target) movers.push({ leg, target });
  }
  if (!movers.length) return;
  for (const { leg, target } of movers) {
    leg.start.copy(leg.foot); leg.target.copy(target);
    leg.swing = { progress: 0, duration: quick ? .10 - gait * .015 : gaitTuning.swingBase - gait * gaitTuning.swingGait, plan };
  }
  spider.step = (gaitOrder.indexOf(trigger) + 1) % gaitOrder.length;
}

function updateFeet(delta, gait, plan, quick) {
  const active = legs.filter(leg => leg.swing);
  if (!active.length) { startNextStep(gait, plan, quick); return; }
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

function positionKeepsSector(leg, position) {
  const dx = leg.foot.x - position.x, dz = leg.foot.z - position.z;
  const c = Math.cos(spider.angle), s = Math.sin(spider.angle);
  const angle = Math.atan2((-dx * s + dz * c) - leg.root.z, (dx * c + dz * s) - leg.root.x);
  return Math.abs(angleDelta(leg.sector, angle)) < stanceSectorLimit;
}

function updateWalk(delta) {
  return updateWalkStep(delta * 2);
}

function updateWalkStep(delta) {
  const toPointer = pointer.clone().sub(spider.position); toPointer.y = 0;
  const distance = toPointer.length();
  const heading = Math.atan2(toPointer.z, toPointer.x);
  const stepping = legs.some(leg => leg.swing);
  const requested = spider.angle + clamp(angleDelta(spider.angle, heading), -delta * 5.2, delta * 5.2);
  const needsTurnStep = distance > 25 && !headingIsSupported(requested);
  if (needsTurnStep) {
    const planned = spider.angle + clamp(angleDelta(spider.angle, heading), -.25, .25);
    const blockers = new Set(legs.filter(leg => !leg.swing && blocksHeading(leg, requested)));
    if (!turnPlan || Math.abs(angleDelta(turnPlan.angle, planned)) > .08 || [...turnPlan.legs].every(leg => turnPlan.moved.has(leg))) {
      turnPlan = { angle: planned, legs: blockers, moved: new Set() };
    }
  } else {
    turnPlan = null;
  }
  if (testRun) testRun.turnBlocked ||= needsTurnStep;
  if (distance > 2 && !needsTurnStep && !stepping) spider.angle = requested;
  const headingError = Math.abs(angleDelta(spider.angle, heading));
  const straight = headingError < .18;
  // Walk an arc toward the goal instead of freezing to rotate: creep forward
  // while heading is off by up to 1.2 rad, then sprint once nearly aligned.
  const aligned = headingError < .55;
  const targetSpeed = distance > 12 && headingError < 1.2 ? clamp(distance * (straight ? 1.2 : 1.05), straight ? 34 : aligned ? 30 : 12, straight ? 220 : aligned ? 185 : 45) : 0;
  spider.speed += (targetSpeed - spider.speed) * (1 - Math.exp(-delta * 7));
  const gait = Math.max(clamp(spider.speed / 160, 0, 1), needsTurnStep ? .26 : 0);
  const advance = stepping ? (turnPlan ? 0 : Math.min(spider.speed * delta, straight ? gaitTuning.advanceStep : gaitTuning.advanceArc)) : Math.min(spider.speed * delta, straight ? 3.4 : 2.4);
  const proposed = spider.position.clone().add(new THREE.Vector3(Math.cos(spider.angle) * advance, 0, Math.sin(spider.angle) * advance));
  // Advance as far as the planted feet support; a full stop only when even a
  // quarter step is unsafe, so the body glides instead of pumping in place.
  const planted = legs.filter(leg => !leg.swing);
  const supported = fraction => {
    const position = spider.position.clone().lerp(proposed, fraction);
    return planted.every(leg => leg.foot.distanceTo(rootAt(leg, position)) < gaitTuning.supportReach && positionKeepsSector(leg, position));
  };
  let fraction = 1;
  while (fraction >= .25 && !supported(fraction)) fraction *= .5;
  if (fraction >= .25) spider.position.lerp(proposed, fraction);
  spider.gaitClock += delta * (.8 + gait * 1.2);
  updateFeet(delta, gait, turnPlan, straight || Boolean(turnPlan));
  return gait;
}
