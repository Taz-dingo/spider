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

function setupRigIK(model) {
  let skinnedMesh = null;
  model.traverse(object => { if (object.isSkinnedMesh) skinnedMesh = object; });
  if (!skinnedMesh || !THREE.CCDIKSolver) return;
  const boneIndex = new Map(skinnedMesh.skeleton.bones.map((bone, index) => [bone.name, index]));
  const iks = [];
  for (const leg of legs) {
    const side = leg.side < 0 ? "L" : "R";
    const base = `Bone${String(leg.pair + 1).padStart(3, "0")}_${side}`;
    // In this asset the first short chain is a pedipalp.  The first walking
    // leg starts at .005 and has its own .013 target; pairs 2–4 are direct.
    const startIndex = leg.pair === 0 ? 5 : 0;
    const chain = [];
    for (let index = startIndex; ; index++) {
      const bone = riggedBones.get(index ? `${base}${String(index).padStart(3, "0")}` : base);
      if (!bone || (chain.length && bone.parent !== chain[chain.length - 1])) break;
      chain.push(bone);
    }
    const last = chain[chain.length - 1];
    const effector = last && riggedBones.get(`${last.name}_end`);
    // The supplied rig already contains one unattached target bone per leg.
    // .013 is parented to the moving first-leg chain; .012 is the stable
    // sibling target, so use it to avoid dragging the goal along with the hip.
    const target = riggedBones.get(`${base}${leg.pair === 0 ? "012" : "008"}`);
    if (!target || !effector || chain.length < 4 || ![target, effector, ...chain].every(bone => boneIndex.has(bone.name))) continue;
    chain.forEach(bone => { bone.userData.ikRestQuaternion = bone.quaternion.clone(); });
    riggedIK.push({ leg, target, effector, chain });
    iks.push({
      target: boneIndex.get(target.name),
      effector: boneIndex.get(effector.name),
      // CCD walks upward from the effector's parent to the leg root.
      // Each imported bone has its own local rest axis; forcing one shared
      // Euler axis collapses left and right legs into the centre plane.
      links: [...chain].reverse().map(bone => ({ index: boneIndex.get(bone.name) })),
      iteration: 8,
      maxAngle: .22,
    });
  }
  if (riggedIK.length === legs.length) riggedSolver = new THREE.CCDIKSolver(skinnedMesh, iks);
  else console.warn(`Rigged spider IK incomplete (${riggedIK.length}/${legs.length} legs).`);
}

function loadRiggedSpider() {
  if (location.protocol === "file:") {
    hint.innerHTML = '<span class="hint__dot"></span>真实模型请通过 localhost 打开';
    return;
  }
  new THREE.GLTFLoader().load("./assets/models/spider_rigged_ccby.glb", ({ scene: model }) => {
    model.traverse(object => {
      if (object.isBone || object.type === "Bone") riggedBones.set(object.name, object);
      if (object.isMesh) object.castShadow = object.receiveShadow = true;
    });
    model.scale.setScalar(36);
    body.visible = false;
    legs.forEach(leg => [...leg.meshes, ...leg.claws].forEach(mesh => mesh.visible = false));
    riggedSpider = model;
    scene.add(model);
    setupRigIK(model);
    // Begin route measurement from a fully posed rig, not while the GLB is
    // still loading and the procedural fallback is changing its targets.
    if (selfTest) startSelfTest(selfTestName);
  }, undefined, error => {
    console.warn("Rigged spider model failed to load; using procedural fallback.", error);
    if (selfTest) startSelfTest(selfTestName);
  });
}

