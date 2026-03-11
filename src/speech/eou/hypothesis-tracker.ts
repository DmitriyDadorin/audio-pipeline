import type {
  HypothesisTrackerSnapshot,
  TranscriptHypothesis,
} from "./types.ts";

const EMPTY_SNAPSHOT: HypothesisTrackerSnapshot = {
  text: "",
  previousText: "",
  stablePrefix: "",
  unstableSuffix: "",
  tokenCount: 0,
  stablePrefixRatio: 0,
  unchangedMs: 0,
  recentChurnScore: 0,
  appendedChars: 0,
  removedChars: 0,
  terminalPunctuation: false,
  lastTokenLooksComplete: false,
  isFinal: false,
  timestampMs: 0,
};

export class HypothesisTracker {
  private snapshot: HypothesisTrackerSnapshot = { ...EMPTY_SNAPSHOT };

  private lastChangedAtMs = 0;

  reset(): HypothesisTrackerSnapshot {
    this.snapshot = { ...EMPTY_SNAPSHOT };
    this.lastChangedAtMs = 0;

    return this.snapshot;
  }

  getSnapshot(): HypothesisTrackerSnapshot {
    return this.snapshot;
  }

  update(
    hypothesis: TranscriptHypothesis | undefined,
    timestampMs: number,
  ): HypothesisTrackerSnapshot {
    if (!hypothesis) {
      return this.snapshot.text
        ? {
          ...this.snapshot,
          unchangedMs: Math.max(0, timestampMs - this.lastChangedAtMs),
          timestampMs,
        }
        : this.snapshot;
    }

    const nextText = normalizeWhitespace(hypothesis.text);
    const previousText = this.snapshot.text;
    const explicitStablePrefix = normalizeWhitespace(hypothesis.stablePrefix ?? "");
    const commonPrefixLength = longestCommonPrefixLength(previousText, nextText);
    const stablePrefixLength = Math.min(
      nextText.length,
      Math.max(
        commonPrefixLength,
        nextText.startsWith(explicitStablePrefix) ? explicitStablePrefix.length : 0,
      ),
    );
    const stablePrefix = nextText.slice(0, stablePrefixLength);
    const unstableSuffix = nextText.slice(stablePrefixLength);
    const appendedChars = Math.max(0, nextText.length - stablePrefixLength);
    const removedChars = Math.max(0, previousText.length - stablePrefixLength);
    const changed = nextText !== previousText || hypothesis.isFinal !== this.snapshot.isFinal;

    if (changed) {
      this.lastChangedAtMs = timestampMs;
    }

    const churnMagnitude = (appendedChars + removedChars) / Math.max(1, nextText.length);
    const recentChurnScore = clamp01(
      (this.snapshot.recentChurnScore * 0.55) + (churnMagnitude * 0.45),
    );

    this.snapshot = {
      text: nextText,
      previousText,
      stablePrefix,
      unstableSuffix,
      tokenCount: nextText ? tokenize(nextText).length : 0,
      stablePrefixRatio: nextText.length === 0 ? 0 : stablePrefix.length / nextText.length,
      unchangedMs: changed ? 0 : Math.max(0, timestampMs - this.lastChangedAtMs),
      recentChurnScore,
      appendedChars,
      removedChars,
      terminalPunctuation: /[.!?…]$/.test(nextText.trim()),
      lastTokenLooksComplete: /[\s.!?…,:;)]$/.test(nextText),
      isFinal: hypothesis.isFinal,
      confidence: hypothesis.confidence,
      timestampMs,
    };

    return this.snapshot;
  }
}

function longestCommonPrefixLength(left: string, right: string): number {
  const maxLength = Math.min(left.length, right.length);
  let index = 0;

  while (index < maxLength && left[index] === right[index]) {
    index += 1;
  }

  return index;
}

function normalizeWhitespace(value: string): string {
  return value.trimStart().replace(/\s+/g, " ").trimEnd();
}

function tokenize(value: string): string[] {
  return value.split(/\s+/).filter(Boolean);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
