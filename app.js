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
// All four coxae sit along the prosoma, fanning from the anterior eyes to its
// posterior rim; none originate on the abdomen.
const roots = [{ x: 22, z: 5 }, { x: 14, z: 15 }, { x: 6, z: 15 }, { x: -1, z: 5 }];
// Calibrated from the imported rig's actual reachable feet.  Pair 1 is the
// model's shorter anterior walking leg, not the long procedural placeholder.
const footForward = [44, 36, -14, -34];
const footSpread = [20, 58, 58, 24];
const stepSector = [.55, .43, .28, .28];
const prosomaShape = { x: 13, rx: 15.5, ry: 11.5, rz: 13, coxaY: -3.3 };
// The scan has a compact coxa/trochanter, then a visibly fuller femur and
// patella.  The thin, tapered tibia → metatarsus → tarsus is a separate
// silhouette instead of seven equally thin rods.
const boneRadius = [1.38, 1.72, 2.28, 2.02, 1.62, 1.16, .68];
// Walking envelope from Hao et al. (2019), measured on level ground.  Angles
// below are signed segment turns, so their magnitude is π minus the anatomical
// inner angle.  The CT pose has a principal femur–patella fold, then a second
// counter-fold at tibia–metatarsus; constraining every distal joint to the same
// sign made the old rig read as one long C-shaped wire.  The tiny tarsus stays
// nearly collinear with the metatarsus, as it does in the scan.
const jointLimits = [
  [-.64, .34], [-.62, .38], [-Math.PI / 2, -Math.PI * 5 / 18],
  [-.48, -.10], [.24, .62], [-.17, .08],
];
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
let riggedSpider = null;
let showRiggedModel = true;
const riggedBones = new Map();
let riggedSolver = null;
const riggedIK = [];
const shell = new THREE.MeshStandardMaterial({ color: 0x142021, roughness: .72, metalness: .04 });
const abdomenRig = new THREE.Group();
abdomenRig.position.set(-2.3, 0, 0); body.add(abdomenRig);
const abdomen = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 18), shell);
// CT scan of the female P. regius: opisthosoma 7.6 mm vs prosoma 4.1 mm.
abdomen.position.set(-28.7, 0, 0); abdomen.scale.set(28.75, 15, 18); abdomenRig.add(abdomen);
const prosoma = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 18), shell);
prosoma.position.set(prosomaShape.x, 0, 0); prosoma.scale.set(prosomaShape.rx, prosomaShape.ry, prosomaShape.rz); body.add(prosoma);
const pedicel = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), shell);
pedicel.position.set(-2.3, 0, 0); pedicel.scale.set(3.8, 3.4, 3.6); body.add(pedicel);
const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0xc98255, emissive: 0x6a341b, emissiveIntensity: .35, roughness: .46 });
for (const [x, y, z, r] of [[25, 5, -4.5, 2.4], [25, 5, 4.5, 2.4], [27.5, 3.5, -2.4, 1.35], [27.5, 3.5, 2.4, 1.35]]) {
  const eye = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), eyeMaterial);
  eye.position.set(x, y, z); body.add(eye);
}
const shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshBasicMaterial({ color: 0x1d292a, transparent: true, opacity: .14, depthWrite: false }));
shadow.rotation.x = -Math.PI / 2; shadow.scale.set(42, 19, 1); scene.add(shadow);

