export class StreamingLinearResampler {
  private readonly sourceSampleRate: number;

  private readonly targetSampleRate: number;

  private readonly sourceBuffer: number[] = [];

  private nextOutputPosition = 0;

  constructor(sourceSampleRate: number, targetSampleRate: number) {
    this.sourceSampleRate = sourceSampleRate;
    this.targetSampleRate = targetSampleRate;
  }

  push(input: Float32Array): Float32Array {
    if (this.sourceSampleRate === this.targetSampleRate) {
      return input;
    }

    for (const sample of input) {
      this.sourceBuffer.push(sample);
    }

    const output: number[] = [];
    const step = this.sourceSampleRate / this.targetSampleRate;

    while (this.nextOutputPosition + 1 < this.sourceBuffer.length) {
      const baseIndex = Math.floor(this.nextOutputPosition);
      const fraction = this.nextOutputPosition - baseIndex;
      const start = this.sourceBuffer[baseIndex] ?? 0;
      const end = this.sourceBuffer[baseIndex + 1] ?? start;

      output.push(start + ((end - start) * fraction));
      this.nextOutputPosition += step;
    }

    const consumed = Math.floor(this.nextOutputPosition);

    if (consumed > 0) {
      this.sourceBuffer.splice(0, consumed);
      this.nextOutputPosition -= consumed;
    }

    return Float32Array.from(output);
  }

  reset(): void {
    this.sourceBuffer.length = 0;
    this.nextOutputPosition = 0;
  }
}
