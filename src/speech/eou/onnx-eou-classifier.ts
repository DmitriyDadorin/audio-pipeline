import * as ort from "onnxruntime-web/wasm";
import { BASELINE_EOU_FEATURE_NAMES, extractBaselineEouFeatures } from "./baseline-eou-features.ts";
import type {
  EouClassifier,
  EouClassifierInput,
  EouPrediction,
} from "./types.ts";

export class OnnxEouClassifier implements EouClassifier {
  private readonly modelUrl: string;

  private readonly wasmBasePath: string;

  private session?: ort.InferenceSession;

  constructor(modelUrl: string, wasmBasePath: string = "/ort/") {
    this.modelUrl = modelUrl;
    this.wasmBasePath = wasmBasePath;
  }

  async init(): Promise<void> {
    if (this.session) {
      return;
    }

    ort.env.wasm.wasmPaths = {
      wasm: `${this.wasmBasePath}ort-wasm-simd-threaded.wasm`,
    };
    ort.env.wasm.numThreads = 1;
    this.session = await ort.InferenceSession.create(this.modelUrl, {
      executionProviders: ["wasm"],
      graphOptimizationLevel: "all",
    });
  }

  async predict(input: EouClassifierInput): Promise<EouPrediction> {
    if (!this.session) {
      await this.init();
    }

    if (!this.session) {
      throw new Error("ONNX EOU classifier session was not initialized");
    }

    const features = extractBaselineEouFeatures(input);
    const tensor = new ort.Tensor("float32", features, [1, features.length]);
    const output = await this.session.run({ features: tensor });
    const probabilityTensor = output.probability;

    if (!(probabilityTensor instanceof ort.Tensor)) {
      throw new Error("EOU ONNX model did not return a probability tensor");
    }

    return {
      probability: Number(probabilityTensor.data[0] ?? 0),
      features,
      featureNames: BASELINE_EOU_FEATURE_NAMES,
    };
  }

  async dispose(): Promise<void> {
    await this.session?.release();
    this.session = undefined;
  }
}