const boneGeometry = new THREE.CylinderGeometry(1, 1, 1, 7, 1, false);
const legGeometries = [
  [.82, 1.0], [.92, 1.06], [.78, 1.0], [.9, 1.1],
  [.74, .92], [.66, .82], [.42, .6],
].map(([top, bottom]) => new THREE.CylinderGeometry(top, bottom, 1, 7, 1, false));
const legMaterials = [
  new THREE.MeshStandardMaterial({ color: 0x5c6664, roughness: .8 }),
  new THREE.MeshStandardMaterial({ color: 0x172123, roughness: .8 }),
];
const palps = [];
for (const side of [-1, 1]) {
  const nodes = [new THREE.Vector3(25, -1, side * 5), new THREE.Vector3(28.5, -3.7, side * 7), new THREE.Vector3(31, -5.5, side * 8)];
  const meshes = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    const palp = new THREE.Mesh(boneGeometry, shell); body.add(palp);
    placeBone(palp, nodes[i], nodes[i + 1], i ? .75 : 1.05);
    meshes.push(palp);
  }
  const tip = new THREE.Mesh(new THREE.SphereGeometry(1.15, 10, 8), shell);
  tip.position.copy(nodes[nodes.length - 1]); body.add(tip);
  palps.push({ side, nodes, meshes, tip });
}
const clawGeometry = new THREE.CylinderGeometry(.42, .58, 1, 6, 1, false);
const spider = { position: new THREE.Vector3(), angle: 0, speed: 0, height: 11, pose: 0, jump: null, gaitClock: 0, step: 0 };
const selfTestName = new URLSearchParams(location.search).get("selftest");
const selfTest = Boolean(selfTestName);
const testCases = {
  straight: { timeout: 8, minTurn: 0, goals: [[55, 0], [110, 0], [164, 8]] },
  curve: { timeout: 8, minTurn: .28, goals: [[48, 6], [94, 20], [136, 42], [172, 68]] },
  reversal: { timeout: 10, minTurn: 1.2, goals: [[70, 0], [70, 38], [20, 38], [20, 0]] },
  stress: { timeout: 8, minTurn: .4, goals: [[55, 0], [108, 24], [158, -8], [212, 30], [266, -6]] },
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
// The gait plans from anatomical coxa centres.  The renderer clips its first
// visible segment to this shell instead of drawing it through the carapace.
function shellCoxa(rawRoot) {
  const nx = (rawRoot.x - prosomaShape.x) / prosomaShape.rx;
  const nz = rawRoot.z / prosomaShape.rz;
  const radial = Math.max(.001, Math.hypot(nx, nz));
  const rim = Math.sqrt(1 - (prosomaShape.coxaY / prosomaShape.ry) ** 2);
  const scale = rim / radial;
  return { x: prosomaShape.x + (rawRoot.x - prosomaShape.x) * scale, z: rawRoot.z * scale };
}
function visibleCoxa(leg, nextNode, height = spider.height) {
  const start = { x: leg.root.x, y: -3, z: leg.root.z };
  const localNext = bodyRelative(nextNode);
  const end = { x: localNext.x, y: nextNode.y - height, z: localNext.z };
  const delta = { x: end.x - start.x, y: end.y - start.y, z: end.z - start.z };
  const offset = { x: start.x - prosomaShape.x, y: start.y, z: start.z };
  const a = delta.x ** 2 / prosomaShape.rx ** 2 + delta.y ** 2 / prosomaShape.ry ** 2 + delta.z ** 2 / prosomaShape.rz ** 2;
  const b = 2 * (offset.x * delta.x / prosomaShape.rx ** 2 + offset.y * delta.y / prosomaShape.ry ** 2 + offset.z * delta.z / prosomaShape.rz ** 2);
  const c = offset.x ** 2 / prosomaShape.rx ** 2 + offset.y ** 2 / prosomaShape.ry ** 2 + offset.z ** 2 / prosomaShape.rz ** 2 - 1;
  const discriminant = b ** 2 - 4 * a * c;
  const exit = discriminant >= 0 && a > .0001 ? Math.max((-b - Math.sqrt(discriminant)) / (2 * a), (-b + Math.sqrt(discriminant)) / (2 * a)) : -1;
  if (exit <= 0 || exit >= 1) return localToWorld(leg.shellRoot, spider.angle, height + prosomaShape.coxaY);
  return localToWorld({ x: start.x + delta.x * exit, z: start.z + delta.z * exit }, spider.angle, height + start.y + delta.y * exit);
}

const legs = roots.flatMap((root, pair) => [-1, 1].map(side => {
  const rootLocal = { x: root.x, z: side * root.z };
  const shellRoot = shellCoxa(rootLocal);
  const neutral = { x: footForward[pair], z: side * footSpread[pair] };
  const sector = Math.atan2(neutral.z - rootLocal.z, neutral.x - rootLocal.x);
  const group = ((pair % 2 === 0) === (side === -1)) ? 0 : 1;
  const meshes = lengthsFor(pair).map((_, index) => {
    const mesh = new THREE.Mesh(legGeometries[index], legMaterials[side > 0 ? 1 : 0]);
    scene.add(mesh); return mesh;
  });
  const claws = [-1, 1].map(() => {
    const claw = new THREE.Mesh(clawGeometry, legMaterials[side > 0 ? 1 : 0]);
    scene.add(claw); return claw;
  });
  return { pair, side, root: rootLocal, shellRoot, sector, group, lengths: lengthsFor(pair), meshes, claws, foot: new THREE.Vector3(), start: new THREE.Vector3(), target: new THREE.Vector3(), swing: null };
}));
const gaitOrder = [...legs.filter(leg => leg.group === 0), ...legs.filter(leg => leg.group === 1)];
// Runtime modules in ./src own rig adaptation, locomotion, and checks.

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
  const angles = leg.lengths.map((_, index) => Math.atan2(points[index + 1].v - points[index].v, points[index + 1].u - points[index].u));
  const forward = () => {
    const chain = [{ u: 0, v: 0 }];
    for (let i = 0; i < leg.lengths.length; i++) chain.push({
      u: chain[i].u + Math.cos(angles[i]) * leg.lengths[i],
      v: chain[i].v + Math.sin(angles[i]) * leg.lengths[i],
    });
    return chain;
  };
  const clampJoints = () => {
    for (let i = 1; i < angles.length; i++) {
      const [min, max] = jointLimits[i - 1];
      angles[i] = angles[i - 1] + clamp(angleDelta(angles[i - 1], angles[i]), min, max);
    }
  };
  clampJoints();
  for (let pass = 0; pass < 4; pass++) {
    let chain = forward();
    for (let joint = angles.length - 1; joint >= 0; joint--) {
      const end = chain[chain.length - 1], pivot = chain[joint];
      const aim = Math.atan2(vertical - pivot.v, horizontal - pivot.u);
      const current = Math.atan2(end.v - pivot.v, end.u - pivot.u);
      const delta = angleDelta(current, aim);
      for (let i = joint; i < angles.length; i++) angles[i] += delta;
      clampJoints();
      chain = forward();
    }
  }
  return forward().map(point => base.clone().addScaledVector(radial, point.u).addScaledVector(UP, point.v));
}

