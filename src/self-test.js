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
    elapsed: 0, phaseElapsed: 0, phase: 0, steps: 0, maxReach: 0, maxSector: 0, maxTurn: 0, minFootGap: Infinity, maxLegCrossings: 0, maxCoxaShellError: 0, timeouts: 0,
    femurPatella: { min: Infinity, max: -Infinity },
    distal: { min: Infinity, max: -Infinity }, terminal: { min: Infinity, max: -Infinity },
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
  const rigPass = !showRiggedModel || (riggedIK.length === legs.length && testRun.rigBoneMotion >= .12 && testRun.rigFootError < 12 && testRun.pairSteps.every(count => count > 0));
  const passed = complete && testRun.timeouts === 0 && testRun.steps >= 8 && testRun.maxReach <= 58.1 && testRun.maxSector <= .9 && testRun.minFootGap >= 10 && testRun.maxLegCrossings === 0 && testRun.maxCoxaShellError < .001 && testRun.maxTurn >= testRun.minTurn && angleEnvelopePass && frontPass && rigPass;
  window.__spiderSelfTest = { name: testRun.name, running: !complete, passed: complete && passed, elapsed: testRun.elapsed, phase: testRun.phase, steps: testRun.steps, pairSteps: testRun.pairSteps, maxReach: testRun.maxReach, maxSector: testRun.maxSector, maxTurn: testRun.maxTurn, minFootGap: testRun.minFootGap, legCrossings: testRun.maxLegCrossings, maxCoxaShellError: testRun.maxCoxaShellError, crossingPairs: [...testRun.crossingPairs], femurPatella: testRun.femurPatella, distal: testRun.distal, terminal: testRun.terminal, frontTouchdown: testRun.frontTouchdown, frontPass, rigBoneMotion: testRun.rigBoneMotion, rigFootError: testRun.rigFootError, rigFootErrors: testRun.rigFootErrors, ikLegs: riggedIK.length, finishError: error, timeouts: testRun.timeouts, heading: spider.angle, turnBlocked: testRun.turnBlocked };
  if (complete) testRun.complete = true;
}
