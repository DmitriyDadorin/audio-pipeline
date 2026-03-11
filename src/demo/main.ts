import {
  BrowserStreamingCommitService,
  DEFAULT_STREAMING_COMMIT_CONFIG,
  STREAMING_COMMIT_SETTING_DESCRIPTORS,
  createStreamingCommitConfig,
  type PartialStreamingCommitConfig,
  type StreamingCommitSettingDescriptor,
} from "../index.ts";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Missing #app root");
}

app.innerHTML = `
  <main class="shell">
    <section class="topbar">
      <div>
        <p class="eyebrow">Browser EOU Test Bench</p>
        <h1>Send To Agent</h1>
      </div>
      <div class="controls">
        <button id="init-btn">init</button>
        <button id="start-btn">start mic</button>
        <button id="stop-btn">stop</button>
        <button id="reset-btn">reset</button>
        <button id="dispose-btn">dispose</button>
      </div>
    </section>

    <section class="hero-grid">
      <article class="dispatch-card">
        <p class="label">Agent Dispatch</p>
        <div id="dispatch-badge" class="dispatch-badge waiting">WAITING</div>
        <p id="dispatch-reason" class="dispatch-reason">Waiting for stable end of utterance</p>
        <div class="mini-grid">
          <div class="mini-stat">
            <span>EOU</span>
            <strong id="eou-value">0.000</strong>
          </div>
          <div class="mini-stat">
            <span>Silence</span>
            <strong id="silence-value">0 ms</strong>
          </div>
          <div class="mini-stat">
            <span>VAD</span>
            <strong id="prob-value">0.000</strong>
          </div>
          <div class="mini-stat">
            <span>Phase</span>
            <strong id="phase-value">silence</strong>
          </div>
        </div>
        <div class="meter">
          <div id="meter-fill" class="meter-fill"></div>
        </div>
      </article>

      <article class="stack-card">
        <div class="status-list">
          <div class="status-row"><span>Service</span><strong id="service-status-value">idle</strong></div>
          <div class="status-row"><span>Model</span><strong id="model-status-value">not loaded</strong></div>
          <div class="status-row"><span>Decision</span><strong id="decision-value">waiting</strong></div>
        </div>
        <p class="compact-copy">
          Все ключевые пороги собраны ниже в одном месте. Меняй настройки и заново жми
          <code>init</code> или <code>start mic</code>.
        </p>
      </article>
    </section>

    <section class="panel tuning-panel">
      <div class="panel-head">
        <h2>Unified Tuning</h2>
        <div class="controls compact">
          <button id="restore-defaults-btn">restore defaults</button>
        </div>
      </div>
      <div id="settings-grid" class="settings-grid"></div>
    </section>

    <section class="content-grid">
      <article class="panel">
        <div class="panel-head">
          <h2>Live Transcript</h2>
          <span class="hint-chip">auto from Vosk</span>
        </div>
        <pre id="last-hypothesis" class="output large">-</pre>
      </article>

      <article class="panel">
        <div class="panel-head">
          <h2>Payload To Agent</h2>
          <span class="hint-chip">commit payload</span>
        </div>
        <pre id="last-commit" class="output">-</pre>
      </article>
    </section>

    <section class="manual-grid">
      <article class="panel">
        <div class="panel-head">
          <h2>Manual Override</h2>
          <label class="toggle">
            <input id="final-flag" type="checkbox" />
            <span>final</span>
          </label>
        </div>
        <textarea
          id="hypothesis-input"
          rows="4"
          placeholder="Manual hypothesis override for testing post-STT logic"
        ></textarea>
        <div class="controls compact">
          <button id="send-hypothesis-btn">manual update()</button>
          <button id="clear-hypothesis-btn">clear</button>
        </div>
      </article>

      <article class="panel">
        <div class="panel-head">
          <h2>Events</h2>
          <button id="clear-log-btn">clear</button>
        </div>
        <pre id="log-output" class="log-output"></pre>
      </article>
    </section>
  </main>
`;

