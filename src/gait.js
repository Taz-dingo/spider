/* global THREE */

// Foot placement and body locomotion.  This file deliberately works with the
// scene state declared by app.js so the app can stay dependency-free.

function seedFeet() {
  for (const leg of legs) {
    const foot = localToWorld({ x: footForward[leg.pair], z: leg.side * footSpread[leg.pair] });
    foot.y = 0; leg.foot.copy(foot); leg.start.copy(foot); leg.target.copy(foot); leg.swing = null;
  }
}

function desiredFoot(leg, stride, angle = spider.angle, offset = 0) {
  const raw = { x: footForward[leg.pair] + stride * ([.42, .5, .52, .45][leg.pair]), z: leg.side * footSpread[leg.pair] };
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
  return reach > 54 || Math.abs(angleDelta(leg.sector, fromRoot)) > stepSector[leg.pair] + .08;
}

function startNextStep(gait, plan = null, quick = false) {
  if (legs.some(leg => leg.swing)) return;
  const stride = plan ? 0 : 30 + gait * 26;
  const candidates = plan ? gaitOrder.filter(leg => plan.legs.has(leg) && !plan.moved.has(leg)) : gaitOrder.slice(spider.step).concat(gaitOrder.slice(0, spider.step));
  const choice = candidates.find(leg => (plan || needsStep(leg)) && availableFootTarget(leg, stride, plan?.angle));
  if (!choice) return;
  const movers = [{ leg: choice, target: availableFootTarget(choice, stride, plan?.angle) }];
  if (!plan && gait > .38) {
    const companion = candidates.find(leg => leg !== choice && leg.group === choice.group && needsStep(leg));
    const target = companion && availableFootTarget(companion, stride, undefined, movers.map(move => move.target));
    if (target) movers.push({ leg: companion, target });
  }
  for (const { leg, target } of movers) {
    leg.start.copy(leg.foot); leg.target.copy(target);
    leg.swing = { progress: 0, duration: quick ? .10 - gait * .015 : .16 - gait * .045, plan };
  }
  spider.step = (gaitOrder.indexOf(choice) + 1) % gaitOrder.length;
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
  return leg.foot.distanceTo(base) >= 57 || Math.abs(angleDelta(leg.sector, legAngle)) >= .68;
}

function positionKeepsSector(leg, position) {
  const dx = leg.foot.x - position.x, dz = leg.foot.z - position.z;
  const c = Math.cos(spider.angle), s = Math.sin(spider.angle);
  const angle = Math.atan2((-dx * s + dz * c) - leg.root.z, (dx * c + dz * s) - leg.root.x);
  return Math.abs(angleDelta(leg.sector, angle)) < .82;
}

function updateWalk(delta) {
  let gait = 0;
  // Two stable solver ticks per rendered frame make the character faster
  // without enlarging a single foot-placement move beyond its safe envelope.
  for (let tick = 0; tick < 2; tick++) gait = updateWalkStep(delta);
  return gait;
}

function updateWalkStep(delta) {
  const toPointer = pointer.clone().sub(spider.position); toPointer.y = 0;
  const distance = toPointer.length();
  const heading = Math.atan2(toPointer.z, toPointer.x);
  const stepping = legs.some(leg => leg.swing);
  const requested = spider.angle + clamp(angleDelta(spider.angle, heading), -delta * 4.2, delta * 4.2);
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
  const targetSpeed = distance > 25 && headingError < .55 ? clamp(distance * (straight ? 1.2 : 1.05), straight ? 34 : 30, straight ? 220 : 185) : 0;
  spider.speed += (targetSpeed - spider.speed) * (1 - Math.exp(-delta * 7));
  const gait = Math.max(clamp(spider.speed / 160, 0, 1), needsTurnStep ? .26 : 0);
  const advance = stepping ? (turnPlan ? 0 : Math.min(spider.speed * delta, straight ? 2.3 : 1.55)) : Math.min(spider.speed * delta, straight ? 3.8 : 2.8);
  const proposed = spider.position.clone().add(new THREE.Vector3(Math.cos(spider.angle) * advance, 0, Math.sin(spider.angle) * advance));
  const safe = legs.filter(leg => !leg.swing).every(leg => leg.foot.distanceTo(rootAt(leg, proposed)) < 56 && positionKeepsSector(leg, proposed));
  if (safe) spider.position.copy(proposed);
  spider.gaitClock += delta * (.8 + gait * 1.2);
  updateFeet(delta, gait, turnPlan, straight || Boolean(turnPlan));
  return gait;
}
