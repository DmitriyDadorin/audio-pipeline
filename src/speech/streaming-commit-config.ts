import type { CommitPolicyConfig } from "./eou/types.ts";

export interface StreamingCommitAssetsConfig {
  sttModelUrl: string;
  eouModelUrl: string;
  ortBasePath: string;
  vadBaseAssetPath: string;
}

export interface StreamingCommitSttConfig {
  processorBufferSize: number;
}

export interface StreamingCommitVadConfig {
  model: "v5" | "legacy";
  frameDurationMs: number;
  speechProbabilityThreshold: number;
  possibleEndSilenceMs: number;
}

export interface StreamingCommitConfig {
  assets: StreamingCommitAssetsConfig;
  stt: StreamingCommitSttConfig;
  vad: StreamingCommitVadConfig;
  commit: CommitPolicyConfig;
}

export type PartialStreamingCommitConfig = {
  assets?: Partial<StreamingCommitAssetsConfig>;
  stt?: Partial<StreamingCommitSttConfig>;
  vad?: Partial<StreamingCommitVadConfig>;
  commit?: Partial<CommitPolicyConfig>;
};

export interface StreamingCommitSettingDescriptor {
  key: string;
  path: string;
  label: string;
  description: string;
  type: "string" | "number";
  unit?: string;
}

export const DEFAULT_STREAMING_COMMIT_CONFIG: StreamingCommitConfig = {
  assets: {
    sttModelUrl: "/models/vosk-model-small-ru-0.22.tar.gz",
    eouModelUrl: "/models/baseline-eou.onnx",
    ortBasePath: "/ort/",
    vadBaseAssetPath: "/vad/",
  },
  stt: {
    processorBufferSize: 4096,
  },
  vad: {
    model: "v5",
    frameDurationMs: 32,
    speechProbabilityThreshold: 0.5,
    possibleEndSilenceMs: 240,
  },
  commit: {
    minChars: 3,
    minTokenCount: 1,
    minSilenceMs: 220,
    fastCommitPunctuationMs: 320,
    maxSilenceMs: 1100,
    minStableMs: 180,
    commitProbabilityThreshold: 0.68,
    duplicateCommitCooldownMs: 1200,
  },
};

export const STREAMING_COMMIT_SETTING_DESCRIPTORS: readonly StreamingCommitSettingDescriptor[] = [
  {
    key: "assets.sttModelUrl",
    path: "assets.sttModelUrl",
    label: "Vosk model URL",
    description: "Путь до локальной или внешней STT модели Vosk, которая будет загружена при init().",
    type: "string",
  },
  {
    key: "assets.eouModelUrl",
    path: "assets.eouModelUrl",
    label: "EOU model URL",
    description: "Путь до ONNX модели классификатора конца высказывания.",
    type: "string",
  },
  {
    key: "assets.ortBasePath",
    path: "assets.ortBasePath",
    label: "ORT base path",
    description: "Базовый путь до runtime файлов onnxruntime-web.",
    type: "string",
  },
  {
    key: "assets.vadBaseAssetPath",
    path: "assets.vadBaseAssetPath",
    label: "VAD asset path",
    description: "Базовый путь до Silero VAD assets и worklet runtime.",
    type: "string",
  },
  {
    key: "stt.processorBufferSize",
    path: "stt.processorBufferSize",
    label: "STT buffer size",
    description: "Размер буфера ScriptProcessor для Vosk. Больше буфер: стабильнее, но выше latency.",
    type: "number",
    unit: "samples",
  },
  {
    key: "vad.model",
    path: "vad.model",
    label: "VAD model",
    description: "Какой вариант модели использует MicVAD. Обычно оставлять v5.",
    type: "string",
  },
  {
    key: "vad.frameDurationMs",
    path: "vad.frameDurationMs",
    label: "VAD frame duration",
    description: "Длительность одного VAD кадра для накопления speechDuration и trailingSilence.",
    type: "number",
    unit: "ms",
  },
  {
    key: "vad.speechProbabilityThreshold",
    path: "vad.speechProbabilityThreshold",
    label: "VAD speech threshold",
    description: "Порог Silero VAD, выше которого кадр считается речью. Ниже порога быстрее растет тишина.",
    type: "number",
  },
  {
    key: "vad.possibleEndSilenceMs",
    path: "vad.possibleEndSilenceMs",
    label: "VAD possible end",
    description: "Через сколько мс тишины VAD phase переключается в possible_end.",
    type: "number",
    unit: "ms",
  },
  {
    key: "commit.minChars",
    path: "commit.minChars",
    label: "Min chars",
    description: "Минимальная длина текста, ниже которой фраза не отправляется.",
    type: "number",
  },
  {
    key: "commit.minTokenCount",
    path: "commit.minTokenCount",
    label: "Min token count",
    description: "Минимальное число токенов или слов для commit.",
    type: "number",
  },
  {
    key: "commit.minSilenceMs",
    path: "commit.minSilenceMs",
    label: "Min silence before send",
    description: "Минимальная тишина перед ранним SEND_TO_AGENT. Для медленной речи это один из главных регуляторов.",
    type: "number",
    unit: "ms",
  },
  {
    key: "commit.fastCommitPunctuationMs",
    path: "commit.fastCommitPunctuationMs",
    label: "Punctuation fast path",
    description: "Сколько тишины нужно, чтобы быстрее отправлять фразу с завершающей пунктуацией.",
    type: "number",
    unit: "ms",
  },
  {
    key: "commit.maxSilenceMs",
    path: "commit.maxSilenceMs",
    label: "Silence backstop",
    description: "Жесткий предел тишины, после которого система почти наверняка считает фразу завершенной.",
    type: "number",
    unit: "ms",
  },
  {
    key: "commit.minStableMs",
    path: "commit.minStableMs",
    label: "Min stable transcript",
    description: "Сколько partial должен не меняться, чтобы его можно было безопасно отправить.",
    type: "number",
    unit: "ms",
  },
  {
    key: "commit.commitProbabilityThreshold",
    path: "commit.commitProbabilityThreshold",
    label: "EOU probability threshold",
    description: "Минимальная уверенность EOU classifier для early commit без final hypothesis.",
    type: "number",
  },
  {
    key: "commit.duplicateCommitCooldownMs",
    path: "commit.duplicateCommitCooldownMs",
    label: "Duplicate commit cooldown",
    description: "Страховка от повторной отправки одной и той же фразы подряд.",
    type: "number",
    unit: "ms",
  },
];

export function createStreamingCommitConfig(
  overrides: PartialStreamingCommitConfig = {},
): StreamingCommitConfig {
  return {
    assets: {
      ...DEFAULT_STREAMING_COMMIT_CONFIG.assets,
      ...overrides.assets,
    },
    stt: {
      ...DEFAULT_STREAMING_COMMIT_CONFIG.stt,
      ...overrides.stt,
    },
    vad: {
      ...DEFAULT_STREAMING_COMMIT_CONFIG.vad,
      ...overrides.vad,
    },
    commit: {
      ...DEFAULT_STREAMING_COMMIT_CONFIG.commit,
      ...overrides.commit,
    },
  };
}
