import type {
  DebugFrameSnapshot,
  EndpointDetectorFrameResult,
  SpeechEndpointConfig,
  SpeechProbabilityEvent,
} from "../types.ts";

export interface WorkerInitMessage {
  type: "init";
  config: SpeechEndpointConfig;
}

export interface WorkerAudioFrameMessage {
  type: "audio-frame";
  samples: ArrayBuffer;
  sourceSampleRate: number;
  timestampMs: number;
}

export interface WorkerResetMessage {
  type: "reset";
}

export interface WorkerDisposeMessage {
  type: "dispose";
}

export type SpeechWorkerRequest =
  | WorkerInitMessage
  | WorkerAudioFrameMessage
  | WorkerResetMessage
  | WorkerDisposeMessage;

export interface WorkerReadyMessage {
  type: "ready";
}

export interface WorkerFrameResultMessage {
  type: "frame-result";
  result: EndpointDetectorFrameResult;
  probabilityEvent: SpeechProbabilityEvent;
  debugSnapshot?: DebugFrameSnapshot;
}

export interface WorkerErrorMessage {
  type: "error";
  message: string;
}

export type SpeechWorkerResponse =
  | WorkerReadyMessage
  | WorkerFrameResultMessage
  | WorkerErrorMessage;
