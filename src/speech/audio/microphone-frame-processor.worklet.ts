const PROCESSOR_NAME = "microphone-frame-processor";

interface ProcessorOptions {
  frameSize?: number;
}

interface ProcessorMessage {
  type: "configure" | "reset";
  frameSize?: number;
}

class MicrophoneFrameProcessor extends AudioWorkletProcessor {
  private frameSize: number;

  private frameBuffer: Float32Array;

  private frameOffset = 0;

  constructor(options?: AudioWorkletNodeOptions) {
    super();

    const processorOptions = options?.processorOptions as ProcessorOptions | undefined;

    this.frameSize = processorOptions?.frameSize ?? 320;
    this.frameBuffer = new Float32Array(this.frameSize);

    this.port.onmessage = (event: MessageEvent<ProcessorMessage>) => {
      if (event.data.type === "configure" && event.data.frameSize) {
        this.frameSize = event.data.frameSize;
        this.frameBuffer = new Float32Array(this.frameSize);
        this.frameOffset = 0;
      }

      if (event.data.type === "reset") {
        this.frameOffset = 0;
      }
    };
  }

  override process(inputs: Float32Array[][]): boolean {
    const input = inputs[0];

    if (!input || input.length === 0) {
      return true;
    }

    const channelCount = input.length;
    const sampleCount = input[0]?.length ?? 0;

    for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
      let monoSample = 0;

      for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
        monoSample += input[channelIndex]?.[sampleIndex] ?? 0;
      }

      this.frameBuffer[this.frameOffset] = monoSample / channelCount;
      this.frameOffset += 1;

      if (this.frameOffset === this.frameSize) {
        const completeFrame = this.frameBuffer;

        this.port.postMessage(
          {
            type: "frame",
            samples: completeFrame,
          },
          [completeFrame.buffer],
        );

        this.frameBuffer = new Float32Array(this.frameSize);
        this.frameOffset = 0;
      }
    }

    return true;
  }
}

registerProcessor(PROCESSOR_NAME, MicrophoneFrameProcessor);
