import { useEffect, useMemo, useRef, useState } from "react";
import type { SourcesState, NewSourceInput } from "../hooks/useSourcesState";
import { normalizeSourceId } from "../lib/source-tokens";

type SourcesPanelProps = {
  open: boolean;
  onClose: () => void;
  state: SourcesState;
  workspaceId: string | null;
  workpieceId: string | null;
};

const SOURCE_TYPES = [
  "article",
  "book",
  "statute",
  "case",
  "paper",
  "webpage",
  "transcript",
  "video",
  "other",
];

export default function SourcesPanel({ open, onClose, state, workspaceId, workpieceId }: SourcesPanelProps) {
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [notesDrafts, setNotesDrafts] = useState<Record<string, string>>({});
  const [form, setForm] = useState<NewSourceInput>({
    title: "",
    type: SOURCE_TYPES[0],
    url: "",
    author: "",
    publisher: "",
    published_at: "",
    notes: "",
  });
  const [attachOnSave, setAttachOnSave] = useState(false);
  const [overrideSourceId, setOverrideSourceId] = useState<string | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);

  const attachedIds = useMemo(() => {
    return new Set(state.workpieceSources.map((ref) => normalizeSourceId(ref.source_id)));
  }, [state.workpieceSources]);

  const unusedIds = useMemo(() => {
    return new Set(state.unusedWorkpieceSources.map((id) => normalizeSourceId(id)));
  }, [state.unusedWorkpieceSources]);

  const sortedLibrary = useMemo(() => {
    return [...state.sourceIndexEntries].sort((a, b) => {
      const left = (a.title ?? "").toLowerCase();
      const right = (b.title ?? "").toLowerCase();
      return left.localeCompare(right);
    });
  }, [state.sourceIndexEntries]);

  const workpieceRows = useMemo(() => {
    return state.workpieceSources
      .map((ref) => {
        const normalized = normalizeSourceId(ref.source_id);
        const entry = state.sourceIndexById.get(normalized);
        const title = entry?.title?.trim() || `Unknown source (${ref.source_id})`;
        return {
          ref,
          normalized,
          entry,
          title,
        };
      })
      .sort((a, b) => a.title.toLowerCase().localeCompare(b.title.toLowerCase()));
  }, [state.workpieceSources, state.sourceIndexById]);

  const missingWorkpiece = useMemo(() => {
    return state.missingWorkpieceSources.map((id) => ({
      id,
      normalized: normalizeSourceId(id),
      inLibrary: state.sourceIndexById.has(normalizeSourceId(id)),
    }));
  }, [state.missingWorkpieceSources, state.sourceIndexById]);

  const missingLibrary = useMemo(() => {
    return state.missingLibrarySources.map((id) => ({
      id,
      normalized: normalizeSourceId(id),
      inWorkpiece: attachedIds.has(normalizeSourceId(id)),
    }));
  }, [state.missingLibrarySources, attachedIds]);

  useEffect(() => {
    setNotesDrafts((prev) => {
      const next: Record<string, string> = {};
      for (const ref of state.workpieceSources) {
        const key = normalizeSourceId(ref.source_id);
        next[key] = prev[key] ?? ref.notes ?? "";
      }
      return next;
    });
  }, [state.workpieceSources]);

  if (!open) return null;

  const statusColor = state.status.kind === "error"
    ? "#b00020"
    : state.status.kind === "success"
      ? "#0f7b2f"
      : "rgba(15, 23, 42, 0.7)";

  const toggleExpand = (sourceId: string) => {
    const normalized = normalizeSourceId(sourceId);
    setExpandedIds((prev) => {
      const next = !prev[normalized];
      if (next) {
        void state.loadSourceDetails(sourceId);
      }
      return { ...prev, [normalized]: next };
    });
  };

  const handleSaveSource = async () => {
    if (!form.title.trim()) return;
    const payload: NewSourceInput = {
      ...form,
      source_id: overrideSourceId ?? form.source_id ?? null,
    };
    const created = await state.addSourceToLibrary(payload, { attachToWorkpiece: attachOnSave });
    if (created) {
      setForm({
        title: "",
        type: SOURCE_TYPES[0],
        url: "",
        author: "",
        publisher: "",
        published_at: "",
        notes: "",
      });
      setAttachOnSave(false);
      setOverrideSourceId(null);
    }
  };

  const handlePrefillMissing = (sourceId: string) => {
    setOverrideSourceId(sourceId);
    setTimeout(() => titleInputRef.current?.focus(), 0);
  };

  return (
    <aside
      style={{
        border: "1px solid var(--forge-border, #ddd)",
        borderRadius: 10,
        padding: 12,
        background: "var(--forge-bg-elevated, #fff)",
        minHeight: 240,
        display: "grid",
        gap: 14,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontWeight: 700 }}>Sources</div>
        <button type="button" onClick={onClose}>Close</button>
      </div>

      {state.status.kind !== "idle" ? (
        <div style={{ fontSize: 12, color: statusColor }}>{state.status.message}</div>
      ) : null}

      {!workpieceId ? (
        <div style={{ fontSize: 12, opacity: 0.7 }}>
          Forge a workpiece to attach sources.
        </div>
      ) : null}

      <section style={{ display: "grid", gap: 10 }}>
        <div style={{ fontWeight: 600 }}>Cited in this script</div>
        {workpieceRows.length === 0 ? (
          <div style={{ fontSize: 12, opacity: 0.7 }}>No sources attached yet.</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {workpieceRows.map(({ ref, normalized, entry, title }) => {
              const isExpanded = Boolean(expandedIds[normalized]);
              const isUnused = unusedIds.has(normalized);
              const detail = state.sourceDetails[normalized];
              const notesValue = notesDrafts[normalized] ?? ref.notes ?? "";
              return (
                <div
                  key={`workpiece-${ref.source_id}`}
                  style={{
                    border: "1px solid rgba(148,163,184,0.35)",
                    borderRadius: 8,
                    padding: 8,
                    display: "grid",
                    gap: 6,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{title}</div>
                      <div style={{ fontSize: 12, opacity: 0.7 }}>
                        {entry?.type ? `${entry.type} · ` : ""}
                        {entry?.publisher ?? ""}
                        {entry?.published_at ? ` · ${entry.published_at}` : ""}
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                      {isUnused ? (
                        <span
                          style={{
                            fontSize: 11,
                            padding: "2px 6px",
                            borderRadius: 999,
                            border: "1px solid rgba(148,163,184,0.5)",
                            opacity: 0.7,
                          }}
                        >
                          Unused
                        </span>
                      ) : null}
                      <button type="button" onClick={() => state.removeSourceFromWorkpiece(ref.source_id)}>
                        Remove
                      </button>
                    </div>
                  </div>

                  <label style={{ display: "grid", gap: 4 }}>
                    <span style={{ fontSize: 11, opacity: 0.7 }}>Local notes</span>
                    <textarea
                      value={notesValue}
                      onChange={(event) => {
                        const value = event.target.value;
                        setNotesDrafts((prev) => ({ ...prev, [normalized]: value }));
                      }}
                      onBlur={() => state.updateWorkpieceSourceNotes(ref.source_id, notesValue)}
                      placeholder="Notes for this script"
                      style={{ minHeight: 60, resize: "vertical" }}
                    />
                  </label>

                  <button type="button" onClick={() => toggleExpand(ref.source_id)}>
                    {isExpanded ? "Hide details" : "Show details"}
                  </button>

                  {isExpanded ? (
                    <div style={{ fontSize: 12, opacity: 0.8 }}>
                      {detail ? (
                        <div style={{ display: "grid", gap: 4 }}>
                          <div><strong>Author:</strong> {detail.author ?? "—"}</div>
                          <div><strong>URL:</strong> {detail.url ?? "—"}</div>
                          <div><strong>Publisher:</strong> {detail.publisher ?? "—"}</div>
                          <div><strong>Published:</strong> {detail.published_at ?? "—"}</div>
                          <div><strong>Notes:</strong> {detail.notes ?? "—"}</div>
                        </div>
                      ) : (
                        <div>Loading details...</div>
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section style={{ display: "grid", gap: 10 }}>
        <div style={{ fontWeight: 600 }}>Validation</div>
        {missingWorkpiece.length === 0 && missingLibrary.length === 0 && state.unusedWorkpieceSources.length === 0 ? (
          <div style={{ fontSize: 12, opacity: 0.7 }}>All citations look good.</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {missingWorkpiece.length ? (
              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 600 }}>Missing from workpiece refs</div>
                {missingWorkpiece.map((item) => (
                  <div key={`missing-workpiece-${item.id}`} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 12 }}>{item.id}</span>
                    <button
                      type="button"
                      onClick={() => state.attachSourceToWorkpiece(item.id)}
                      disabled={!workpieceId}
                    >
                      Add to workpiece
                    </button>
                    {!item.inLibrary ? (
                      <button type="button" onClick={() => handlePrefillMissing(item.id)}>
                        Create in library
                      </button>
                    ) : (
                      <span style={{ fontSize: 11, opacity: 0.6 }}>In library</span>
                    )}
                  </div>
                ))}
              </div>
            ) : null}

            {missingLibrary.length ? (
              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 600 }}>Missing from library</div>
                {missingLibrary.map((item) => (
                  <div key={`missing-library-${item.id}`} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 12 }}>{item.id}</span>
                    <button type="button" onClick={() => handlePrefillMissing(item.id)} disabled={!workspaceId}>
                      Create in library
                    </button>
                    {item.inWorkpiece ? (
                      <span style={{ fontSize: 11, opacity: 0.6 }}>Referenced in workpiece</span>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}

            {state.unusedWorkpieceSources.length ? (
              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 600 }}>Unused workpiece sources</div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>
                  {state.unusedWorkpieceSources.join(", ")}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </section>

      <section style={{ display: "grid", gap: 10 }}>
        <div style={{ fontWeight: 600 }}>Workspace library</div>
        {sortedLibrary.length === 0 ? (
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            No sources saved yet.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {sortedLibrary.map((entry) => {
              const normalized = normalizeSourceId(entry.source_id);
              const isAttached = attachedIds.has(normalized);
              const isExpanded = Boolean(expandedIds[normalized]);
              const detail = state.sourceDetails[normalized];
              return (
                <div
                  key={`library-${entry.source_id}`}
                  style={{
                    border: "1px solid rgba(148,163,184,0.35)",
                    borderRadius: 8,
                    padding: 8,
                    display: "grid",
                    gap: 6,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{entry.title ?? "Untitled source"}</div>
                      <div style={{ fontSize: 12, opacity: 0.7 }}>
                        {entry.type ?? "other"}
                        {entry.publisher ? ` · ${entry.publisher}` : ""}
                        {entry.published_at ? ` · ${entry.published_at}` : ""}
                      </div>
                    </div>
                    <div style={{ display: "grid", gap: 6 }}>
                      <button
                        type="button"
                        onClick={() => state.attachSourceToWorkpiece(entry.source_id)}
                        disabled={!workpieceId || isAttached}
                      >
                        {isAttached ? "Attached" : "Use in this script"}
                      </button>
                      <button type="button" onClick={() => toggleExpand(entry.source_id)}>
                        {isExpanded ? "Hide details" : "Show details"}
                      </button>
                    </div>
                  </div>

                  {isExpanded ? (
                    <div style={{ fontSize: 12, opacity: 0.8 }}>
                      {detail ? (
                        <div style={{ display: "grid", gap: 4 }}>
                          <div><strong>Author:</strong> {detail.author ?? "—"}</div>
                          <div><strong>URL:</strong> {detail.url ?? "—"}</div>
                          <div><strong>Publisher:</strong> {detail.publisher ?? "—"}</div>
                          <div><strong>Published:</strong> {detail.published_at ?? "—"}</div>
                          <div><strong>Notes:</strong> {detail.notes ?? "—"}</div>
                        </div>
                      ) : (
                        <div>Loading details...</div>
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section style={{ display: "grid", gap: 10 }}>
        <div style={{ fontWeight: 600 }}>Add a new source</div>
        {overrideSourceId ? (
          <div style={{ fontSize: 12, opacity: 0.7, display: "flex", gap: 6, alignItems: "center" }}>
            Creating source for token <code>{overrideSourceId}</code>
            <button type="button" onClick={() => setOverrideSourceId(null)}>Clear</button>
          </div>
        ) : null}
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 12, opacity: 0.7 }}>Title</span>
          <input
            ref={titleInputRef}
            value={form.title}
            onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
            placeholder="Source title"
          />
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 12, opacity: 0.7 }}>Type</span>
          <select
            value={form.type}
            onChange={(event) => setForm((prev) => ({ ...prev, type: event.target.value }))}
          >
            {SOURCE_TYPES.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 12, opacity: 0.7 }}>URL</span>
          <input
            value={form.url ?? ""}
            onChange={(event) => setForm((prev) => ({ ...prev, url: event.target.value }))}
            placeholder="https://"
          />
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 12, opacity: 0.7 }}>Publisher</span>
          <input
            value={form.publisher ?? ""}
            onChange={(event) => setForm((prev) => ({ ...prev, publisher: event.target.value }))}
          />
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 12, opacity: 0.7 }}>Author</span>
          <input
            value={form.author ?? ""}
            onChange={(event) => setForm((prev) => ({ ...prev, author: event.target.value }))}
          />
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 12, opacity: 0.7 }}>Published date</span>
          <input
            type="date"
            value={form.published_at ?? ""}
            onChange={(event) => setForm((prev) => ({ ...prev, published_at: event.target.value }))}
          />
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 12, opacity: 0.7 }}>Notes</span>
          <textarea
            value={form.notes ?? ""}
            onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
            style={{ minHeight: 70, resize: "vertical" }}
          />
        </label>
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, opacity: 0.8 }}>
          <input
            type="checkbox"
            checked={attachOnSave}
            onChange={(event) => setAttachOnSave(event.target.checked)}
            disabled={!workpieceId}
          />
          Also add to this workpiece
        </label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" onClick={handleSaveSource} disabled={!form.title.trim() || !workspaceId}>
            Save to library
          </button>
        </div>
      </section>
    </aside>
  );
}
