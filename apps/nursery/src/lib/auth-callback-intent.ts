export type AuthCallbackLocation = Pick<Location, "pathname" | "search" | "hash">;

export const AUTH_NEXT_STORAGE_KEY = "forge_auth_next_v1";
export const AUTH_PROVIDER_STORAGE_KEY = "forge_auth_provider_v1";

export type AuthCallbackError = {
  code: string | null;
  description: string;
};

function readParam(source: string, name: string): string | null {
  try {
    return new URLSearchParams(source.replace(/^[?#]/, "")).get(name);
  } catch {
    return null;
  }
}

function hasControlCharacters(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
}

export function readAuthCallbackType(location: AuthCallbackLocation): string | null {
  const normalizedPath = location.pathname.replace(/\/+$/, "");
  if (normalizedPath === "/auth/callback/recovery") return "recovery";
  return readParam(location.search, "type") ?? readParam(location.hash, "type");
}

export function isRecoveryAuthCallback(location: AuthCallbackLocation): boolean {
  return readAuthCallbackType(location) === "recovery";
}

export function isInvitationAuthCallback(location: AuthCallbackLocation): boolean {
  return readAuthCallbackType(location) === "invite";
}

export function normalizeAuthNextPath(raw: string | null): string {
  if (!raw) return "/app";
  const trimmed = raw.trim();
  if (
    !trimmed
    || !trimmed.startsWith("/")
    || trimmed.startsWith("//")
    || trimmed.includes("\\")
    || hasControlCharacters(trimmed)
  ) return "/app";
  return trimmed;
}

export function readAuthCallbackError(
  location: Pick<AuthCallbackLocation, "search" | "hash">,
): AuthCallbackError | null {
  for (const source of [location.search, location.hash]) {
    const code = readParam(source, "error_code") ?? readParam(source, "error");
    const description = readParam(source, "error_description") ?? code;
    if (description) return { code, description };
  }
  return null;
}

export function isOAuthCancellation(error: AuthCallbackError): boolean {
  if (error.code?.toLowerCase() === "access_denied") return true;
  return /\b(cancel(?:led|ed)?|denied|declined)\b/i.test(error.description);
}
