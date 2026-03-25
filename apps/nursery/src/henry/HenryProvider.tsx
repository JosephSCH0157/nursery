import type { HenryConversationTurn, HenryObservation, HenryPreferenceState } from "@forge/shared/henry";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { parseForgeRouteContext } from "../lib/forge-route-context";
import { useOptionalEpisodeWorkspace } from "../workspace/EpisodeWorkspaceContext";
import { buildHenryContext } from "./henryContext";
import {
  buildHenryActionAnswer,
  buildHenryChatAnswer,
  buildHenryContextSummary,
  resolveHenryObservation,
  resolveHenryRecommendation,
} from "./henryMessageEngine";
import { resolveHenryQuickActions } from "./henryQuickActions";
import { getDefaultHenryPreferences, readCachedHenryPreferences, writeCachedHenryPreferences } from "./henryStorage";
import {
  type HenryMessageStateRow,
  getHenryMessageState,
  getHenryPreferences,
  trackHenryEvent,
  upsertHenryMessageState,
  upsertHenryPreferences,
} from "./henryService";
import { resolveHenrySuppressionState } from "./henrySuppression";
import { HenryLauncher, HenryObservationSlot, HenryPanel } from "./HenryUI";
import "./Henry.css";

const OBSERVATION_COOLDOWN_MS = 15 * 60 * 1000;

function shouldRenderHenry(pathname: string): boolean {
  return pathname.startsWith("/app") || pathname.startsWith("/apps/hearth") || pathname.startsWith("/apps/bellows");
}

function isMuted(preferences: HenryPreferenceState): boolean {
  if (!preferences.mutedUntil) return false;
  const untilMs = Date.parse(preferences.mutedUntil);
  return !Number.isNaN(untilMs) && untilMs > Date.now();
}

function deriveLocalSubtitle(pathname: string): string {
  if (pathname.startsWith("/app/hearth") || pathname.startsWith("/apps/hearth")) return "You are in Hearth";
  if (pathname.startsWith("/app/anvil")) return "You are in Anvil";
  if (pathname.startsWith("/app/hammer")) return "You are in Hammer";
  if (pathname.startsWith("/app/quench")) return "You are in Quench";
  if (pathname.startsWith("/app/tongs")) return "You are in Tongs";
  if (pathname.startsWith("/app/barstock") || pathname.startsWith("/app/bar-stock")) return "You are in Bar-Stock";
  if (pathname.startsWith("/app/settings")) return "You are in Settings";
  return "You are in the Forge";
}

