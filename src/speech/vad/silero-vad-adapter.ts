import type { VadFrameContext } from "../eou/types.ts";

interface MicVadInstance {
  start(): Promise<void>;
  pause(): Promise<void>;
  destroy(): Promise<void>;
}

interface OrtLike {
  env: {
    wasm: {
      wasmPaths:
        | string
        | {
          wasm: string;
        };
      numThreads: number;
    };
  };
}

interface SpeechProbabilitiesLike {
  isSpeech?: number;
}

interface VadGlobal {
  MicVAD: {
    new(options: {
      model: "v5" | "legacy";
      baseAssetPath: string;
      onnxWASMBasePath: string;
      ortConfig: (ort: OrtLike) => void;
      startOnLoad: boolean;
      onSpeechStart: () => void;
      onSpeechEnd: (audio: Float32Array) => void;
      onFrameProcessed: (probabilities: SpeechProbabilitiesLike) => void;
    }): Promise<MicVadInstance>;
  };
}

declare global {
  interface Window {
    vad?: VadGlobal;
  }
}

export interface SileroVadAdapterOptions {
  onFrame: (frame: VadFrameContext) => void;
  onSpeechStart?: () => void;
  onSpeechEnd?: (audio: Float32Array) => void;
  model?: "v5" | "legacy";
  baseAssetPath?: string;
  onnxWasmBasePath?: string;
  speechProbabilityThreshold?: number;
  possibleEndSilenceMs?: number;
  frameDurationMs?: number;
}

export class SileroVadAdapter {
  private readonly options: SileroVadAdapterOptions;

  private vad?: MicVadInstance;

  private speechDurationMs = 0;

  private trailingSilenceMs = 0;

  constructor(options: SileroVadAdapterOptions) {
    this.options = options;
  }

  async start(): Promise<void> {
    const vadGlobal = window.vad;

    if (!vadGlobal?.MicVAD) {
      throw new Error("Global vad.MicVAD is not loaded");
    }

    if (this.vad) {
      await this.vad.start();
      return;
    }

    this.vad = await vadGlobal.MicVAD.new({
      model: this.options.model ?? "v5",
      baseAssetPath: this.options.baseAssetPath ?? "/vad/",
      onnxWASMBasePath: this.options.onnxWasmBasePath ?? "/ort/",
      ortConfig: (ort) => {
        const wasmBasePath = this.options.onnxWasmBasePath ?? "/ort/";

        ort.env.wasm.wasmPaths = {
          wasm: `${wasmBasePath}ort-wasm-simd-threaded.wasm`,
        };
        ort.env.wasm.numThreads = 1;
      },
      startOnLoad: false,
      onSpeechStart: () => {
        this.options.onSpeechStart?.();
      },
      onSpeechEnd: (audio) => {
        this.options.onSpeechEnd?.(audio);
      },
      onFrameProcessed: (probabilities) => {
        const speechProbability = Number(probabilities.isSpeech ?? 0);
        const speaking = speechProbability >= (this.options.speechProbabilityThreshold ?? 0.5);
        const frameDurationMs = this.options.frameDurationMs ?? 32;
        const possibleEndSilenceMs = this.options.possibleEndSilenceMs ?? 240;

        if (speaking) {
          this.speechDurationMs += frameDurationMs;
          this.trailingSilenceMs = 0;
        } else {
          this.trailingSilenceMs += frameDurationMs;
        }

        this.options.onFrame({
          timestampMs: performance.now(),
          speechProbability,
          speaking,
          phase: speaking
            ? "speech_active"
            : this.trailingSilenceMs > possibleEndSilenceMs
              ? "possible_end"
              : "silence",
          speechDurationMs: this.speechDurationMs,
          trailingSilenceMs: this.trailingSilenceMs,
        });
      },
    });

    await this.vad.start();
  }

  async stop(): Promise<void> {
    await this.vad?.pause();
  }

  async dispose(): Promise<void> {
    await this.vad?.destroy();
    this.vad = undefined;
    this.reset();
  }

  reset(): void {
    this.speechDurationMs = 0;
    this.trailingSilenceMs = 0;
  }
}
