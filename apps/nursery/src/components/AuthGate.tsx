import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { supabase } from "../lib/supabase";

type Props = { children: ReactNode };

const ACTIVE_WORKSPACE_KEY = "forge_workspace_id_v1";
const LEGACY_BARSTOCK_WORKSPACE_KEY = "barstock_workspace_id";
const WORKSPACE_QUERY_KEYS = ["workspace_id", "workspaceId", "workspace"] as const;

function hasWorkspaceParam(search: string): boolean {
  const params = new URLSearchParams(search);
  return WORKSPACE_QUERY_KEYS.some((key) => {
    const value = params.get(key);
    return typeof value === "string" && value.trim().length > 0;
  });
}

function readPersistedWorkspaceId(): string | null {
  try {
    return window.localStorage.getItem(ACTIVE_WORKSPACE_KEY)
      ?? window.localStorage.getItem(LEGACY_BARSTOCK_WORKSPACE_KEY);
  } catch {
    return null;
  }
}

function buildNextPath(pathname: string, search: string, hash: string): string {
  const params = new URLSearchParams(search);
  if (!hasWorkspaceParam(search)) {
    const persistedWorkspaceId = readPersistedWorkspaceId();
    if (persistedWorkspaceId) {
      WORKSPACE_QUERY_KEYS.forEach((key) => params.delete(key));
      params.set("workspace_id", persistedWorkspaceId);
    }
  }
  const nextSearch = params.toString();
  return `${pathname}${nextSearch ? `?${nextSearch}` : ""}${hash}`;
}

export default function AuthGate({ children }: Props) {
  const loc = useLocation();
  const [checking, setChecking] = useState(true);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    let alive = true;

    (async () => {
      const { data, error } = await supabase.auth.getSession();
      if (!alive) return;

      if (error) {
        setAuthed(false);
        setChecking(false);
        return;
      }

      setAuthed(!!data.session);
      setChecking(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!alive) return;
      setAuthed(!!session);
      setChecking(false);
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (checking) {
    return (
      <div style={{ padding: 24, fontFamily: "system-ui" }}>
        Checking session...
      </div>
    );
  }

  if (!authed) {
    const next = encodeURIComponent(buildNextPath(loc.pathname, loc.search, loc.hash));
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  return <>{children}</>;
}
