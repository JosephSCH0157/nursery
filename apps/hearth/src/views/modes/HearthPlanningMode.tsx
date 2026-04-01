import type { HearthSessionDecision, HearthSessionIntent } from "../../domain/hearth-session";

type HearthPlanningModeProps = {
  sessionIntent: HearthSessionIntent | null | undefined;
  sessionSparkId: string | null;
  syncSessionToTongs: () => void | Promise<void>;
  planningSession: unknown;
  workpieceId: string | null;
  sessionTouched: boolean;
  sessionTitle: string;
  onSessionTitleChange: (value: string) => void;
  sessionGoalsText: string;
  onSessionGoalsChange: (value: string) => void;
  sessionOutlineText: string;
  onSessionOutlineChange: (value: string) => void;
  decisionDraft: string;
  onDecisionDraftChange: (value: string) => void;
  onAddDecision: () => void;
  sessionDecisions: HearthSessionDecision[];
  formatDecisionAt: (value: string | undefined) => string;
  onUpdateDecision: (index: number, value: string) => void;
  onRemoveDecision: (index: number) => void;
};

export default function HearthPlanningMode({
  sessionIntent,
  sessionSparkId,
  syncSessionToTongs,
  planningSession,
  workpieceId,
  sessionTouched,
  sessionTitle,
  onSessionTitleChange,
  sessionGoalsText,
  onSessionGoalsChange,
  sessionOutlineText,
  onSessionOutlineChange,
  decisionDraft,
  onDecisionDraftChange,
  onAddDecision,
  sessionDecisions,
  formatDecisionAt,
  onUpdateDecision,
  onRemoveDecision,
}: HearthPlanningModeProps) {
  return (
    <section className="hs-planning">
      <header className="hs-planning-header">
        <div className="hs-planning-title">Planning Board</div>
        <div className="hs-planning-meta">
          {sessionIntent ? `Intent: ${sessionIntent === "from_spark" ? "From Spark" : "New Idea"}` : "Intent: —"}
          {sessionSparkId ? ` · Spark ${sessionSparkId.slice(0, 8)}` : ""}
        </div>
      </header>

      <div className="hs-toolbar">
        <button
          type="button"
          onClick={() => void syncSessionToTongs()}
          disabled={!planningSession || !workpieceId}
        >
          Save Planning
        </button>
        <span className="hs-status-text">
          {sessionTouched ? "Unsaved changes" : "Saved"}
        </span>
      </div>

      <label className="hs-field">
        <span className="hs-field-label">Title</span>
        <input
          type="text"
          value={sessionTitle}
          placeholder="Episode title seed"
          onChange={(event) => onSessionTitleChange(event.target.value)}
        />
      </label>
      <label className="hs-field">
        <span className="hs-field-label">Goals</span>
        <textarea
          value={sessionGoalsText}
          placeholder="One per line"
          onChange={(event) => onSessionGoalsChange(event.target.value)}
          className="hs-textarea-small"
        />
      </label>
      <label className="hs-field">
        <span className="hs-field-label">Outline</span>
        <textarea
          value={sessionOutlineText}
          placeholder="Bullet outline, one per line"
          onChange={(event) => onSessionOutlineChange(event.target.value)}
          className="hs-textarea-medium"
        />
      </label>
      <div className="hs-decision-section">
        <span className="hs-decision-title">Decision notes</span>
        <div className="hs-decision-input-row">
          <input
            type="text"
            aria-label="Decision draft"
            value={decisionDraft}
            placeholder="Add a decision"
            onChange={(event) => onDecisionDraftChange(event.target.value)}
            className="hs-decision-input"
          />
          <button type="button" onClick={onAddDecision} disabled={!decisionDraft.trim()}>
            Add
          </button>
        </div>
        {sessionDecisions.length === 0 ? (
          <p className="hs-muted-text-small">No decisions logged yet.</p>
        ) : (
          <div className="hs-decision-list">
            {sessionDecisions.map((decision, idx) => (
              <div
                key={`${decision.at}-${idx}`}
                className="hs-decision-card"
              >
                <div className="hs-decision-time">
                  {formatDecisionAt(decision.at)}
                </div>
                <input
                  type="text"
                  aria-label={`Decision note ${idx + 1}`}
                  value={decision.text}
                  onChange={(event) => onUpdateDecision(idx, event.target.value)}
                />
                <div className="hs-decision-actions">
                  <button type="button" onClick={() => onRemoveDecision(idx)}>
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
