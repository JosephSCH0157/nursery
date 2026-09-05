export type AuthCallbackLocation = Pick<Location, "pathname" | "search" | "hash">;

function readParam(source: string, name: string): string | null {
  try {
    return new URLSearchParams(source.replace(/^[?#]/, "")).get(name);
  } catch {
    return null;
  }
}

export function readAuthCallbackType(location: AuthCallbackLocation): string | null {
  const normalizedPath = location.pathname.replace(/\/+$/, "");
  if (normalizedPath === "/auth/callback/recovery") return "recovery";
  return readParam(location.search, "type") ?? readParam(location.hash, "type");
}

export function isRecoveryAuthCallback(location: AuthCallbackLocation): boolean {
  return readAuthCallbackType(location) === "recovery";
}
