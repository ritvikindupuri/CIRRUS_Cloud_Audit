import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ── Audio Guidance (TTS via Web Speech API) ──────────────────────────────────
export interface AudioGuidanceState {
  speaking: boolean;
  activeId: string | null;
}

type AudioListener = (state: AudioGuidanceState) => void;
const audioListeners = new Set<AudioListener>();

let currentAudioState: AudioGuidanceState = {
  speaking: false,
  activeId: null,
};

function notifyAudio(speaking: boolean, activeId: string | null) {
  currentAudioState = { speaking, activeId };
  for (const fn of audioListeners) {
    try {
      fn(currentAudioState);
    } catch {
      // ignore
    }
  }
}

export function subscribeAudioGuidance(listener: AudioListener): () => void {
  audioListeners.add(listener);
  listener(currentAudioState);
  return () => {
    audioListeners.delete(listener);
  };
}

export function stopAudioGuidance() {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
  notifyAudio(false, null);
}

export function speakFinding(finding: {
  id: string;
  title: string;
  severity: string;
  resource?: string | null;
  description?: string | null;
  explanation?: string | null;
}) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return false;
  }

  if (currentAudioState.speaking && currentAudioState.activeId === finding.id) {
    stopAudioGuidance();
    return true;
  }

  window.speechSynthesis.cancel();

  const resourceText = finding.resource ? `Target resource: ${finding.resource}.` : "";
  const detailText = finding.explanation || finding.description || "No further description provided.";

  const text = `Attention: ${finding.severity.toUpperCase()} severity finding. Title: ${finding.title}. ${resourceText} Context: ${detailText}. Review the pre-remediation diff and state snapshot ledger before executing fixes.`;

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.0;
  utterance.pitch = 1.0;

  const voices = window.speechSynthesis.getVoices();
  const selectedVoice =
    voices.find(
      (v) =>
        v.lang.startsWith("en") &&
        (v.name.includes("Natural") || v.name.includes("Google") || v.name.includes("Samantha")),
    ) ||
    voices.find((v) => v.lang.startsWith("en")) ||
    voices[0];
  if (selectedVoice) {
    utterance.voice = selectedVoice;
  }

  utterance.onstart = () => {
    notifyAudio(true, finding.id);
  };

  utterance.onend = () => {
    notifyAudio(false, null);
  };

  utterance.onerror = () => {
    notifyAudio(false, null);
  };

  window.speechSynthesis.speak(utterance);
  return true;
}

export function speakScanSummary(summary: {
  id: string;
  name: string;
  totalFindings: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
}) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return false;
  }

  if (currentAudioState.speaking && currentAudioState.activeId === `scan-${summary.id}`) {
    stopAudioGuidance();
    return true;
  }

  window.speechSynthesis.cancel();

  const text = `Audit scan completed for ${summary.name}. Discovered ${summary.totalFindings} total findings: ${summary.criticalCount} critical, ${summary.highCount} high, and ${summary.mediumCount} medium severity issues. Review the node graph and findings ledger to examine before-and-after diffs or trigger rollback-safe remediations.`;

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.0;
  utterance.pitch = 1.0;

  const voices = window.speechSynthesis.getVoices();
  const selectedVoice =
    voices.find(
      (v) =>
        v.lang.startsWith("en") &&
        (v.name.includes("Natural") || v.name.includes("Google")),
    ) ||
    voices.find((v) => v.lang.startsWith("en")) ||
    voices[0];
  if (selectedVoice) {
    utterance.voice = selectedVoice;
  }

  utterance.onstart = () => {
    notifyAudio(true, `scan-${summary.id}`);
  };

  utterance.onend = () => {
    notifyAudio(false, null);
  };

  utterance.onerror = () => {
    notifyAudio(false, null);
  };

  window.speechSynthesis.speak(utterance);
  return true;
}

