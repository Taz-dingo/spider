/* global THREE */

// Spider Brain v1 owns behaviour, not locomotion. It observes the desktop
// cursor as an environmental stimulus and chooses a short-lived behavioural
// intent. Motion Controller / gait still own how the body moves.
//
// Default contract: the spider does NOT continuously follow the mouse.
// Ordinary or distant cursor motion is ignored. Repeated nearby motion raises
// attention, which may escalate REST -> OBSERVE -> APPROACH -> STALK -> POUNCE.
// When uninterested, the spider alternates between REST and short local WANDER
// bouts so it reads as an autonomous creature instead of a cursor skin.

const brainTuning = {
  awarenessRadius: 420,
  observeAttention: .78,
  approachAttention: 1.5,
  attentionMax: 4,
  attentionDecay: .23,
  meaningfulMove: 1.5,
  fastMove: 18,
  stopMove: 2.5,
  approachStandOff: 135,
  stalkStandOff: 72,
  pounceRadius: 220,
  wanderMin: 110,
  wanderMax: 300,
  desktopMargin: 120,
};

const spiderBrain = {
  state: "REST",
  stateTime: 0,
  stateDeadline: 4,
  clock: 0,
  attention: 0,
  activityAge: 999,
  mouse: null,
  mouseLast: null,
  mouseMove: 0,
  mouseSpeed: 0,
  prevMouseMove: 0,
  mouseDistance: Infinity,
  fastStop: false,
  wanderTarget: null,
  rngState: null,
  pounceCooldown: 0,
};

let brainLastWall = performance.now() / 1000;
let brainForcedDelta = null;

function brainRandom() {
  if (spiderBrain.rngState == null) return Math.random();
  let x = spiderBrain.rngState | 0;
  x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  spiderBrain.rngState = x >>> 0;
  return spiderBrain.rngState / 4294967296;
}

function brainRange(min, max) { return min + (max - min) * brainRandom(); }

function brainStateDeadline(state) {
  switch (state) {
    case "REST": return brainRange(3.2, 7.2);
    case "WANDER": return brainRange(4.5, 8.0);
    case "OBSERVE": return brainRange(.8, 1.7);
    case "APPROACH": return brainRange(3.0, 6.0);
    case "STALK": return brainRange(3.5, 7.5);
    default: return 2;
  }
}

function enterBrainState(state) {
  spiderBrain.state = state;
  spiderBrain.stateTime = 0;
  spiderBrain.stateDeadline = brainStateDeadline(state);
  if (state !== "WANDER") spiderBrain.wanderTarget = null;
  if (state === "REST") spiderBrain.attention = Math.min(spiderBrain.attention, .45);
}

function resetSpiderBrain(seed = null) {
  spiderBrain.state = "REST";
  spiderBrain.stateTime = 0;
  spiderBrain.clock = 0;
  spiderBrain.attention = 0;
  spiderBrain.activityAge = 999;
  spiderBrain.mouse = null;
  spiderBrain.mouseLast = null;
  spiderBrain.mouseMove = 0;
  spiderBrain.mouseSpeed = 0;
  spiderBrain.prevMouseMove = 0;
  spiderBrain.mouseDistance = Infinity;
  spiderBrain.fastStop = false;
  spiderBrain.wanderTarget = null;
  spiderBrain.rngState = seed == null ? null : (Number(seed) >>> 0) || 1;
  spiderBrain.pounceCooldown = 0;
  spiderBrain.stateDeadline = brainStateDeadline("REST");
  pointer.copy(spider.position);
  petState = spiderBrain.state;
  petIdleTarget = null;
  brainLastWall = performance.now() / 1000;
  updateBrainDebug();
}

function brainMousePoint() {
  if (!window.__petMouse) return null;
  let x = window.__petMouse.x, z = window.__petMouse.z;
  const frame = window.__petFrame;
  if (frame) {
    const margin = 90;
    x = clamp(x, -frame.w / 2 + margin, frame.w / 2 - margin);
    z = clamp(z, -frame.h / 2 / VIEW_Z_K + margin / VIEW_Z_K, frame.h / 2 / VIEW_Z_K - margin / VIEW_Z_K);
  }
  return new THREE.Vector3(x, 0, z);
}

