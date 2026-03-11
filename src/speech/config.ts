import type { SpeechEndpointConfig } from "./types.ts";

export const DEFAULT_SPEECH_ENDPOINT_CONFIG: SpeechEndpointConfig = {
  audio: {
    frameDurationMs: 20,
    sampleRate: 16000,
    channelCount: 1,
    maxBufferedFrames: 8,
  },
  vad: {
    speechThreshold: 0.62,
    silenceThreshold: 0.38,
    smoothingFactor: 0.35,
    noiseFloorDecay: 0.985,
    noiseFloorRise: 0.08,
    minNoiseFloor: 0.0015,
    maxNoiseFloor: 0.045,
    zeroCrossSpeechCeiling: 0.22,
    zeroCrossSilenceFloor: 0.03,
    fluxBoost: 0.12,
  },
  endpoint: {
    frameDurationMs: 20,
    startTriggerMs: 60,
    minSpeechMs: 160,
    endOfSpeechMs: 720,
    hangoverMs: 260,
    cooldownMs: 180,
    speechThreshold: 0.62,
    silenceThreshold: 0.38,
  },
  debug: false,
};

export function createSpeechEndpointConfig(
  overrides: Partial<SpeechEndpointConfig> = {},
): SpeechEndpointConfig {
  return {
    audio: {
      ...DEFAULT_SPEECH_ENDPOINT_CONFIG.audio,
      ...overrides.audio,
    },
    vad: {
      ...DEFAULT_SPEECH_ENDPOINT_CONFIG.vad,
      ...overrides.vad,
    },
    endpoint: {
      ...DEFAULT_SPEECH_ENDPOINT_CONFIG.endpoint,
      ...overrides.endpoint,
      frameDurationMs: overrides.endpoint?.frameDurationMs
        ?? overrides.audio?.frameDurationMs
        ?? DEFAULT_SPEECH_ENDPOINT_CONFIG.endpoint.frameDurationMs,
    },
    debug: overrides.debug ?? DEFAULT_SPEECH_ENDPOINT_CONFIG.debug,
  };
}