function placeBone(mesh, start, end, radius) {
  const direction = end.clone().sub(start); const length = direction.length();
  mesh.position.copy(start).addScaledVector(direction, .5);
  mesh.scale.set(radius, length, radius);
  mesh.quaternion.setFromUnitVectors(UP, direction.multiplyScalar(1 / Math.max(length, .001)));
}

function animateSoftParts(gait, jumpFrame) {
  const phase = spider.gaitClock * Math.PI * 4;
  const sway = jumpFrame ? Math.sin(jumpFrame.progress * Math.PI) * .12 : Math.sin(phase) * gait * .055;
  abdomenRig.rotation.y = sway;
  abdomenRig.rotation.z = -sway * .65;
  for (const palp of palps) {
    const flick = Math.sin(phase + palp.side * .8) * (.45 + gait * .8);
    const [base, mid, tip] = palp.nodes;
    base.set(25, -1, palp.side * 5);
    mid.set(28.5 + flick * .2, -3.7 - Math.abs(flick) * .25, palp.side * (7 + flick * .18));
    tip.set(31 + flick * .55, -5.5 - flick * .25, palp.side * (8 + flick * .35));
    palp.meshes.forEach((mesh, index) => placeBone(mesh, palp.nodes[index], palp.nodes[index + 1], index ? .75 : 1.05));
    palp.tip.position.copy(tip);
  }
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
    let foot = leg.foot, lift = leg.swing ? 22 + gait * 9 : 0;
    if (jumpFrame) ({ foot, lift } = jumpPose(leg, jumpFrame.progress));
    const nodes = solvePlanarIK(leg, foot, lift, spider.height);
    leg.nodes = nodes;
    if (testRun && !jumpFrame) {
      const innerAngle = index => nodes[index].clone().sub(nodes[index - 1]).negate().angleTo(nodes[index + 1].clone().sub(nodes[index]));
      const degrees = radians => radians * 180 / Math.PI;
      const femurPatella = degrees(innerAngle(3));
      testRun.femurPatella.min = Math.min(testRun.femurPatella.min, femurPatella);
      testRun.femurPatella.max = Math.max(testRun.femurPatella.max, femurPatella);
      for (const index of [4, 5]) {
        const distal = degrees(innerAngle(index));
        testRun.distal.min = Math.min(testRun.distal.min, distal);
        testRun.distal.max = Math.max(testRun.distal.max, distal);
      }
      const terminal = degrees(innerAngle(6));
      testRun.terminal.min = Math.min(testRun.terminal.min, terminal);
      testRun.terminal.max = Math.max(testRun.terminal.max, terminal);
    }
    const pairThickness = [1.26, 1.06, 1.04, 1.2][leg.pair];
    const visibleStart = visibleCoxa(leg, nodes[1]);
    if (testRun && !jumpFrame) {
      const local = bodyRelative(visibleStart);
      const shellDistance = (local.x - prosomaShape.x) ** 2 / prosomaShape.rx ** 2 + (visibleStart.y - spider.height) ** 2 / prosomaShape.ry ** 2 + local.z ** 2 / prosomaShape.rz ** 2;
      testRun.maxCoxaShellError = Math.max(testRun.maxCoxaShellError, Math.abs(shellDistance - 1));
    }
    nodes.slice(0, -1).forEach((node, index) => placeBone(leg.meshes[index], index ? node : visibleStart, nodes[index + 1], boneRadius[index] * pairThickness));
    const footPoint = nodes[nodes.length - 1];
    leg.renderFoot = footPoint.clone();
    const tarsus = footPoint.clone().sub(nodes[nodes.length - 2]).normalize();
    const lateral = new THREE.Vector3(-tarsus.z, 0, tarsus.x).normalize();
    leg.claws.forEach((claw, index) => {
      const sign = index ? 1 : -1;
      const start = footPoint.clone().addScaledVector(lateral, sign * .2).addScaledVector(UP, .16);
      const end = start.clone().addScaledVector(tarsus, 1.15).addScaledVector(lateral, sign * .34).addScaledVector(UP, .3);
      placeBone(claw, start, end, .45);
      // The procedural claws are only the fallback model.  Keeping them visible
      // over a rigged model made the old target markers look like a second set
      // of feet.
      claw.visible = !showRiggedModel && lift < 1;
    });
  }
  if (testRun && !jumpFrame) testRun.maxLegCrossings = Math.max(testRun.maxLegCrossings, sameSideCrossings());
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
  animateSoftParts(gait, jumpFrame);
  renderLegs(jumpFrame, gait);
  syncRiggedSpider(gait, jumpFrame);
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

