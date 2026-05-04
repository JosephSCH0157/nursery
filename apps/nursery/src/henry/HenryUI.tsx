import type { HenryConversationTurn, HenryObservation, HenryPreferenceState, HenryQuickAction } from "@forge/shared/henry";

type HenryLauncherProps = {
  muted: boolean;
  statusLabel?: string;
  onClick: () => void;
};

export function HenryLauncher({ muted, statusLabel, onClick }: HenryLauncherProps) {
  const visibleStatus = muted ? "muted" : (statusLabel?.trim() || "available");
  return (
    <button
      type="button"
      className={`henry-launcher${muted ? " is-muted" : ""}`}
      onClick={onClick}
      aria-label="Open Henry"
      title={muted ? "Henry is muted" : "Open Henry"}
    >
      <span className="henry-launcher__label">Henry</span>
      <span className="henry-launcher__status">{visibleStatus}</span>
    </button>
  );
}

type HenryObservationSlotProps = {
  observation: HenryObservation | null;
  onDismiss: () => void;
  onHideTips: () => void;
};

export function HenryObservationSlot({ observation, onDismiss, onHideTips }: HenryObservationSlotProps) {
  if (!observation) return null;
  return (
    <aside className="henry-observation" role="status" aria-live="polite">
      <span className="henry-observation__text">{observation.text}</span>
      <div className="henry-observation__actions">
        <button type="button" onClick={onHideTips} aria-label="Hide Henry tips">Hide tips</button>
        <button type="button" onClick={onDismiss} aria-label="Dismiss Henry observation">Dismiss</button>
      </div>
    </aside>
  );
}

type HenryPanelProps = {
  title: string;
  summaryLines: string[];
  actions: HenryQuickAction[];
  actionAnswer: string | null;
  showChat: boolean;
  chatDraft: string;
  conversation: HenryConversationTurn[];
  preferences: HenryPreferenceState;
  onClose: () => void;
  onAction: (actionId: string) => void;
  onSetShowHenry: (value: boolean) => void;
  onSetHideTips: (value: boolean) => void;
  onSetMutedForMinutes: (minutes: number | null) => void;
  onToggleChat: () => void;
  onChangeChatDraft: (value: string) => void;
  onSendChat: () => void;
};

export function HenryPanel(props: HenryPanelProps) {
  const {
    title,
    summaryLines,
    actions,
    actionAnswer,
    showChat,
    chatDraft,
    conversation,
    preferences,
    onClose,
    onAction,
    onSetShowHenry,
    onSetHideTips,
    onSetMutedForMinutes,
    onToggleChat,
    onChangeChatDraft,
    onSendChat,
  } = props;
  return (
    <aside className="henry-panel" role="dialog" aria-modal="false" aria-label="Henry panel">
      <header className="henry-panel__header">
        <div>
          <h2>Henry - Apprentice of the Forge</h2>
          <p>{title}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close Henry panel">Close</button>
      </header>

      <section className="henry-panel__section">
        <h3>Context summary</h3>
        <ul>
          {summaryLines.map((line) => <li key={line}>{line}</li>)}
        </ul>
      </section>

      <section className="henry-panel__section">
        <h3>Quick actions</h3>
        <div className="henry-panel__actions">
          {actions.map((action) => (
            <button
              key={action.id}
              type="button"
              disabled={!action.enabled}
              onClick={() => onAction(action.id)}
            >
              {action.label}
            </button>
          ))}
        </div>
      </section>

      {actionAnswer ? (
        <section className="henry-panel__section">
          <h3>Henry</h3>
          <pre className="henry-panel__answer">{actionAnswer}</pre>
        </section>
      ) : null}

      <section className="henry-panel__section">
        <div className="henry-panel__chat-header">
          <h3>Conversation</h3>
          <button type="button" onClick={onToggleChat}>
            {showChat ? "Hide chat" : "Ask Henry"}
          </button>
        </div>
        {showChat ? (
          <div className="henry-panel__chat">
            <div className="henry-panel__chat-log">
              {conversation.length === 0 ? <p>Conversation starts when you ask.</p> : null}
              {conversation.map((turn, index) => (
                <p key={`${turn.role}-${turn.timestampIso}-${index}`}>
                  <strong>{turn.role === "assistant" ? "Henry" : "You"}:</strong> {turn.text}
                </p>
              ))}
            </div>
            <div className="henry-panel__chat-row">
              <input
                type="text"
                value={chatDraft}
                onChange={(event) => onChangeChatDraft(event.target.value)}
                placeholder="Ask Henry"
              />
              <button type="button" onClick={onSendChat} disabled={!chatDraft.trim()}>Send</button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="henry-panel__section">
        <h3>Preferences</h3>
        <label>
          <input
            type="checkbox"
            checked={preferences.showHenry}
            onChange={(event) => onSetShowHenry(event.target.checked)}
          />
          Show Henry
        </label>
        <label>
          <input
            type="checkbox"
            checked={preferences.hideTips}
            onChange={(event) => onSetHideTips(event.target.checked)}
          />
          Hide contextual tips
        </label>
        <div className="henry-panel__actions">
          <button type="button" onClick={() => onSetMutedForMinutes(30)}>Mute 30m</button>
          <button type="button" onClick={() => onSetMutedForMinutes(null)}>Unmute</button>
        </div>
      </section>
    </aside>
  );
}
