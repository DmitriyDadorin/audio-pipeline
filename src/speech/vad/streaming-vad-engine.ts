import type {
  DebugFrameSnapshot,
  EndpointPhase,
  SpeechProbabilityEvent,
  VadConfig,
} from "../types.ts";
import { extractFrameFeatures } from "./frame-features.ts";
import { createWasmVadScorer } from "./wasm-vad-scorer.ts";

interface ProcessedVadFrame {
  probabilityEvent: SpeechProbabilityEvent;
  debugSnapshot: Omit<DebugFrameSnapshot, "phase" | "speechDurationMs" | "trailingSilenceMs">;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function sigmoid(value: number): number {
  return 1 / (1 + Math.exp(-value));
}

export class StreamingVadEngine {
  private readonly config: VadConfig;

  private scorer?: Awaited<ReturnType<typeof createWasmVadScorer>>;

  private smoothedProbability = 0;

  private noiseFloor: number;

  constructor(config: VadConfig) {
    this.config = config;
    this.noiseFloor = config.minNoiseFloor;
  }

  async init(): Promise<void> {
    this.scorer = await createWasmVadScorer();
  }

  reset(): void {
    this.smoothedProbability = 0;
    this.noiseFloor = this.config.minNoiseFloor;
  }

  processFrame(
    samples: Float32Array,
    timestampMs: number,
    phase: EndpointPhase = "silence",
  ): ProcessedVadFrame {
    if (!this.scorer) {
      throw new Error("StreamingVadEngine is not initialized");
    }

    const features = extractFrameFeatures(samples, this.noiseFloor);
    const energyScore = clamp(
      (features.rms - this.noiseFloor) / Math.max(this.noiseFloor * 5.2, 0.018),
      0,
      1,
    );
    const peakScore = clamp(
      (features.peak - (this.noiseFloor * 2.2)) / 0.36,
      0,
      1,
    );
    const voicedScore = clamp(features.voicedRatio / 0.42, 0, 1);
    const zcrPenalty = clamp(
      (features.zeroCrossingRate - this.config.zeroCrossSpeechCeiling)
      / Math.max(0.08, 0.5 - this.config.zeroCrossSpeechCeiling),
      0,
      1,
    );
    const fluxScore = clamp(features.flux / this.config.fluxBoost, 0, 1);
    const logit = this.scorer.score(
      energyScore,
      peakScore,
      voicedScore,
      zcrPenalty,
      fluxScore,
    );
    const rawProbability = sigmoid(logit);

    this.smoothedProbability = (
      (this.smoothedProbability * (1 - this.config.smoothingFactor))
      + (rawProbability * this.config.smoothingFactor)
    );

    if (
      this.smoothedProbability <= this.config.silenceThreshold
      && features.rms <= this.noiseFloor * 3.8
    ) {
      this.noiseFloor = clamp(
        (
          (this.noiseFloor * this.config.noiseFloorDecay)
          + (features.rms * this.config.noiseFloorRise)
        ),
        this.config.minNoiseFloor,
        this.config.maxNoiseFloor,
      );
    }

    const speaking = this.smoothedProbability >= this.config.speechThreshold;

    return {
      probabilityEvent: {
        probability: this.smoothedProbability,
        speaking,
        phase,
        timestampMs,
      },
      debugSnapshot: {
        timestampMs,
        probability: rawProbability,
        smoothedProbability: this.smoothedProbability,
        rms: features.rms,
        peak: features.peak,
        zeroCrossingRate: features.zeroCrossingRate,
        flux: features.flux,
        noiseFloor: this.noiseFloor,
        speaking,
      },
    };
  }
}
