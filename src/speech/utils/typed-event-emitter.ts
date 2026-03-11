import type {
  SpeechServiceEventUnsubscribe,
  TypedEventEmitter,
} from "../types.ts";

type HandlerMap<EventMap extends Record<string, unknown>> = {
  [EventName in keyof EventMap]?: Set<(payload: EventMap[EventName]) => void>;
};

export class SimpleTypedEventEmitter<EventMap extends Record<string, unknown>>
  implements TypedEventEmitter<EventMap> {
  private readonly handlers: HandlerMap<EventMap> = {};

  emit<EventName extends keyof EventMap>(
    eventName: EventName,
    payload: EventMap[EventName],
  ): void {
    const eventHandlers = this.handlers[eventName];

    if (!eventHandlers) {
      return;
    }

    for (const handler of eventHandlers) {
      handler(payload);
    }
  }

  on<EventName extends keyof EventMap>(
    eventName: EventName,
    handler: (payload: EventMap[EventName]) => void,
  ): SpeechServiceEventUnsubscribe {
    const handlers = this.handlers[eventName]
      ?? new Set<(payload: EventMap[EventName]) => void>();

    handlers.add(handler);
    this.handlers[eventName] = handlers;

    return () => {
      handlers.delete(handler);

      if (handlers.size === 0) {
        delete this.handlers[eventName];
      }
    };
  }

  clear(): void {
    for (const key of Object.keys(this.handlers) as Array<keyof EventMap>) {
      delete this.handlers[key];
    }
  }
}
