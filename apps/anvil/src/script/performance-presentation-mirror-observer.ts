import { classifyPresentationMutation } from './performance-presentation-mutation-transaction';

export function observeCommittedPresentationMutations(
  root: HTMLElement,
  onCommittedMutation: () => void,
): MutationObserver {
  const observer = new MutationObserver(() => {
    // Raw records can describe a committed install or a rolled-back transaction. The
    // installer-owned registry remains durable until this asynchronous callback runs.
    if (classifyPresentationMutation(root) === 'suppress') return;
    onCommittedMutation();
  });
  observer.observe(root, { childList: true, subtree: true });
  return observer;
}
