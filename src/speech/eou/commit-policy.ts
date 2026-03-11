import type {
  CommitDecision,
  CommitPolicyConfig,
  HypothesisTrackerSnapshot,
  StabilitySnapshot,
  VadFrameContext,
} from "./types.ts";
import { DEFAULT_STREAMING_COMMIT_CONFIG } from "../streaming-commit-config.ts";

export const DEFAULT_COMMIT_POLICY_CONFIG: CommitPolicyConfig =
  DEFAULT_STREAMING_COMMIT_CONFIG.commit;

export class CommitPolicy {
  private readonly config: CommitPolicyConfig;

  constructor(config: CommitPolicyConfig = DEFAULT_COMMIT_POLICY_CONFIG) {
    this.config = config;
  }

  decide(params: {
    tracker: HypothesisTrackerSnapshot;
    stability: StabilitySnapshot;
    vad: VadFrameContext;
    eouProbability: number;
    lastCommittedText: string;
    lastCommitAtMs: number;
  }): CommitDecision {
    const { tracker, stability, vad, eouProbability, lastCommittedText, lastCommitAtMs } = params;

    if (
      tracker.text.length < this.config.minChars
      || tracker.tokenCount < this.config.minTokenCount
    ) {
      return { shouldCommit: false, reason: "insufficient_text", waitMs: 120 };
    }

    if (
      tracker.text === lastCommittedText
      && (vad.timestampMs - lastCommitAtMs) < this.config.duplicateCommitCooldownMs
    ) {
      return { shouldCommit: false, reason: "duplicate_commit", waitMs: 180 };
    }

    if (vad.speaking) {
      return { shouldCommit: false, reason: "still_speaking", waitMs: 120 };
    }

    if (vad.trailingSilenceMs < this.config.minSilenceMs && !tracker.isFinal) {
      return {
        shouldCommit: false,
        reason: "waiting_for_silence",
        waitMs: this.config.minSilenceMs - vad.trailingSilenceMs,
      };
    }

    if (stability.continuationScore > 0.55 && vad.trailingSilenceMs < this.config.maxSilenceMs) {
      return { shouldCommit: false, reason: "likely_continuation", waitMs: 140 };
    }

    if (
      tracker.unchangedMs < this.config.minStableMs
      && !tracker.isFinal
      && vad.trailingSilenceMs < this.config.maxSilenceMs
    ) {
      return {
        shouldCommit: false,
        reason: "waiting_for_stability",
        waitMs: this.config.minStableMs - tracker.unchangedMs,
      };
    }

    if (tracker.isFinal) {
      return { shouldCommit: true, reason: "final_hypothesis", waitMs: 0 };
    }

    if (
      tracker.terminalPunctuation
      && stability.stabilityScore >= 0.52
      && vad.trailingSilenceMs >= this.config.fastCommitPunctuationMs
    ) {
      return { shouldCommit: true, reason: "punctuation_fast_path", waitMs: 0 };
    }

    if (
      eouProbability >= this.config.commitProbabilityThreshold
      && stability.readyToCommit
    ) {
      return { shouldCommit: true, reason: "high_confidence_eou", waitMs: 0 };
    }

    if (
      vad.trailingSilenceMs >= this.config.maxSilenceMs
      && stability.stabilityScore >= 0.48
    ) {
      return { shouldCommit: true, reason: "silence_backstop", waitMs: 0 };
    }

    return { shouldCommit: false, reason: "waiting_for_stability", waitMs: 120 };
  }
}
