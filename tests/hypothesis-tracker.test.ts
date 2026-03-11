import test from "node:test";
import assert from "node:assert/strict";
import { HypothesisTracker } from "../src/speech/eou/hypothesis-tracker.ts";

test("hypothesis tracker keeps stable prefix and churn metrics across partial updates", () => {
  const tracker = new HypothesisTracker();

  const first = tracker.update(
    { text: "сколько времени", isFinal: false },
    100,
  );
  const second = tracker.update(
    { text: "сколько времени займет", isFinal: false },
    200,
  );
  const third = tracker.update(
    { text: "сколько времени займет доставка", isFinal: false },
    320,
  );
  const settled = tracker.update(undefined, 760);

  assert.equal(first.text, "сколько времени");
  assert.equal(second.stablePrefix, "сколько времени");
  assert.equal(third.unstableSuffix, " доставка");
  assert.equal(settled.unchangedMs, 440);
  assert.equal(settled.recentChurnScore > 0, true);
});

test("hypothesis tracker respects explicit stable prefixes from STT", () => {
  const tracker = new HypothesisTracker();

  tracker.update({ text: "привет как", isFinal: false }, 100);
  const next = tracker.update(
    {
      text: "привет как дела",
      stablePrefix: "привет как",
      isFinal: false,
    },
    200,
  );

  assert.equal(next.stablePrefix, "привет как");
  assert.equal(next.stablePrefixRatio > 0.5, true);
});
