/* global THREE */
const canvas = document.querySelector("#stage");
const hint = document.querySelector(".hint");

const specimen = {
  total: [10.4, 8.4, 8.4, 10.5],
  segments: [
    [10.6, 5.8, 25.9, 17.3, 18.3, 12.5, 9.6],
    [10.7, 5.9, 28.6, 15.5, 16.7, 11.9, 10.7],
    [9.5, 7.1, 28.6, 13.1, 14.3, 15.5, 11.9],
    [7.6, 6.7, 27.6, 9.5, 20.0, 18.1, 10.5],
  ],
};
const roots = [{ x: 12, z: 10 }, { x: 5, z: 12 }, { x: -7, z: 12 }, { x: -17, z: 10 }];
const footForward = [30, 13, -14, -34];
const footSpread = [43, 45, 46, 42];
const boneRadius = [2.5, 2.15, 1.85, 1.55, 1.28, 1.05, .82];
const modelScale = 7.2;
const UP = new THREE.Vector3(0, 1, 0);
const ground = new THREE.Plane(UP, 0);
const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2();
const pointer = new THREE.Vector3();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 1000);
const scene = new THREE.Scene();
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
renderer.setClearColor(0x000000, 0);
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;

const hemi = new THREE.HemisphereLight(0xffffff, 0x172021, 2.4);
const key = new THREE.DirectionalLight(0xffffff, 2.2);
key.position.set(80, 120, 90);
scene.add(hemi, key);

const body = new THREE.Group();
scene.add(body);
const shell = new THREE.MeshStandardMaterial({ color: 0x142021, roughness: .72, metalness: .04 });
const abdomen = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 18), shell);
abdomen.position.set(-17, 0, 0); abdomen.scale.set(24, 15, 18); body.add(abdomen);
const prosoma = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 18), shell);
prosoma.position.set(13, 0, 0); prosoma.scale.set(15.5, 11.5, 13); body.add(prosoma);
const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0xc98255, emissive: 0x6a341b, emissiveIntensity: .35, roughness: .46 });
for (const [x, y, z, r] of [[25, 5, -4.5, 2.4], [25, 5, 4.5, 2.4], [27.5, 3.5, -2.4, 1.35], [27.5, 3.5, 2.4, 1.35]]) {
  const eye = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), eyeMaterial);
  eye.position.set(x, y, z); body.add(eye);
}
const shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshBasicMaterial({ color: 0x1d292a, transparent: true, opacity: .14, depthWrite: false }));
shadow.rotation.x = -Math.PI / 2; shadow.scale.set(42, 19, 1); scene.add(shadow);

const boneGeometry = new THREE.CylinderGeometry(1, 1, 1, 7, 1, false);
const legMaterials = [
  new THREE.MeshStandardMaterial({ color: 0x5c6664, roughness: .8 }),
  new THREE.MeshStandardMaterial({ color: 0x172123, roughness: .8 }),
];
const toeGeometry = new THREE.SphereGeometry(1.45, 10, 8);
const spider = { position: new THREE.Vector3(), angle: 0, speed: 0, height: 11, pose: 0, jump: null, gaitClock: 0, step: 0 };
const selfTestName = new URLSearchParams(location.search).get("selftest");
const selfTest = Boolean(selfTestName);
const testCases = {
  straight: { timeout: 8, minTurn: 0, goals: [[55, 0], [110, 0], [164, 8]] },
  curve: { timeout: 8, minTurn: .28, goals: [[48, 6], [94, 20], [136, 42], [172, 68]] },
  reversal: { timeout: 10, minTurn: 1.2, goals: [[70, 0], [70, 38], [20, 38], [20, 0]] },
};
let testRun = null;
let turnPlan = null;

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function ease(t) { return t * t * (3 - 2 * t); }
function angleDelta(from, to) { return Math.atan2(Math.sin(to - from), Math.cos(to - from)); }
function lengthsFor(pair) { return specimen.segments[pair].map(percent => percent / 100 * specimen.total[pair] * modelScale); }
function localToWorld(local, angle = spider.angle, y = 0) {
  const c = Math.cos(angle), s = Math.sin(angle);
  return new THREE.Vector3(spider.position.x + local.x * c - local.z * s, y, spider.position.z + local.x * s + local.z * c);
}
function rootFor(leg, angle = spider.angle, height = spider.height) { return localToWorld(leg.root, angle, height - 3); }
function rootAt(leg, position, angle = spider.angle, height = spider.height) {
  const c = Math.cos(angle), s = Math.sin(angle);
  return new THREE.Vector3(position.x + leg.root.x * c - leg.root.z * s, height - 3, position.z + leg.root.x * s + leg.root.z * c);
}
function bodyRelative(world, angle = spider.angle) {
  const dx = world.x - spider.position.x, dz = world.z - spider.position.z;
  const c = Math.cos(angle), s = Math.sin(angle);
  return { x: dx * c + dz * s, z: -dx * s + dz * c };
}

