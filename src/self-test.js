/* global THREE */

// Deterministic route checks.  Their result is exposed via
// window.render_game_to_text for autonomous browser verification.

function startSelfTest(name) {
  const config = testCases[name] || testCases.reversal;
  spider.speed = 0;
  spider.angle = 0;
  turnPlan = null;
  seedFeet();
  const start = spider.position.clone();
  testRun = {
    name, timeout: config.timeout, minTurn: config.minTurn,
    elapsed: 0, phaseElapsed: 0, phase: 0, steps: 0, maxReach: 0, maxSector: 0, maxTurn: 0, minFootGap: Infinity, maxLegCrossings: 0, maxCoxaShellError: 0, bodyPenetrations: 0, bodyTravel: 0, footTravel: 0, twitchTime: 0, maxStall: 0, stallTime: 0, timeouts: 0,
    femurPatella: { min: Infinity, max: -Infinity },
    distal: { min: Infinity, max: -Infinity }, terminal: { min: Infinity, max: -Infinity },
    frontTouchdown: [[-Infinity, -Infinity], [-Infinity, -Infinity]],
    crossingPairs: new Set(),
    startAngle: spider.angle, rigBoneMotion: 0, rigFootError: 0, rigFootErrors: Array(legs.length).fill(0), pairSteps: Array(4).fill(0),
    goals: config.goals.map(([x, z]) => start.clone().add(new THREE.Vector3(x, 0, z))),
    lastPosition: start.clone(), lastFeet: legs.map(leg => leg.foot.clone()), lastError: Infinity,
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
  const frameBodyTravel = spider.position.distanceTo(testRun.lastPosition);
  const frameFootTravel = legs.reduce((sum, leg, index) => sum + leg.foot.distanceTo(testRun.lastFeet[index]), 0);
  testRun.bodyTravel += frameBodyTravel;
  testRun.footTravel += frameFootTravel;
  // A brief planted phase is normal; moving feet without either body movement
  // or goal progress is the visible "twitch" we want to drive down.
  if (frameFootTravel > .18 && frameBodyTravel < .025 && error >= testRun.lastError - .02) testRun.twitchTime += delta;
  testRun.stallTime = error >= testRun.lastError - .02 && error > 26 ? testRun.stallTime + delta : 0;
  testRun.maxStall = Math.max(testRun.maxStall, testRun.stallTime);
  testRun.lastPosition.copy(spider.position);
  legs.forEach((leg, index) => testRun.lastFeet[index].copy(leg.foot));
  testRun.lastError = error;
  if (error < 26 && testRun.phase < testRun.goals.length - 1) { testRun.phase++; testRun.phaseElapsed = 0; }
  else testRun.phaseElapsed += delta;
  if (testRun.phaseElapsed > testRun.timeout) { testRun.timeouts++; testRun.complete = true; }
  const complete = testRun.complete || (testRun.phase === testRun.goals.length - 1 && error < 26);
  const angleEnvelopePass = testRun.femurPatella.min >= 89 && testRun.femurPatella.max <= 131 && testRun.distal.min >= 139 && testRun.distal.max <= 176 && testRun.terminal.min >= 169 && testRun.terminal.max <= 180;
  const frontPass = testRun.frontTouchdown[0].every(value => value >= 8) && testRun.frontTouchdown[1].every(value => value >= -2);
  const rigPass = !showRiggedModel || (riggedIK.length === legs.length && testRun.rigBoneMotion >= .12 && testRun.rigFootError < 12 && testRun.pairSteps.every(count => count > 0));
  const gaitEfficiency = testRun.bodyTravel ? testRun.footTravel / testRun.bodyTravel : Infinity;
  const passed = complete && testRun.timeouts === 0 && testRun.steps >= 8 && testRun.maxReach <= 58.1 && testRun.maxSector <= .9 && testRun.minFootGap >= 10 && testRun.maxLegCrossings === 0 && testRun.maxCoxaShellError < .001 && testRun.bodyPenetrations === 0 && testRun.maxTurn >= testRun.minTurn && angleEnvelopePass && frontPass && rigPass;
  window.__spiderSelfTest = { name: testRun.name, running: !complete, passed: complete && passed, elapsed: testRun.elapsed, phase: testRun.phase, steps: testRun.steps, pairSteps: testRun.pairSteps, maxReach: testRun.maxReach, maxSector: testRun.maxSector, maxTurn: testRun.maxTurn, minFootGap: testRun.minFootGap, legCrossings: testRun.maxLegCrossings, maxCoxaShellError: testRun.maxCoxaShellError, bodyPenetrations: testRun.bodyPenetrations, bodyTravel: testRun.bodyTravel, footTravel: testRun.footTravel, gaitEfficiency, twitchTime: testRun.twitchTime, maxStall: testRun.maxStall, crossingPairs: [...testRun.crossingPairs], femurPatella: testRun.femurPatella, distal: testRun.distal, terminal: testRun.terminal, frontTouchdown: testRun.frontTouchdown, frontPass, rigBoneMotion: testRun.rigBoneMotion, rigFootError: testRun.rigFootError, rigFootErrors: testRun.rigFootErrors, ikLegs: riggedIK.length, finishError: error, timeouts: testRun.timeouts, heading: spider.angle, turnBlocked: testRun.turnBlocked };
  if (complete) testRun.complete = true;
}
