import { BaselineEouClassifier } from "./baseline-eou-classifier.ts";
import { CommitPolicy, DEFAULT_COMMIT_POLICY_CONFIG } from "./commit-policy.ts";
import { HypothesisTracker } from "./hypothesis-tracker.ts";
import { StabilityDetector } from "./stability-detector.ts";
import type {
  CommitEngineUpdateInput,
  CommitEngineUpdateResult,
  CommitPolicyConfig,
  EouClassifier,
  HypothesisTrackerSnapshot,
} from "./types.ts";

export interface EouCommitEngineOptions {
  classifier?: EouClassifier;
  commitPolicyConfig?: CommitPolicyConfig;
}

export class EouCommitEngine {
  private readonly tracker = new HypothesisTracker();

  private readonly stabilityDetector = new StabilityDetector();

  private readonly classifier: EouClassifier;

  private readonly commitPolicy: CommitPolicy;

  private lastCommittedText = "";

  private lastCommitAtMs = -Infinity;

  private commitLatchArmed = true;

  constructor(options: EouCommitEngineOptions = {}) {
    this.classifier = options.classifier ?? new BaselineEouClassifier();
    this.commitPolicy = new CommitPolicy(
      options.commitPolicyConfig ?? DEFAULT_COMMIT_POLICY_CONFIG,
    );
  }

  async init(): Promise<void> {
    await this.classifier.init?.();
  }

  reset(): HypothesisTrackerSnapshot {
    this.lastCommittedText = "";
    this.lastCommitAtMs = -Infinity;
    this.commitLatchArmed = true;

    return this.tracker.reset();
  }

  async dispose(): Promise<void> {
    await this.classifier.dispose?.();
  }

  async update(input: CommitEngineUpdateInput): Promise<CommitEngineUpdateResult> {
    const tracker = this.tracker.update(input.transcript, input.vad.timestampMs);
    const hasTranscriptUpdate = input.transcript !== undefined;

    if (
      !this.commitLatchArmed
      && (input.vad.speaking || (hasTranscriptUpdate && tracker.text !== this.lastCommittedText))
    ) {
      this.commitLatchArmed = true;
    }

    const stability = this.stabilityDetector.evaluate(tracker, input.vad);
    const prediction = await this.classifier.predict({
      vad: input.vad,
      tracker,
      stability,
    });
    const decision = this.commitPolicy.decide({
      tracker,
      stability,
      vad: input.vad,
      eouProbability: prediction.probability,
      lastCommittedText: this.lastCommittedText,
      lastCommitAtMs: this.lastCommitAtMs,
    });

    if (decision.shouldCommit && !this.commitLatchArmed) {
      decision.shouldCommit = false;
      decision.reason = "commit_latched";
      decision.waitMs = 0;
    }

    if (decision.shouldCommit) {
      this.lastCommittedText = tracker.text;
      this.lastCommitAtMs = input.vad.timestampMs;
      this.commitLatchArmed = false;
    }

    return {
      vad: input.vad,
      tracker,
      stability,
      eouProbability: prediction.probability,
      decision,
      committedText: decision.shouldCommit ? tracker.text : undefined,
    };
  }
}
