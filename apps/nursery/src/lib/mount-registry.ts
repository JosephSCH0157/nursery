import { buildDefaultRegistry, normalizeRegistry, validateRegistry } from "@forge/tongs";
import type { WorkspaceMountRegistry } from "@forge/tongs";

const KEY = "forge_mount_registry_v1";

export type LoadResult =
  | { ok: true; registry: WorkspaceMountRegistry; seeded: boolean; issues: null }
  | { ok: false; registry: WorkspaceMountRegistry; seeded: boolean; issues: unknown };

export function loadMountRegistry(workspaceId = "default"): LoadResult {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      const seeded = buildDefaultRegistry(workspaceId);
      localStorage.setItem(KEY, JSON.stringify(seeded));
      return { ok: true, registry: seeded, seeded: true, issues: null };
    }

    const parsed = JSON.parse(raw);
    const normalized = normalizeRegistry(parsed, workspaceId);

    const v = validateRegistry(normalized);
    if (!v.ok) {
      // keep a usable registry, but surface issues for diagnostics
      // and reseed if it's truly broken
      const fallback = buildDefaultRegistry(workspaceId);
      localStorage.setItem(KEY, JSON.stringify(fallback));
      return { ok: false, registry: fallback, seeded: true, issues: v.issues };
    }

    // ensure workspaceId matches caller expectation
    const reg = normalized.workspaceId === workspaceId ? normalized : { ...normalized, workspaceId };
    return { ok: true, registry: reg, seeded: false, issues: null };
  } catch (err) {
    const fallback = buildDefaultRegistry(workspaceId);
    try {
      localStorage.setItem(KEY, JSON.stringify(fallback));
    } catch {
      // ignore storage failures
    }
    return { ok: false, registry: fallback, seeded: true, issues: err };
  }
}

export function saveMountRegistry(registry: WorkspaceMountRegistry): { ok: true } | { ok: false; error: unknown } {
  try {
    const v = validateRegistry(registry);
    if (!v.ok) return { ok: false, error: v.issues };
    localStorage.setItem(KEY, JSON.stringify(registry));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err };
  }
}

export function clearMountRegistry(): void {
  localStorage.removeItem(KEY);
}
