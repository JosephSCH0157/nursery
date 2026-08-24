import { loadHammerReadOnlyAcceptance, type HammerReadOnlyAcceptance } from "@hammer/acceptance/hammerReadOnlyAcceptance";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";

type State = { status: "loading" } | { status: "error"; error: string } | { status: "ready"; value: HammerReadOnlyAcceptance };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function HammerAcceptanceRoute() {
  const [params] = useSearchParams();
  const [state, setState] = useState<State>({ status: "loading" });
  const workspaceId = params.get("workspace_id")?.trim() ?? "";
  const workpieceId = params.get("workpiece_id")?.trim() ?? "";
  const revisionId = params.get("revision_id")?.trim() ?? "";

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        if (![workspaceId, workpieceId, revisionId].every((value) => UUID.test(value))) {
          throw new Error("workspace_id, workpiece_id, and revision_id must be valid UUIDs.");
        }
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (!data.session?.user.id) throw new Error("Authentication is required.");
        const value = await loadHammerReadOnlyAcceptance({ workspaceId, workpieceId, revisionId });
        if (!cancelled) setState({ status: "ready", value });
      } catch (error) {
        if (!cancelled) setState({ status: "error", error: error instanceof Error ? error.message : "Acceptance hydration failed." });
      }
    })();
    return () => { cancelled = true; };
  }, [revisionId, workpieceId, workspaceId]);

  const payload = state.status === "ready"
    ? state.value
    : state.status === "error"
      ? { schema: "forge.hammer-read-only-acceptance.v1", status: "error", error: state.error }
      : { schema: "forge.hammer-read-only-acceptance.v1", status: "loading" };
  return <main aria-label="Hammer read-only acceptance"><pre id="hammer-read-only-acceptance">{JSON.stringify(payload, null, 2)}</pre></main>;
}
