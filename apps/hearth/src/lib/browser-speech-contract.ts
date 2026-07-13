export type BrowserSpeechRecognitionResultEvent = {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0?: { transcript?: string };
  }>;
};

export type BrowserSpeechRecognitionErrorEvent = { error?: string };

export type BrowserSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onresult: ((event: BrowserSpeechRecognitionResultEvent) => void) | null;
  onerror: ((event: BrowserSpeechRecognitionErrorEvent) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
  __hearthBrowserSttSession?: { manualStopRequested: boolean };
  __hearthBrowserSttSettle?: () => void | Promise<void>;
};

export type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

type SpeechWindow = Window & {
  SpeechRecognition?: BrowserSpeechRecognitionConstructor;
  webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
};

export function resolveBrowserSpeechRecognitionConstructor(
  source: Window = window,
): BrowserSpeechRecognitionConstructor | null {
  const speechWindow = source as SpeechWindow;
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

export function hasBrowserSpeechRecognition(source: Window = window): boolean {
  return resolveBrowserSpeechRecognitionConstructor(source) !== null;
}
