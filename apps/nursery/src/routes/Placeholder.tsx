import { useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { upsertScriptDraftV1 } from "@hearth/lib";

export default function Placeholder({ name }: { name: string }) {
  const isHearth = name.toLowerCase() === "hearth";
  const [revision, setRevision] = useState(0);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const scriptId = useMemo(() => crypto.randomUUID(), []);

  async function onSaveTestScript() {
    setStatus("Saving...");
    const nextRevision = revision + 1;
    setRevision(nextRevision);
    try {
      const res = await upsertScriptDraftV1(supabase, {
        scriptId,
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

  return (
    <div style={{ padding: 18 }}>
      <h2 style={{ marginTop: 0 }}>{name}</h2>
      <p style={{ opacity: 0.7 }}>
        This is a placeholder route inside Nursery. Next step is mounting the real app here.
      </p>
      {isHearth && (
        <div style={{ marginTop: 16, display: "grid", gap: 8 }}>
          <button onClick={onSaveTestScript} style={{ width: "fit-content" }}>
            Save test script
          </button>
          <div style={{ fontSize: 12, opacity: 0.8 }}>
            Script id: {scriptId}
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
