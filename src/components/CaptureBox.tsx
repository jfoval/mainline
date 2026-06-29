"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { captureText, useCaptures } from "@/lib/capture/store";
import { createDictation, isSpeechSupported, type Dictation } from "@/lib/speech";
import { useHydrated } from "@/lib/use-hydrated";
import { useOnline } from "@/lib/use-online";

/**
 * The capture surface — the 2-second promise. Text + voice, instant optimistic save, works
 * fully offline. Nothing here ever waits on the network.
 */
export function CaptureBox() {
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [justCaptured, setJustCaptured] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const dictationRef = useRef<Dictation | null>(null);
  const baseTextRef = useRef(""); // text already in the box when dictation began

  const hydrated = useHydrated();
  const online = useOnline();
  const captures = useCaptures();
  const pending = captures.filter((c) => c.pending && c.status !== "discarded").length;
  // Gate the client-only capability check behind hydration so SSR (no SpeechRecognition) and
  // the first client render agree — otherwise the conditional mic button is a hydration mismatch.
  const speechOk = hydrated && isSpeechSupported();

  useEffect(() => {
    textRef.current?.focus();
    return () => dictationRef.current?.abort();
  }, []);

  const submit = useCallback(async () => {
    const value = text.trim();
    if (!value) return;
    dictationRef.current?.stop();
    setListening(false);
    // Durable-first: only clear the box once the capture is safely committed. The local commit
    // is sub-millisecond, so this still feels instant — and a failed write never loses text.
    const id = await captureText(value);
    if (id) {
      setText("");
      setJustCaptured(true);
      window.setTimeout(() => setJustCaptured(false), 1200);
    }
    textRef.current?.focus();
  }, [text]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter = capture; Shift+Enter = newline.
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  };

  const toggleMic = () => {
    if (listening) {
      dictationRef.current?.stop();
      setListening(false);
      return;
    }
    baseTextRef.current = text ? text.replace(/\s+$/, "") + " " : "";
    const dictation = createDictation({
      onTranscript: (full) => setText(baseTextRef.current + full),
      onError: () => setListening(false),
      onEnd: () => setListening(false),
    });
    if (!dictation) return;
    dictationRef.current = dictation;
    dictation.start();
    setListening(true);
    textRef.current?.focus();
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl border border-border bg-surface p-3 shadow-sm focus-within:border-accent">
        <textarea
          ref={textRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          rows={4}
          placeholder="What's on your mind?"
          aria-label="Capture"
          className="w-full resize-none bg-transparent text-lg leading-relaxed outline-none placeholder:text-muted"
        />
        <div className="mt-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {speechOk && (
              <button
                type="button"
                onClick={toggleMic}
                aria-pressed={listening}
                aria-label={listening ? "Stop dictation" : "Start dictation"}
                className={`flex h-10 w-10 items-center justify-center rounded-full border transition-colors ${
                  listening
                    ? "border-danger bg-danger/10 text-danger animate-pulse"
                    : "border-border text-muted hover:bg-surface-2 hover:text-foreground"
                }`}
              >
                <MicIcon />
              </button>
            )}
            {listening && <span className="text-sm text-danger">Listening…</span>}
          </div>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!text.trim()}
            className="rounded-xl bg-accent px-5 py-2.5 font-medium text-accent-foreground transition-opacity disabled:opacity-40"
          >
            Capture
          </button>
        </div>
      </div>

      <StatusLine online={online} pending={pending} justCaptured={justCaptured} />
    </div>
  );
}

function StatusLine({
  online,
  pending,
  justCaptured,
}: {
  online: boolean;
  pending: number;
  justCaptured: boolean;
}) {
  let label: string;
  let tone: string;
  if (justCaptured) {
    label = "Captured ✓";
    tone = "text-success";
  } else if (!online && pending > 0) {
    label = `Offline · ${pending} saved locally, will sync`;
    tone = "text-muted";
  } else if (pending > 0) {
    label = `Syncing ${pending}…`;
    tone = "text-muted";
  } else {
    label = online ? "All synced" : "Offline · all saved locally";
    tone = "text-muted";
  }
  return (
    <div className="flex items-center gap-2 px-1 text-sm">
      <span
        className={`h-2 w-2 rounded-full ${online ? "bg-success" : "bg-muted"}`}
        aria-hidden
      />
      <span className={tone}>{label}</span>
    </div>
  );
}

function MicIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
  );
}
