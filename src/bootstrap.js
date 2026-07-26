/* global THREE */

// The only startup side effects live here, after every runtime module loaded.

addEventListener("resize", resize);
addEventListener("pointermove", setPointer, { passive: true });
addEventListener("pointerdown", pounce);
addEventListener("keydown", event => {
  if (event.code === "KeyM") {
    event.preventDefault(); setSpiderModel(!showRiggedModel);
    hint.innerHTML = `<span class="hint__dot"></span>${showRiggedModel ? "真实模型" : "程序化模型"}`;
  } else if (event.code === "Space") {
    event.preventDefault(); spider.pose = 1;
    hint.innerHTML = '<span class="hint__dot"></span>威吓姿态';
  }
});

resize();
setPointer({ clientX: innerWidth * .58, clientY: innerHeight * .55 });
spider.position.copy(pointer); seedFeet();
loadRiggedSpider();
console.assert(Math.abs(angleDelta(0, Math.PI * 2)) < .001 && lengthsFor(0).length === 7, "3D rig helpers failed");
requestAnimationFrame(loop);
