#!/usr/bin/env node
import { readFileSync } from "node:fs";

const file = process.argv[2];
if (!file) {
  console.error("usage: node desktop/analyze-trace.mjs /tmp/spider-cross-screen.jsonl");
  process.exit(2);
}

const samples = readFileSync(file, "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line));
if (!samples.length) throw new Error("trace has no samples");

const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const transitions = values => {
  const cleaned = values.filter(v => Number.isInteger(v) && v >= 0);
  let count = 0;
  for (let i = 1; i < cleaned.length; i++) if (cleaned[i] !== cleaned[i - 1]) count++;
  return count;
};
const unique = values => [...new Set(values.filter(v => Number.isInteger(v) && v >= 0))];

let maxWindowError = 0;
let maxPublishedPoseError = 0;
let maxPointerMouseError = 0;
let maxMouseConversionError = 0;

for (const sample of samples) {
  if (sample.windowCenter && sample.expectedPoseGlobal) maxWindowError = Math.max(maxWindowError, distance(sample.windowCenter, sample.expectedPoseGlobal));
  if (sample.page?.spider && sample.lastPagePose) maxPublishedPoseError = Math.max(maxPublishedPoseError, distance(sample.page.spider, sample.lastPagePose));
  if (sample.page?.pointer && sample.page?.petMouse) maxPointerMouseError = Math.max(maxPointerMouseError,
    distance(sample.page.pointer, [sample.page.petMouse.x, sample.page.petMouse.z]));
  if (sample.mousePage && sample.page?.petMouse) maxMouseConversionError = Math.max(maxMouseConversionError,
    distance(sample.mousePage, [sample.page.petMouse.x, sample.page.petMouse.z]));
}

const mouseScreens = samples.map(s => s.mouseScreen);
const poseScreens = samples.map(s => s.poseScreen);
const report = {
  samples: samples.length,
  durationSeconds: Number((samples.at(-1).timestamp - samples[0].timestamp).toFixed(2)),
  screens: samples[0].screens,
  screensHaveSeparateSpaces: samples[0].screensHaveSeparateSpaces,
  mouseScreensVisited: unique(mouseScreens),
  poseScreensVisited: unique(poseScreens),
  mouseScreenTransitions: transitions(mouseScreens),
  poseScreenTransitions: transitions(poseScreens),
  maxWindowFollowError: Number(maxWindowError.toFixed(3)),
  maxPublishedPoseError: Number(maxPublishedPoseError.toFixed(3)),
  maxPointerVsInjectedMouseError: Number(maxPointerMouseError.toFixed(3)),
  maxNativeVsInjectedMouseError: Number(maxMouseConversionError.toFixed(3)),
};

console.log(JSON.stringify(report, null, 2));

if (report.mouseScreenTransitions > 0 && report.poseScreenTransitions === 0) {
  console.log("\nDIAGNOSIS: mouse crossed displays but logical spider never did -> inspect locomotion/target/topology path before native rendering.");
} else if (report.poseScreenTransitions > 0 && report.maxWindowFollowError > 4) {
  console.log("\nDIAGNOSIS: logical spider crossed but native window did not follow accurately -> inspect WKScriptMessage/native window bridge.");
} else if (report.poseScreenTransitions > 0 && report.maxWindowFollowError <= 4) {
  console.log("\nDIAGNOSIS: logic and native window both crossed. If pixels were still absent on the other physical display, the remaining defect is visual/window-server/compositor evidence, not coordinate mapping.");
} else {
  console.log("\nDIAGNOSIS: trace did not exercise a cross-screen traversal. Repeat A -> B -> A -> B while tracing.");
}
