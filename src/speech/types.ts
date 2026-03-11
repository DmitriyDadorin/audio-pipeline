export type SpeechEndpointServiceState =
  | "idle"
  | "listening"
  | "speech_detected"
  | "speech_active"
  | "possible_end"
  | "speech_ended"
  | "error";

export type EndpointPhase =
  | "silence"
  | "speech_candidate"
  | "speech_active"
  | "possible_end"
  | "cooldown";

export type EndpointTransition =
  | "none"
  | "speech_start"
  | "speech_active"
  | "speech_resume"
  | "speech_pause"
  | "possible_end"
  | "speech_end"
  | "silence";

export interface AudioPipelineConfig {
  frameDurationMs: number;
  sampleRate: number;
  channelCount: number;
  maxBufferedFrames: number;
}

export interface VadConfig {
  speechThreshold: number;
  silenceThreshold: number;
  smoothingFactor: number;
  noiseFloorDecay: number;
  noiseFloorRise: number;
  minNoiseFloor: number;
  maxNoiseFloor: number;
  zeroCrossSpeechCeiling: number;
  zeroCrossSilenceFloor: number;
  fluxBoost: number;
}

export interface EndpointDetectorConfig {
  frameDurationMs: number;
  startTriggerMs: number;
  minSpeechMs: number;
  endOfSpeechMs: number;
  hangoverMs: number;
  cooldownMs: number;
  speechThreshold: number;
  silenceThreshold: number;
}

export interface SpeechEndpointConfig {
  audio: AudioPipelineConfig;
  vad: VadConfig;
  endpoint: EndpointDetectorConfig;
  debug: boolean;
}

export interface SpeechProbabilityEvent {
  probability: number;
  speaking: boolean;
  phase: EndpointPhase;
  timestampMs: number;
}

export interface DebugFrameSnapshot {
  timestampMs: number;
  probability: number;
  smoothedProbability: number;
  rms: number;
  peak: number;
  zeroCrossingRate: number;
  flux: number;
  noiseFloor: number;
  speaking: boolean;
  phase: EndpointPhase;
  speechDurationMs: number;
  trailingSilenceMs: number;
}

export interface EndpointDetectorFrameResult {
  phase: EndpointPhase;
  transition: EndpointTransition;
  timestampMs: number;
  speechProbability: number;
  speaking: boolean;
  inUtterance: boolean;
  shortPause: boolean;
  likelyContinuation: boolean;
  speechDurationMs: number;
  trailingSilenceMs: number;
}

export interface SpeechStateChangedEvent {
  previousState: SpeechEndpointServiceState;
  state: SpeechEndpointServiceState;
  timestampMs: number;
  reason:
    | "start"
    | "stop"
    | "reset"
    | "detector"
    | "error"
    | "dispose";
}

export interface SpeechEndpointEventMap {
  ready: undefined;
  speechStart: EndpointDetectorFrameResult;
  speechProb: SpeechProbabilityEvent;
  speechPause: EndpointDetectorFrameResult;
  speechEnd: EndpointDetectorFrameResult;
  silence: EndpointDetectorFrameResult;
  stateChanged: SpeechStateChangedEvent;
  debug: DebugFrameSnapshot;
  error: Error;
}

export type SpeechServiceEventUnsubscribe = () => void;

export interface BrowserSpeechEndpointServiceOptions {
  config?: Partial<SpeechEndpointConfig>;
  getUserMedia?: typeof navigator.mediaDevices.getUserMedia;
}

export interface TypedEventEmitter<EventMap extends Record<string, unknown>> {
  emit<EventName extends keyof EventMap>(
    eventName: EventName,
    payload: EventMap[EventName],
  ): void;
  on<EventName extends keyof EventMap>(
    eventName: EventName,
    handler: (payload: EventMap[EventName]) => void,
  ): SpeechServiceEventUnsubscribe;
  clear(): void;
}
