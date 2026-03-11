import test from "node:test";
import assert from "node:assert/strict";
import { EouCommitEngine } from "../src/speech/eou/eou-commit-engine.ts";
import { BaselineEouClassifier } from "../src/speech/eou/baseline-eou-classifier.ts";

const baseVad = {
  timestampMs: 0,
  speechProbability: 0.08,
  speaking: false,
  phase: "possible_end" as const,
  speechDurationMs: 1200,
  trailingSilenceMs: 0,
};

test("commit engine avoids premature commit while silence is still short", async () => {
  const engine = new EouCommitEngine({
    classifier: new BaselineEouClassifier(),
  });

  await engine.init();

  await engine.update({
    vad: { ...baseVad, timestampMs: 100, trailingSilenceMs: 80 },
    transcript: { text: "сколько стоит доставка", isFinal: false },
  });

  const result = await engine.update({
    vad: { ...baseVad, timestampMs: 180, trailingSilenceMs: 140 },
  });

  assert.equal(result.decision.shouldCommit, false);
  assert.equal(result.decision.reason, "waiting_for_silence");
});

test("commit engine commits after stable silence and settled hypothesis", async () => {
  const engine = new EouCommitEngine({
    classifier: new BaselineEouClassifier(),
  });

  await engine.init();

  await engine.update({
    vad: { ...baseVad, timestampMs: 100, trailingSilenceMs: 120 },
    transcript: { text: "сколько стоит доставка?", isFinal: false },
  });

  const result = await engine.update({
    vad: { ...baseVad, timestampMs: 620, trailingSilenceMs: 420 },
  });

  assert.equal(result.decision.shouldCommit, true);
  assert.equal(result.decision.reason, "punctuation_fast_path");
  assert.equal(result.committedText, "сколько стоит доставка?");
});

test("commit engine emits commit only once during continued silence", async () => {
  const engine = new EouCommitEngine({
    classifier: new BaselineEouClassifier(),
  });

  await engine.init();

  await engine.update({
    vad: { ...baseVad, timestampMs: 100, trailingSilenceMs: 120 },
    transcript: { text: "сколько стоит доставка?", isFinal: false },
  });

  const firstCommit = await engine.update({
    vad: { ...baseVad, timestampMs: 620, trailingSilenceMs: 420 },
  });

  const repeatedSilence = await engine.update({
    vad: { ...baseVad, timestampMs: 2220, trailingSilenceMs: 2020 },
  });

  assert.equal(firstCommit.decision.shouldCommit, true);
  assert.equal(repeatedSilence.decision.shouldCommit, false);
  assert.equal(repeatedSilence.decision.reason, "commit_latched");
});
