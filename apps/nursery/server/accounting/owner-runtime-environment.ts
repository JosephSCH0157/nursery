import { AsyncLocalStorage } from "node:async_hooks";

import type { OwnerRuntimeEnvironment } from "./forge-owner-execution-coordinator";

const ownerRuntimeEnvironment = new AsyncLocalStorage<OwnerRuntimeEnvironment>();

function hostedNetlifyRuntime(): boolean {
  return process.env.NETLIFY === "true" || Boolean(process.env.SITE_ID?.trim());
}

export function resolveOwnerRuntimeEnvironment(
  value: unknown,
  hosted = hostedNetlifyRuntime(),
): OwnerRuntimeEnvironment {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (normalized === "production") return "production";
  if (normalized === "deploy-preview" || normalized === "branch-deploy" || normalized === "preview") {
    return "preview";
  }
  if (normalized === "dev" || normalized === "development" || normalized === "test") {
    return "development";
  }
  if (!normalized && !hosted) return "development";
  throw new Error(`Owner runtime environment is unavailable or unsupported: ${normalized || "missing"}`);
}

export function runWithOwnerRuntimeEnvironment<T>(
  value: unknown,
  callback: () => T,
): T {
  return ownerRuntimeEnvironment.run(resolveOwnerRuntimeEnvironment(value), callback);
}

export function readOwnerRuntimeEnvironment(): OwnerRuntimeEnvironment {
  const current = ownerRuntimeEnvironment.getStore();
  if (current) return current;

  if (hostedNetlifyRuntime()) {
    throw new Error("Owner runtime environment is unavailable outside the Netlify request context");
  }
  return resolveOwnerRuntimeEnvironment(process.env.CONTEXT ?? process.env.NODE_ENV);
}
