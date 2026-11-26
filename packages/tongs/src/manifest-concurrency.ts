// Merge only this operation's changes after a failed provider-version CAS.
// These are request snapshots, never persisted authority or a local lock.
export class ManifestConflictError extends Error {}
const canonical = (value: unknown): string => JSON.stringify(value, function (_key, item) {
  return item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item;
});
const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);
export function mergeManifestDelta<T>(base: T, desired: T, latest: T): T {
  const output = structuredClone(latest) as Record<string, unknown>;
  const original = base as Record<string, unknown>, target = desired as Record<string, unknown>;
  const merge = (before: Record<string, unknown>, after: Record<string, unknown>, now: Record<string, unknown>, prefix: string, ignored: string[] = []) => {
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
      if (ignored.includes(key) || same(before[key], after[key])) continue;
      if (!same(now[key], before[key]) && !same(now[key], after[key])) {
        throw new ManifestConflictError(`Concurrent manifest change at ${prefix}${key}`);
      }
      if (Object.hasOwn(after, key)) now[key] = structuredClone(after[key]);
      else delete now[key];
    }
  };
  merge(original, target, output, '', ['files','pointers','updated_at']);
  for (const collection of ['files','pointers']) {
    const before = (original[collection] ?? {}) as Record<string, unknown>;
    const after = (target[collection] ?? {}) as Record<string, unknown>;
    const now = (output[collection] ??= {}) as Record<string, unknown>;
    merge(before, after, now, `${collection}.`, collection === 'files' ? ['manifest.json'] : []);
  }
  output.updated_at = target.updated_at;
  return output as T;
}
