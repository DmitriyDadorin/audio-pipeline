import type {
  EndpointDetectorFrameResult,
  SpeechEndpointServiceState,
} from "../types.ts";

export interface StateMachineTransition {
  previousState: SpeechEndpointServiceState;
  state: SpeechEndpointServiceState;
  changed: boolean;
}

export class SpeechStateMachine {
  private state: SpeechEndpointServiceState = "idle";

  getState(): SpeechEndpointServiceState {
    return this.state;
  }

  start(): StateMachineTransition {
    return this.setState("listening");
  }

  stop(): StateMachineTransition {
    return this.setState("idle");
  }

  reset(): StateMachineTransition {
    return this.setState(this.state === "idle" ? "idle" : "listening");
  }

  setError(): StateMachineTransition {
    return this.setState("error");
  }

  applyDetectorResult(
    result: EndpointDetectorFrameResult,
  ): StateMachineTransition {
    switch (result.phase) {
      case "silence":
        return this.setState(this.state === "idle" ? "idle" : "listening");
      case "speech_candidate":
        return this.setState("speech_detected");
      case "speech_active":
        return this.setState("speech_active");
      case "possible_end":
        return this.setState("possible_end");
      case "cooldown":
        return this.setState("speech_ended");
      default:
        return {
          previousState: this.state,
          state: this.state,
          changed: false,
        };
    }
  }

  private setState(
    nextState: SpeechEndpointServiceState,
  ): StateMachineTransition {
    const previousState = this.state;
    const changed = previousState !== nextState;

    this.state = nextState;

    return {
      previousState,
      state: nextState,
      changed,
    };
  }
}
