import type { MatchConfig } from './matcher';

export type MatcherRuntimeState = {
  scriptWords: string[];
  paraIndex: any[];
  vParaIndex: string[] | null;
  cfg: MatchConfig;
  currentIndex: number;
  viterbiState: { path: number[]; pred?: number } | null;
};

export function getMatcherRuntimeState(opts?: {
  currentIndex?: number | null;
  windowBack?: number;
  windowAhead?: number;
}): MatcherRuntimeState | null {
  if (typeof window === 'undefined') return null;
  const w: any = window as any;
  const scriptWords: string[] = Array.isArray(w.scriptWords) ? w.scriptWords : [];
  const paraIndex: any[] = Array.isArray(w.paraIndex) ? w.paraIndex : [];
  const vParaIndex: string[] | null = Array.isArray(w.__vParaIndex) ? w.__vParaIndex : null;
  const currentIndexRaw =
    typeof opts?.currentIndex === 'number'
      ? opts.currentIndex
      : (typeof w.currentIndex === 'number' ? w.currentIndex : 0);
  const currentIndex = Number.isFinite(Number(currentIndexRaw))
    ? Math.max(0, Math.floor(Number(currentIndexRaw)))
    : 0;

  const rawViterbiState = w.__viterbiIPred;
  const viterbiState =
    rawViterbiState &&
    typeof rawViterbiState === 'object' &&
    Array.isArray(rawViterbiState.path)
      ? {
          path: rawViterbiState.path.map((value: unknown) => Number(value)).filter((value: number) => Number.isFinite(value)),
          pred: Number.isFinite(Number(rawViterbiState.pred)) ? Number(rawViterbiState.pred) : undefined,
        }
      : null;

  return {
    scriptWords,
    paraIndex,
    vParaIndex,
    cfg: {
      MATCH_WINDOW_AHEAD:
        typeof opts?.windowAhead === 'number'
          ? opts.windowAhead
          : (typeof w.MATCH_WINDOW_AHEAD === 'number' ? w.MATCH_WINDOW_AHEAD : 240),
      MATCH_WINDOW_BACK:
        typeof opts?.windowBack === 'number'
          ? opts.windowBack
          : (typeof w.MATCH_WINDOW_BACK === 'number' ? w.MATCH_WINDOW_BACK : 40),
      SIM_THRESHOLD: typeof w.SIM_THRESHOLD === 'number' ? w.SIM_THRESHOLD : 0.46,
      MAX_JUMP_AHEAD_WORDS: typeof w.MAX_JUMP_AHEAD_WORDS === 'number' ? w.MAX_JUMP_AHEAD_WORDS : 18,
    },
    currentIndex,
    viterbiState,
  };
}