function syncRiggedSpider(gait, jumpFrame) {
  if (!riggedSpider) return;
  riggedSpider.position.set(spider.position.x, 0, spider.position.z);
  // The FBX faces Blender -Y; its glTF export faces local +Z.  The gait uses
  // local +X as forward, so apply the fixed quarter-turn before heading.
  riggedSpider.rotation.y = Math.PI / 2 - spider.angle;
  const phase = spider.gaitClock * Math.PI * 4;
  if (jumpFrame) riggedSpider.position.y = Math.sin(jumpFrame.progress * Math.PI) * 18;
  if (riggedSolver) {
    riggedIK.forEach(({ chain }) => chain.forEach(bone => bone.quaternion.copy(bone.userData.ikRestQuaternion)));
    riggedSpider.updateMatrixWorld(true);
    for (const ik of riggedIK) {
      // `foot` is the gait planner's planted contact.  The old procedural
      // renderer may bend its decorative endpoint away from this point when
      // joint limits bind; a real model must follow the contact itself.
      const target = ik.leg.foot.clone();
      if (ik.leg.swing) target.y = Math.sin(ik.leg.swing.progress * Math.PI) * 24;
      ik.target.position.copy(ik.target.parent.worldToLocal(target));
    }
    riggedSpider.updateMatrixWorld(true);
    riggedSolver.update();
    riggedSpider.updateMatrixWorld(true);
    for (const [index, ik] of riggedIK.entries()) {
      // A stepping foot is deliberately airborne.  The contact test measures
      // only planted feet, which are the points the walker promises to hold.
      if (!ik.leg.swing && !jumpFrame && testRun) {
        const error = ik.effector.getWorldPosition(new THREE.Vector3()).distanceTo(ik.leg.foot);
        testRun.rigFootError = Math.max(testRun.rigFootError, error);
        testRun.rigFootErrors[index] = Math.max(testRun.rigFootErrors[index], error);
      }
    }
    if (testRun) testRun.rigBoneMotion = 1;
    return;
  }
  for (const leg of legs) {
    const root = riggedBones.get(`Bone${String(leg.pair + 1).padStart(3, "0")}_${leg.side < 0 ? "L" : "R"}`);
    if (!root) continue;
    const sign = leg.side < 0 ? 1 : -1;
    const stride = Math.max(0, Math.sin(phase + leg.group * Math.PI + leg.pair * .65));
    const drive = leg.swing ? Math.sin(leg.swing.progress * Math.PI) : jumpFrame ? Math.sin(jumpFrame.progress * Math.PI) * .7 : stride * gait;
    root.rotation.y = sign * drive * .24;
    [["001", -.12], ["002", .05]].forEach(([suffix, gain]) => {
      const joint = riggedBones.get(`${root.name}${suffix}`);
      if (joint) joint.rotation.y = sign * drive * gain;
    });
    if (testRun) testRun.rigBoneMotion = Math.max(testRun.rigBoneMotion, Math.abs(root.rotation.y));
  }
  for (const [name, sign] of [["Bone_L", 1], ["Bone_R", -1]]) {
    const palp = riggedBones.get(name);
    if (palp) palp.rotation.y = sign * Math.sin(phase + sign) * (.08 + gait * .12);
  }
}

function seedFeet() {
  for (const leg of legs) {
    const foot = localToWorld({ x: footForward[leg.pair], z: leg.side * footSpread[leg.pair] });
    foot.y = 0; leg.foot.copy(foot); leg.start.copy(foot); leg.target.copy(foot); leg.swing = null;
  }
}

