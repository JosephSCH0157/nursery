/** Operator configuration only. This admission gate is NOT a database fence:
 * direct Storage clients and already admitted work must be fenced/drained
 * separately before a migration. Never infer global quiescence from a 503.
 * No timeout or automatic resume: the operator explicitly restores `open`.
 */
export function storageReleasePauseResponse(
  configuredMode: string | undefined,
  headers: HeadersInit = {},
): Response | null {
  if (configuredMode === undefined || configuredMode === "open") return null;
  const paused = configuredMode === "paused";
  return new Response(JSON.stringify({
    ok: false,
    error: {
      code: paused ? "storage_release_paused" : "storage_release_configuration_invalid",
      message: "Storage release maintenance is in progress. Retry later.",
    },
  }), {
    status: 503,
    headers: {
      ...Object.fromEntries(new Headers(headers)),
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "retry-after": "60",
    },
  });
}
