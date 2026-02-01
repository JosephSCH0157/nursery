// packages/hearth/src/storage/ids.ts

export function newId(): string {
  // Browser + modern Node
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // Last-resort fallback (not perfect, but keeps us moving)
  // eslint-disable-next-line no-console
  console.warn("crypto.randomUUID unavailable; using fallback id generator");
  return (
    "id_" +
    Math.random().toString(16).slice(2) +
    "_" +
    Date.now().toString(16)
  );
}
