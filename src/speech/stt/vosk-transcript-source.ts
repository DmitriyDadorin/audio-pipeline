import { StreamingLinearResampler } from "../audio/streaming-linear-resampler.ts";
import type { TranscriptHypothesis } from "../eou/types.ts";
import type { StreamingTranscriptSource } from "../eou/transcript-source.ts";
import { DEFAULT_STREAMING_COMMIT_CONFIG } from "../streaming-commit-config.ts";
import { SimpleTypedEventEmitter } from "../utils/typed-event-emitter.ts";

const TARGET_SAMPLE_RATE = 16000;

interface VoskModelMessage {
  event: "load" | "error";
  result?: boolean;
  error?: string;
}

interface VoskRecognizerPartialMessage {
  event: "partialresult";
  result: {
    partial: string;
  };
}

interface VoskRecognizerResultMessage {
  event: "result";
  result: {
    text: string;
  };
}

interface VoskRecognizer {
  on(
    event: "partialresult",
    listener: (message: VoskRecognizerPartialMessage) => void,
  ): void;
  on(
    event: "result",
    listener: (message: VoskRecognizerResultMessage) => void,
  ): void;
  setWords(words: boolean): void;
  acceptWaveformFloat(buffer: Float32Array, sampleRate: number): void;
  retrieveFinalResult(): void;
  remove(): void;
}

interface VoskModel {
  KaldiRecognizer: new (sampleRate: number, grammar?: string) => VoskRecognizer;
  on(event: "load" | "error", listener: (message: VoskModelMessage) => void): void;
  terminate(): void;
}

interface VoskGlobal {
  createModel(modelUrl: string, logLevel?: number): Promise<VoskModel>;
}

declare global {
  interface Window {
    Vosk?: VoskGlobal;
  }
}

interface TranscriptSourceEventMap {
  hypothesis: TranscriptHypothesis;
}

export interface VoskTranscriptSourceOptions {
  modelUrl?: string;
  getUserMedia?: typeof navigator.mediaDevices.getUserMedia;
  processorBufferSize?: number;
}

export class VoskTranscriptSource implements StreamingTranscriptSource {
  private readonly emitter = new SimpleTypedEventEmitter<TranscriptSourceEventMap>();

  private readonly modelUrl: string;

  private readonly getUserMedia: (
    constraints: MediaStreamConstraints,
  ) => Promise<MediaStream>;

  private readonly processorBufferSize: number;

  private model?: VoskModel;

  private recognizer?: VoskRecognizer;

  private audioContext?: AudioContext;

  private mediaStream?: MediaStream;

  private sourceNode?: MediaStreamAudioSourceNode;

  private processorNode?: ScriptProcessorNode;

  private resampler?: StreamingLinearResampler;

  private lastPartialText = "";

  private lastFinalText = "";

  constructor(options: VoskTranscriptSourceOptions = {}) {
    this.modelUrl = options.modelUrl ?? DEFAULT_STREAMING_COMMIT_CONFIG.assets.sttModelUrl;
    this.getUserMedia = options.getUserMedia
      ?? ((constraints) => navigator.mediaDevices.getUserMedia(constraints));
    this.processorBufferSize = options.processorBufferSize ?? 4096;
  }

  async init(): Promise<void> {
    if (this.model) {
      return;
    }

    const vosk = window.Vosk;

    if (!vosk?.createModel) {
      throw new Error("Global Vosk.createModel is not loaded");
    }

    this.model = await vosk.createModel(this.modelUrl, -1);
  }

  onHypothesis(handler: (hypothesis: TranscriptHypothesis) => void): () => void {
    return this.emitter.on("hypothesis", handler);
  }

  async start(): Promise<void> {
    await this.init();

    if (!this.model) {
      throw new Error("Vosk model is not initialized");
    }

    if (this.audioContext) {
      return;
    }

    this.mediaStream = await this.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });

    this.audioContext = new AudioContext({
      latencyHint: "interactive",
    });
    this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
    this.processorNode = this.audioContext.createScriptProcessor(
      this.processorBufferSize,
      1,
      1,
    );
    this.resampler = new StreamingLinearResampler(
      this.audioContext.sampleRate,
      TARGET_SAMPLE_RATE,
    );
    this.recognizer = new this.model.KaldiRecognizer(TARGET_SAMPLE_RATE);
    this.recognizer.setWords(false);
    this.recognizer.on("partialresult", (message) => {
      const text = message.result.partial.trim();

      if (!text || text === this.lastPartialText) {
        return;
      }

      this.lastPartialText = text;
      this.emitter.emit("hypothesis", {
        text,
        isFinal: false,
      });
    });
    this.recognizer.on("result", (message) => {
      const text = message.result.text.trim();

      if (!text || text === this.lastFinalText) {
        return;
      }

      this.lastFinalText = text;
      this.lastPartialText = "";
      this.emitter.emit("hypothesis", {
        text,
        isFinal: true,
      });
    });

    this.processorNode.onaudioprocess = (event: AudioProcessingEvent) => {
      if (!this.recognizer || !this.resampler) {
        return;
      }

      const mono = Float32Array.from(event.inputBuffer.getChannelData(0));
      const resampled = this.resampler.push(mono);

      if (resampled.length === 0) {
        return;
      }

      this.recognizer.acceptWaveformFloat(resampled, TARGET_SAMPLE_RATE);
    };

    this.sourceNode.connect(this.processorNode);
    this.processorNode.connect(this.audioContext.destination);

    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }
  }

  async stop(): Promise<void> {
    this.recognizer?.retrieveFinalResult();
    this.sourceNode?.disconnect();
    this.processorNode?.disconnect();

    for (const track of this.mediaStream?.getTracks() ?? []) {
      track.stop();
    }

    this.mediaStream = undefined;
    this.sourceNode = undefined;
    this.processorNode = undefined;
    this.resampler?.reset();
    this.resampler = undefined;

    if (this.audioContext) {
      await this.audioContext.close();
      this.audioContext = undefined;
    }

    this.recognizer?.remove();
    this.recognizer = undefined;
  }

  reset(): void {
    this.lastPartialText = "";
    this.lastFinalText = "";
    this.resampler?.reset();
  }

  async dispose(): Promise<void> {
    await this.stop();
    this.model?.terminate();
    this.model = undefined;
  }
}
