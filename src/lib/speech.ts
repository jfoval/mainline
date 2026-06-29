"use client";

/**
 * Thin wrapper over the browser Web Speech API for instant, free voice transcription.
 * Where unsupported (notably Firefox, some Android browsers) callers fall back to text.
 * Phase 1 stores only the transcript; original-audio capture is a P1.5 follow-up.
 */

// The DOM lib doesn't ship SpeechRecognition types reliably — declare the minimum we use.
interface SpeechRecognitionAlternativeLike {
  transcript: string;
}
interface SpeechRecognitionResultLike {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
}
interface SpeechRecognitionResultListLike {
  readonly length: number;
  [index: number]: SpeechRecognitionResultLike;
}
interface SpeechRecognitionEventLike {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultListLike;
}
interface SpeechRecognitionErrorEventLike {
  readonly error: string;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isSpeechSupported(): boolean {
  return getCtor() !== null;
}

export interface DictationHandlers {
  /** Called as speech is recognized. `final` accumulates committed text; `interim` is the
   *  in-progress tail. The full live transcript is `final + interim`. */
  onTranscript: (full: string, final: string, interim: string) => void;
  onError?: (error: string) => void;
  onEnd?: () => void;
  lang?: string;
}

export interface Dictation {
  start: () => void;
  stop: () => void;
  abort: () => void;
}

/**
 * Create a dictation session. Returns null if unsupported (caller should hide the mic).
 */
export function createDictation(handlers: DictationHandlers): Dictation | null {
  const Ctor = getCtor();
  if (!Ctor) return null;

  const recognition = new Ctor();
  recognition.lang = handlers.lang ?? navigator.language ?? "en-US";
  recognition.continuous = true;
  recognition.interimResults = true;

  let finalText = "";

  recognition.onresult = (event) => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      const text = result[0]?.transcript ?? "";
      if (result.isFinal) {
        finalText += text;
      } else {
        interim += text;
      }
    }
    handlers.onTranscript((finalText + interim).trim(), finalText.trim(), interim.trim());
  };

  recognition.onerror = (event) => handlers.onError?.(event.error);
  recognition.onend = () => handlers.onEnd?.();

  return {
    start: () => {
      finalText = "";
      try {
        recognition.start();
      } catch {
        // start() throws if already started — safe to ignore.
      }
    },
    stop: () => recognition.stop(),
    abort: () => recognition.abort(),
  };
}
