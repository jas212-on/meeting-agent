import type { TranscriptEntry } from "../types";

/**
 * Consolidates fragmented, word-by-word streaming transcript entries into unified, cohesive dialogue turns.
 * 
 * Handles:
 * 1. Progressive prefix extensions: (e.g. "U" -> "Uh," -> "Uh, Me" -> "Uh, Meet" -> "Uh, Meeting agent")
 * 2. Subsumed / out-of-order partial fragments
 * 3. Token overlap and repetition removal
 * 4. Merging consecutive utterances from the same speaker into single cohesive speech turns
 */
export function consolidateTranscripts(entries: TranscriptEntry[]): TranscriptEntry[] {
  if (!entries || entries.length === 0) return [];

  const consolidated: TranscriptEntry[] = [];

  for (const rawEntry of entries) {
    const text = (rawEntry.text || "").trim();
    if (!text) continue;

    if (consolidated.length === 0) {
      consolidated.push({ ...rawEntry, text });
      continue;
    }

    const last = consolidated[consolidated.length - 1];

    const isSameSpeaker =
      last.speaker.toLowerCase().trim() === (rawEntry.speaker || "").toLowerCase().trim();

    if (!isSameSpeaker) {
      consolidated.push({ ...rawEntry, text });
      continue;
    }

    // Normalized alphanumeric strings for prefix comparison
    const cleanLast = last.text.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
    const cleanCurr = text.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();

    // 1. Exact or progressive prefix extension (e.g. "u" -> "uh" -> "uh meet" -> "uh meeting agent")
    if (cleanCurr.startsWith(cleanLast) || text.startsWith(last.text)) {
      last.text = text;
      last.timestamp = rawEntry.timestamp || last.timestamp;
      continue;
    }

    // 2. Incoming text is already subsumed by the last turn (stale, shorter, or duplicate fragment)
    if (cleanLast.startsWith(cleanCurr) || last.text.startsWith(text) || cleanLast.includes(cleanCurr)) {
      continue;
    }

    // 3. Word token overlap: check if last utterance ends with beginning of current
    const lastWords = last.text.split(/\s+/);
    const currWords = text.split(/\s+/);
    let overlapped = false;
    for (let len = Math.min(5, lastWords.length, currWords.length); len >= 2; len--) {
      const suffix = lastWords.slice(-len).join(" ").toLowerCase().replace(/[^a-z0-9\s]/g, "");
      const prefix = currWords.slice(0, len).join(" ").toLowerCase().replace(/[^a-z0-9\s]/g, "");
      if (suffix === prefix) {
        last.text = `${lastWords.slice(0, -len).join(" ")} ${text}`.trim();
        last.timestamp = rawEntry.timestamp || last.timestamp;
        overlapped = true;
        break;
      }
    }
    if (overlapped) continue;

    // 4. Consecutive speech from the same speaker:
    // Combine into the same speaker turn card so it creates a single cohesive paragraph
    const endsWithPunct = /[.!?]$/.test(last.text.trim());
    const separator = endsWithPunct ? " " : ". ";
    last.text = `${last.text.trim()}${separator}${text.trim()}`;
    last.timestamp = rawEntry.timestamp || last.timestamp;
  }

  return consolidated;
}
