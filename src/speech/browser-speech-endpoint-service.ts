import { createSpeechEndpointConfig } from "./config.ts";
import { SpeechStateMachine } from "./state/speech-state-machine.ts";
import type {
  BrowserSpeechEndpointServiceOptions,
  EndpointDetectorFrameResult,
  SpeechEndpointConfig,
  SpeechEndpointEventMap,
  SpeechEndpointServiceState,
  SpeechProbabilityEvent,
  SpeechStateChangedEvent,
} from "./types.ts";
import { SimpleTypedEventEmitter } from "./utils/typed-event-emitter.ts";
import type {
  SpeechWorkerRequest,
  SpeechWorkerResponse,
} from "./worker/protocol.ts";

const PROCESSOR_NAME = "microphone-frame-processor";

interface WorkletFrameMessage {
  type: "frame";
  samples: Float32Array;
}

export class BrowserSpeechEndpointService {
  private readonly config: SpeechEndpointConfig;

  private readonly emitter = new SimpleTypedEventEmitter<SpeechEndpointEventMap>();

  private readonly stateMachine = new SpeechStateMachine();

  private readonly getUserMedia: (
    constraints: MediaStreamConstraints,
  ) => Promise<MediaStream>;

  private worker?: Worker;

  private readyPromise?: Promise<void>;

  private readyResolve?: () => void;

  private readyReject?: (error: Error) => void;

  private audioContext?: AudioContext;

  private mediaStream?: MediaStream;

  private sourceNode?: MediaStreamAudioSourceNode;

  private workletNode?: AudioWorkletNode;

  private sinkNode?: GainNode;

  private running = false;

  private disposed = false;

  constructor(options: BrowserSpeechEndpointServiceOptions = {}) {
    this.config = createSpeechEndpointConfig(options.config);
    this.getUserMedia = options.getUserMedia
      ?? ((constraints) => navigator.mediaDevices.getUserMedia(constraints));
  }

  on<EventName extends keyof SpeechEndpointEventMap>(
    eventName: EventName,
    handler: (payload: SpeechEndpointEventMap[EventName]) => void,
  ): () => void {
    return this.emitter.on(eventName, handler);
  }

  getState(): SpeechEndpointServiceState {
    return this.stateMachine.getState();
  }

  async init(): Promise<void> {
    try {
      this.assertNotDisposed();

      if (this.worker && this.readyPromise) {
        return this.readyPromise;
      }

      this.worker = new Worker(
        new URL("./worker/vad-worker.ts", import.meta.url),
        { type: "module" },
      );
      this.worker.onmessage = (event: MessageEvent<SpeechWorkerResponse>) => {
        this.handleWorkerMessage(event.data);
      };
      this.worker.onerror = (event: ErrorEvent) => {
        this.handleError(new Error(event.message || "Speech worker crashed"));
      };

      this.readyPromise = new Promise<void>((resolve, reject) => {
        this.readyResolve = resolve;
        this.readyReject = reject;
      });

      this.postWorkerMessage({
        type: "init",
        config: this.config,
      });

      return this.readyPromise;
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error));

