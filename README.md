# Browser Speech + EOU MVP

Локальный browser-first MVP для цепочки:

`AudioWorklet -> Silero VAD -> Streaming STT adapter -> HypothesisTracker -> StabilityDetector -> EOU -> Commit`

Сейчас в проекте реально работают:

- `Silero VAD` в браузере через `@ricky0123/vad-web`
- `Vosk STT` в браузере через `vosk-browser`
- baseline `EOU classifier` на engineered features
- экспорт baseline-модели в `ONNX`
- runtime через `onnxruntime-web`
- `update()` / `reset()` API для пост-STT слоя
- готовая архитектура, куда потом можно вставить tiny transformer вместо baseline classifier

Streaming STT теперь подключен через отдельный adapter, а ручной `update()` в demo оставлен как отладочный override.

## Почему архитектура такая

### Почему сначала `HypothesisTracker`

EOU почти всегда ломается не из-за VAD, а из-за нестабильных partial transcript-ов.

Если partial текст дрожит, то без tracker-а система:

- коммитит слишком рано по случайной паузе;
- ждет слишком долго, потому что боится churn;
- не понимает, какая часть гипотезы уже устойчива, а какая еще меняется.

Поэтому первым слоем после STT идет [hypothesis-tracker.ts](/Users/dmitriydadorin/all/audio-pipeline/src/speech/eou/hypothesis-tracker.ts): он считает `stablePrefix`, `unstableSuffix`, `unchangedMs`, `recentChurnScore`, `appendedChars`, `removedChars`.

### Почему отдельный `StabilityDetector`

EOU probability сама по себе не должна коммитить текст.

Нужен отдельный слой, который отвечает на прикладной вопрос:

- partial уже достаточно устоялся;
- пользователь, скорее всего, еще продолжит;
- пауза уже похожа на конец реплики или еще нет.

Это реализовано в [stability-detector.ts](/Users/dmitriydadorin/all/audio-pipeline/src/speech/eou/stability-detector.ts).

### Почему `CommitPolicy` отдельно от classifier

Classifier хорошо дает плавную вероятность.
Policy нужен, чтобы навесить production-friendly guardrails:

- fast path по пунктуации;
- backstop по долгой тишине;
- запрет premature commit пока человек еще говорит;
- защита от duplicate commit.

Это реализовано в [commit-policy.ts](/Users/dmitriydadorin/all/audio-pipeline/src/speech/eou/commit-policy.ts).

### Почему baseline classifier сделан на engineered features

Для browser MVP это самый быстрый путь:

- дешево по latency;
- прозрачно дебажится;
- легко экспортируется в ONNX;
- можно быстро заменить на tiny transformer по интерфейсу `EouClassifier`.

Это реализовано в [baseline-eou-classifier.ts](/Users/dmitriydadorin/all/audio-pipeline/src/speech/eou/baseline-eou-classifier.ts) и [onnx-eou-classifier.ts](/Users/dmitriydadorin/all/audio-pipeline/src/speech/eou/onnx-eou-classifier.ts).

## Какие признаки реально нужны

В baseline classifier идут только дешевые признаки, которые реально полезны для MVP:

- `trailingSilenceMs`
- `speechDurationMs`
- `speechProbability`
- `1 - speechProbability`
- `stabilityScore`
- `stablePrefixRatio`
- `unchangedMs`
- `recentChurnScore`
- `terminalPunctuation`
- `tokenCount`
- `unstableSuffixLength`
- `isFinal`

Фичи собираются в [baseline-eou-features.ts](/Users/dmitriydadorin/all/audio-pipeline/src/speech/eou/baseline-eou-features.ts).

Почему этого достаточно для MVP:

- `silence + speechProbability` помогают не коммитить во время живой речи;
- `unchangedMs + churn` помогают понять, дрожит ли transcript;
- `stablePrefixRatio + unstableSuffix` помогают отделить устойчивую часть от нестабильного хвоста;
- `terminal punctuation + isFinal` дают быстрый fast path без ожидания избыточной тишины.

## Как уменьшается latency

- VAD работает в браузере и дает frame-level signal без сервера.
- Commit не ждет финального ASR, если уже есть сочетание:
  - meaningful silence
  - стабильный partial
  - высокая EOU probability
- Есть punctuation fast path: если partial выглядит законченным и немного устоялся, коммит можно делать раньше.

## Как уменьшается premature commit

- Пока `vad.speaking === true`, коммит запрещен.
- Если `continuationScore` высокий, policy удерживает commit.
- Если transcript недавно менялся, policy ждет `minStableMs`.
- Короткая пауза без устойчивости не считается концом реплики.

## Как уменьшается late commit

- Есть `final_hypothesis` fast path.
- Есть `punctuation_fast_path`.
- Есть `silence_backstop`, если тишина тянется слишком долго.
- EOU classifier дает probability, которая позволяет коммитить до идеального финала STT, когда уже накоплено достаточно сигналов.

## Структура

