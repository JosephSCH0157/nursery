import { useEffect, useMemo, useRef, useState } from "react";
import type { SourcesState, NewSourceInput } from "../hooks/useSourcesState";
import type { HearthResearchResult } from "../lib/hearth-research-contract";
import { normalizeSourceId } from "../lib/source-tokens";
import "./SourcesView.css";

type SourcesViewProps = {
  state: SourcesState;
  workspaceId: string | null;
  workpieceId: string | null;
  researchResult?: HearthResearchResult | null;
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

export default function SourcesView({ state, workspaceId, workpieceId }: SourcesViewProps) {
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

  const statusClassName = state.status.kind === "error"
    ? "hs-sources-status-error"
    : state.status.kind === "success"
      ? "hs-sources-status-success"
      : "hs-sources-status-info";

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
    <section className="hs-sources-view">
      <div className="hs-sources-header">
        <div className="hs-sources-title">Sources</div>
      </div>

      {state.status.kind !== "idle" ? (
        <div className={`hs-sources-status ${statusClassName}`}>{state.status.message}</div>
      ) : null}

      {!workpieceId ? (
        <div className="hs-sources-muted">
          Forge a workpiece to attach sources.
        </div>
      ) : null}

      <section className="hs-sources-section">
        <div className="hs-sources-section-title">Cited in this script</div>
        {workpieceRows.length === 0 ? (
          <div className="hs-sources-muted">No sources attached yet.</div>
        ) : (
          <div className="hs-sources-list">
            {workpieceRows.map(({ ref, normalized, entry, title }) => {
              const isExpanded = Boolean(expandedIds[normalized]);
              const isUnused = unusedIds.has(normalized);
              const detail = state.sourceDetails[normalized];
              const notesValue = notesDrafts[normalized] ?? ref.notes ?? "";
              return (
                <div
                  key={`workpiece-${ref.source_id}`}
                  className="hs-sources-card"
                >
                  <div className="hs-sources-card-header">
                    <div>
                      <div className="hs-sources-card-title">{title}</div>
                      <div className="hs-sources-meta">
                        {entry?.type ? `${entry.type} · ` : ""}
                        {entry?.publisher ?? ""}
                        {entry?.published_at ? ` · ${entry.published_at}` : ""}
                      </div>
                    </div>
                    <div className="hs-sources-action-stack hs-sources-action-stack-end">
                      {isUnused ? (
                        <span className="hs-sources-badge-unused">
                          Unused
                        </span>
                      ) : null}
                      <button type="button" onClick={() => state.removeSourceFromWorkpiece(ref.source_id)}>
                        Remove
                      </button>
                    </div>
                  </div>

                  <label className="hs-sources-label-stack">
                    <span className="hs-sources-label-caption-sm">Local notes</span>
                    <textarea
                      className="hs-sources-textarea-notes"
                      value={notesValue}
                      onChange={(event) => {
                        const value = event.target.value;
                        setNotesDrafts((prev) => ({ ...prev, [normalized]: value }));
                      }}
                      onBlur={() => state.updateWorkpieceSourceNotes(ref.source_id, notesValue)}
                      placeholder="Notes for this script"
                    />
                  </label>

                  <button type="button" onClick={() => toggleExpand(ref.source_id)}>
                    {isExpanded ? "Hide details" : "Show details"}
                  </button>

                  {isExpanded ? (
                    <div className="hs-sources-detail-block">
                      {detail ? (
                        <div className="hs-sources-detail-grid">
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

      <section className="hs-sources-section">
        <div className="hs-sources-section-title">Validation</div>
        {missingWorkpiece.length === 0 && missingLibrary.length === 0 && state.unusedWorkpieceSources.length === 0 ? (
          <div className="hs-sources-muted">All citations look good.</div>
        ) : (
          <div className="hs-sources-list">
            {missingWorkpiece.length ? (
              <div className="hs-sources-group">
                <div className="hs-sources-group-title">Missing from workpiece refs</div>
                {missingWorkpiece.map((item) => (
                  <div key={`missing-workpiece-${item.id}`} className="hs-sources-inline-row">
                    <span className="hs-sources-text-xs">{item.id}</span>
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
                      <span className="hs-sources-meta-xs">In library</span>
                    )}
                  </div>
                ))}
              </div>
            ) : null}

            {missingLibrary.length ? (
              <div className="hs-sources-group">
                <div className="hs-sources-group-title">Missing from library</div>
                {missingLibrary.map((item) => (
                  <div key={`missing-library-${item.id}`} className="hs-sources-inline-row">
                    <span className="hs-sources-text-xs">{item.id}</span>
                    <button type="button" onClick={() => handlePrefillMissing(item.id)} disabled={!workspaceId}>
                      Create in library
                    </button>
                    {item.inWorkpiece ? (
                      <span className="hs-sources-meta-xs">Referenced in workpiece</span>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}

            {state.unusedWorkpieceSources.length ? (
              <div className="hs-sources-group">
                <div className="hs-sources-group-title">Unused workpiece sources</div>
                <div className="hs-sources-muted">
                  {state.unusedWorkpieceSources.join(", ")}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </section>

      <section className="hs-sources-section">
        <div className="hs-sources-section-title">Workspace library</div>
        {sortedLibrary.length === 0 ? (
          <div className="hs-sources-muted">
            No sources saved yet.
          </div>
        ) : (
          <div className="hs-sources-list">
            {sortedLibrary.map((entry) => {
              const normalized = normalizeSourceId(entry.source_id);
              const isAttached = attachedIds.has(normalized);
              const isExpanded = Boolean(expandedIds[normalized]);
              const detail = state.sourceDetails[normalized];
              return (
                <div
                  key={`library-${entry.source_id}`}
                  className="hs-sources-card"
                >
                  <div className="hs-sources-card-header">
                    <div>
                      <div className="hs-sources-card-title">{entry.title ?? "Untitled source"}</div>
                      <div className="hs-sources-meta">
                        {entry.type ?? "other"}
                        {entry.publisher ? ` · ${entry.publisher}` : ""}
                        {entry.published_at ? ` · ${entry.published_at}` : ""}
                      </div>
                    </div>
                    <div className="hs-sources-action-stack">
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
                    <div className="hs-sources-detail-block">
                      {detail ? (
                        <div className="hs-sources-detail-grid">
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

      <section className="hs-sources-section">
        <div className="hs-sources-section-title">Add a new source</div>
        {overrideSourceId ? (
          <div className="hs-sources-muted hs-sources-inline-row hs-sources-inline-row-tight">
            Creating source for token <code>{overrideSourceId}</code>
            <button type="button" onClick={() => setOverrideSourceId(null)}>Clear</button>
          </div>
        ) : null}
        <label className="hs-sources-label-stack">
          <span className="hs-sources-label-caption">Title</span>
          <input
            ref={titleInputRef}
            value={form.title}
            onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
            placeholder="Source title"
          />
        </label>
        <label className="hs-sources-label-stack">
          <span className="hs-sources-label-caption">Type</span>
          <select
            value={form.type}
            onChange={(event) => setForm((prev) => ({ ...prev, type: event.target.value }))}
          >
            {SOURCE_TYPES.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </label>
        <label className="hs-sources-label-stack">
          <span className="hs-sources-label-caption">URL</span>
          <input
            value={form.url ?? ""}
            onChange={(event) => setForm((prev) => ({ ...prev, url: event.target.value }))}
            placeholder="https://"
          />
        </label>
        <label className="hs-sources-label-stack">
          <span className="hs-sources-label-caption">Publisher</span>
          <input
            value={form.publisher ?? ""}
            onChange={(event) => setForm((prev) => ({ ...prev, publisher: event.target.value }))}
          />
        </label>
        <label className="hs-sources-label-stack">
          <span className="hs-sources-label-caption">Author</span>
          <input
            value={form.author ?? ""}
            onChange={(event) => setForm((prev) => ({ ...prev, author: event.target.value }))}
          />
        </label>
        <label className="hs-sources-label-stack">
          <span className="hs-sources-label-caption">Published date</span>
          <input
            type="date"
            value={form.published_at ?? ""}
            onChange={(event) => setForm((prev) => ({ ...prev, published_at: event.target.value }))}
          />
        </label>
        <label className="hs-sources-label-stack">
          <span className="hs-sources-label-caption">Notes</span>
          <textarea
            className="hs-sources-textarea-form"
            value={form.notes ?? ""}
            onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
          />
        </label>
        <label className="hs-sources-checkbox-row">
          <input
            type="checkbox"
            checked={attachOnSave}
            onChange={(event) => setAttachOnSave(event.target.checked)}
            disabled={!workpieceId}
          />
          Also add to this workpiece
        </label>
        <div className="hs-sources-inline-row">
          <button type="button" onClick={handleSaveSource} disabled={!form.title.trim() || !workspaceId}>
            Save to library
          </button>
        </div>
      </section>
    </section>
  );
}
