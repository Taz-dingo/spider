/* global THREE */

// The only startup side effects live here, after every runtime module loaded.

const tuningFields = [
  ["total", "链长", 7, 11, .1], ["rootX", "髋前后", -2, 25, 1], ["rootZ", "髋外移", 4, 18, 1],
  ["footForward", "落脚前后", -30, 55, 1], ["footSpread", "落脚外展", 15, 65, 1], ["stepSector", "扇区", .18, .7, .01],
];
const tuningInputs = [];
const legTuner = document.querySelector("#leg-tuner");

function tuningValue(pair, key) {
  return key === "total" ? specimen.total[pair] : key === "rootX" ? roots[pair].x : key === "rootZ" ? roots[pair].z : ({ footForward, footSpread, stepSector }[key])[pair];
}

function syncLegTuner() {
  tuningInputs.forEach(({ input, output, pair, key }) => { input.value = tuningValue(pair, key); output.textContent = input.value; });
}

for (let pair = 0; pair < 4; pair++) {
  const group = document.createElement("section"); group.className = "tuner__pair";
  const title = document.createElement("strong"); title.textContent = `第 ${pair + 1} 对足`; group.append(title);
  for (const [key, label, min, max, step] of tuningFields) {
    const row = document.createElement("label"), input = document.createElement("input"), output = document.createElement("output");
    input.type = "range"; input.min = min; input.max = max; input.step = step; input.value = tuningValue(pair, key);
    output.textContent = input.value; row.append(label, input, output); group.append(row);
    input.addEventListener("input", () => { setLegTuning(pair, key, Number(input.value)); output.textContent = input.value; });
    tuningInputs.push({ input, output, pair, key });
  }
  legTuner.append(group);
}
document.querySelector(".tuner__reset").addEventListener("click", () => { resetLegTuning(); syncLegTuner(); });

addEventListener("resize", resize);
addEventListener("pointermove", setPointer, { passive: true });
addEventListener("pointerdown", pounce);
addEventListener("keydown", event => {
  if (event.code === "Space") {
    event.preventDefault(); spider.pose = 1;
    hint.innerHTML = '<span class="hint__dot"></span>威吓姿态';
  }
});

resize();
if (petMode) {
  // Desktop pet: start at the screen centre, hide the browser-only chrome,
  // and let the shell drive the spider from the global cursor and window bounds.
  hint.style.display = "none";
  document.querySelector(".tuner").style.display = "none";
  document.querySelector(".controls").style.display = "none";
  spider.position.set(0, 0, 0);
  spider.angle = 0;
  seedFeet();
} else {
  setPointer({ clientX: innerWidth * .58, clientY: innerHeight * .55 });
  spider.position.copy(pointer); seedFeet();
}
console.assert(Math.abs(angleDelta(0, Math.PI * 2)) < .001 && lengthsFor(0).length === 7, "3D leg helpers failed");
requestAnimationFrame(loop);