const style = document.createElement("style");
style.textContent = `
  :root {
    color-scheme: light;
    --bg: #f5efe7;
    --panel: rgba(255, 252, 246, 0.86);
    --line: rgba(28, 35, 32, 0.12);
    --ink: #1c2320;
    --muted: #647068;
    --accent: #0b8e66;
    --accent-soft: rgba(11, 142, 102, 0.12);
    --warn: #b36a00;
    --warn-soft: rgba(179, 106, 0, 0.12);
  }

  * { box-sizing: border-box; }

  body {
    margin: 0;
    min-height: 100vh;
    color: var(--ink);
    font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
    background:
      radial-gradient(circle at top left, rgba(11, 142, 102, 0.15), transparent 24%),
      radial-gradient(circle at top right, rgba(217, 151, 54, 0.12), transparent 22%),
      linear-gradient(180deg, #fbf7f0 0%, var(--bg) 100%);
  }

  .shell {
    width: min(1180px, calc(100vw - 24px));
    margin: 0 auto;
    padding: 20px 0 28px;
  }

  .topbar,
  .hero-grid,
  .content-grid,
  .manual-grid {
    display: grid;
    gap: 16px;
  }

  .topbar {
    grid-template-columns: 1fr auto;
    align-items: end;
    margin-bottom: 16px;
  }

  .hero-grid {
    grid-template-columns: 1.4fr 0.9fr;
    margin-bottom: 16px;
  }

  .content-grid,
  .manual-grid {
    grid-template-columns: 1fr 1fr;
    margin-bottom: 16px;
  }

  .eyebrow {
    margin: 0 0 6px;
    text-transform: uppercase;
    letter-spacing: 0.16em;
    font-size: 11px;
    color: var(--muted);
  }

  h1 {
    margin: 0;
    font-family: "IBM Plex Serif", Georgia, serif;
    font-size: clamp(30px, 5vw, 52px);
    line-height: 0.95;
  }

  h2 {
    margin: 0;
    font-size: 16px;
  }

  code {
    font-family: "IBM Plex Mono", "SFMono-Regular", monospace;
  }

  .dispatch-card,
  .stack-card,
  .panel {
    border: 1px solid var(--line);
    border-radius: 24px;
    background: var(--panel);
    backdrop-filter: blur(10px);
    box-shadow: 0 10px 28px rgba(28, 35, 32, 0.05);
    padding: 16px;
  }

  .label {
    margin: 0 0 10px;
    color: var(--muted);
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.12em;
  }

  .dispatch-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 84px;
    width: 100%;
    border-radius: 20px;
    font-family: "IBM Plex Serif", Georgia, serif;
    font-size: clamp(26px, 5vw, 44px);
    letter-spacing: 0.04em;
    text-align: center;
    transition: background 120ms ease, color 120ms ease, transform 120ms ease;
  }

  .dispatch-badge.waiting {
    background: var(--warn-soft);
    color: var(--warn);
  }

  .dispatch-badge.ready {
    background: var(--accent-soft);
    color: var(--accent);
    transform: scale(1.01);
  }

  .dispatch-reason {
    min-height: 22px;
    margin: 10px 0 14px;
    color: var(--muted);
    font-size: 14px;
  }

  .mini-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
  }

  .mini-stat,
  .status-row,
  .setting-row {
    border: 1px solid var(--line);
    border-radius: 16px;
    padding: 10px 12px;
    background: rgba(255, 255, 255, 0.45);
  }

  .mini-stat span,
  .status-row span {
    display: block;
    margin-bottom: 6px;
    color: var(--muted);
    font-size: 12px;
  }

  .mini-stat strong,
  .status-row strong {
    font-size: 18px;
  }

  .compact-copy {
    margin: 0;
    color: var(--muted);
    line-height: 1.5;
    font-size: 14px;
  }

  .meter {
    position: relative;
    height: 14px;
    margin-top: 14px;
    border-radius: 999px;
    overflow: hidden;
    background: rgba(28, 35, 32, 0.08);
  }

  .meter-fill {
    position: absolute;
    inset: 0 auto 0 0;
    width: 0%;
    background: linear-gradient(90deg, var(--accent) 0%, #7cdab1 100%);
    transition: width 80ms linear;
  }

  .status-list {
    display: grid;
    gap: 10px;
    margin-bottom: 14px;
  }

  .controls {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }

  .controls.compact {
    margin-top: 10px;
  }

  button,
  textarea,
  input {
    font: inherit;
  }

  button {
    border: 0;
    border-radius: 999px;
    padding: 10px 16px;
    background: var(--ink);
    color: white;
    cursor: pointer;
  }

  input,
  textarea {
    width: 100%;
    border: 1px solid var(--line);
    border-radius: 14px;
    padding: 10px 12px;
    background: rgba(255, 255, 255, 0.65);
  }

  textarea {
    resize: vertical;
    min-height: 112px;
  }

  .panel-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;
  }

  .hint-chip {
    border-radius: 999px;
    padding: 6px 10px;
    background: rgba(28, 35, 32, 0.06);
    color: var(--muted);
    font-size: 12px;
  }

  .toggle {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: var(--muted);
  }

  .output,
  .log-output {
    margin: 0;
    padding: 14px;
    border-radius: 16px;
    font-family: "IBM Plex Mono", "SFMono-Regular", monospace;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .output {
    min-height: 150px;
    background: var(--accent-soft);
  }

  .output.large {
    min-height: 184px;
  }

  .log-output {
    min-height: 184px;
    max-height: 184px;
    overflow: auto;
    background: #1c2320;
    color: #dff8ec;
    font-size: 12px;
    line-height: 1.55;
  }

  .tuning-panel {
    margin-bottom: 16px;
  }

  .settings-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .setting-row {
    display: grid;
    gap: 10px;
  }

  .setting-head {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    align-items: baseline;
  }

  .setting-title {
    font-size: 14px;
    font-weight: 600;
  }

  .setting-unit,
  .setting-path,
  .setting-description {
    color: var(--muted);
    font-size: 12px;
  }

  .setting-path {
    font-family: "IBM Plex Mono", "SFMono-Regular", monospace;
  }

  .setting-description {
    line-height: 1.45;
  }

  @media (max-width: 980px) {
    .settings-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 860px) {
    .topbar,
    .hero-grid,
    .content-grid,
    .manual-grid {
      grid-template-columns: 1fr;
    }

    .mini-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
`;
document.head.append(style);

