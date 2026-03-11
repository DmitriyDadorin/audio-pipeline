import type { EndpointPhase } from "../types.ts";

export interface TranscriptHypothesis {
  text: string;
  isFinal: boolean;
  confidence?: number;
  stablePrefix?: string;
}

export interface VadFrameContext {
  timestampMs: number;
  speechProbability: number;
  speaking: boolean;
  phase: EndpointPhase;
  speechDurationMs: number;
  trailingSilenceMs: number;
}

export interface HypothesisTrackerSnapshot {
  text: string;
  previousText: string;
  stablePrefix: string;
  unstableSuffix: string;
  tokenCount: number;
  stablePrefixRatio: number;
  unchangedMs: number;
  recentChurnScore: number;
  appendedChars: number;
  removedChars: number;
  terminalPunctuation: boolean;
  lastTokenLooksComplete: boolean;
  isFinal: boolean;
  confidence?: number;
  timestampMs: number;
}

export interface StabilitySnapshot {
  stabilityScore: number;
  continuationScore: number;
  silenceScore: number;
  punctuationBoost: number;
  readyToCommit: boolean;
  reasons: string[];
}

export interface CommitDecision {
  shouldCommit: boolean;
  reason:
    | "insufficient_text"
    | "still_speaking"
    | "likely_continuation"
    | "waiting_for_silence"
    | "waiting_for_stability"
    | "final_hypothesis"
    | "punctuation_fast_path"
    | "high_confidence_eou"
    | "silence_backstop"
    | "duplicate_commit"
    | "commit_latched";
  waitMs: number;
}

export interface EouClassifierInput {
  vad: VadFrameContext;
  tracker: HypothesisTrackerSnapshot;
  stability: StabilitySnapshot;
}

export interface EouPrediction {
  probability: number;
  features: Float32Array;
  featureNames: readonly string[];
}

export interface EouClassifier {
  init?(): Promise<void>;
  predict(input: EouClassifierInput): Promise<EouPrediction>;
  dispose?(): Promise<void>;
}

export interface CommitEngineUpdateInput {
  vad: VadFrameContext;
  transcript?: TranscriptHypothesis;
}

export interface CommitEngineUpdateResult {
  vad: VadFrameContext;
  tracker: HypothesisTrackerSnapshot;
  stability: StabilitySnapshot;
  eouProbability: number;
  decision: CommitDecision;
  committedText?: string;
}

export interface CommitPolicyConfig {
  minChars: number;
  minTokenCount: number;
  minSilenceMs: number;
  fastCommitPunctuationMs: number;
  maxSilenceMs: number;
  minStableMs: number;
  commitProbabilityThreshold: number;
  duplicateCommitCooldownMs: number;
}