- [src/speech/browser-streaming-commit-service.ts](/Users/dmitriydadorin/all/audio-pipeline/src/speech/browser-streaming-commit-service.ts) - browser-first commit service
- [src/speech/streaming-commit-config.ts](/Users/dmitriydadorin/all/audio-pipeline/src/speech/streaming-commit-config.ts) - единая точка настройки порогов, путей моделей и VAD/STT параметров
- [src/speech/vad/silero-vad-adapter.ts](/Users/dmitriydadorin/all/audio-pipeline/src/speech/vad/silero-vad-adapter.ts) - Silero VAD adapter
- [src/speech/stt/vosk-transcript-source.ts](/Users/dmitriydadorin/all/audio-pipeline/src/speech/stt/vosk-transcript-source.ts) - Vosk streaming transcript source
- [src/speech/eou/hypothesis-tracker.ts](/Users/dmitriydadorin/all/audio-pipeline/src/speech/eou/hypothesis-tracker.ts)
- [src/speech/eou/stability-detector.ts](/Users/dmitriydadorin/all/audio-pipeline/src/speech/eou/stability-detector.ts)
- [src/speech/eou/commit-policy.ts](/Users/dmitriydadorin/all/audio-pipeline/src/speech/eou/commit-policy.ts)
- [src/speech/eou/eou-commit-engine.ts](/Users/dmitriydadorin/all/audio-pipeline/src/speech/eou/eou-commit-engine.ts)
- [src/speech/eou/baseline-eou-classifier.ts](/Users/dmitriydadorin/all/audio-pipeline/src/speech/eou/baseline-eou-classifier.ts)
- [src/speech/eou/onnx-eou-classifier.ts](/Users/dmitriydadorin/all/audio-pipeline/src/speech/eou/onnx-eou-classifier.ts)
- [scripts/export_baseline_eou_onnx.py](/Users/dmitriydadorin/all/audio-pipeline/scripts/export_baseline_eou_onnx.py)
- [scripts/sync_browser_assets.mjs](/Users/dmitriydadorin/all/audio-pipeline/scripts/sync_browser_assets.mjs)

## Запуск

1. Установить зависимости:

```bash
npm install
python3 -m pip install onnx
```

2. Скопировать browser assets и экспортировать baseline EOU model:

```bash
npm run prepare:browser
```

3. Поднять demo:

```bash
npm run dev
```

4. Открыть адрес от Vite, обычно `http://localhost:5173`.

## Как проверить

### Silero VAD

1. Нажать `start mic`
2. Дать доступ к микрофону
3. Проверить, что меняются `VAD phase` и `Speech Prob`

### Vosk STT

1. Нажать `init`
2. Дождаться загрузки модели
3. Нажать `start mic`
4. Начать говорить в микрофон
5. Следить за:
   - `hypothesis update` в логе
   - `Last Hypothesis`
   - `Last Commit`

По умолчанию demo использует локальную Russian small model:

- [public/models/vosk-model-small-ru-0.22.tar.gz](/Users/dmitriydadorin/all/audio-pipeline/public/models/vosk-model-small-ru-0.22.tar.gz)

Если нужна другая модель, поменяйте `Vosk model URL` в UI до `init()`.

### Tracker / EOU / Commit

1. Можно дополнительно ввести partial transcript вручную
2. Нажать `manual update()`
3. Во время паузы следить за:
   - `EOU Prob`
   - `Decision`
   - `Last Hypothesis`
   - `Last Commit`

Полезные сценарии:

1. Без пунктуации и с короткой паузой: commit не должен происходить слишком рано.
2. С вопросительным или точкой на конце и устойчивой тишиной: commit должен происходить быстрее.
3. Если partial меняется часто: commit должен задерживаться.
4. Если выставить `final hypothesis`: commit должен срабатывать агрессивнее.

## Где теперь настраивать пороги

Все ключевые настройки сведены в один typed config:

- [streaming-commit-config.ts](/Users/dmitriydadorin/all/audio-pipeline/src/speech/streaming-commit-config.ts)

Там лежат:

- пути до Vosk, ONNX и ORT assets
- параметры STT буфера
- пороги VAD
- параметры `SEND_TO_AGENT` и duplicate commit guard

Для быстрой ручной настройки эти же параметры выведены на demo-страницу в блок `Unified Tuning`.

## ONNX

Baseline модель экспортируется в:

- [public/models/baseline-eou.onnx](/Users/dmitriydadorin/all/audio-pipeline/public/models/baseline-eou.onnx)

Runtime файлы для VAD и ORT копируются в:

- [public/vad](/Users/dmitriydadorin/all/audio-pipeline/public/vad)
- [public/ort](/Users/dmitriydadorin/all/audio-pipeline/public/ort)

## Что заменится потом на tiny transformer

Ничего выше `EouClassifier` ломать не придется.

Нужно будет заменить только classifier implementation:

- сейчас: engineered features + ONNX logistic model
- потом: tiny transformer / conv-transformer / sequence model

То есть `HypothesisTracker`, `StabilityDetector`, `CommitPolicy`, service API и browser plumbing остаются на месте.