      this.handleError(normalized);
      throw normalized;
    }
  }

  async start(): Promise<void> {
    try {
      this.assertNotDisposed();
      await this.init();

      if (this.running) {
        return;
      }

      this.mediaStream = await this.getUserMedia({
        audio: {
          channelCount: this.config.audio.channelCount,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      this.audioContext = new AudioContext({
        sampleRate: this.config.audio.sampleRate,
        latencyHint: "interactive",
      });

      await this.audioContext.audioWorklet.addModule(
        new URL("./audio/microphone-frame-processor.worklet.ts", import.meta.url).toString(),
      );

      const workletFrameSize = Math.round(
        this.audioContext.sampleRate * (this.config.audio.frameDurationMs / 1000),
      );

      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.workletNode = new AudioWorkletNode(
        this.audioContext,
        PROCESSOR_NAME,
        {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          channelCount: this.config.audio.channelCount,
          processorOptions: {
            frameSize: workletFrameSize,
          },
        },
      );
      this.sinkNode = new GainNode(this.audioContext, {
        gain: 0,
      });

      this.workletNode.port.onmessage = (event: MessageEvent<WorkletFrameMessage>) => {
        if (!this.running || event.data.type !== "frame" || !this.audioContext) {
          return;
        }

        this.postWorkerMessage(
          {
            type: "audio-frame",
            samples: event.data.samples.buffer,
            sourceSampleRate: this.audioContext.sampleRate,
            timestampMs: performance.now(),
          },
          [event.data.samples.buffer],
        );
      };

      this.running = true;
      this.postWorkerMessage({ type: "reset" });
      this.sourceNode.connect(this.workletNode);
      this.workletNode.connect(this.sinkNode);
      this.sinkNode.connect(this.audioContext.destination);

      if (this.audioContext.state === "suspended") {
        await this.audioContext.resume();
      }

      this.emitStateChange(this.stateMachine.start(), performance.now(), "start");
    } catch (error) {
      this.running = false;
      await this.teardownAudioGraph();

      const normalized = error instanceof Error ? error : new Error(String(error));

      this.handleError(normalized);
      throw normalized;
    }
  }

  async stop(): Promise<void> {
    this.running = false;
    this.postWorkerMessage({ type: "reset" });
    await this.teardownAudioGraph();
    this.emitStateChange(this.stateMachine.stop(), performance.now(), "stop");
  }

  reset(): void {
    if (this.disposed) {
      return;
    }

    this.postWorkerMessage({ type: "reset" });
    this.emitStateChange(this.stateMachine.reset(), performance.now(), "reset");
  }

  async dispose(): Promise<void> {
    if (this.disposed) {
      return;
    }

    await this.stop();
    this.disposed = true;
    this.postWorkerMessage({ type: "dispose" });
    this.worker?.terminate();
    this.worker = undefined;
    this.readyPromise = undefined;
    this.readyResolve = undefined;
    this.readyReject = undefined;
    this.emitStateChange(this.stateMachine.stop(), performance.now(), "dispose");
    this.emitter.clear();
  }

  private handleWorkerMessage(message: SpeechWorkerResponse): void {
    if (message.type === "ready") {
      this.readyResolve?.();
      this.readyResolve = undefined;
      this.readyReject = undefined;
      this.emitter.emit("ready", undefined);
      return;
    }

    if (message.type === "error") {
      this.handleError(new Error(message.message));
      return;
    }

    this.handleProbabilityEvent(message.probabilityEvent);
    this.handleDetectorResult(message.result);

    if (this.config.debug && message.debugSnapshot) {
      this.emitter.emit("debug", message.debugSnapshot);
    }
  }

  private handleProbabilityEvent(event: SpeechProbabilityEvent): void {
    this.emitter.emit("speechProb", event);
  }

  private handleDetectorResult(result: EndpointDetectorFrameResult): void {
    this.emitStateChange(
      this.stateMachine.applyDetectorResult(result),
      result.timestampMs,
      "detector",
    );

    switch (result.transition) {
      case "speech_start":
        this.emitter.emit("speechStart", result);
        return;
      case "speech_pause":
      case "possible_end":
        this.emitter.emit("speechPause", result);
        return;
      case "speech_end":
        this.emitter.emit("speechEnd", result);
        return;
      case "silence":
        this.emitter.emit("silence", result);
        return;
      default:
        return;
    }
  }

  private emitStateChange(
    transition: {
      previousState: SpeechEndpointServiceState;
      state: SpeechEndpointServiceState;
      changed: boolean;
    },
    timestampMs: number,
    reason: SpeechStateChangedEvent["reason"],
  ): void {
    if (!transition.changed) {
      return;
    }

    this.emitter.emit("stateChanged", {
      previousState: transition.previousState,
      state: transition.state,
      timestampMs,
      reason,
    });
  }

  private handleError(error: Error): void {
    this.readyReject?.(error);

    if (this.readyPromise && !this.running) {
      this.worker?.terminate();
      this.worker = undefined;
      this.readyPromise = undefined;
    }

    this.readyResolve = undefined;
    this.readyReject = undefined;
    this.emitStateChange(this.stateMachine.setError(), performance.now(), "error");
    this.emitter.emit("error", error);
  }

  private postWorkerMessage(
    message: SpeechWorkerRequest,
    transfer: Transferable[] = [],
  ): void {
    this.worker?.postMessage(message, transfer);
  }

  private async teardownAudioGraph(): Promise<void> {
    this.workletNode?.port.postMessage({ type: "reset" });
    this.sourceNode?.disconnect();
    this.workletNode?.disconnect();
    this.sinkNode?.disconnect();

    for (const track of this.mediaStream?.getTracks() ?? []) {
      track.stop();
    }

    this.mediaStream = undefined;
    this.sourceNode = undefined;
    this.workletNode = undefined;
    this.sinkNode = undefined;

    if (this.audioContext) {
      await this.audioContext.close();
      this.audioContext = undefined;
    }
  }

  private assertNotDisposed(): void {
    if (this.disposed) {
      throw new Error("BrowserSpeechEndpointService is already disposed");
    }
  }
}