const legs = roots.flatMap((root, pair) => [-1, 1].map(side => {
  const rootLocal = { x: root.x, z: side * root.z };
  const neutral = { x: footForward[pair], z: side * footSpread[pair] };
  const sector = Math.atan2(neutral.z - rootLocal.z, neutral.x - rootLocal.x);
  const group = ((pair % 2 === 0) === (side === -1)) ? 0 : 1;
  const meshes = lengthsFor(pair).map((_, index) => {
    const mesh = new THREE.Mesh(boneGeometry, legMaterials[side > 0 ? 1 : 0]);
    scene.add(mesh); return mesh;
  });
  const toe = new THREE.Mesh(toeGeometry, legMaterials[side > 0 ? 1 : 0]); scene.add(toe);
  return { pair, side, root: rootLocal, sector, group, lengths: lengthsFor(pair), meshes, toe, foot: new THREE.Vector3(), start: new THREE.Vector3(), target: new THREE.Vector3(), swing: null };
}));
const gaitOrder = [...legs.filter(leg => leg.group === 0), ...legs.filter(leg => leg.group === 1)];

function seedFeet() {
  for (const leg of legs) {
    const foot = localToWorld({ x: footForward[leg.pair], z: leg.side * footSpread[leg.pair] });
    foot.y = 0; leg.foot.copy(foot); leg.start.copy(foot); leg.target.copy(foot); leg.swing = null;
  }
}

function desiredFoot(leg, stride, angle = spider.angle, offset = 0) {
  const raw = { x: footForward[leg.pair] + stride * (.66 - leg.pair * .07), z: leg.side * footSpread[leg.pair] };
  const base = leg.root;
  const relativeAngle = Math.atan2(raw.z - base.z, raw.x - base.x);
  const limited = clamp(relativeAngle + offset, leg.sector - .28, leg.sector + .28);
  const radius = Math.hypot(raw.x - base.x, raw.z - base.z);
  return localToWorld({ x: base.x + Math.cos(limited) * radius, z: base.z + Math.sin(limited) * radius }, angle, 0);
}

function footPlanIsClear(leg, target) {
  return legs.every(other => other === leg || target.distanceTo(other.foot) > 10);
}

function availableFootTarget(leg, stride, angle) {
  for (const offset of [0, .12, -.12, .24, -.24]) {
    const target = desiredFoot(leg, stride, angle, offset);
    if (footPlanIsClear(leg, target)) return target;
  }
  return null;
}

function needsStep(leg) {
  const base = rootFor(leg);
  const reach = leg.foot.distanceTo(base);
  const relative = bodyRelative(leg.foot);
  const fromRoot = Math.atan2(relative.z - leg.root.z, relative.x - leg.root.x);
  return reach > 54 || Math.abs(angleDelta(leg.sector, fromRoot)) > .42;
}

function startNextStep(gait, plan = null, quick = false) {
  if (legs.some(leg => leg.swing)) return;
  const stride = plan ? 0 : 23 + gait * 18;
  const candidates = plan ? gaitOrder.filter(leg => plan.legs.has(leg) && !plan.moved.has(leg)) : gaitOrder.slice(spider.step).concat(gaitOrder.slice(0, spider.step));
  const choice = candidates.map(leg => ({ leg, target: availableFootTarget(leg, stride, plan?.angle) })).find(candidate => candidate.target && (plan || needsStep(candidate.leg)));
  if (!choice) return;
  const { leg, target } = choice;
  leg.start.copy(leg.foot); leg.target.copy(target);
  leg.swing = { progress: 0, duration: quick ? .15 - gait * .04 : .22 - gait * .07, plan };
  spider.step = (gaitOrder.indexOf(leg) + 1) % gaitOrder.length;
}

