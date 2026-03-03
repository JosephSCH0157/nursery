import { useEffect, useMemo } from "react";
import { useLocation, useOutletContext } from "react-router-dom";
import type { AppShellContext } from "./AppShell";
import WorkspaceRequiredNotice from "./WorkspaceRequiredNotice";
import { buildForgeRouteHref, parseForgeRouteContext } from "../lib/forge-route-context";

const ANVIL_FULL_PAGE_URL = "/anvil/teleprompter_pro.html";
const TONGS_TOKEN_STORAGE_KEY = "forge_tongs_api_token_v1";

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resolveClientTongsToken(search: string): string | null {
  try {
    const params = new URLSearchParams(search);
    const fromQuery = readString(params.get("tongs_api_token") ?? params.get("tongsApiToken"));
    if (fromQuery) return fromQuery;
  } catch {
    // Ignore malformed query strings.
  }

  const fromEnv = readString((import.meta as { env?: Record<string, string | undefined> }).env?.VITE_TONGS_API_TOKEN);
  return fromEnv;
}

export default function AnvilRoute() {
  const shell = useOutletContext<AppShellContext>();
  const location = useLocation();
  const context = useMemo(() => parseForgeRouteContext(location.search), [location.search]);
  const anvilHref = useMemo(
    () =>
      buildForgeRouteHref(ANVIL_FULL_PAGE_URL, {
        search: location.search,
        workspaceId: shell.workspaceId,
        workpieceId: context.workpieceId,
      }),
    [context.workpieceId, location.search, shell.workspaceId],
  );

  useEffect(() => {
    if (!shell.workspaceId) return;
    try {
      const token = resolveClientTongsToken(location.search);
      if (token) {
        window.localStorage.setItem(TONGS_TOKEN_STORAGE_KEY, token);
      }
    } catch {
      // Ignore storage failures; Anvil still may resolve token via env/query.
    }
    window.location.replace(anvilHref);
  }, [anvilHref, location.search, shell.workspaceId]);

  if (!shell.workspaceId) {
    return <WorkspaceRequiredNotice toolName="Anvil" />;
  }

  return (
    <section style={{ padding: 24, display: "grid", gap: 8 }}>
      <h2 style={{ margin: 0 }}>Opening Anvil...</h2>
      <a href={anvilHref}>Continue to Anvil</a>
    </section>
  );
}
