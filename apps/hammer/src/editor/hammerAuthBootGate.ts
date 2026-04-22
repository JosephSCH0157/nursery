export type HammerAuthBootGateState = "resolving" | "missing" | "ready";

export type HammerAuthBootGateViewModel =
  | { kind: "none"; message: null }
  | { kind: "holding" | "blocked"; message: string };

export function shouldRunHammerTongsBootEffects(args: {
  persistenceMode: "canonical" | "disabled";
  authState: HammerAuthBootGateState;
}): boolean {
  if (args.persistenceMode !== "canonical") {
    return true;
  }
  return args.authState === "ready";
}

export function resolveHammerAuthBootGateViewModel(args: {
  persistenceMode: "canonical" | "disabled";
  authState: HammerAuthBootGateState;
}): HammerAuthBootGateViewModel {
  if (args.persistenceMode !== "canonical" || args.authState === "ready") {
    return { kind: "none", message: null };
  }
  if (args.authState === "resolving") {
    return { kind: "holding", message: "Waiting for authentication…" };
  }
  return { kind: "blocked", message: "Sign in required to load Hammer workspace data." };
}
