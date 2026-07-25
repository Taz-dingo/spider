const canvas = document.querySelector("#stage");
const ctx = canvas.getContext("2d");
const hint = document.querySelector(".hint");

let width = 0, height = 0, dpr = 1, last = performance.now(), gaitClock = 0;
let pointer = { x: innerWidth * .58, y: innerHeight * .55 };
let spider = { x: pointer.x, y: pointer.y, angle: 0, speed: 0, pose: 0, jump: null };

const bases = [16, 7, -7, -15];
const legs = bases.flatMap((x, pair) => [-1, 1].map(side => ({
  pair, side, base: { x, y: side * (8 + (pair === 1 ? 2 : 0)) },
  phase: ((pair % 2 === 0) === (side === -1)) ? 0 : .5,
  foot: { x: 0, y: 0 }, start: { x: 0, y: 0 }, target: { x: 0, y: 0 }, swing: false,
})));

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function lerp(a, b, t) { return a + (b - a) * t; }
function ease(t) { return t * t * (3 - 2 * t); }
function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function angleTo(a, b) { return Math.atan2(b.y - a.y, b.x - a.x); }
function lerpAngle(a, b, t) { return a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t; }

function point(local, body = spider) {
  const c = Math.cos(body.angle), s = Math.sin(body.angle);
  return { x: body.x + local.x * c - local.y * s, y: body.y + local.x * s + local.y * c };
}

function seedFeet() {
  for (const leg of legs) {
    const local = { x: leg.base.x - 12, y: leg.side * (38 + leg.pair * 2) };
    leg.foot = point(local);
    leg.start = { ...leg.foot }; leg.target = { ...leg.foot };
  }
}

function nextFoot(leg, stride) {
  return point({ x: leg.base.x + stride * (.55 + leg.pair * .03), y: leg.side * (40 + leg.pair * 2) });
}

function movePointer(event) { pointer = { x: event.clientX, y: event.clientY }; }

function pounce(event) {
  movePointer(event);
  const target = { ...pointer };
  if (distance(spider, target) < 35) return;
  spider.jump = { elapsed: 0, duration: .68, from: { x: spider.x, y: spider.y }, to: target, angle: angleTo(spider, target) };
  spider.speed = 0;
  hint.innerHTML = '<span class="hint__dot"></span>锁定 · 跳扑！';
  setTimeout(() => hint.innerHTML = '<span class="hint__dot"></span>正在观察', 900);
}

function updateWalk(delta) {
  const targetDistance = distance(spider, pointer);
  const targetSpeed = targetDistance > 28 ? clamp(targetDistance * .9, 35, 220) : 0;
  spider.speed = lerp(spider.speed, targetSpeed, 1 - Math.exp(-delta * 7));
  if (targetDistance > 1) spider.angle = lerpAngle(spider.angle, angleTo(spider, pointer), 1 - Math.exp(-delta * 7));
  spider.x += Math.cos(spider.angle) * spider.speed * delta;
  spider.y += Math.sin(spider.angle) * spider.speed * delta;

  const gait = clamp(spider.speed / 180, 0, 1);
  if (gait < .03) return gait;
  // ponytail: planar foot anchors; add terrain contact only for a 3D world.
  gaitClock = (gaitClock + delta * (.34 + spider.speed / 110)) % 1;
  const duty = lerp(.67, .57, gait);
  const stride = lerp(27, 45, gait);
  for (const leg of legs) {
    const phase = (gaitClock + leg.phase) % 1;
    const swinging = phase > duty;
    if (swinging && !leg.swing) {
      leg.start = { ...leg.foot };
      leg.target = nextFoot(leg, stride);
    }
    leg.swing = swinging;
    if (!swinging) continue;
    const t = ease((phase - duty) / (1 - duty));
    leg.foot.x = lerp(leg.start.x, leg.target.x, t);
    leg.foot.y = lerp(leg.start.y, leg.target.y, t);
  }
  return gait;
}

function updateJump(delta) {
  const jump = spider.jump;
  jump.elapsed += delta;
  const progress = clamp(jump.elapsed / jump.duration, 0, 1);
  const launch = ease(clamp((progress - .28) / .12, 0, 1));
  const travel = ease(clamp((progress - .35) / .55, 0, 1));
  spider.angle = lerpAngle(spider.angle, jump.angle, 1 - Math.exp(-delta * 18));
  spider.x = lerp(jump.from.x, jump.to.x, travel);
  spider.y = lerp(jump.from.y, jump.to.y, travel);
  const airborne = Math.sin(clamp((progress - .35) / .52, 0, 1) * Math.PI);
  const arc = airborne * clamp(distance(jump.from, jump.to) * .13, 22, 58);
  if (progress >= 1) {
    spider.jump = null;
    seedFeet();
  }
  return { progress, launch, arc };
}

