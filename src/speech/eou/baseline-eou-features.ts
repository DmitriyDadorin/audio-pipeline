import type { EouClassifierInput } from "./types.ts";

export const BASELINE_EOU_FEATURE_NAMES = [
  "trailing_silence_norm",
  "speech_duration_norm",
  "speech_probability",
  "silence_confidence",
  "stability_score",
  "stable_prefix_ratio",
  "unchanged_norm",
  "churn_penalty",
  "terminal_punctuation",
  "token_count_norm",
  "unstable_tail_norm",
  "final_flag",
] as const;

export function extractBaselineEouFeatures(input: EouClassifierInput): Float32Array {
  const { vad, tracker, stability } = input;

  return new Float32Array([
    clamp01(vad.trailingSilenceMs / 1200),
    clamp01(vad.speechDurationMs / 4000),
    clamp01(vad.speechProbability),
    clamp01(1 - vad.speechProbability),
    clamp01(stability.stabilityScore),
    clamp01(tracker.stablePrefixRatio),
    clamp01(tracker.unchangedMs / 800),
    clamp01(tracker.recentChurnScore),
    tracker.terminalPunctuation ? 1 : 0,
    clamp01(tracker.tokenCount / 12),
    clamp01(tracker.unstableSuffix.length / 32),
    tracker.isFinal ? 1 : 0,
  ]);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