window.render_game_to_text = () => JSON.stringify({
  coordinates: "world x: forward, z: spider's right, y: up",
  spider: { x: Number(spider.position.x.toFixed(1)), z: Number(spider.position.z.toFixed(1)), heading: Number(spider.angle.toFixed(2)), speed: Number(spider.speed.toFixed(1)), jumping: Boolean(spider.jump), model: showRiggedModel ? "rigged" : "procedural" },
  rig: riggedSpider ? {
    bones: riggedBones.size,
    legRoots: ["Bone002_L", "Bone002_R", "Bone_L", "Bone_R"].filter(name => riggedBones.has(name)).length,
    ikLegs: riggedIK.length,
    endpointError: riggedIK.map(({ leg, effector }) => ({
      error: Number(effector.getWorldPosition(new THREE.Vector3()).distanceTo(leg.foot).toFixed(1)),
      end: effector.getWorldPosition(new THREE.Vector3()).toArray().map(value => Number(value.toFixed(1))),
      target: leg.foot.toArray().map(value => Number(value.toFixed(1))),
    })),
  } : null,
  feet: legs.map(leg => ({ pair: leg.pair + 1, side: leg.side < 0 ? "left" : "right", x: Number(leg.foot.x.toFixed(1)), z: Number(leg.foot.z.toFixed(1)), swinging: Boolean(leg.swing) })),
  selfTest: window.__spiderSelfTest || null,
});
window.advanceTime = ms => {
  const steps = Math.max(1, Math.round(ms / (1000 / 60)));
  for (let i = 0; i < steps; i++) render(1 / 60);
};
