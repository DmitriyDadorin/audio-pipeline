import { EouCommitEngine } from "./eou/eou-commit-engine.ts";
import { OnnxEouClassifier } from "./eou/onnx-eou-classifier.ts";
import type {
  CommitEngineUpdateResult,
  EouClassifier,
  TranscriptHypothesis,
  VadFrameContext,
} from "./eou/types.ts";
import { SimpleTypedEventEmitter } from "./utils/typed-event-emitter.ts";
import { VoskTranscriptSource } from "./stt/vosk-transcript-source.ts";
import {
  createStreamingCommitConfig,
  type PartialStreamingCommitConfig,
  type StreamingCommitConfig,
} from "./streaming-commit-config.ts";
import { SileroVadAdapter } from "./vad/silero-vad-adapter.ts";

export interface BrowserStreamingCommitEventMap {
  ready: undefined;
  status: {
    status:
      | "idle"
      | "loading_model"
      | "ready"
      | "starting_audio"
      | "listening"
      | "stopped"
      | "disposed"
      | "error";
    detail: string;
  };
  vadFrame: VadFrameContext;
  hypothesis: TranscriptHypothesis;
  agentDispatch: CommitEngineUpdateResult;
  commit: CommitEngineUpdateResult;
  decision: CommitEngineUpdateResult;
  error: Error;
}

export interface BrowserStreamingCommitServiceOptions {
  classifier?: EouClassifier;
  config?: PartialStreamingCommitConfig;
  sttModelUrl?: string;
}

export class BrowserStreamingCommitService {
  private readonly emitter = new SimpleTypedEventEmitter<BrowserStreamingCommitEventMap>();

  private readonly engine: EouCommitEngine;

  private readonly transcriptSource: VoskTranscriptSource;

  private readonly vad: SileroVadAdapter;

  private readonly config: StreamingCommitConfig;

  private lastVadFrame: VadFrameContext = {
    timestampMs: 0,
    speechProbability: 0,
    speaking: false,
    phase: "silence",
    speechDurationMs: 0,
    trailingSilenceMs: 0,
  };

  private status: BrowserStreamingCommitEventMap["status"]["status"] = "idle";

  constructor(options: BrowserStreamingCommitServiceOptions = {}) {
    this.config = createStreamingCommitConfig({
      ...options.config,
      assets: {
        ...options.config?.assets,
        sttModelUrl: options.sttModelUrl ?? options.config?.assets?.sttModelUrl,
      },
    });
    this.engine = new EouCommitEngine({
      classifier: options.classifier
        ?? new OnnxEouClassifier(
          this.config.assets.eouModelUrl,
          this.config.assets.ortBasePath,
        ),
      commitPolicyConfig: this.config.commit,
    });
    this.transcriptSource = new VoskTranscriptSource({
      modelUrl: this.config.assets.sttModelUrl,
      processorBufferSize: this.config.stt.processorBufferSize,
    });
    this.vad = new SileroVadAdapter({
      model: this.config.vad.model,
      baseAssetPath: this.config.assets.vadBaseAssetPath,
      onnxWasmBasePath: this.config.assets.ortBasePath,
      frameDurationMs: this.config.vad.frameDurationMs,
      speechProbabilityThreshold: this.config.vad.speechProbabilityThreshold,
      possibleEndSilenceMs: this.config.vad.possibleEndSilenceMs,
      onFrame: (frame) => {
        this.lastVadFrame = frame;
        this.emitter.emit("vadFrame", frame);
        void this.flush(undefined);
      },
    });
    this.transcriptSource.onHypothesis((hypothesis) => {
      this.emitter.emit("hypothesis", hypothesis);
      void this.flush(hypothesis);
    });
  }

  async init(): Promise<void> {
    if (this.status === "ready" || this.status === "listening") {
      return;
    }

    this.setStatus("loading_model", "Loading Vosk model");
    await this.engine.init();
    await this.transcriptSource.init?.();
    this.setStatus("ready", "Model loaded");
    this.emitter.emit("ready", undefined);
  }

  async start(): Promise<void> {
    await this.init();
    this.setStatus("starting_audio", "Requesting microphone access");
    await this.transcriptSource.start();
    await this.vad.start();
    this.setStatus("listening", "Microphone and recognizers are active");
  }

  async stop(): Promise<void> {
    await this.transcriptSource.stop();
    await this.vad.stop();
    this.setStatus("stopped", "Microphone stopped");
  }

  async dispose(): Promise<void> {
    await this.transcriptSource.dispose();
    await this.vad.dispose();
    await this.engine.dispose();
    this.setStatus("disposed", "Service disposed");
    this.emitter.clear();
  }

  reset(): void {
    this.transcriptSource.reset();
    this.vad.reset();
    this.engine.reset();
  }

  on<EventName extends keyof BrowserStreamingCommitEventMap>(
    eventName: EventName,
    handler: (payload: BrowserStreamingCommitEventMap[EventName]) => void,
  ): () => void {
    return this.emitter.on(eventName, handler);
  }

  getConfig(): StreamingCommitConfig {
    return this.config;
  }

  async update(hypothesis: TranscriptHypothesis): Promise<CommitEngineUpdateResult> {
    this.emitter.emit("hypothesis", hypothesis);

    return this.flush(hypothesis);
  }

  private async flush(
    hypothesis: TranscriptHypothesis | undefined,
  ): Promise<CommitEngineUpdateResult> {
    try {
      const result = await this.engine.update({
        vad: {
          ...this.lastVadFrame,
          timestampMs: performance.now(),
        },
        transcript: hypothesis,
      });

      this.emitter.emit("decision", result);

      if (result.decision.shouldCommit) {
        this.emitter.emit("agentDispatch", result);
        this.emitter.emit("commit", result);
      }

      return result;
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error));

      this.setStatus("error", normalized.message);
      this.emitter.emit("error", normalized);
      throw normalized;
    }
  }

  private setStatus(
    status: BrowserStreamingCommitEventMap["status"]["status"],
    detail: string,
  ): void {
    this.status = status;
    this.emitter.emit("status", {
      status,
      detail,
    });
  }
}
