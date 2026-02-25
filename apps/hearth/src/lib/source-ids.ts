export function createSourceId(prefix = "src_"): string {
  const raw = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}${raw.toLowerCase()}`;
}
