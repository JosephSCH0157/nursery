import { useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { upsertScriptDraftV1 } from "@hearth/lib";
import type { AppShellContext } from "./AppShell";
import WorkspaceRequiredNotice from "./WorkspaceRequiredNotice";

const TEST_SCRIPT_ID_KEY = "hearth_test_script_id_v1";
const WORKSPACE_REQUIRED_PLACEHOLDERS = new Set(["hearth", "hammer", "quench", "ledger", "calendar"]);

export default function Placeholder({ name }: { name: string }) {
  const shell = useOutletContext<AppShellContext>();
  const normalizedName = name.toLowerCase();
  const isHearth = normalizedName === "hearth";
  const requiresWorkspace = WORKSPACE_REQUIRED_PLACEHOLDERS.has(normalizedName);
  const devEnabled = useMemo(() => {
    if (import.meta.env.DEV) return true;
    if (localStorage.getItem("tp_dev_mode") === "1") return true;
    const params = new URLSearchParams(window.location.search);
    return params.get("dev") === "1";
  }, []);
  const [revision, setRevision] = useState(0);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [scriptId, setScriptId] = useState<string | null>(() => {
    return localStorage.getItem(TEST_SCRIPT_ID_KEY);
  });

  function getOrCreateScriptId(): string {
    if (scriptId) return scriptId;
    const next = crypto.randomUUID();
    localStorage.setItem(TEST_SCRIPT_ID_KEY, next);
    setScriptId(next);
    return next;
  }

  async function onSaveTestScript() {
    setStatus("Saving...");
    const nextRevision = revision + 1;
    setRevision(nextRevision);
    try {
      const id = getOrCreateScriptId();
      const res = await upsertScriptDraftV1(supabase, {
        scriptId: id,
        originSparkId: null,
        titleWorking: "Hearth Test Script",
        bodyAnvil: `Test body @ ${new Date().toISOString()}`,
        baseState: "warming",
        relevance: "other",
        revision: nextRevision,
      });
      console.info("[hearth] upsert_script_draft_v1 ok", res);
      setRevision(res.revision);
      setLastSavedAt(res.updatedAt ?? null);
      setStatus(`Saved revision ${res.revision}`);
    } catch (err) {
      console.error("[hearth] upsert_script_draft_v1 failed", err);
      setStatus("Save failed. Check console.");
    }
  }

  if (requiresWorkspace && !shell.workspaceId) {
    return <WorkspaceRequiredNotice toolName={name} />;
  }

  return (
    <div style={{ padding: 18 }}>
      <h2 style={{ marginTop: 0 }}>{name}</h2>
      <p style={{ opacity: 0.7 }}>
        This is a placeholder route inside Nursery. Next step is mounting the real app here.
      </p>
      {isHearth && devEnabled && (
        <div style={{ marginTop: 16, display: "grid", gap: 8 }}>
          <button onClick={onSaveTestScript} style={{ width: "fit-content" }}>
            Save test script
          </button>
          <div style={{ fontSize: 12, opacity: 0.8 }}>
            Script id: {scriptId ?? "not created"}
          </div>
          <div style={{ fontSize: 12, opacity: 0.8 }}>
            Revision: {revision}
          </div>
          <div style={{ fontSize: 12, opacity: 0.8 }}>
            Last saved: {lastSavedAt ?? "never"}
          </div>
          {status && (
            <div style={{ fontSize: 12, opacity: 0.9 }}>{status}</div>
          )}
        </div>
      )}
    </div>
  );
}
