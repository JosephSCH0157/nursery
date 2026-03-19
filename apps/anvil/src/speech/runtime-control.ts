export function stopAsrRuntime(): void {
  if (typeof window === 'undefined') return;
  try {
    const w = window as any;
    const candidates = [
      w.__tpGetActiveRecognizer?.(),
      w.__tpRecognizer,
      w.recog,
    ];
    for (const recognizer of candidates) {
      try { recognizer?.abort?.(); } catch {}
      try { recognizer?.stop?.(); } catch {}
    }
    const speech = w.__tpSpeech;
    if (speech && typeof speech.stopRecognizer === 'function') {
      try { speech.stopRecognizer(); } catch {}
    }
  } catch {}
}
