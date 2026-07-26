/* global THREE */

// Browser-side integration for the downloadable, skinned spider asset.  The
// procedural gait remains the source of truth for footholds; this adapter only
// maps those targets onto the imported skeleton.

const rigLegBase = ["Bone002", "Bone003", "Bone004", "Bone"];

function setupRigIK(model) {
  let skinnedMesh = null;
  model.traverse(object => { if (object.isSkinnedMesh) skinnedMesh = object; });
  if (!skinnedMesh || !THREE.CCDIKSolver) return;
  const boneIndex = new Map(skinnedMesh.skeleton.bones.map((bone, index) => [bone.name, index]));
  const iks = [];
  model.updateMatrixWorld(true);
  for (const leg of legs) {
    const side = leg.side < 0 ? "L" : "R";
    const base = `${rigLegBase[leg.pair]}_${side}`;
    const chain = [];
    for (let index = 0; ; index++) {
      const bone = riggedBones.get(index ? `${base}${String(index).padStart(3, "0")}` : base);
      if (!bone || (chain.length && bone.parent !== chain[chain.length - 1])) break;
      chain.push(bone);
    }
    const last = chain[chain.length - 1];
    const effector = last && riggedBones.get(`${last.name}_end`);
    if (!effector || chain.length < 4 || ![effector, ...chain].every(bone => boneIndex.has(bone.name))) continue;
    const target = new THREE.Object3D();
    scene.add(target);
    chain.forEach(bone => { bone.userData.ikRestQuaternion = bone.quaternion.clone(); });
    riggedIK.push({ leg, target, effector, chain });
    iks.push({
      targetObject: target,
      effector: boneIndex.get(effector.name),
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
    riggedSpider = model;
    scene.add(model);
    setSpiderModel(false);
    setupRigIK(model);
    if (selfTest) startSelfTest(selfTestName);
  }, undefined, error => {
    console.warn("Rigged spider model failed to load; using procedural fallback.", error);
    if (selfTest) startSelfTest(selfTestName);
  });
}

function setSpiderModel(rigged) {
  showRiggedModel = Boolean(rigged && riggedSpider);
  body.visible = !showRiggedModel;
  legs.forEach(leg => leg.meshes.forEach(mesh => mesh.visible = !showRiggedModel));
  if (riggedSpider) riggedSpider.visible = showRiggedModel;
}

function syncRiggedSpider(gait, jumpFrame) {
  if (!riggedSpider || !showRiggedModel) return;
  riggedSpider.position.set(spider.position.x, 0, spider.position.z);
  riggedSpider.rotation.y = Math.PI / 2 - spider.angle;
  const phase = spider.gaitClock * Math.PI * 4;
  riggedSpider.position.y = jumpFrame ? Math.sin(jumpFrame.progress * Math.PI) * 18 : 0;
  if (riggedSolver) {
    riggedIK.forEach(({ chain }) => chain.forEach(bone => bone.quaternion.copy(bone.userData.ikRestQuaternion)));
    if (jumpFrame) return;
    riggedSpider.updateMatrixWorld(true);
    for (const ik of riggedIK) {
      ik.target.position.copy(ik.leg.foot);
      if (ik.leg.swing) ik.target.position.y = Math.sin(ik.leg.swing.progress * Math.PI) * 24;
      ik.target.updateMatrixWorld();
    }
    riggedSpider.updateMatrixWorld(true);
    riggedSolver.update();
    riggedSpider.updateMatrixWorld(true);
    for (const [index, ik] of riggedIK.entries()) {
      if (!ik.leg.swing && testRun) {
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