function updateFeet(delta, gait, plan, quick) {
  const active = legs.find(leg => leg.swing);
  if (!active) { startNextStep(gait, plan, quick); return; }
  active.swing.progress = Math.min(1, active.swing.progress + delta / active.swing.duration);
  active.foot.lerpVectors(active.start, active.target, ease(active.swing.progress));
  active.foot.y = 0;
  if (active.swing.progress === 1) {
    active.foot.copy(active.target);
    active.swing.plan?.moved.add(active);
    active.swing = null;
    if (testRun) testRun.steps++;
  }
}

function sectorError(leg) {
  const relative = bodyRelative(leg.foot);
  return Math.abs(angleDelta(leg.sector, Math.atan2(relative.z - leg.root.z, relative.x - leg.root.x)));
}

function startSelfTest(name) {
  const config = testCases[name] || testCases.reversal;
  const start = spider.position.clone();
  testRun = {
    name, timeout: config.timeout, minTurn: config.minTurn,
    elapsed: 0, phaseElapsed: 0, phase: 0, steps: 0, maxReach: 0, maxSector: 0, maxTurn: 0, minFootGap: Infinity, timeouts: 0,
    startAngle: spider.angle,
    goals: config.goals.map(([x, z]) => start.clone().add(new THREE.Vector3(x, 0, z))),
  };
}

