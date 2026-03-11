import type {
  HypothesisTrackerSnapshot,
  StabilitySnapshot,
  VadFrameContext,
} from "./types.ts";

export class StabilityDetector {
  evaluate(
    tracker: HypothesisTrackerSnapshot,
    vad: VadFrameContext,
  ): StabilitySnapshot {
    const reasons: string[] = [];
    const silenceScore = clamp01(vad.trailingSilenceMs / 900);
    const unchangedScore = clamp01(tracker.unchangedMs / 600);
    const stablePrefixScore = tracker.stablePrefixRatio;
    const churnPenalty = tracker.recentChurnScore;
    const punctuationBoost = tracker.terminalPunctuation ? 0.16 : 0;
    const finalBoost = tracker.isFinal ? 0.25 : 0;
    const speakingPenalty = vad.speaking ? 0.45 : 0;
    const instabilityPenalty = tracker.unstableSuffix.length > 18 ? 0.1 : 0;
    const stabilityScore = clamp01(
      (unchangedScore * 0.32)
      + (stablePrefixScore * 0.26)
      + (silenceScore * 0.22)
      + ((1 - churnPenalty) * 0.2)
      + punctuationBoost
      + finalBoost
      - speakingPenalty
      - instabilityPenalty,
    );
    const continuationScore = clamp01(
      (vad.speaking ? 0.45 : 0)
      + (vad.phase === "possible_end" ? 0.18 : 0)
      + ((1 - silenceScore) * 0.16)
      + (tracker.recentChurnScore * 0.25)
      + (tracker.lastTokenLooksComplete ? 0 : 0.08)
      - (tracker.terminalPunctuation ? 0.22 : 0)
      - (tracker.isFinal ? 0.28 : 0),
    );

    if (tracker.terminalPunctuation) {
      reasons.push("terminal-punctuation");
    }

    if (tracker.unchangedMs >= 400) {
      reasons.push("hypothesis-settled");
    }

    if (vad.trailingSilenceMs >= 300) {
      reasons.push("meaningful-silence");
    }

    if (vad.speaking) {
      reasons.push("speaker-still-active");
    }

    return {
      stabilityScore,
      continuationScore,
      silenceScore,
      punctuationBoost,
      readyToCommit: stabilityScore >= 0.62 && continuationScore <= 0.42,
      reasons,
    };
  }
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
