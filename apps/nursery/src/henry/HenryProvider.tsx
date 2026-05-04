import type {
  HearthHenrySignal,
  HenryConversationTurn,
  HenrySuggestionKind,
  HenryObservation,
  HenryPreferenceState,
} from "@forge/shared/henry";
import { HENRY_HEARTH_SIGNAL_EVENT } from "@forge/shared/henry";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useLayoutMode } from "@forge/ui-mobile";
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
import { getHenryDeterministicSuggestion } from "./henry-deterministic-suggestions";
import { matchesHearthSignalRoute, readHearthHenrySignal } from "./henry-hearth-signal";
import { deriveHenryMode } from "./henry-mode";
import { buildHenrySignalFingerprint, shouldHenrySurfaceSuggestion } from "./henry-silence-policy";
import { canRenderHenrySurface } from "./henryRenderPolicy";
import { resolveHenryQuickActions } from "./henryQuickActions";
import { readCachedHenryPreferences, writeCachedHenryPreferences } from "./henryStorage";
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
import { resolveHenryStatusLabel } from "./henry-voice";
import "./Henry.css";

const OBSERVATION_COOLDOWN_MS = 15 * 60 * 1000;

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
  const layoutMode = useLayoutMode();
  const canRenderHenry = canRenderHenrySurface({
    pathname: location.pathname,
    layoutMode,
  });
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
  const cachedPreferences = useMemo(
    () => readCachedHenryPreferences({ userId, workspaceId: routeContext.workspaceId }),
    [routeContext.workspaceId, userId],
  );
  const [storedPreferences, setStoredPreferences] = useState<{
    userId: string | null;
    workspaceId: string | null;
    value: HenryPreferenceState | null;
  }>({
    userId: null,
    workspaceId: null,
    value: null,
  });
  const [panelOpen, setPanelOpen] = useState(false);
  const [actionAnswer, setActionAnswer] = useState<string | null>(null);
  const [showChat, setShowChat] = useState(false);
  const [chatDraft, setChatDraft] = useState("");
  const [conversation, setConversation] = useState<HenryConversationTurn[]>([]);
  const [observation, setObservation] = useState<HenryObservation | null>(null);
  const [latestHearthSignal, setLatestHearthSignal] = useState<HearthHenrySignal | null>(null);
  const [storedMessageState, setStoredMessageState] = useState<{
    userId: string | null;
    workspaceId: string | null;
    rows: Map<string, HenryMessageStateRow>;
  }>({
    userId: null,
    workspaceId: null,
    rows: new Map(),
  });
  const pendingFollowThroughRef = useRef<{
    fromPath: string;
    issuedAtMs: number;
  } | null>(null);
  const trackedObservationKeyRef = useRef<string | null>(null);
  const lastAmbientSuggestionRef = useRef<{
    kind: HenrySuggestionKind | null;
    shownAtMs: number | null;
    signalFingerprint: string | null;
    mode: ReturnType<typeof deriveHenryMode>;
    tagValidationOk: boolean | null;
  }>({
    kind: null,
    shownAtMs: null,
    signalFingerprint: null,
    mode: null,
    tagValidationOk: null,
  });

  const preferences = storedPreferences.userId === userId
    && storedPreferences.workspaceId === routeContext.workspaceId
    && storedPreferences.value
    ? storedPreferences.value
    : cachedPreferences;
  const messageState = useMemo(
    () => (
      storedMessageState.userId === userId
      && storedMessageState.workspaceId === routeContext.workspaceId
        ? storedMessageState.rows
        : new Map<string, HenryMessageStateRow>()
    ),
    [routeContext.workspaceId, storedMessageState, userId],
  );

  const muted = isMuted(preferences);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onSignal = (event: Event) => {
      const signal = readHearthHenrySignal(event);
      if (!signal) return;
      setLatestHearthSignal(signal);
    };
    window.addEventListener(HENRY_HEARTH_SIGNAL_EVENT, onSignal);
    return () => window.removeEventListener(HENRY_HEARTH_SIGNAL_EVENT, onSignal);
  }, []);

  const hearthSignal = useMemo(
    () => (matchesHearthSignalRoute(latestHearthSignal, routeContext) ? latestHearthSignal : null),
    [latestHearthSignal, routeContext],
  );
  const henryMode = useMemo(
    () => deriveHenryMode({ context: henryContext, hearthSignal }),
    [hearthSignal, henryContext],
  );
  const deterministicSuggestion = useMemo(
    () => getHenryDeterministicSuggestion({ context: henryContext, mode: henryMode, hearthSignal }),
    [hearthSignal, henryContext, henryMode],
  );
  const launcherStatusLabel = useMemo(() => resolveHenryStatusLabel(henryMode), [henryMode]);
  const currentSignalFingerprint = useMemo(
    () => buildHenrySignalFingerprint(hearthSignal),
    [hearthSignal],
  );

  const suppression = useMemo(
    () => resolveHenrySuppressionState({ pathname: location.pathname, panelOpen, mutedUntil: preferences.mutedUntil }),
    [location.pathname, panelOpen, preferences.mutedUntil],
  );
  const ambientSuggestionObservation = useMemo(() => {
    if (!deterministicSuggestion || henryContext.surface !== "hearth") return null;
    const shouldSurface = shouldHenrySurfaceSuggestion({
      context: henryContext,
      signal: hearthSignal,
      mode: henryMode,
      suggestion: deterministicSuggestion,
      history: {
        nowMs: Date.now(),
        explicitUserInvocation: false,
        userIsTyping: suppression.reasons.includes("typing-focus"),
        userMutedHenry: muted || suppression.reasons.includes("muted"),
        previousMode: lastAmbientSuggestionRef.current.mode,
        previousTagValidationOk: lastAmbientSuggestionRef.current.tagValidationOk,
        lastSignalFingerprint: lastAmbientSuggestionRef.current.signalFingerprint,
        lastSuggestionKind: lastAmbientSuggestionRef.current.kind,
        lastSuggestionAtMs: lastAmbientSuggestionRef.current.shownAtMs,
      },
    });
    if (!shouldSurface) return null;
    return {
      id: `hearth:suggestion:${deterministicSuggestion.kind}`,
      text: deterministicSuggestion.text,
      surface: "hearth" as const,
    };
  }, [deterministicSuggestion, henryContext, hearthSignal, henryMode, suppression.reasons, muted]);
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
    if (!workspaceId || !userId) return;
    let cancelled = false;
    void getHenryPreferences(workspaceId)
      .then((fromDb) => {
        if (cancelled || !fromDb) return;
        setStoredPreferences({
          userId,
          workspaceId,
          value: fromDb,
        });
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
    if (!workspaceId || !userId) return;
    let cancelled = false;
    void getHenryMessageState(workspaceId)
      .then((rows) => {
        if (cancelled) return;
        setStoredMessageState({
          userId,
          workspaceId,
          rows,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setStoredMessageState({
          userId,
          workspaceId,
          rows: new Map(),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [routeContext.workspaceId, userId]);

  useEffect(() => {
    let cancelled = false;
    const nextObservation = (() => {
      if (!canRenderHenry) return null;
      if (!preferences.showHenry || preferences.hideTips || panelOpen || suppression.isSuppressed) {
        return null;
      }
      const candidate = henryContext.surface === "hearth"
        ? ambientSuggestionObservation
        : resolveHenryObservation(henryContext);
      if (!candidate) return null;

      const existing = messageState.get(candidate.id);
      if (existing?.cooldownUntil) {
        const cooldownMs = Date.parse(existing.cooldownUntil);
        if (!Number.isNaN(cooldownMs) && cooldownMs > Date.now()) {
          return null;
        }
      }
      return candidate;
    })();

    queueMicrotask(() => {
      if (cancelled) return;
      setObservation(nextObservation);
    });

    return () => {
      cancelled = true;
    };
  }, [
    henryContext,
    ambientSuggestionObservation,
    canRenderHenry,
    location.pathname,
    messageState,
    panelOpen,
    preferences.hideTips,
    preferences.showHenry,
    suppression.isSuppressed,
  ]);

  useEffect(() => {
    const currentObservation = observation;
    const observationKey = observation
      ? `${routeContext.workspaceId ?? "none"}:${routeContext.workpieceId ?? "none"}:${observation.id}`
      : null;
    if (!observationKey) {
      trackedObservationKeyRef.current = null;
      return;
    }
    if (trackedObservationKeyRef.current === observationKey) return;
    trackedObservationKeyRef.current = observationKey;

    const workspaceId = routeContext.workspaceId;
    if (!workspaceId || !currentObservation) return;
    void upsertHenryMessageState({
      workspaceId,
      messageId: currentObservation.id,
      lastSeenAt: new Date().toISOString(),
    }).catch(() => {
      // non-fatal in ambient assistant surface
    });
    void trackHenryEvent({
      workspaceId,
      workpieceId: routeContext.workpieceId,
      eventName: "observation_shown",
      surface: henryContext.surface,
      metadata: { messageId: currentObservation.id },
    }).catch(() => {
      // non-fatal in ambient assistant surface
    });
  }, [henryContext.surface, observation, routeContext.workspaceId, routeContext.workpieceId]);

  useEffect(() => {
    if (!observation || henryContext.surface !== "hearth") return;
    if (!observation.id.startsWith("hearth:suggestion:")) return;
    const kind = observation.id.slice("hearth:suggestion:".length) as HenrySuggestionKind;
    lastAmbientSuggestionRef.current = {
      kind,
      shownAtMs: Date.now(),
      signalFingerprint: currentSignalFingerprint,
      mode: henryMode,
      tagValidationOk: hearthSignal?.tagValidationOk ?? null,
    };
  }, [currentSignalFingerprint, hearthSignal?.tagValidationOk, henryMode, henryContext.surface, observation]);

  function persistPreferences(next: HenryPreferenceState): void {
    setStoredPreferences({
      userId,
      workspaceId: routeContext.workspaceId,
      value: next,
    });
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
    void trackHenryEvent({
      workspaceId: routeContext.workspaceId,
      workpieceId: routeContext.workpieceId,
      eventName: "panel_open",
      surface: henryContext.surface,
    }).catch(() => {
      // non-fatal in ambient assistant surface
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
      setActionAnswer(buildHenryActionAnswer(actionId, henryContext, {
        mode: henryMode,
        suggestion: deterministicSuggestion,
        hearthSignal,
      }));
    }

    const eventName = actionId === "what-next" ? "next_step_shown" : "quick_action";
    if (actionId === "what-next") {
      pendingFollowThroughRef.current = {
        fromPath: location.pathname,
        issuedAtMs: Date.now(),
      };
    }
    void trackHenryEvent({
      workspaceId: routeContext.workspaceId,
      workpieceId: routeContext.workpieceId,
      eventName,
      surface: henryContext.surface,
      metadata: { actionId },
    }).catch(() => {
      // non-fatal in ambient assistant surface
    });
  }

  function handleDismissObservation(): void {
    if (!observation) return;
    const workspaceId = routeContext.workspaceId;
    const now = new Date();
    const cooldownUntil = new Date(now.getTime() + OBSERVATION_COOLDOWN_MS).toISOString();
    setStoredMessageState((prev) => {
      const previousRows = prev.userId === userId && prev.workspaceId === routeContext.workspaceId
        ? prev.rows
        : new Map<string, HenryMessageStateRow>();
      const next = new Map(previousRows);
      const existing = next.get(observation.id);
      next.set(observation.id, {
        messageId: observation.id,
        lastSeenAt: existing?.lastSeenAt ?? now.toISOString(),
        lastDismissedAt: now.toISOString(),
        cooldownUntil,
        dismissCount: (existing?.dismissCount ?? 0) + 1,
        updatedAt: now.toISOString(),
      });
      return {
        userId,
        workspaceId: routeContext.workspaceId,
        rows: next,
      };
    });

    if (!workspaceId) return;
    void upsertHenryMessageState({
      workspaceId,
      messageId: observation.id,
      lastSeenAt: now.toISOString(),
      lastDismissedAt: now.toISOString(),
      cooldownUntil,
      incrementDismiss: 1,
    }).catch(() => {
      // non-fatal in ambient assistant surface
    });
    void trackHenryEvent({
      workspaceId,
      workpieceId: routeContext.workpieceId,
      eventName: "observation_dismissed",
      surface: henryContext.surface,
      metadata: { messageId: observation.id },
    }).catch(() => {
      // non-fatal in ambient assistant surface
    });
  }

  function handleSendChat(): void {
    const prompt = chatDraft.trim();
    if (!prompt) return;
    const nowIso = new Date().toISOString();
    const answer = buildHenryChatAnswer(prompt, henryContext, {
      mode: henryMode,
      suggestion: deterministicSuggestion,
      hearthSignal,
    });
    const userTurn: HenryConversationTurn = { role: "user", text: prompt, timestampIso: nowIso };
    const assistantTurn: HenryConversationTurn = {
      role: "assistant",
      text: answer,
      timestampIso: new Date().toISOString(),
    };
    setConversation((prev): HenryConversationTurn[] => [...prev, userTurn, assistantTurn].slice(-20));
    setChatDraft("");
    setActionAnswer(answer);
    void trackHenryEvent({
      workspaceId: routeContext.workspaceId,
      workpieceId: routeContext.workpieceId,
      eventName: "freeform_asked",
      surface: henryContext.surface,
    }).catch(() => {
      // non-fatal in ambient assistant surface
    });
  }

  function handleMuteFor(minutes: number | null): void {
    const mutedUntil = typeof minutes === "number"
      ? new Date(Date.now() + (minutes * 60_000)).toISOString()
      : null;
    const next = { ...preferences, mutedUntil };
    persistPreferences(next);
    if (mutedUntil) {
      void trackHenryEvent({
        workspaceId: routeContext.workspaceId,
        workpieceId: routeContext.workpieceId,
        eventName: "muted",
        surface: henryContext.surface,
      }).catch(() => {
        // non-fatal in ambient assistant surface
      });
    }
  }

  const recommendation = useMemo(() => resolveHenryRecommendation(henryContext), [henryContext]);

  useEffect(() => {
    const pendingFollowThrough = pendingFollowThroughRef.current;
    if (!pendingFollowThrough) return;
    if (pendingFollowThrough.fromPath === location.pathname) return;
    if (Date.now() - pendingFollowThrough.issuedAtMs > 2 * 60 * 1000) {
      pendingFollowThroughRef.current = null;
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
    }).catch(() => {
      // non-fatal in ambient assistant surface
    });
    pendingFollowThroughRef.current = null;
  }, [
    henryContext.surface,
    location.pathname,
    routeContext.workspaceId,
    routeContext.workpieceId,
  ]);

  return (
    <>
      {children}
      {canRenderHenry && preferences.showHenry ? (
        <>
          <HenryObservationSlot
            observation={observation}
            onDismiss={handleDismissObservation}
            onHideTips={() => {
              persistPreferences({ ...preferences, hideTips: true });
            }}
          />
          <HenryLauncher
            muted={muted}
            statusLabel={launcherStatusLabel}
            onClick={() => {
              void trackHenryEvent({
                workspaceId: routeContext.workspaceId,
                workpieceId: routeContext.workpieceId,
                eventName: "launcher_click",
                surface: henryContext.surface,
              }).catch(() => {
                // non-fatal in ambient assistant surface
              });
              setActionAnswer(
                actionAnswer
                ?? buildHenryActionAnswer("what-next", henryContext, {
                  mode: henryMode,
                  suggestion: deterministicSuggestion,
                  hearthSignal,
                })
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
