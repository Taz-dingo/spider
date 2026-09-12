/* global THREE */

// Body-level intent.  This layer deliberately knows nothing about individual
// legs, footholds or support polygons: it answers only where the creature
// wants to go, how fast, and which heading it wants next.  Gait may correct
// the realised motion, but should not redefine the intent.
const motionTuning = {
  turnRate: 5.2,
  arriveDistance: 12,
  arcLimit: 1.2,
  straightAngle: .18,
  alignedAngle: .55,
  response: 7,
};

function bodyMotionIntent(delta) {
  const toPointer = pointer.clone().sub(spider.position);
  toPointer.y = 0;
  const distance = toPointer.length();
  const heading = Math.atan2(toPointer.z, toPointer.x);
  const requestedAngle = spider.angle + clamp(
    angleDelta(spider.angle, heading),
    -delta * motionTuning.turnRate,
    delta * motionTuning.turnRate,
  );
  return { distance, heading, requestedAngle };
}

// Resolve desired speed against the body angle that gait actually allowed for
// this frame.  Keeping this separate preserves the existing behaviour while
// making the ownership explicit: Motion Controller owns desired speed;
// locomotion/gait only supplies the realised body angle.
function resolveBodyMotion(intent, angle = spider.angle) {
  const headingError = Math.abs(angleDelta(angle, intent.heading));
  const straight = headingError < motionTuning.straightAngle;
  const aligned = headingError < motionTuning.alignedAngle;
  const targetSpeed = intent.distance > motionTuning.arriveDistance && headingError < motionTuning.arcLimit
    ? clamp(
      intent.distance * (straight ? 1.2 : 1.05),
      straight ? 34 : aligned ? 30 : 12,
      straight ? 220 : aligned ? 185 : 45,
    )
    : 0;
  return { ...intent, headingError, straight, aligned, targetSpeed };
}

function updateBodySpeed(motion, delta) {
  spider.speed += (motion.targetSpeed - spider.speed) * (1 - Math.exp(-delta * motionTuning.response));
  return spider.speed;
}
