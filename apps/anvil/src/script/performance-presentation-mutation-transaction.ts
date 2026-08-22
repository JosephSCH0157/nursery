export type PresentationMutationTransaction = Readonly<{
  root: HTMLElement;
  epoch: string;
  token: symbol;
}>;

type TransactionState = {
  epoch: string;
  token: symbol;
  outcome: 'pending' | 'committed' | 'rolled-back';
  committedMirrorConsumed: boolean;
};

export type PresentationMutationDecision = 'ordinary' | 'suppress' | 'committed-mirror';

const transactions = new WeakMap<HTMLElement, TransactionState>();

export function beginPresentationMutationTransaction(root: HTMLElement, epoch: string): PresentationMutationTransaction {
  if (transactions.has(root)) throw new Error('performance presentation mutation transaction already active');
  const token = Symbol(epoch);
  transactions.set(root, { epoch, token, outcome: 'pending', committedMirrorConsumed: false });
  return Object.freeze({ root, epoch, token });
}

function requireOwned(handle: PresentationMutationTransaction): TransactionState {
  const state = transactions.get(handle.root);
  if (!state || state.token !== handle.token || state.epoch !== handle.epoch) {
    throw new Error('performance presentation mutation transaction is not installer-owned');
  }
  return state;
}

export function commitPresentationMutationTransaction(handle: PresentationMutationTransaction): void {
  requireOwned(handle).outcome = 'committed';
}

export function rollBackPresentationMutationTransaction(handle: PresentationMutationTransaction): void {
  requireOwned(handle).outcome = 'rolled-back';
}

export function classifyPresentationMutation(root: HTMLElement): PresentationMutationDecision {
  const state = transactions.get(root);
  if (!state) return 'ordinary';
  if (state.outcome !== 'committed' || state.committedMirrorConsumed) return 'suppress';
  state.committedMirrorConsumed = true;
  return 'committed-mirror';
}

export function finishPresentationMutationTransaction(handle: PresentationMutationTransaction): void {
  requireOwned(handle);
  transactions.delete(handle.root);
}

export function hasPresentationMutationTransaction(root: HTMLElement): boolean {
  return transactions.has(root);
}