function updateBrainPerception(delta) {
  const mouse = brainMousePoint();
  spiderBrain.fastStop = false;
  if (!mouse) return null;

  const move = spiderBrain.mouseLast ? mouse.distanceTo(spiderBrain.mouseLast) : 0;
  const speed = move / Math.max(delta, 1 / 240);
  const distance = mouse.distanceTo(spider.position);
  const proximity = clamp((brainTuning.awarenessRadius - distance) / (brainTuning.awarenessRadius - 80), 0, 1);
  const meaningful = move > brainTuning.meaningfulMove;

  spiderBrain.prevMouseMove = spiderBrain.mouseMove;
  spiderBrain.mouseMove = move;
  spiderBrain.mouseSpeed = speed;
  spiderBrain.mouseDistance = distance;
  spiderBrain.mouse = mouse;

  if (meaningful && distance < brainTuning.awarenessRadius) {
    // Attention is event-driven: sustained nearby motion accumulates, while a
    // single ordinary pass usually produces only OBSERVE at most.
    spiderBrain.attention = clamp(
      spiderBrain.attention + clamp(move / 30, .08, 1.3) * (.22 + .78 * proximity) * .18,
      0,
      brainTuning.attentionMax,
    );
    spiderBrain.activityAge = 0;
    petMouseActive = performance.now() / 1000;
  } else {
    spiderBrain.activityAge += delta;
  }

  spiderBrain.attention = Math.max(0, spiderBrain.attention - delta * brainTuning.attentionDecay);
  spiderBrain.fastStop = spiderBrain.prevMouseMove > brainTuning.fastMove && move < brainTuning.stopMove && distance < brainTuning.pounceRadius;
  spiderBrain.mouseLast = mouse.clone();
  petMouseLast = { x: mouse.x, z: mouse.z };
  petPrevMoved = move;
  return mouse;
}

function pointAtWithoutWalking(target) {
  const direction = target.clone().sub(spider.position);
  direction.y = 0;
  if (direction.lengthSq() < .001) {
    pointer.copy(spider.position);
    return;
  }
  direction.normalize();
  pointer.copy(spider.position).addScaledVector(direction, 8); // inside motion arriveDistance
}

function targetWithStandOff(target, standOff) {
  const direction = target.clone().sub(spider.position);
  direction.y = 0;
  const distance = direction.length();
  if (distance <= standOff + 10 || distance < .001) {
    pointAtWithoutWalking(target);
    return;
  }
  direction.multiplyScalar(1 / distance);
  pointer.copy(target).addScaledVector(direction, -standOff);
}

function chooseWanderTarget() {
  const frame = window.__petFrame;
  const angle = brainRandom() * Math.PI * 2;
  const distance = brainRange(brainTuning.wanderMin, brainTuning.wanderMax);
  let x = spider.position.x + Math.cos(angle) * distance;
  let z = spider.position.z + Math.sin(angle) * distance;
  if (frame) {
    x = clamp(x, -frame.w / 2 + brainTuning.desktopMargin, frame.w / 2 - brainTuning.desktopMargin);
    z = clamp(
      z,
      -frame.h / 2 / VIEW_Z_K + brainTuning.desktopMargin / VIEW_Z_K,
      frame.h / 2 / VIEW_Z_K - brainTuning.desktopMargin / VIEW_Z_K,
    );
  }
  spiderBrain.wanderTarget = new THREE.Vector3(x, 0, z);
  petIdleTarget = spiderBrain.wanderTarget;
}

function beginBrainPounce(mouse) {
  if (spider.jump || spiderBrain.clock < spiderBrain.pounceCooldown) return false;
  spider.jump = {
    elapsed: 0,
    duration: .7,
    from: spider.position.clone(),
    to: mouse.clone(),
    angle: Math.atan2(mouse.z - spider.position.z, mouse.x - spider.position.x),
  };
  spider.speed = 0;
  spiderBrain.pounceCooldown = spiderBrain.clock + 2.5;
  enterBrainState("POUNCE");
  return true;
}

