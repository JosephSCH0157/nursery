import { dispatchAuthenticatedCanonicalScript } from '../script/authenticated-performance-dispatcher';
import type { CanonicalScriptIdentity } from '../script/performance-presentation-boundary';
import { appScrollModeReadiness } from '../script/scroll-mode-readiness';

export function dispatchAuthenticatedWorkpieceScript(input: {
  canonicalIdentity: CanonicalScriptIdentity;
  canonicalText: string;
  scrollMode: string;
  legacyApply: (text: string) => void;
}) {
  return dispatchAuthenticatedCanonicalScript({
    source: 'workpiece-handoff',
    authenticated: true,
    canonicalIdentity: input.canonicalIdentity,
    canonicalText: input.canonicalText,
    canonicalUtf8Bytes: new TextEncoder().encode(input.canonicalText),
    scrollMode: input.scrollMode,
    scrollModeReadiness: appScrollModeReadiness,
    legacyApply: input.legacyApply,
  });
}