function drawLeg(leg, foot, lift = 0, faded = false, body = spider) {
  const base = point(leg.base, body);
  const displayFoot = { x: foot.x, y: foot.y - lift * .24 };
  const dx = displayFoot.x - base.x, dy = displayFoot.y - base.y;
  const length = clamp(Math.hypot(dx, dy), 12, 67);
  const ux = dx / length, uy = dy / length;
  const upper = 35, lower = 35;
  const along = (upper ** 2 - lower ** 2 + length ** 2) / (2 * length);
  const bend = Math.sqrt(Math.max(0, upper ** 2 - along ** 2));
  const normal = { x: -uy, y: ux };
  const lateral = point({ x: 0, y: leg.side }, body);
  const side = ((normal.x * (lateral.x - body.x) + normal.y * (lateral.y - body.y)) > 0) ? 1 : -1;
  const knee = { x: base.x + ux * along + normal.x * bend * side, y: base.y + uy * along + normal.y * bend * side - lift };

  ctx.globalAlpha = faded ? .72 : 1;
  ctx.beginPath(); ctx.moveTo(base.x, base.y); ctx.lineTo(knee.x, knee.y); ctx.lineTo(displayFoot.x, displayFoot.y); ctx.stroke();
  if (!faded) { ctx.beginPath(); ctx.arc(displayFoot.x, displayFoot.y, 1.55, 0, Math.PI * 2); ctx.fill(); }
  ctx.globalAlpha = 1;
}

function jumpLegPose(leg, progress, launch) {
  const isFront = leg.pair < 2;
  let local;
  let lift = 0;
  if (progress < .28) {
    local = isFront ? { x: leg.base.x + 34, y: leg.side * 47 } : { x: leg.base.x - 18, y: leg.side * 29 };
    lift = isFront ? 14 + progress * 35 : 0;
  } else if (progress < .43) {
    local = isFront ? { x: leg.base.x + 38, y: leg.side * 42 } : { x: leg.base.x - 39, y: leg.side * 31 };
    lift = isFront ? 15 : 0;
  } else if (progress < .85) {
    local = isFront ? { x: leg.base.x + 17, y: leg.side * 24 } : { x: leg.base.x - 12, y: leg.side * 24 };
    lift = 18;
  } else {
    const land = ease((progress - .85) / .15);
    local = isFront ? { x: leg.base.x + lerp(22, 47, land), y: leg.side * lerp(27, 46, land) } : { x: leg.base.x + lerp(-8, -24, land), y: leg.side * lerp(25, 37, land) };
    lift = (1 - land) * 13;
  }
  return { foot: point(local), lift, faded: progress > .4 && progress < .85, launch };
}

function drawSpider(now, gait, jumpFrame) {
  const jump = spider.jump;
  const bob = jump ? (jumpFrame.progress < .35 ? jumpFrame.progress * 7 : 0) : Math.sin(gaitClock * Math.PI * 4) * gait * 1.8;
  const drawBody = { ...spider, y: spider.y + bob - (jumpFrame?.arc || 0) };

  ctx.save();
  ctx.translate(spider.x, spider.y + 11);
  ctx.scale(1, .4);
  ctx.fillStyle = "#2932342b";
  ctx.beginPath(); ctx.ellipse(0, 0, 38 + gait * 6, 18, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  ctx.strokeStyle = "#182123"; ctx.fillStyle = "#182123"; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.lineWidth = 3.15;
  for (const leg of legs) {
    if (jump) {
      const posed = jumpLegPose(leg, jumpFrame.progress, jumpFrame.launch);
      drawLeg(leg, posed.foot, posed.lift, posed.faded, drawBody);
      continue;
    }
    const probing = leg.pair === 0 && spider.pose > 0;
    drawLeg(leg, leg.foot, leg.swing ? 13 + gait * 7 : probing ? spider.pose * 22 : 0, leg.swing, drawBody);
  }

  ctx.save();
  ctx.translate(drawBody.x, drawBody.y); ctx.rotate(drawBody.angle);
  ctx.shadowColor = "#0f1819"; ctx.shadowBlur = 4;
  ctx.beginPath(); ctx.ellipse(-4, 0, 20, 13, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(14, 0, 15, 11, 0, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#c98255";
  for (const [x, y, r] of [[20, -4, 2.4], [20, 4, 2.4], [25, -2, 1.3], [25, 2, 1.3]]) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}

function draw(now) {
  const delta = Math.min((now - last) / 1000, .04); last = now;
  spider.pose = Math.max(0, spider.pose - delta * .8);
  const jumpFrame = spider.jump ? updateJump(delta) : null;
  const gait = spider.jump ? 0 : updateWalk(delta);
  ctx.clearRect(0, 0, width, height);
  drawSpider(now, gait, jumpFrame);
  requestAnimationFrame(draw);
}

function resize() {
  dpr = Math.min(devicePixelRatio || 1, 2); width = innerWidth; height = innerHeight;
  canvas.width = width * dpr; canvas.height = height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

addEventListener("resize", resize);
addEventListener("pointermove", movePointer, { passive: true });
addEventListener("pointerdown", pounce);
addEventListener("keydown", event => {
  if (event.code !== "Space") return;
  event.preventDefault(); spider.pose = 1;
  hint.innerHTML = '<span class="hint__dot"></span>威吓姿态';
});

resize(); seedFeet();
console.assert(clamp(8, 0, 5) === 5 && Math.round(distance({ x: 0, y: 0 }, { x: 3, y: 4 })) === 5, "motion helpers failed");
requestAnimationFrame(draw);