const settingsGrid = mustElement<HTMLDivElement>("#settings-grid");
settingsGrid.innerHTML = STREAMING_COMMIT_SETTING_DESCRIPTORS
  .map(renderSettingField)
  .join("");

const phaseValue = mustElement<HTMLSpanElement>("#phase-value");
const probValue = mustElement<HTMLSpanElement>("#prob-value");
const eouValue = mustElement<HTMLSpanElement>("#eou-value");
const decisionValue = mustElement<HTMLSpanElement>("#decision-value");
const serviceStatusValue = mustElement<HTMLSpanElement>("#service-status-value");
const modelStatusValue = mustElement<HTMLSpanElement>("#model-status-value");
const silenceValue = mustElement<HTMLSpanElement>("#silence-value");
const dispatchBadge = mustElement<HTMLDivElement>("#dispatch-badge");
const dispatchReason = mustElement<HTMLParagraphElement>("#dispatch-reason");
const meterFill = mustElement<HTMLDivElement>("#meter-fill");
const hypothesisOutput = mustElement<HTMLPreElement>("#last-hypothesis");
const commitOutput = mustElement<HTMLPreElement>("#last-commit");
const logOutput = mustElement<HTMLPreElement>("#log-output");
const hypothesisInput = mustElement<HTMLTextAreaElement>("#hypothesis-input");
const finalFlag = mustElement<HTMLInputElement>("#final-flag");

let service: BrowserStreamingCommitService | undefined;
let lastLoggedHypothesis = "";
let lastLoggedStatus = "";

function mustElement<ElementType extends Element>(selector: string): ElementType {
  const element = document.querySelector<ElementType>(selector);

  if (!element) {
    throw new Error(`Missing element ${selector}`);
  }

  return element;
}

function renderSettingField(descriptor: StreamingCommitSettingDescriptor): string {
  const value = readDefaultConfigValue(descriptor.path);
  const inputMode = descriptor.type === "number" ? "decimal" : "text";
  const step = descriptor.type === "number" && String(value).includes(".") ? "0.01" : "1";

  return `
    <label class="setting-row">
      <div class="setting-head">
        <span class="setting-title">${descriptor.label}</span>
        <span class="setting-unit">${descriptor.unit ?? ""}</span>
      </div>
      <div class="setting-path">${descriptor.path}</div>
      <div class="setting-description">${descriptor.description}</div>
      <input
        id="setting-${descriptor.key}"
        data-path="${descriptor.path}"
        data-type="${descriptor.type}"
        type="${descriptor.type === "number" ? "number" : "text"}"
        inputmode="${inputMode}"
        ${descriptor.type === "number" ? `step="${step}"` : ""}
        value="${String(value)}"
      />
    </label>
  `;
}

function readDefaultConfigValue(path: string): number | string {
  const segments = path.split(".");
  let cursor: unknown = DEFAULT_STREAMING_COMMIT_CONFIG;

  for (const segment of segments) {
    if (typeof cursor !== "object" || cursor === null || !(segment in cursor)) {
      throw new Error(`Missing default config path ${path}`);
    }

    cursor = (cursor as Record<string, unknown>)[segment];
  }

  if (typeof cursor === "string" || typeof cursor === "number") {
    return cursor;
  }

  throw new Error(`Unsupported default config value at ${path}`);
}

