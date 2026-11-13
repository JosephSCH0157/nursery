const USER_AUTH_HEADERS = ["x-forge-user-authorization", "x-forge-user-token"] as const;

export function authorizeFirstPartyUserRequest(
  request: Request,
  apiToken: string | undefined,
): Request {
  if (!apiToken || request.headers.has("authorization")) return request;
  const hasUserAuthorization = USER_AUTH_HEADERS.some((name) => {
    const value = request.headers.get(name)?.trim();
    return Boolean(value && /^Bearer\s+\S+$/i.test(value));
  });
  if (!hasUserAuthorization) return request;

  const headers = new Headers(request.headers);
  headers.set("authorization", `Bearer ${apiToken}`);
  return new Request(request, { headers });
}

// Only these episode-creation routes use the Anvil user-only browser request.
// Their service methods independently validate the user and workspace role.
export function authorizeRecordingWorkpieceRequest(
  request: Request,
  apiToken: string | undefined,
): Request {
  const path = new URL(request.url).pathname.replace(/\/+$/, "");
  const creation = request.method === "POST"
    && /^\/tongs\/workspaces\/[^/]+\/recording-workpieces$/.test(path);
  const recovery = request.method === "GET"
    && /^\/tongs\/workspaces\/[^/]+\/recording-workpiece-creations\/[^/]+$/.test(path);
  return creation || recovery ? authorizeFirstPartyUserRequest(request, apiToken) : request;
}
