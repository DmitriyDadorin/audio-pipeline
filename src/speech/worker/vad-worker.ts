/// <reference lib="webworker" />

import { EndpointDetector } from "../endpoint/endpoint-detector.ts";
import { StreamingLinearResampler } from "../audio/streaming-linear-resampler.ts";
import { StreamingVadEngine } from "../vad/streaming-vad-engine.ts";
import type {
  DebugFrameSnapshot,
  SpeechEndpointConfig,
} from "../types.ts";
import type {
  SpeechWorkerRequest,
  SpeechWorkerResponse,
} from "./protocol.ts";

let config: SpeechEndpointConfig | undefined;
let vadEngine: StreamingVadEngine | undefined;
let endpointDetector: EndpointDetector | undefined;
let resampler: StreamingLinearResampler | undefined;
let resamplerSourceRate = 0;
const sampleQueue: number[] = [];

function postMessageToMain(payload: SpeechWorkerResponse): void {
  self.postMessage(payload);
}

async function handleInit(nextConfig: SpeechEndpointConfig): Promise<void> {
  config = nextConfig;
  vadEngine = new StreamingVadEngine(nextConfig.vad);
  endpointDetector = new EndpointDetector(nextConfig.endpoint);

  await vadEngine.init();

  postMessageToMain({ type: "ready" });
}

function handleReset(): void {
  sampleQueue.length = 0;
  resampler?.reset();
  resamplerSourceRate = 0;
  vadEngine?.reset();
  endpointDetector?.reset();
}

function ensureInitialized(): asserts config is SpeechEndpointConfig {
  if (!config || !vadEngine || !endpointDetector) {
    throw new Error("Speech worker is not initialized");
  }
}

function handleAudioFrame(
  message: Extract<SpeechWorkerRequest, { type: "audio-frame" }>,
): void {
  ensureInitialized();

  if (
    !resampler
    || message.sourceSampleRate !== resamplerSourceRate
  ) {
    resampler = new StreamingLinearResampler(
      message.sourceSampleRate,
      config.audio.sampleRate,
    );
    resamplerSourceRate = message.sourceSampleRate;
  }

  const sourceSamples = new Float32Array(message.samples);
  const normalizedSamples = resampler.push(sourceSamples);
  const frameSize = Math.round(
    config.audio.sampleRate * (config.audio.frameDurationMs / 1000),
  );

  for (const sample of normalizedSamples) {
    sampleQueue.push(sample);
  }

  const maxQueuedSamples = frameSize * config.audio.maxBufferedFrames;

  if (sampleQueue.length > maxQueuedSamples) {
    sampleQueue.splice(0, sampleQueue.length - maxQueuedSamples);
  }

  let frameIndex = 0;

  while (sampleQueue.length >= frameSize) {
    const frame = Float32Array.from(sampleQueue.splice(0, frameSize));
    const frameTimestampMs = message.timestampMs + (frameIndex * config.audio.frameDurationMs);
    const vadFrame = vadEngine.processFrame(
      frame,
      frameTimestampMs,
      endpointDetector.getPhase(),
    );
    const result = endpointDetector.process(
      vadFrame.probabilityEvent.probability,
      frameTimestampMs,
    );
    const response: SpeechWorkerResponse = {
      type: "frame-result",
      result,
      probabilityEvent: {
        ...vadFrame.probabilityEvent,
        phase: result.phase,
      },
      debugSnapshot: config.debug
        ? withDetectorDebug(vadFrame.debugSnapshot, result)
        : undefined,
    };

    postMessageToMain(response);
    frameIndex += 1;
  }
}

function withDetectorDebug(
  debugSnapshot: Omit<DebugFrameSnapshot, "phase" | "speechDurationMs" | "trailingSilenceMs">,
  result: ReturnType<EndpointDetector["process"]>,
): DebugFrameSnapshot {
  return {
    ...debugSnapshot,
    phase: result.phase,
    speechDurationMs: result.speechDurationMs,
    trailingSilenceMs: result.trailingSilenceMs,
  };
}

self.onmessage = async (event: MessageEvent<SpeechWorkerRequest>) => {
  try {
    switch (event.data.type) {
      case "init":
        await handleInit(event.data.config);
        return;
      case "audio-frame":
        handleAudioFrame(event.data);
        return;
      case "reset":
        handleReset();
        return;
      case "dispose":
        handleReset();
        self.close();
        return;
      default:
        return;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown speech worker error";

    postMessageToMain({
      type: "error",
      message,
    });
  }
};
