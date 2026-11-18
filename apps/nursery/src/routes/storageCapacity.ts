export type StorageCapacity = {
  baseBytes: number;
  addonBytes: number;
  totalBytes: number;
  usedBytes: number | null;
  remainingBytes: number | null;
  deleteOnly: boolean;
};

export function parseStorageCapacity(value: unknown): StorageCapacity {
  if (!value || typeof value !== "object") throw new Error("Storage capacity is unavailable.");
  const row = value as Record<string, unknown>;
  const bytes = (key: string): number => {
    const v = row[key];
    if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 0) {
      throw new Error("Storage capacity could not be verified.");
    }
    return v;
  };
  const baseBytes = bytes("base_bytes");
  const addonBytes = bytes("addon_bytes");
  const totalBytes = bytes("total_bytes");
  const used = bytes("used_bytes");
  const remaining = bytes("remaining_bytes");
  if (row.term !== "forge.storage-capacity.v1" || baseBytes + addonBytes !== totalBytes
    || remaining !== Math.max(0, totalBytes - used)
    || typeof row.usage_complete !== "boolean" || typeof row.delete_only !== "boolean"
    || ((used >= totalBytes || !row.usage_complete) && !row.delete_only)) {
    throw new Error("Storage capacity could not be verified.");
  }
  return { baseBytes, addonBytes, totalBytes,
    usedBytes: row.usage_complete ? used : null,
    remainingBytes: row.usage_complete ? remaining : null,
    deleteOnly: row.delete_only };
}

export function formatStorageBytes(value: number | null): string {
  if (value == null || !Number.isSafeInteger(value) || value < 0) return "--";
  if (value === 0) return "0 B";
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let next = value;
  let index = 0;
  while (next >= 1024 && index < units.length - 1) { next /= 1024; index++; }
  return `${next >= 100 || index === 0 ? next.toFixed(0) : next.toFixed(1)} ${units[index]}`;
}