function updateSpiderBrain(delta) {
  spiderBrain.clock += delta;
  spiderBrain.stateTime += delta;
  const mouse = updateBrainPerception(delta);

  switch (spiderBrain.state) {
    case "REST": {
      pointer.copy(spider.position);
      if (mouse && spiderBrain.attention >= brainTuning.observeAttention && spiderBrain.mouseDistance < brainTuning.awarenessRadius) {
        enterBrainState("OBSERVE");
      } else if (spiderBrain.stateTime >= spiderBrain.stateDeadline) {
        enterBrainState("WANDER");
        chooseWanderTarget();
      }
      break;
    }

    case "WANDER": {
      if (mouse && spiderBrain.attention >= brainTuning.observeAttention && spiderBrain.mouseDistance < brainTuning.awarenessRadius) {
        enterBrainState("OBSERVE");
        pointAtWithoutWalking(mouse);
        break;
      }
      if (!spiderBrain.wanderTarget) chooseWanderTarget();
      pointer.copy(spiderBrain.wanderTarget);
      if (spider.position.distanceTo(spiderBrain.wanderTarget) < 34 || spiderBrain.stateTime >= spiderBrain.stateDeadline) {
        enterBrainState("REST");
        pointer.copy(spider.position);
      }
      break;
    }

    case "OBSERVE": {
      if (!mouse) { enterBrainState("REST"); break; }
      pointAtWithoutWalking(mouse);
      if (spiderBrain.fastStop && spiderBrain.attention > 1.1 && spiderBrain.stateTime > .25) {
        beginBrainPounce(mouse);
      } else if (spiderBrain.attention >= brainTuning.approachAttention && spiderBrain.mouseDistance < 320 && spiderBrain.stateTime > .4) {
        enterBrainState("APPROACH");
      } else if (spiderBrain.stateTime >= spiderBrain.stateDeadline && spiderBrain.attention < 1.1) {
        enterBrainState("REST");
      }
      break;
    }

    case "APPROACH": {
      if (!mouse || spiderBrain.mouseDistance > 500) { enterBrainState("REST"); break; }
      targetWithStandOff(mouse, brainTuning.approachStandOff);
      if (spiderBrain.fastStop && spiderBrain.mouseDistance < brainTuning.pounceRadius && spiderBrain.stateTime > .3) {
        beginBrainPounce(mouse);
      } else if (spiderBrain.mouseDistance < 175 && spiderBrain.stateTime > .4) {
        enterBrainState("STALK");
      } else if (spiderBrain.activityAge > 2.2 && spiderBrain.attention < .35) {
        enterBrainState("OBSERVE");
      } else if (spiderBrain.stateTime >= spiderBrain.stateDeadline) {
        enterBrainState("OBSERVE");
      }
      break;
    }

    case "STALK": {
      if (!mouse) { enterBrainState("REST"); break; }
      targetWithStandOff(mouse, brainTuning.stalkStandOff);
      if (spiderBrain.fastStop && spiderBrain.mouseDistance < brainTuning.pounceRadius && spiderBrain.stateTime > .2) {
        beginBrainPounce(mouse);
      } else if (spiderBrain.mouseDistance > 310 && spiderBrain.attention > .7) {
        enterBrainState("APPROACH");
      } else if ((spiderBrain.activityAge > 3 && spiderBrain.attention < .35) || spiderBrain.stateTime >= spiderBrain.stateDeadline) {
        enterBrainState("REST");
      }
      break;
    }

    case "POUNCE": {
      if (mouse) pointer.copy(mouse);
      if (!spider.jump && spiderBrain.stateTime > .75) {
        // After a strike the spider pauses to reassess instead of immediately
        // gluing itself back to the cursor.
        spiderBrain.attention = Math.min(spiderBrain.attention, .9);
        enterBrainState("OBSERVE");
      }
      break;
    }

    default:
      enterBrainState("REST");
  }

  petState = spiderBrain.state;
  petIdleTarget = spiderBrain.wanderTarget;
  if (spiderBrain.state !== "REST") petMouseActive = performance.now() / 1000;
  updateBrainDebug();
}

function updateBrainDebug() {
  window.__spiderBrain = {
    state: spiderBrain.state,
    stateTime: Number(spiderBrain.stateTime.toFixed(3)),
    attention: Number(spiderBrain.attention.toFixed(3)),
    activityAge: Number(spiderBrain.activityAge.toFixed(3)),
    mouseMove: Number(spiderBrain.mouseMove.toFixed(3)),
    mouseSpeed: Number(spiderBrain.mouseSpeed.toFixed(1)),
    mouseDistance: Number.isFinite(spiderBrain.mouseDistance) ? Number(spiderBrain.mouseDistance.toFixed(1)) : null,
    fastStop: spiderBrain.fastStop,
    wanderTarget: spiderBrain.wanderTarget ? [Number(spiderBrain.wanderTarget.x.toFixed(1)), Number(spiderBrain.wanderTarget.z.toFixed(1))] : null,
  };
}

// app.js already calls petPointer() from the pet render path. Brain v1 takes
// ownership of that hook while leaving locomotion/rendering untouched.
petPointer = function brainPetPointer() {
  const now = performance.now() / 1000;
  const delta = brainForcedDelta ?? clamp(now - brainLastWall, 1 / 240, .08);
  brainLastWall = now;
  updateSpiderBrain(delta);
};

// Make deterministic simulation advance the brain with the same 60 Hz steps
// used by app.js. This is intentionally a thin adapter around the existing
// locomotion helper rather than a second simulation loop.
const advanceLocomotionTime = window.advanceTime;
window.advanceTime = ms => {
  brainForcedDelta = 1 / 60;
  try { return advanceLocomotionTime(ms); }
  finally { brainForcedDelta = null; }
};

window.resetSpiderBrain = resetSpiderBrain;
resetSpiderBrain(new URLSearchParams(location.search).has("brainseed") ? Number(new URLSearchParams(location.search).get("brainseed")) : null);