function readSettingsConfig(): PartialStreamingCommitConfig {
  return createStreamingCommitConfig({
    assets: {
      sttModelUrl: readStringSetting("assets.sttModelUrl"),
      eouModelUrl: readStringSetting("assets.eouModelUrl"),
      ortBasePath: readStringSetting("assets.ortBasePath"),
      vadBaseAssetPath: readStringSetting("assets.vadBaseAssetPath"),
    },
    stt: {
      processorBufferSize: readNumberSetting("stt.processorBufferSize"),
    },
    vad: {
      model: readStringSetting("vad.model") as "v5" | "legacy",
      frameDurationMs: readNumberSetting("vad.frameDurationMs"),
      speechProbabilityThreshold: readNumberSetting("vad.speechProbabilityThreshold"),
      possibleEndSilenceMs: readNumberSetting("vad.possibleEndSilenceMs"),
    },
    commit: {
      minChars: readNumberSetting("commit.minChars"),
      minTokenCount: readNumberSetting("commit.minTokenCount"),
      minSilenceMs: readNumberSetting("commit.minSilenceMs"),
      fastCommitPunctuationMs: readNumberSetting("commit.fastCommitPunctuationMs"),
      maxSilenceMs: readNumberSetting("commit.maxSilenceMs"),
      minStableMs: readNumberSetting("commit.minStableMs"),
      commitProbabilityThreshold: readNumberSetting("commit.commitProbabilityThreshold"),
      duplicateCommitCooldownMs: readNumberSetting("commit.duplicateCommitCooldownMs"),
    },
  });
}

function readStringSetting(path: string): string {
  return mustElement<HTMLInputElement>(`input[data-path="${path}"]`).value.trim();
}

function readNumberSetting(path: string): number {
  const value = Number(mustElement<HTMLInputElement>(`input[data-path="${path}"]`).value);

  if (!Number.isFinite(value)) {
    throw new Error(`Invalid numeric setting for ${path}`);
  }

  return value;
}

function restoreDefaultSettings(): void {
  for (const descriptor of STREAMING_COMMIT_SETTING_DESCRIPTORS) {
    mustElement<HTMLInputElement>(`#setting-${descriptor.key}`).value = String(
      readDefaultConfigValue(descriptor.path),
    );
  }
}

function setDispatchWaiting(reason: string): void {
  dispatchBadge.textContent = "WAITING";
  dispatchBadge.className = "dispatch-badge waiting";
  dispatchReason.textContent = reason;
}

function setDispatchReady(reason: string): void {
  dispatchBadge.textContent = "READY TO SEND";
  dispatchBadge.className = "dispatch-badge ready";
  dispatchReason.textContent = reason;
}

