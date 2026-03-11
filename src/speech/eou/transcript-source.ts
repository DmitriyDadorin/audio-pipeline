import type { TranscriptHypothesis } from "./types.ts";

export interface StreamingTranscriptSource {
  init?(): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  reset(): void;
  onHypothesis(handler: (hypothesis: TranscriptHypothesis) => void): () => void;
}
