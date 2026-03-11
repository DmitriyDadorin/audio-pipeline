import test from "node:test";
import assert from "node:assert/strict";
import { SpeechStateMachine } from "../src/speech/state/speech-state-machine.ts";
import type {
  EndpointDetectorFrameResult,
  EndpointPhase,
} from "../src/speech/types.ts";

function detectorResult(
  phase: EndpointPhase,
  timestampMs = 0,
): EndpointDetectorFrameResult {
  return {
    phase,
    transition: "none",
    timestampMs,
    speechProbability: 0.5,
    speaking: phase === "speech_candidate" || phase === "speech_active",
    inUtterance: phase !== "silence" && phase !== "cooldown",
    shortPause: phase === "possible_end",
    likelyContinuation: phase === "possible_end",
    speechDurationMs: phase === "silence" ? 0 : 200,
    trailingSilenceMs: phase === "possible_end" ? 300 : 0,
  };
}

test("state machine follows the expected speech lifecycle", () => {
  const machine = new SpeechStateMachine();

  assert.equal(machine.getState(), "idle");
  assert.equal(machine.start().state, "listening");
  assert.equal(machine.applyDetectorResult(detectorResult("speech_candidate")).state, "speech_detected");
  assert.equal(machine.applyDetectorResult(detectorResult("speech_active")).state, "speech_active");
  assert.equal(machine.applyDetectorResult(detectorResult("possible_end")).state, "possible_end");
  assert.equal(machine.applyDetectorResult(detectorResult("speech_active")).state, "speech_active");
  assert.equal(machine.applyDetectorResult(detectorResult("cooldown")).state, "speech_ended");
  assert.equal(machine.applyDetectorResult(detectorResult("silence")).state, "listening");
  assert.equal(machine.stop().state, "idle");
});

test("state machine reset returns to listening while the service is running", () => {
  const machine = new SpeechStateMachine();

  machine.start();
  machine.applyDetectorResult(detectorResult("speech_active"));

  const transition = machine.reset();

  assert.equal(transition.state, "listening");
  assert.equal(machine.getState(), "listening");
});

test("state machine exposes error state explicitly", () => {
  const machine = new SpeechStateMachine();

  machine.start();
  const transition = machine.setError();

  assert.equal(transition.state, "error");
  assert.equal(machine.getState(), "error");
});
