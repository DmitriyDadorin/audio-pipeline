export interface FrameFeatures {
  rms: number;
  peak: number;
  zeroCrossingRate: number;
  flux: number;
  voicedRatio: number;
}

export function extractFrameFeatures(
  samples: Float32Array,
  noiseFloor: number,
): FrameFeatures {
  let sumSquares = 0;
  let peak = 0;
  let zeroCrossings = 0;
  let voicedSamples = 0;
  let fluxAccumulator = 0;

  const voiceGate = Math.max(noiseFloor * 2.4, 0.01);

  for (let index = 0; index < samples.length; index += 1) {
    const current = samples[index] ?? 0;
    const absolute = Math.abs(current);

    sumSquares += current * current;
    peak = Math.max(peak, absolute);

    if (absolute >= voiceGate) {
      voicedSamples += 1;
    }

    if (index > 0) {
      const previous = samples[index - 1] ?? 0;

      if (
        (current >= 0 && previous < 0)
        || (current < 0 && previous >= 0)
      ) {
        zeroCrossings += 1;
      }

      fluxAccumulator += Math.abs(current - previous);
    }
  }

  const length = Math.max(samples.length, 1);

  return {
    rms: Math.sqrt(sumSquares / length),
    peak,
    zeroCrossingRate: zeroCrossings / length,
    flux: fluxAccumulator / length,
    voicedRatio: voicedSamples / length,
  };
}
