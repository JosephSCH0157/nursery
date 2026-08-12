import type { HearthStore, HearthStoreKind } from "./hearth-store";
import { LocalHearthStore } from "./local-store";
import { TongsHearthStore } from "./tongs-store";

export function createHearthStore(kind: HearthStoreKind = "tongs"): HearthStore {
  if (kind === "tongs") {
    return new TongsHearthStore();
  }
  return new LocalHearthStore();
}