function updateSelfTest(delta) {
  if (!testRun || testRun.complete) return;
  testRun.elapsed += delta;
  pointer.copy(testRun.goals[testRun.phase]);
  testRun.maxTurn = Math.max(testRun.maxTurn, Math.abs(angleDelta(testRun.startAngle, spider.angle)));
  for (const leg of legs) {
    if (!leg.swing) {
      testRun.maxReach = Math.max(testRun.maxReach, leg.foot.distanceTo(rootFor(leg)));
      testRun.maxSector = Math.max(testRun.maxSector, sectorError(leg));
    }
  }
  for (let i = 0; i < legs.length; i++) for (let j = i + 1; j < legs.length; j++) {
    if (!legs[i].swing && !legs[j].swing) testRun.minFootGap = Math.min(testRun.minFootGap, legs[i].foot.distanceTo(legs[j].foot));
  }
  const error = spider.position.distanceTo(testRun.goals[testRun.phase]);
  if (error < 26 && testRun.phase < testRun.goals.length - 1) { testRun.phase++; testRun.phaseElapsed = 0; }
  else testRun.phaseElapsed += delta;
  if (testRun.phaseElapsed > testRun.timeout) { testRun.timeouts++; testRun.complete = true; }
  const complete = testRun.complete || (testRun.phase === testRun.goals.length - 1 && error < 26);
  const passed = complete && testRun.timeouts === 0 && testRun.steps >= 8 && testRun.maxReach <= 57.5 && testRun.maxSector <= .9 && testRun.minFootGap >= 10 && testRun.maxTurn >= testRun.minTurn;
  window.__spiderSelfTest = { name: testRun.name, running: !complete, passed: complete && passed, phase: testRun.phase, steps: testRun.steps, maxReach: testRun.maxReach, maxSector: testRun.maxSector, maxTurn: testRun.maxTurn, minFootGap: testRun.minFootGap, finishError: error, timeouts: testRun.timeouts, heading: spider.angle, turnBlocked: testRun.turnBlocked };
  if (complete) {
    testRun.complete = true;
  }
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

function updateWalk(delta) {
  const toPointer = pointer.clone().sub(spider.position); toPointer.y = 0;
  const distance = toPointer.length();
  const heading = Math.atan2(toPointer.z, toPointer.x);
  const stepping = legs.some(leg => leg.swing);
  const requested = spider.angle + clamp(angleDelta(spider.angle, heading), -delta * 3.4, delta * 3.4);
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
  const targetSpeed = distance > 25 && headingError < .55 ? clamp(distance * (straight ? .72 : .66), straight ? 22 : 20, straight ? 130 : 118) : 0;
  spider.speed += (targetSpeed - spider.speed) * (1 - Math.exp(-delta * 7));
  // Replant into the new sectors before rotating; planted legs are never twisted through the body.
  const gait = Math.max(clamp(spider.speed / 115, 0, 1), needsTurnStep ? .26 : 0);
  const advance = stepping ? (turnPlan ? 0 : Math.min(spider.speed * delta, straight ? .6 : .45)) : Math.min(spider.speed * delta, straight ? 1.7 : 1.4);
  const proposed = spider.position.clone().add(new THREE.Vector3(Math.cos(spider.angle) * advance, 0, Math.sin(spider.angle) * advance));
  const safe = legs.filter(leg => !leg.swing).every(leg => leg.foot.distanceTo(rootAt(leg, proposed)) < 56);
  if (safe) spider.position.copy(proposed);
  spider.gaitClock += delta * (.8 + gait * 1.2);
  updateFeet(delta, gait, turnPlan, straight && !turnPlan);
  return gait;
}

function solvePlanarIK(leg, foot, lift, height) {
  const base = rootFor(leg, spider.angle, height);
  const target = foot.clone(); target.y = lift;
  const flat = target.clone().sub(base); flat.y = 0;
  const horizontal = Math.max(.01, flat.length());
  const radial = flat.multiplyScalar(1 / horizontal);
  const vertical = target.y - base.y;
  const total = leg.lengths.reduce((sum, length) => sum + length, 0);
  const points = [{ u: 0, v: 0 }];
  let used = 0;
  for (const length of leg.lengths) {
    used += length;
    const t = used / total;
    points.push({ u: horizontal * t, v: vertical * t + Math.sin(Math.PI * t) * (7 + lift * .12) });
  }
  points[points.length - 1] = { u: horizontal, v: vertical };
  if (Math.hypot(horizontal, vertical) < total) {
    for (let pass = 0; pass < 8; pass++) {
      points[points.length - 1] = { u: horizontal, v: vertical };
      for (let i = points.length - 2; i >= 0; i--) {
        const dx = points[i].u - points[i + 1].u, dy = points[i].v - points[i + 1].v, length = Math.hypot(dx, dy) || 1;
        points[i] = { u: points[i + 1].u + dx / length * leg.lengths[i], v: points[i + 1].v + dy / length * leg.lengths[i] };
      }
      points[0] = { u: 0, v: 0 };
      for (let i = 1; i < points.length; i++) {
        const dx = points[i].u - points[i - 1].u, dy = points[i].v - points[i - 1].v, length = Math.hypot(dx, dy) || 1;
        points[i] = { u: points[i - 1].u + dx / length * leg.lengths[i - 1], v: points[i - 1].v + dy / length * leg.lengths[i - 1] };
      }
    }
  }
  return points.map(point => base.clone().addScaledVector(radial, point.u).addScaledVector(UP, point.v));
}

function placeBone(mesh, start, end, radius) {
  const direction = end.clone().sub(start); const length = direction.length();
  mesh.position.copy(start).addScaledVector(direction, .5);
  mesh.scale.set(radius, length, radius);
  mesh.quaternion.setFromUnitVectors(UP, direction.multiplyScalar(1 / Math.max(length, .001)));
}

function jumpPose(leg, progress) {
  const front = leg.pair < 2;
  const local = progress < .24
    ? (front ? { x: 34, z: leg.side * 43 } : { x: -28, z: leg.side * 30 })
    : progress < .4
      ? (front ? { x: 42, z: leg.side * 42 } : { x: -42, z: leg.side * 28 })
      : progress < .82
        ? (front ? { x: 18, z: leg.side * 21 } : { x: -8, z: leg.side * 21 })
        : (front ? { x: 40, z: leg.side * 43 } : { x: -22, z: leg.side * 35 });
  const lift = progress < .24 ? (front ? 12 + progress * 65 : 0) : progress < .4 ? (front ? 24 : 2) : progress < .82 ? 22 : 12 * (1 - ease((progress - .82) / .18));
  return { foot: localToWorld(local, spider.angle, 0), lift };
}

function updateJump(delta) {
  const jump = spider.jump; jump.elapsed += delta;
  const progress = clamp(jump.elapsed / jump.duration, 0, 1);
  const travel = ease(clamp((progress - .34) / .54, 0, 1));
  spider.position.lerpVectors(jump.from, jump.to, travel);
  spider.angle += angleDelta(spider.angle, jump.angle) * (1 - Math.exp(-delta * 18));
  const arc = Math.sin(clamp((progress - .34) / .52, 0, 1) * Math.PI) * clamp(jump.from.distanceTo(jump.to) * .12, 21, 57);
  if (progress === 1) { spider.jump = null; seedFeet(); }
  return { progress, arc };
}

function renderLegs(jumpFrame, gait) {
  for (const leg of legs) {
    let foot = leg.foot, lift = leg.swing ? 15 + gait * 7 : 0;
    if (jumpFrame) ({ foot, lift } = jumpPose(leg, jumpFrame.progress));
    const nodes = solvePlanarIK(leg, foot, lift, spider.height);
    nodes.slice(0, -1).forEach((node, index) => placeBone(leg.meshes[index], node, nodes[index + 1], boneRadius[index]));
    leg.toe.position.copy(nodes[nodes.length - 1]);
    leg.toe.visible = lift < 1;
  }
}

function render(delta) {
  spider.pose = Math.max(0, spider.pose - delta * .8);
  updateSelfTest(delta);
  const jumpFrame = spider.jump ? updateJump(delta) : null;
  const gait = spider.jump ? 0 : updateWalk(delta);
  const bob = jumpFrame ? jumpFrame.arc : Math.sin(spider.gaitClock * Math.PI * 4) * gait * 1.4;
  spider.height = 11 + bob;
  body.position.set(spider.position.x, spider.height, spider.position.z);
  body.rotation.y = -spider.angle;
  shadow.position.set(spider.position.x, .05, spider.position.z);
  shadow.scale.setScalar(1 + bob * .008);
  renderLegs(jumpFrame, gait);
  renderer.render(scene, camera);
}

function setPointer(event) {
  pointerNdc.set(event.clientX / innerWidth * 2 - 1, -(event.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointerNdc, camera); raycaster.ray.intersectPlane(ground, pointer);
}

function pounce(event) {
  setPointer(event);
  if (pointer.distanceTo(spider.position) < 35) return;
  spider.jump = { elapsed: 0, duration: .7, from: spider.position.clone(), to: pointer.clone(), angle: Math.atan2(pointer.z - spider.position.z, pointer.x - spider.position.x) };
  spider.speed = 0;
  hint.innerHTML = '<span class="hint__dot"></span>锁定 · 跳扑！';
  setTimeout(() => hint.innerHTML = '<span class="hint__dot"></span>正在观察', 900);
}

function resize() {
  const width = innerWidth, height = innerHeight;
  renderer.setSize(width, height, false);
  camera.left = -width / 2; camera.right = width / 2; camera.top = height / 2; camera.bottom = -height / 2;
  camera.position.set(0, 360, 330); camera.lookAt(0, 0, 0); camera.updateProjectionMatrix();
}

let last = performance.now();
function loop(now) {
  const delta = Math.min((now - last) / 1000, .04); last = now;
  render(delta); requestAnimationFrame(loop);
}

addEventListener("resize", resize);
addEventListener("pointermove", setPointer, { passive: true });
addEventListener("pointerdown", pounce);
addEventListener("keydown", event => {
  if (event.code !== "Space") return;
  event.preventDefault(); spider.pose = 1;
  hint.innerHTML = '<span class="hint__dot"></span>威吓姿态';
});

resize();
setPointer({ clientX: innerWidth * .58, clientY: innerHeight * .55 });
spider.position.copy(pointer); seedFeet();
if (selfTest) startSelfTest(selfTestName);
console.assert(Math.abs(angleDelta(0, Math.PI * 2)) < .001 && lengthsFor(0).length === 7, "3D rig helpers failed");
requestAnimationFrame(loop);
