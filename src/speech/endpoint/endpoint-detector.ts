import type {
  EndpointDetectorConfig,
  EndpointDetectorFrameResult,
  EndpointPhase,
  EndpointTransition,
} from "../types.ts";

interface DetectorState {
  phase: EndpointPhase;
  candidateSpeechMs: number;
  speechDurationMs: number;
  trailingSilenceMs: number;
  cooldownRemainingMs: number;
  transition: EndpointTransition;
}

const INITIAL_STATE: DetectorState = {
  phase: "silence",
  candidateSpeechMs: 0,
  speechDurationMs: 0,
  trailingSilenceMs: 0,
  cooldownRemainingMs: 0,
  transition: "none",
};

export class EndpointDetector {
  private readonly config: EndpointDetectorConfig;

  private state: DetectorState = { ...INITIAL_STATE };

  constructor(config: EndpointDetectorConfig) {
    this.config = config;
  }

  getPhase(): EndpointPhase {
    return this.state.phase;
  }

  reset(): void {
    this.state = { ...INITIAL_STATE };
  }

  process(
    speechProbability: number,
    timestampMs: number,
  ): EndpointDetectorFrameResult {
    const speechLike = speechProbability >= this.config.speechThreshold;
    const silenceLike = speechProbability <= this.config.silenceThreshold;
    const nextState = { ...this.state, transition: "none" as EndpointTransition };
    const frameMs = this.config.frameDurationMs;

    if (nextState.cooldownRemainingMs > 0) {
      nextState.cooldownRemainingMs = Math.max(
        0,
        nextState.cooldownRemainingMs - frameMs,
      );

      if (nextState.cooldownRemainingMs === 0) {
        nextState.phase = "silence";
        nextState.transition = "silence";
        nextState.trailingSilenceMs = 0;
        nextState.speechDurationMs = 0;
      }
    }

    if (speechLike) {
      this.handleSpeechFrame(nextState);
    } else if (silenceLike || nextState.phase !== "silence") {
      this.handleSilenceFrame(nextState);
    }

    this.state = nextState;

    return {
      phase: nextState.phase,
      transition: nextState.transition,
      timestampMs,
      speechProbability,
      speaking: speechLike,
      inUtterance: nextState.phase !== "silence" && nextState.phase !== "cooldown",
      shortPause: nextState.phase === "possible_end"
        || (
          nextState.phase === "speech_active"
          && nextState.trailingSilenceMs > 0
          && nextState.trailingSilenceMs < this.config.hangoverMs
        ),
      likelyContinuation: nextState.phase === "possible_end"
        || (
          nextState.phase === "speech_active"
          && nextState.trailingSilenceMs > 0
        ),
      speechDurationMs: nextState.speechDurationMs,
      trailingSilenceMs: nextState.trailingSilenceMs,
    };
  }

  private handleSpeechFrame(state: DetectorState): void {
    state.trailingSilenceMs = 0;

    if (state.phase === "cooldown") {
      state.cooldownRemainingMs = 0;
      state.candidateSpeechMs = this.config.frameDurationMs;
      this.promoteCandidateIfReady(state);
      return;
    }

    if (state.phase === "silence") {
      state.candidateSpeechMs += this.config.frameDurationMs;
      this.promoteCandidateIfReady(state);
      return;
    }

    if (state.phase === "possible_end") {
      state.speechDurationMs += this.config.frameDurationMs;
      state.phase = "speech_active";
      state.transition = "speech_resume";
      return;
    }

    state.speechDurationMs += this.config.frameDurationMs;

    if (
      state.phase === "speech_candidate"
      && state.speechDurationMs >= this.config.minSpeechMs
    ) {
      state.phase = "speech_active";
      state.transition = "speech_active";
    }
  }

  private handleSilenceFrame(state: DetectorState): void {
    if (state.phase === "silence") {
      state.candidateSpeechMs = 0;
      state.speechDurationMs = 0;
      state.trailingSilenceMs = 0;
      return;
    }

    state.trailingSilenceMs += this.config.frameDurationMs;

    if (state.phase === "speech_candidate") {
      if (state.trailingSilenceMs >= this.config.hangoverMs) {
        state.phase = "silence";
        state.transition = "silence";
        state.candidateSpeechMs = 0;
        state.speechDurationMs = 0;
        state.trailingSilenceMs = 0;
      }

      return;
    }

    if (state.phase === "speech_active") {
      if (state.trailingSilenceMs >= this.config.hangoverMs) {
        state.phase = "possible_end";
        state.transition = "possible_end";
      } else if (
        state.transition === "none"
        && state.trailingSilenceMs === this.config.frameDurationMs
      ) {
        state.transition = "speech_pause";
      }

      return;
    }

    if (state.phase === "possible_end") {
      if (state.trailingSilenceMs >= this.config.endOfSpeechMs) {
        state.phase = "cooldown";
        state.transition = "speech_end";
        state.cooldownRemainingMs = this.config.cooldownMs;
        state.candidateSpeechMs = 0;
        state.speechDurationMs = 0;
      }
    }
  }

  private promoteCandidateIfReady(state: DetectorState): void {
    if (state.candidateSpeechMs < this.config.startTriggerMs) {
      return;
    }

    state.phase = "speech_candidate";
    state.speechDurationMs = state.candidateSpeechMs;
    state.transition = "speech_start";
  }
}
