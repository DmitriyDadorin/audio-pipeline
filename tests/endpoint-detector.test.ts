import test from "node:test";
import assert from "node:assert/strict";
import { EndpointDetector } from "../src/speech/endpoint/endpoint-detector.ts";
import type { EndpointDetectorConfig, EndpointTransition } from "../src/speech/types.ts";

const config: EndpointDetectorConfig = {
  frameDurationMs: 20,
  startTriggerMs: 60,
  minSpeechMs: 160,
  endOfSpeechMs: 720,
  hangoverMs: 260,
  cooldownMs: 180,
  speechThreshold: 0.62,
  silenceThreshold: 0.38,
};

function runFrames(
  detector: EndpointDetector,
  probability: number,
  frameCount: number,
  startTimestampMs = 0,
): EndpointTransition[] {
  const transitions: EndpointTransition[] = [];

  for (let index = 0; index < frameCount; index += 1) {
    const result = detector.process(
      probability,
      startTimestampMs + (index * config.frameDurationMs),
    );

    if (result.transition !== "none") {
      transitions.push(result.transition);
    }
  }

  return transitions;
}

test("endpoint detector confirms speech, tolerates pause, and finalizes after stable silence", () => {
  const detector = new EndpointDetector(config);

  const speechTransitions = runFrames(detector, 0.82, 12);

  assert.deepEqual(speechTransitions, ["speech_start", "speech_active"]);

  const shortPause = detector.process(0.05, 240);

  assert.equal(shortPause.transition, "speech_pause");
  assert.equal(shortPause.phase, "speech_active");
  assert.equal(shortPause.likelyContinuation, true);

  const untilPossibleEnd = runFrames(detector, 0.04, 12, 260);

  assert.equal(untilPossibleEnd.includes("possible_end"), true);
  assert.equal(detector.getPhase(), "possible_end");

  const untilSpeechEnd = runFrames(detector, 0.03, 24, 520);

  assert.equal(untilSpeechEnd.includes("speech_end"), true);
  assert.equal(detector.getPhase(), "cooldown");
});

test("endpoint detector resumes active speech if the user restarts during a possible end", () => {
  const detector = new EndpointDetector(config);

  runFrames(detector, 0.84, 12);
  runFrames(detector, 0.05, 13, 240);

  const resumed = detector.process(0.9, 500);

  assert.equal(resumed.transition, "speech_resume");
  assert.equal(resumed.phase, "speech_active");
  assert.equal(resumed.likelyContinuation, false);
});

test("endpoint detector ignores short false starts below the start trigger", () => {
  const detector = new EndpointDetector(config);

  const transitions = runFrames(detector, 0.9, 2);

  assert.deepEqual(transitions, []);
  assert.equal(detector.getPhase(), "silence");
});