function buildService(): BrowserStreamingCommitService {
  void service?.dispose().catch(() => undefined);

  const instance = new BrowserStreamingCommitService({
    config: readSettingsConfig(),
  });

  instance.on("ready", () => pushLog("ready"));
  instance.on("status", (event) => {
    serviceStatusValue.textContent = event.status;
    modelStatusValue.textContent = event.detail;

    const nextStatusLog = `${event.status}:${event.detail}`;

    if (
      event.status === "loading_model"
      || event.status === "ready"
      || event.status === "starting_audio"
      || event.status === "listening"
      || event.status === "stopped"
      || event.status === "error"
    ) {
      if (nextStatusLog !== lastLoggedStatus) {
        pushLog(`status ${event.status}: ${event.detail}`);
        lastLoggedStatus = nextStatusLog;
      }
    }
  });
  instance.on("vadFrame", (frame) => {
    phaseValue.textContent = frame.phase;
    probValue.textContent = frame.speechProbability.toFixed(3);
    silenceValue.textContent = `${Math.round(frame.trailingSilenceMs)} ms`;
    meterFill.style.width = `${Math.round(frame.speechProbability * 100)}%`;
  });
  instance.on("hypothesis", (hypothesis) => {
    hypothesisInput.value = hypothesis.text;
    finalFlag.checked = hypothesis.isFinal;

    const normalized = `${hypothesis.text}|${hypothesis.isFinal}`;

    if (hypothesis.isFinal || normalized !== lastLoggedHypothesis) {
      pushLog(`hypothesis: "${hypothesis.text}"${hypothesis.isFinal ? " [final]" : ""}`);
      lastLoggedHypothesis = normalized;
    }
  });
  instance.on("decision", (result) => {
    eouValue.textContent = result.eouProbability.toFixed(3);
    decisionValue.textContent = result.decision.reason;
    silenceValue.textContent = `${Math.round(result.vad.trailingSilenceMs)} ms`;
    hypothesisOutput.textContent = JSON.stringify(
      {
        text: result.tracker.text,
        stablePrefix: result.tracker.stablePrefix,
        unstableSuffix: result.tracker.unstableSuffix,
        unchangedMs: result.tracker.unchangedMs,
        trailingSilenceMs: result.vad.trailingSilenceMs,
        stability: Number(result.stability.stabilityScore.toFixed(3)),
        continuation: Number(result.stability.continuationScore.toFixed(3)),
      },
      null,
      2,
    );

    if (!result.decision.shouldCommit) {
      setDispatchWaiting(
        `Waiting: ${result.decision.reason}, silence ${Math.round(result.vad.trailingSilenceMs)} ms, EOU ${result.eouProbability.toFixed(3)}`,
      );
    }
  });
  instance.on("agentDispatch", (result) => {
    setDispatchReady(
      `Send now: ${result.decision.reason}, silence ${Math.round(result.vad.trailingSilenceMs)} ms, EOU ${result.eouProbability.toFixed(3)}`,
    );
    pushLog(
      `SEND_TO_AGENT reason=${result.decision.reason} eou=${result.eouProbability.toFixed(3)} trailingSilence=${Math.round(result.vad.trailingSilenceMs)}ms text="${result.committedText ?? ""}"`,
    );
  });
  instance.on("commit", (result) => {
    commitOutput.textContent = JSON.stringify(
      {
        text: result.committedText,
        reason: result.decision.reason,
        eouProbability: Number(result.eouProbability.toFixed(3)),
        trailingSilenceMs: Math.round(result.vad.trailingSilenceMs),
      },
      null,
      2,
    );
  });
  instance.on("error", (error) => {
    setDispatchWaiting(`Error: ${error.message}`);
    pushLog(`error ${error.message}`);
  });

  return instance;
}

function pushLog(message: string): void {
  const now = new Date();
  const timestamp = now.toLocaleTimeString("ru-RU", { hour12: false });

  logOutput.textContent = `[${timestamp}] ${message}\n${logOutput.textContent}`.slice(0, 5000);
}

mustElement<HTMLButtonElement>("#init-btn").addEventListener("click", async () => {
  service = buildService();
  await service.init();
});

mustElement<HTMLButtonElement>("#start-btn").addEventListener("click", async () => {
  service ??= buildService();
  await service.start();
});

mustElement<HTMLButtonElement>("#stop-btn").addEventListener("click", async () => {
  await service?.stop();
});

mustElement<HTMLButtonElement>("#reset-btn").addEventListener("click", () => {
  service?.reset();
  hypothesisOutput.textContent = "-";
  commitOutput.textContent = "-";
  decisionValue.textContent = "waiting";
  eouValue.textContent = "0.000";
  silenceValue.textContent = "0 ms";
  lastLoggedHypothesis = "";
  lastLoggedStatus = "";
  setDispatchWaiting("Waiting for stable end of utterance");
  pushLog("reset");
});

mustElement<HTMLButtonElement>("#dispose-btn").addEventListener("click", async () => {
  await service?.dispose();
  service = undefined;
  phaseValue.textContent = "silence";
  probValue.textContent = "0.000";
  eouValue.textContent = "0.000";
  decisionValue.textContent = "waiting";
  serviceStatusValue.textContent = "idle";
  modelStatusValue.textContent = "not loaded";
  silenceValue.textContent = "0 ms";
  meterFill.style.width = "0%";
  lastLoggedHypothesis = "";
  lastLoggedStatus = "";
  setDispatchWaiting("Waiting for stable end of utterance");
  pushLog("disposed");
});

mustElement<HTMLButtonElement>("#restore-defaults-btn").addEventListener("click", () => {
  restoreDefaultSettings();
  pushLog("settings restored to defaults");
});

mustElement<HTMLButtonElement>("#send-hypothesis-btn").addEventListener("click", async () => {
  service ??= buildService();

  await service.update({
    text: hypothesisInput.value,
    isFinal: finalFlag.checked,
  });
});

mustElement<HTMLButtonElement>("#clear-hypothesis-btn").addEventListener("click", () => {
  hypothesisInput.value = "";
  finalFlag.checked = false;
});

mustElement<HTMLButtonElement>("#clear-log-btn").addEventListener("click", () => {
  logOutput.textContent = "";
});

setDispatchWaiting("Waiting for stable end of utterance");
pushLog("demo ready");
