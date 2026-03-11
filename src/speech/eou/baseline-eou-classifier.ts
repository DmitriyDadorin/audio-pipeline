import { BASELINE_EOU_FEATURE_NAMES, extractBaselineEouFeatures } from "./baseline-eou-features.ts";
import type {
  EouClassifier,
  EouClassifierInput,
  EouPrediction,
} from "./types.ts";

const BASELINE_WEIGHTS = new Float32Array([
  2.15,
  0.24,
  -0.82,
  0.92,
  1.48,
  0.54,
  1.06,
  -1.28,
  0.96,
  0.38,
  -0.84,
  1.75,
]);

const BASELINE_BIAS = -1.94;

export class BaselineEouClassifier implements EouClassifier {
  async predict(input: EouClassifierInput): Promise<EouPrediction> {
    const features = extractBaselineEouFeatures(input);
    const logit = dot(features, BASELINE_WEIGHTS) + BASELINE_BIAS;

    return {
      probability: sigmoid(logit),
      features,
      featureNames: BASELINE_EOU_FEATURE_NAMES,
    };
  }
}

function dot(left: Float32Array, right: Float32Array): number {
  let total = 0;

  for (let index = 0; index < left.length; index += 1) {
    total += (left[index] ?? 0) * (right[index] ?? 0);
  }

  return total;
}

function sigmoid(value: number): number {
  return 1 / (1 + Math.exp(-value));
}
