function isTruthyFlag(value: string | null): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "on" || normalized === "yes";
}

export function isAutoPlacementDebugFlagEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search ?? "");
    return isTruthyFlag(params.get("hammer_auto_placement_debug"))
      || isTruthyFlag(params.get("tp_auto_placement_debug"))
      || isTruthyFlag(params.get("tp_dev_mode"));
  } catch {
    return false;
  }
}
