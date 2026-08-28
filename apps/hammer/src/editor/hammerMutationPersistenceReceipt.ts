import type { HammerHistoryEntry } from "./hammerWorkspaceHistory";

export type HammerMutationPersistenceResult = Readonly<
  { state: "acknowledged" } | { state: "failed"; error: string }
>;
export type HammerAppliedHistoryMutation = HammerHistoryEntry & Readonly<{
  persistence: Promise<HammerMutationPersistenceResult>;
}>;

export function createHammerMutationPersistenceReceipt() {
  let settle!: (result: HammerMutationPersistenceResult) => void;
  const promise = new Promise<HammerMutationPersistenceResult>((resolve) => { settle = resolve; });
  return { promise, settle };
}

export function attachHammerMutationPersistenceReceipt(
  entry: HammerHistoryEntry,
  persistence: Promise<HammerMutationPersistenceResult>,
): HammerAppliedHistoryMutation {
  // Coalesced history mutations reuse the same entry. The persistence promise,
  // however, belongs to the latest durable save request for that entry.
  Object.defineProperty(entry, "persistence", { value: persistence, enumerable: false, configurable: true });
  return entry as HammerAppliedHistoryMutation;
}