export function HenryProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const episodeCtx = useOptionalEpisodeWorkspace();
  const routeContext = useMemo(() => parseForgeRouteContext(location.search), [location.search]);
  const henryContext = useMemo(
    () => buildHenryContext({
      pathname: location.pathname,
      routeContext,
      episode: episodeCtx?.episode ?? null,
    }),
    [episodeCtx?.episode, location.pathname, routeContext],
  );
  const summaryLines = useMemo(() => buildHenryContextSummary(henryContext), [henryContext]);
  const quickActions = useMemo(() => resolveHenryQuickActions(henryContext.surface), [henryContext.surface]);
  const subtitle = useMemo(() => deriveLocalSubtitle(location.pathname), [location.pathname]);

  const [userId, setUserId] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<HenryPreferenceState>(() =>
    readCachedHenryPreferences({ userId: null, workspaceId: routeContext.workspaceId }),
  );
  const [panelOpen, setPanelOpen] = useState(false);
  const [actionAnswer, setActionAnswer] = useState<string | null>(null);
  const [showChat, setShowChat] = useState(false);
  const [chatDraft, setChatDraft] = useState("");
  const [conversation, setConversation] = useState<HenryConversationTurn[]>([]);
  const [observation, setObservation] = useState<HenryObservation | null>(null);
  const [messageState, setMessageState] = useState<Map<string, HenryMessageStateRow>>(new Map());
  const [pendingFollowThrough, setPendingFollowThrough] = useState<{
    fromPath: string;
    issuedAtMs: number;
  } | null>(null);

  const muted = isMuted(preferences);
  const suppression = useMemo(
    () => resolveHenrySuppressionState({ pathname: location.pathname, panelOpen, mutedUntil: preferences.mutedUntil }),
    [location.pathname, panelOpen, preferences.mutedUntil],
  );

  useEffect(() => {
    let alive = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setUserId(data.session?.user.id ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!alive) return;
      setUserId(session?.user.id ?? null);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const workspaceId = routeContext.workspaceId;
    const base = readCachedHenryPreferences({ userId, workspaceId });
    setPreferences(base);
    if (!workspaceId || !userId) return;
    let cancelled = false;
    void getHenryPreferences(workspaceId)
      .then((fromDb) => {
        if (cancelled || !fromDb) return;
        setPreferences(fromDb);
        writeCachedHenryPreferences({ userId, workspaceId, preferences: fromDb });
      })
      .catch(() => {
        // keep cache fallback
      });
    return () => {
      cancelled = true;
    };
  }, [routeContext.workspaceId, userId]);

  useEffect(() => {
    const workspaceId = routeContext.workspaceId;
    if (!workspaceId || !userId) {
      setMessageState(new Map());
      return;
    }
    let cancelled = false;
    void getHenryMessageState(workspaceId)
      .then((rows) => {
        if (cancelled) return;
        setMessageState(rows);
      })
      .catch(() => {
        if (cancelled) return;
        setMessageState(new Map());
      });
    return () => {
      cancelled = true;
    };
  }, [routeContext.workspaceId, userId]);

  useEffect(() => {
    if (!shouldRenderHenry(location.pathname)) return;
    if (!preferences.showHenry || preferences.hideTips || panelOpen || suppression.isSuppressed) {
      setObservation(null);
      return;
    }
    const candidate = resolveHenryObservation(henryContext);
    if (!candidate) {
      setObservation(null);
      return;
    }

    const existing = messageState.get(candidate.id);
    if (existing?.cooldownUntil) {
      const cooldownMs = Date.parse(existing.cooldownUntil);
      if (!Number.isNaN(cooldownMs) && cooldownMs > Date.now()) {
        setObservation(null);
        return;
      }
    }

    setObservation(candidate);
    const workspaceId = routeContext.workspaceId;
    if (!workspaceId) return;
    void upsertHenryMessageState({
      workspaceId,
      messageId: candidate.id,
      lastSeenAt: new Date().toISOString(),
    });
    void trackHenryEvent({
      workspaceId,
      workpieceId: routeContext.workpieceId,
      eventName: "observation_shown",
      surface: henryContext.surface,
      metadata: { messageId: candidate.id },
    });
  }, [
    henryContext,
    location.pathname,
    messageState,
    panelOpen,
    preferences.hideTips,
    preferences.showHenry,
    routeContext.workspaceId,
    routeContext.workpieceId,
    suppression.isSuppressed,
  ]);

  function persistPreferences(next: HenryPreferenceState): void {
    setPreferences(next);
    writeCachedHenryPreferences({
      userId,
      workspaceId: routeContext.workspaceId,
      preferences: next,
    });
    if (!routeContext.workspaceId || !userId) return;
    void upsertHenryPreferences(routeContext.workspaceId, next).catch(() => {
      // non-fatal, cache retains current setting
    });
  }

  function handleOpenPanel(): void {
    if (!preferences.showHenry) return;
    setPanelOpen(true);
    setObservation(null);
    void trackHenryEvent({
      workspaceId: routeContext.workspaceId,
      workpieceId: routeContext.workpieceId,
      eventName: "panel_open",
      surface: henryContext.surface,
    });
  }

  function handleQuickAction(actionId: string): void {
    if (actionId === "hide-tips") {
      const next = { ...preferences, hideTips: true };
      persistPreferences(next);
      setActionAnswer("Contextual tips are now hidden. You can re-enable them anytime.");
    } else if (actionId === "ask-henry") {
      setShowChat(true);
      setActionAnswer("Ask a question and I will answer with concise orientation.");
    } else {
      setActionAnswer(buildHenryActionAnswer(actionId, henryContext));
    }

    const eventName = actionId === "what-next" ? "next_step_shown" : "quick_action";
    if (actionId === "what-next") {
      setPendingFollowThrough({
        fromPath: location.pathname,
        issuedAtMs: Date.now(),
      });
    }
    void trackHenryEvent({
      workspaceId: routeContext.workspaceId,
      workpieceId: routeContext.workpieceId,
      eventName,
      surface: henryContext.surface,
      metadata: { actionId },
    });
  }

  function handleDismissObservation(): void {
    if (!observation) return;
    const workspaceId = routeContext.workspaceId;
    const now = new Date();
    const cooldownUntil = new Date(now.getTime() + OBSERVATION_COOLDOWN_MS).toISOString();
    setObservation(null);
    setMessageState((prev) => {
      const next = new Map(prev);
      const existing = next.get(observation.id);
      next.set(observation.id, {
        messageId: observation.id,
        lastSeenAt: existing?.lastSeenAt ?? now.toISOString(),
        lastDismissedAt: now.toISOString(),
        cooldownUntil,
        dismissCount: (existing?.dismissCount ?? 0) + 1,
        updatedAt: now.toISOString(),
      });
      return next;
    });

    if (!workspaceId) return;
    void upsertHenryMessageState({
      workspaceId,
      messageId: observation.id,
      lastSeenAt: now.toISOString(),
      lastDismissedAt: now.toISOString(),
      cooldownUntil,
      incrementDismiss: 1,
    });
    void trackHenryEvent({
      workspaceId,
      workpieceId: routeContext.workpieceId,
      eventName: "observation_dismissed",
      surface: henryContext.surface,
      metadata: { messageId: observation.id },
    });
  }

  function handleSendChat(): void {
    const prompt = chatDraft.trim();
    if (!prompt) return;
    const nowIso = new Date().toISOString();
    const answer = buildHenryChatAnswer(prompt, henryContext);
    setConversation((prev) => [
      ...prev,
      { role: "user", text: prompt, timestampIso: nowIso },
      { role: "assistant", text: answer, timestampIso: new Date().toISOString() },
    ].slice(-20));
    setChatDraft("");
    setActionAnswer(answer);
    void trackHenryEvent({
      workspaceId: routeContext.workspaceId,
      workpieceId: routeContext.workpieceId,
      eventName: "freeform_asked",
      surface: henryContext.surface,
    });
  }

  function handleMuteFor(minutes: number | null): void {
    const mutedUntil = typeof minutes === "number"
      ? new Date(Date.now() + (minutes * 60_000)).toISOString()
      : null;
    const next = { ...preferences, mutedUntil };
    persistPreferences(next);
    if (mutedUntil) {
      setObservation(null);
      void trackHenryEvent({
        workspaceId: routeContext.workspaceId,
        workpieceId: routeContext.workpieceId,
        eventName: "muted",
        surface: henryContext.surface,
      });
    }
  }

  const recommendation = useMemo(() => resolveHenryRecommendation(henryContext), [henryContext]);

  useEffect(() => {
    if (!pendingFollowThrough) return;
    if (pendingFollowThrough.fromPath === location.pathname) return;
    if (Date.now() - pendingFollowThrough.issuedAtMs > 2 * 60 * 1000) {
      setPendingFollowThrough(null);
      return;
    }
    void trackHenryEvent({
      workspaceId: routeContext.workspaceId,
      workpieceId: routeContext.workpieceId,
      eventName: "follow_through",
      surface: henryContext.surface,
      metadata: {
        fromPath: pendingFollowThrough.fromPath,
        toPath: location.pathname,
      },
    });
    setPendingFollowThrough(null);
  }, [
    henryContext.surface,
    location.pathname,
    pendingFollowThrough,
    routeContext.workspaceId,
    routeContext.workpieceId,
  ]);

  return (
    <>
      {children}
      {shouldRenderHenry(location.pathname) && preferences.showHenry ? (
        <>
          <HenryObservationSlot observation={observation} onDismiss={handleDismissObservation} />
          <HenryLauncher
            muted={muted}
            onClick={() => {
              void trackHenryEvent({
                workspaceId: routeContext.workspaceId,
                workpieceId: routeContext.workpieceId,
                eventName: "launcher_click",
                surface: henryContext.surface,
              });
              setActionAnswer(
                actionAnswer
                ?? `Best next step: ${recommendation.primary}\nWhy: ${recommendation.why}\nYou could also: ${recommendation.alternatives.join(" or ")}`,
              );
              handleOpenPanel();
            }}
          />
          {panelOpen ? (
            <HenryPanel
              title={subtitle}
              summaryLines={summaryLines}
              actions={quickActions}
              actionAnswer={actionAnswer}
              showChat={showChat}
              chatDraft={chatDraft}
              conversation={conversation}
              preferences={preferences}
              onClose={() => setPanelOpen(false)}
              onAction={handleQuickAction}
              onSetShowHenry={(value) => persistPreferences({ ...preferences, showHenry: value })}
              onSetHideTips={(value) => persistPreferences({ ...preferences, hideTips: value })}
              onSetMutedForMinutes={handleMuteFor}
              onToggleChat={() => setShowChat((prev) => !prev)}
              onChangeChatDraft={setChatDraft}
              onSendChat={handleSendChat}
            />
          ) : null}
        </>
      ) : null}
    </>
  );
}
