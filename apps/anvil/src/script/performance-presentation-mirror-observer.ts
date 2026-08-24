import { classifyPresentationMutation } from './performance-presentation-mutation-transaction';
import { serializePerformancePresentation, type PerformancePresentationCandidate } from './performance-presentation-builder';

const committedMirrors = new WeakMap<HTMLElement, string>();

export function registerCommittedPresentationMirror(root: HTMLElement, candidate: PerformancePresentationCandidate): Readonly<{ htmlBytes: number; serializationMs: number }> {
  const startedAt = performance.now();
  const html = serializePerformancePresentation(candidate);
  const result = Object.freeze({ htmlBytes: new TextEncoder().encode(html).length, serializationMs: performance.now() - startedAt });
  committedMirrors.set(root, html);
  return result;
}

export function observeCommittedPresentationMutations(
  root: HTMLElement,
  onCommittedMutation: (modelHtml?: string) => void,
  onProcessing?: (processingMs: number) => void,
): MutationObserver {
  const observer = new MutationObserver(() => {
    const startedAt = performance.now();
    // Raw records can describe a committed install or a rolled-back transaction. The
    // installer-owned registry remains durable until this asynchronous callback runs.
    const decision = classifyPresentationMutation(root);
    if (decision !== 'suppress') onCommittedMutation(decision === 'committed-mirror' ? committedMirrors.get(root) : undefined);
    onProcessing?.(performance.now() - startedAt);
  });
  observer.observe(root, { childList: true, subtree: true });
  return observer;
}