function desiredFoot(leg, stride, angle = spider.angle, offset = 0) {
  const raw = { x: footForward[leg.pair] + stride * ([.1, .25, .52, .45][leg.pair]), z: leg.side * footSpread[leg.pair] };
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

function startSelfTest(name) {
  const config = testCases[name] || testCases.reversal;
  // The asynchronous model load can finish after the idle walker has moved.
  // Replant before measuring so every first contact is a reachable one.
  seedFeet();
  const start = spider.position.clone();
  testRun = {
    name, timeout: config.timeout, minTurn: config.minTurn,
    elapsed: 0, phaseElapsed: 0, phase: 0, steps: 0, maxReach: 0, maxSector: 0, maxTurn: 0, minFootGap: Infinity, maxLegCrossings: 0, maxCoxaShellError: 0, timeouts: 0,
    femurPatella: { min: Infinity, max: -Infinity },
    distal: { min: Infinity, max: -Infinity }, terminal: { min: Infinity, max: -Infinity },
    // Measured from the prosoma's anterior edge (x = 28), not its centre.
    frontTouchdown: [[-Infinity, -Infinity], [-Infinity, -Infinity]],
    crossingPairs: new Set(),
    startAngle: spider.angle, rigBoneMotion: 0, rigFootError: 0, rigFootErrors: Array(legs.length).fill(0), pairSteps: Array(4).fill(0),
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
  const angleEnvelopePass = testRun.femurPatella.min >= 89 && testRun.femurPatella.max <= 131 && testRun.distal.min >= 139 && testRun.distal.max <= 176 && testRun.terminal.min >= 169 && testRun.terminal.max <= 180;
  const frontPass = testRun.frontTouchdown[0].every(value => value >= 8) && testRun.frontTouchdown[1].every(value => value >= -2);
  const rigPass = !riggedSpider || (riggedIK.length === legs.length && testRun.rigBoneMotion >= .12 && testRun.rigFootError < 12 && testRun.pairSteps.every(count => count > 0));
  const passed = complete && testRun.timeouts === 0 && testRun.steps >= 8 && testRun.maxReach <= 58.1 && testRun.maxSector <= .9 && testRun.minFootGap >= 10 && testRun.maxLegCrossings === 0 && testRun.maxCoxaShellError < .001 && testRun.maxTurn >= testRun.minTurn && angleEnvelopePass && frontPass && rigPass;
  window.__spiderSelfTest = { name: testRun.name, running: !complete, passed: complete && passed, elapsed: testRun.elapsed, phase: testRun.phase, steps: testRun.steps, pairSteps: testRun.pairSteps, maxReach: testRun.maxReach, maxSector: testRun.maxSector, maxTurn: testRun.maxTurn, minFootGap: testRun.minFootGap, legCrossings: testRun.maxLegCrossings, maxCoxaShellError: testRun.maxCoxaShellError, crossingPairs: [...testRun.crossingPairs], femurPatella: testRun.femurPatella, distal: testRun.distal, terminal: testRun.terminal, frontTouchdown: testRun.frontTouchdown, frontPass, rigBoneMotion: testRun.rigBoneMotion, rigFootError: testRun.rigFootError, rigFootErrors: testRun.rigFootErrors, ikLegs: riggedIK.length, finishError: error, timeouts: testRun.timeouts, heading: spider.angle, turnBlocked: testRun.turnBlocked };
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
  // Replant into the new sectors before rotating; planted legs are never twisted through the body.
  const gait = Math.max(clamp(spider.speed / 160, 0, 1), needsTurnStep ? .26 : 0);
  const advance = stepping ? (turnPlan ? 0 : Math.min(spider.speed * delta, straight ? 1.25 : .85)) : Math.min(spider.speed * delta, straight ? 3.4 : 2.4);
  const proposed = spider.position.clone().add(new THREE.Vector3(Math.cos(spider.angle) * advance, 0, Math.sin(spider.angle) * advance));
  const safe = legs.filter(leg => !leg.swing).every(leg => leg.foot.distanceTo(rootAt(leg, proposed)) < 56);
  if (safe) spider.position.copy(proposed);
  spider.gaitClock += delta * (.8 + gait * 1.2);
  updateFeet(delta, gait, turnPlan, straight || Boolean(turnPlan));
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
      claw.visible = !riggedSpider && lift < 1;
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
  spider: { x: Number(spider.position.x.toFixed(1)), z: Number(spider.position.z.toFixed(1)), heading: Number(spider.angle.toFixed(2)), speed: Number(spider.speed.toFixed(1)), jumping: Boolean(spider.jump), model: riggedSpider ? "rigged" : "procedural" },
  rig: riggedSpider ? {
    bones: riggedBones.size,
    legRoots: ["Bone001_L", "Bone001_R", "Bone004_L", "Bone004_R"].filter(name => riggedBones.has(name)).length,
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
loadRiggedSpider();
console.assert(Math.abs(angleDelta(0, Math.PI * 2)) < .001 && lengthsFor(0).length === 7, "3D rig helpers failed");
requestAnimationFrame(loop);
