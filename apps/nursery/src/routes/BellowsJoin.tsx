import { useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import type {
  BellowsDeviceReadinessState,
  BellowsResolvedTongsJoinLink,
  SessionId,
} from "@forge/bellows";
import {
  createBellowsTongsJoinLinkRepository,
  type NurseryBellowsTongsJoinLinkRepository,
} from "../lib/bellows/bellowsTongsRepository";
import {
  BELLOWS_HOST_SESSION_SIGNAL_EVENT,
  buildBellowsGuestPresencePayload,
  type BellowsAudioActivityState,
  type BellowsHostSessionSignal,
  type BellowsParticipantReadiness,
  parseBellowsHostSessionSignal,
} from "../lib/bellows/bellowsSessionPresence";
import { useBellowsLocalMediaReadiness } from "../lib/bellows/useBellowsLocalMediaReadiness";
import { supabase } from "../lib/supabase";
import "./BellowsJoin.css";

const BELLOWS_JOIN_CONTINUATION_KEY = "forge_bellows_join_continuation_v1";
const inflightJoinContinuations = new Map<string, Promise<JoinResolution | null>>();
type BellowsPresenceChannel = RealtimeChannel;

type JoinPhase =
  | "resolving"
  | "connecting"
  | "permissions"
  | "waiting"
  | "signaled"
  | "error";

type JoinResolutionSource = "cache" | "rpc";

type JoinContinuation = {
  readonly resolved: BellowsResolvedTongsJoinLink;
  readonly guestKey: string;
  readonly cachedAt: string;
};

type JoinResolution = {
  readonly continuation: JoinContinuation;
  readonly source: JoinResolutionSource;
};

function asSessionId(value: string): SessionId {
  return value as SessionId;
}

function createBellowsId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object") {
    const row = error as {
      message?: unknown;
      details?: unknown;
      hint?: unknown;
      code?: unknown;
    };

    const parts = [
      typeof row.message === "string" ? row.message.trim() : "",
      typeof row.details === "string" ? row.details.trim() : "",
      typeof row.hint === "string" ? row.hint.trim() : "",
      typeof row.code === "string" ? `[${row.code.trim()}]` : "",
    ].filter(Boolean);

    if (parts.length > 0) {
      return parts.join(" ");
    }
  }

  return fallback;
}

function normalizeJoinToken(value: string | null): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function createPendingReadiness(): BellowsParticipantReadiness {
  return {
    microphone: "pending",
    camera: "pending",
    overall: "pending",
  };
}

function describeRoleCode(roleCode: BellowsResolvedTongsJoinLink["roleCode"] | null): string {
  switch (roleCode) {
    case "S1":
      return "Studio seat one";
    case "S2":
      return "Studio seat two";
    case "G1":
      return "Guest seat one";
    case "G2":
      return "Guest seat two";
    default:
      return "Pending role";
  }
}

function describeReadinessState(state: BellowsDeviceReadinessState): string {
  switch (state) {
    case "ready":
      return "Ready";
    case "blocked":
      return "Needs attention";
    case "pending":
      return "Checking";
    default:
      return "Unknown";
  }
}

function describeAudioActivity(activity: BellowsAudioActivityState): string {
  switch (activity) {
    case "active":
      return "Voice activity detected";
    case "silent":
      return "Listening";
    default:
      return "Mic idle";
  }
}

function formatTimestamp(value: string | null): string {
  if (!value) return "Not available";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function buildJoinContinuationKey(sessionId: string, token: string): string {
  return `${encodeURIComponent(sessionId)}::${encodeURIComponent(token)}`;
}

function readJoinContinuationCache(): Record<string, JoinContinuation> {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.sessionStorage.getItem(BELLOWS_JOIN_CONTINUATION_KEY);
    if (!raw) return {};

    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object"
      ? parsed as Record<string, JoinContinuation>
      : {};
  } catch {
    return {};
  }
}

function writeJoinContinuationCache(cache: Record<string, JoinContinuation>): void {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(BELLOWS_JOIN_CONTINUATION_KEY, JSON.stringify(cache));
  } catch {
    // ignore session storage failures
  }
}

function readJoinContinuation(
  sessionId: string,
  token: string,
): JoinContinuation | null {
  const cache = readJoinContinuationCache();
  const key = buildJoinContinuationKey(sessionId, token);
  const cached = cache[key];

  if (!cached || !cached.resolved) return null;

  const expiresAt = new Date(cached.resolved.expiresAt).getTime();
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    delete cache[key];
    writeJoinContinuationCache(cache);
    return null;
  }

  return cached;
}

function persistJoinContinuation(
  sessionId: string,
  token: string,
  continuation: JoinContinuation,
): void {
  const cache = readJoinContinuationCache();
  cache[buildJoinContinuationKey(sessionId, token)] = continuation;
  writeJoinContinuationCache(cache);
}

async function resolveJoinContinuation(
  repository: NurseryBellowsTongsJoinLinkRepository,
  sessionId: string,
  token: string,
): Promise<JoinResolution | null> {
  // Resolving a join link consumes a use, so same-tab continuation is deliberate.
  const cached = readJoinContinuation(sessionId, token);
  if (cached) {
    return {
      continuation: cached,
      source: "cache",
    };
  }

  const key = buildJoinContinuationKey(sessionId, token);
  const inflight = inflightJoinContinuations.get(key);
  if (inflight) {
    return inflight;
  }

  const nextPromise = (async () => {
    const resolved = await repository.resolveJoinLink(asSessionId(sessionId), token);
    if (!resolved) return null;

    const continuation: JoinContinuation = {
      resolved,
      guestKey: createBellowsId("bellows-guest"),
      cachedAt: new Date().toISOString(),
    };

    persistJoinContinuation(sessionId, token, continuation);
    return {
      continuation,
      source: "rpc",
    } as JoinResolution;
  })().finally(() => {
    inflightJoinContinuations.delete(key);
  });

  inflightJoinContinuations.set(key, nextPromise);
  return nextPromise;
}

function countPresenceEntries(value: unknown): number {
  if (!value || typeof value !== "object") return 0;

  return Object.values(value as Record<string, unknown>).reduce((count, entry) => {
    return count + (Array.isArray(entry) ? entry.length : 0);
  }, 0);
}

async function publishPresence(
  channel: BellowsPresenceChannel,
  payload: ReturnType<typeof buildBellowsGuestPresencePayload>,
): Promise<void> {
  await channel.track(payload);
}

function deferStateUpdate(update: () => void): void {
  queueMicrotask(update);
}

function buildStatusTone(
  phase: JoinPhase,
  readiness: BellowsParticipantReadiness,
  hostSignal: BellowsHostSessionSignal | null,
): "ok" | "warn" | "error" {
  if (phase === "error") return "error";
  if (hostSignal?.kind === "finalizing" || hostSignal?.kind === "closed") return "warn";
  if (phase === "permissions" && hasGuestAdvancingHostSignal(hostSignal)) return "warn";
  if (readiness.overall === "blocked") return "warn";
  return "ok";
}

function buildStatusHeading(
  phase: JoinPhase,
  hostSignal: BellowsHostSessionSignal | null,
): string {
  switch (phase) {
    case "resolving":
      return "Validating access";
    case "connecting":
      return "Connecting live session";
    case "permissions":
      switch (hostSignal?.kind) {
        case "admitted":
          return "Host opened the room";
        case "preflight":
          return "Preflight in progress";
        case "ready_to_start":
          return "Studio ready";
        case "countdown":
          return "Countdown live";
        case "sync_initializing":
          return "Initializing sync";
        case "recording":
          return "Recording underway";
        case "finalizing":
          return "Session closing out";
        case "closed":
          return "Session closed";
        default:
          return "Checking devices";
      }
    case "waiting":
      return "Waiting for host";
    case "signaled":
      switch (hostSignal?.kind) {
        case "admitted":
          return "Host opened the room";
        case "preflight":
          return "Preflight in progress";
        case "ready_to_start":
          return "Studio ready";
        case "countdown":
          return "Countdown live";
        case "sync_initializing":
          return "Initializing sync";
        case "recording":
          return "Recording underway";
        case "finalizing":
          return "Session closing out";
        case "closed":
          return "Session closed";
        default:
          return "Host signaled";
      }
    case "error":
      return "Join blocked";
  }
}

function hasGuestAdvancingHostSignal(signal: BellowsHostSessionSignal | null): boolean {
  return Boolean(signal && signal.kind !== "waiting_room");
}

function buildPermissionStatusMessage(args: {
  readiness: BellowsParticipantReadiness;
  hostSignal: BellowsHostSessionSignal | null;
}): string {
  const deviceSetupAction = args.readiness.overall === "blocked"
    ? "Bellows still needs camera or microphone permission before you can join."
    : "Finish camera and microphone setup to join.";

  const base = args.readiness.overall === "blocked"
    ? "Bellows connected you, but camera or microphone permissions still need attention."
    : "Bellows is checking local media readiness.";

  if (!hasGuestAdvancingHostSignal(args.hostSignal)) {
    return base;
  }

  switch (args.hostSignal?.kind) {
    case "admitted":
      return `Host opened the room. ${deviceSetupAction}`;
    case "preflight":
      return args.readiness.overall === "blocked"
        ? "Preflight is in progress, but camera or microphone permissions still need attention before you can join."
        : "Preflight is in progress. Bellows is waiting for your device setup to finish.";
    case "ready_to_start":
      return `Studio is ready to start. ${deviceSetupAction}`;
    case "countdown":
      return args.readiness.overall === "blocked"
        ? "Countdown has started, but your camera or microphone is not ready yet."
        : "Countdown has started. Finish camera and microphone setup now.";
    case "sync_initializing":
      return args.readiness.overall === "blocked"
        ? "Bellows is initializing sync, but your camera or microphone is not ready yet."
        : "Bellows is initializing sync. Finish camera and microphone setup immediately.";
    case "recording":
      return args.readiness.overall === "blocked"
        ? "Bellows has already moved into recording, but your camera or microphone is still not ready."
        : "Bellows has already moved into recording. Finish camera and microphone setup immediately.";
    case "finalizing":
      return "The session is already closing out. Bellows can no longer wait for device setup to finish.";
    case "closed":
      return "This session is closed and no longer admitting live participation.";
    default:
      return `${args.hostSignal?.headline ?? "Host signaled"}. ${base}`;
  }
}

function buildStatusDetail(args: {
  phase: JoinPhase;
  errorMessage: string | null;
  deviceError: string | null;
  statusMessage: string;
  hostSignal: BellowsHostSessionSignal | null;
}): string {
  if (args.errorMessage) return args.errorMessage;

  if (args.phase === "permissions" && hasGuestAdvancingHostSignal(args.hostSignal)) {
    return [args.statusMessage, args.deviceError].filter(Boolean).join(" ");
  }

  return args.deviceError ?? args.statusMessage;
}

export default function BellowsJoin() {
  const repository = useMemo(
    () => createBellowsTongsJoinLinkRepository(supabase),
    [],
  );
  const location = useLocation();
  const { sessionId: routeSessionId } = useParams();
  const [searchParams] = useSearchParams();
  const token = useMemo(
    () => normalizeJoinToken(searchParams.get("token")),
    [searchParams],
  );

  const [resolvedLink, setResolvedLink] = useState<BellowsResolvedTongsJoinLink | null>(null);
  const [guestKey, setGuestKey] = useState<string | null>(null);
  const [phase, setPhase] = useState<JoinPhase>("resolving");
  const [statusMessage, setStatusMessage] = useState("Validating Bellows join link...");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [presenceCount, setPresenceCount] = useState(0);
  const [usedCache, setUsedCache] = useState(false);
  const [presenceConnected, setPresenceConnected] = useState(false);
  const [hostSignal, setHostSignal] = useState<BellowsHostSessionSignal | null>(null);

  const previewRef = useRef<HTMLVideoElement | null>(null);
  const channelRef = useRef<BellowsPresenceChannel | null>(null);
  const joinedAtRef = useRef<string | null>(null);
  const publishedPresenceRef = useRef<string>("");

  const sessionId = routeSessionId?.trim() ?? "";
  const guestLabel = guestKey ? `Guest ${guestKey.slice(-6).toUpperCase()}` : "Guest";
  const channelName = resolvedLink ? `bellows:session:${resolvedLink.sessionId}` : null;
  const backHref = "/app";
  const localMedia = useBellowsLocalMediaReadiness(Boolean(resolvedLink && guestKey && presenceConnected));
  const presenceAudioLevelPct = Math.max(0, Math.min(100, Math.round(localMedia.audioLevelPct / 10) * 10));
  const effectiveStatusTone = buildStatusTone(phase, localMedia.readiness, hostSignal);
  const statusDetail = buildStatusDetail({
    phase,
    errorMessage,
    deviceError: localMedia.deviceError,
    statusMessage,
    hostSignal,
  });

  useEffect(() => {
    const node = previewRef.current;
    if (!node) return;

    node.srcObject = localMedia.stream;
    return () => {
      if (node.srcObject === localMedia.stream) {
        node.srcObject = null;
      }
    };
  }, [localMedia.stream]);

  useEffect(() => {
    if (!sessionId) {
      deferStateUpdate(() => {
        setResolvedLink(null);
        setGuestKey(null);
        setHostSignal(null);
        setPhase("error");
        setErrorMessage("Bellows could not find a session id in this join route.");
        setStatusMessage("Join link is missing its session id.");
      });
      return;
    }

    if (!token) {
      deferStateUpdate(() => {
        setResolvedLink(null);
        setGuestKey(null);
        setHostSignal(null);
        setPhase("error");
        setErrorMessage("Bellows join links require a token query parameter.");
        setStatusMessage("Join link is missing its access token.");
      });
      return;
    }

    let active = true;
    setResolvedLink(null);
    setGuestKey(null);
    setPresenceCount(0);
    setPresenceConnected(false);
    setHostSignal(null);
    setPhase("resolving");
    setErrorMessage(null);
    setUsedCache(false);
    setStatusMessage("Validating Bellows join link...");

    void resolveJoinContinuation(repository, sessionId, token)
      .then((result) => {
        if (!active) return;

        if (!result) {
          setPhase("error");
          setErrorMessage(
            "This Bellows join link is invalid, expired, revoked, exhausted, or no longer joinable.",
          );
          setStatusMessage("Bellows could not validate this guest link.");
          return;
        }

        setResolvedLink(result.continuation.resolved);
        setGuestKey(result.continuation.guestKey);
        setUsedCache(result.source === "cache");
        setPhase("connecting");
        setStatusMessage(
          result.source === "cache"
            ? "Continuing the same guest join attempt from this tab."
            : "Join link validated. Connecting to the live Bellows session.",
        );
      })
      .catch((error) => {
        if (!active) return;
        setPhase("error");
        setErrorMessage(getErrorMessage(error, "Bellows could not resolve this guest link."));
        setStatusMessage("Bellows guest entry could not start.");
      });

    return () => {
      active = false;
    };
  }, [repository, sessionId, token]);

  useEffect(() => {
    if (!resolvedLink || !guestKey) {
      channelRef.current = null;
      joinedAtRef.current = null;
      publishedPresenceRef.current = "";
      deferStateUpdate(() => {
        setPresenceConnected(false);
        setHostSignal(null);
      });
      return;
    }

    let active = true;
    const joinedAt = new Date().toISOString();
    joinedAtRef.current = joinedAt;
    publishedPresenceRef.current = "";
    const channel = supabase.channel(`bellows:session:${resolvedLink.sessionId}`, {
      config: {
        presence: {
          key: guestKey,
        },
      },
    });

    channelRef.current = channel;

    const syncPresenceCount = () => {
      if (!active) return;
      setPresenceCount(countPresenceEntries(channel.presenceState?.() ?? {}));
    };

    channel.on("presence", { event: "sync" }, syncPresenceCount);
    channel.on("presence", { event: "join" }, syncPresenceCount);
    channel.on("presence", { event: "leave" }, syncPresenceCount);
    channel.on("broadcast", { event: BELLOWS_HOST_SESSION_SIGNAL_EVENT }, (event: unknown) => {
      if (!active) return;

      const nextSignal = parseBellowsHostSessionSignal(event);
      if (!nextSignal || nextSignal.sessionId !== resolvedLink.sessionId) {
        return;
      }

      setHostSignal(nextSignal);
    });

    setPhase("connecting");
    setStatusMessage(
      usedCache
        ? "Rejoining the Bellows session channel from this tab."
        : "Connecting to the Bellows session channel.",
    );

    channel.subscribe((status: string) => {
      if (!active) return;

      if (status === "SUBSCRIBED") {
        setPresenceConnected(true);
        void publishPresence(channel, buildBellowsGuestPresencePayload({
          presenceKey: guestKey,
          displayName: guestLabel,
          resolved: resolvedLink,
          readiness: createPendingReadiness(),
          audioLevelPct: 0,
          audioActivity: "unknown",
          hasPreview: false,
          joinedAt,
        }))
          .then(() => {
            if (!active) return;
            setPhase("permissions");
            setStatusMessage("Presence connected. Checking microphone, camera, and local preview...");
            syncPresenceCount();
          })
          .catch((error) => {
            if (!active) return;
            setPhase("error");
            setErrorMessage(getErrorMessage(error, "Bellows guest presence could not be published."));
            setStatusMessage("Bellows could not finish guest entry.");
          });
        return;
      }

      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        setPresenceConnected(false);
        setHostSignal(null);
        setPhase("error");
        setErrorMessage("Bellows could not connect to the live session presence channel.");
        setStatusMessage("Bellows guest entry stopped before the waiting room.");
      }
    });

    return () => {
      active = false;
      setPresenceConnected(false);
      setHostSignal(null);
      channelRef.current = null;
      joinedAtRef.current = null;
      publishedPresenceRef.current = "";
      void channel.unsubscribe();
    };
  }, [guestKey, guestLabel, resolvedLink, usedCache]);

  useEffect(() => {
    if (!resolvedLink || !guestKey || !presenceConnected || !channelRef.current || !joinedAtRef.current) {
      return;
    }

    const payload = buildBellowsGuestPresencePayload({
      presenceKey: guestKey,
      displayName: guestLabel,
      resolved: resolvedLink,
      readiness: localMedia.readiness,
      audioLevelPct: presenceAudioLevelPct,
      audioActivity: localMedia.audioActivity,
      hasPreview: localMedia.hasPreview,
      joinedAt: joinedAtRef.current,
      updatedAt: new Date().toISOString(),
    });

    const signature = JSON.stringify({
      readiness: payload.readiness,
      audioLevelPct: payload.audioLevelPct,
      audioActivity: payload.audioActivity,
      hasPreview: payload.hasPreview,
      presenceState: payload.presenceState,
    });

    if (signature === publishedPresenceRef.current) {
      return;
    }

    publishedPresenceRef.current = signature;

    void publishPresence(channelRef.current, payload)
      .catch((error) => {
        setPhase("error");
        setErrorMessage(getErrorMessage(error, "Bellows guest presence could not be published."));
        setStatusMessage("Bellows could not finish guest entry.");
      });
  }, [
    guestKey,
    guestLabel,
    localMedia.audioActivity,
    localMedia.hasPreview,
    localMedia.readiness,
    presenceAudioLevelPct,
    presenceConnected,
    resolvedLink,
  ]);

  useEffect(() => {
    if (!resolvedLink || !guestKey || !presenceConnected) {
      return;
    }

    const nextPhase = localMedia.readiness.overall === "ready"
      ? hasGuestAdvancingHostSignal(hostSignal)
        ? "signaled"
        : "waiting"
      : "permissions";
    const nextStatusMessage = nextPhase === "signaled"
      ? hostSignal?.detail ?? "Bellows received a live host session signal."
      : nextPhase === "waiting"
      ? "Waiting for host. Bellows sees your camera, microphone, and preview."
      : buildPermissionStatusMessage({
        readiness: localMedia.readiness,
        hostSignal,
      });

    if (phase === nextPhase && statusMessage === nextStatusMessage) {
      return;
    }

    deferStateUpdate(() => {
      setPhase(nextPhase);
      setStatusMessage(nextStatusMessage);
    });
  }, [
    guestKey,
    hostSignal,
    localMedia.readiness,
    phase,
    presenceConnected,
    resolvedLink,
    statusMessage,
  ]);

  return (
    <div className="bellows-join">
      <header className="bellows-join__header">
        <div>
          <div className="bellows-join__eyebrow">Bellows Guest Surface</div>
          <h1 className="bellows-join__title">Bellows Join</h1>
          <p className="bellows-join__subtitle">
            Public guest entry validates access first, then goes live on Bellows session presence, local media readiness, and host session-state signaling.
          </p>
        </div>

        <div className="bellows-join__header-actions">
          <span className="bellows-join__pill">
            Session: {(resolvedLink?.title ?? sessionId) || "Pending"}
          </span>
          <span className="bellows-join__pill">
            Guest: {guestLabel}
          </span>
          <Link to={backHref} className="bellows-join__back-link">
            Back To Forge
          </Link>
        </div>
      </header>

      <main className="bellows-join__main">
        <section className="bellows-join__panel bellows-join__panel--wide">
          <div className="bellows-join__panel-header">
            <div>
              <h2>{resolvedLink?.title ?? "Bellows guest entry"}</h2>
              <p>
                Bellows guest flow: validate token, attach presence, request devices, publish readiness, show preview, then wait for a real host signal.
              </p>
            </div>
            <span className="bellows-join__pill">
              {resolvedLink ? describeRoleCode(resolvedLink.roleCode) : "Awaiting role"}
            </span>
          </div>

          <div className="bellows-join__status-banner" data-state={effectiveStatusTone}>
            <strong>{buildStatusHeading(phase, hostSignal)}</strong>
            <span>{statusDetail}</span>
          </div>

          <div className="bellows-join__state-grid">
            <article className="bellows-join__state-card">
              <span>Host</span>
              <strong>{resolvedLink?.hostUserId ?? "Pending"}</strong>
            </article>
            <article className="bellows-join__state-card">
              <span>Presence</span>
              <strong>{channelName ? `Connected to ${channelName}` : "Not connected yet"}</strong>
            </article>
            <article className="bellows-join__state-card">
              <span>Participants Seen</span>
              <strong>{presenceCount}</strong>
            </article>
            <article className="bellows-join__state-card">
              <span>Microphone</span>
              <strong>{describeReadinessState(localMedia.readiness.microphone)}</strong>
            </article>
            <article className="bellows-join__state-card">
              <span>Camera</span>
              <strong>{describeReadinessState(localMedia.readiness.camera)}</strong>
            </article>
            <article className="bellows-join__state-card">
              <span>Preview</span>
              <strong>{localMedia.hasPreview ? "Live preview" : "Waiting on camera"}</strong>
            </article>
            <article className="bellows-join__state-card">
              <span>Host Signal</span>
              <strong>{hostSignal?.headline ?? "No live host signal yet"}</strong>
            </article>
          </div>
        </section>

        <section className="bellows-join__panel">
          <div className="bellows-join__panel-header">
            <div>
              <h3>Local Readiness</h3>
              <p>Pre-recording camera preview and microphone activity for this guest only.</p>
            </div>
            <button type="button" onClick={localMedia.retry}>
              Retry Devices
            </button>
          </div>

          <div className="bellows-join__preview-shell" data-state={localMedia.hasPreview ? "ready" : "pending"}>
            <video
              ref={previewRef}
              className="bellows-join__preview-video"
              autoPlay
              muted
              playsInline
            />
            {!localMedia.hasPreview ? (
              <div className="bellows-join__preview-empty">
                {localMedia.readiness.camera === "blocked"
                  ? "Bellows needs camera permission before preview can go live."
                  : "Camera preview will appear here once Bellows finishes device checks."}
              </div>
            ) : null}
          </div>

          <div className="bellows-join__meter-card">
            <div className="bellows-join__meter-header">
              <span>Mic Activity</span>
              <strong>{describeAudioActivity(localMedia.audioActivity)}</strong>
            </div>
            <div className="bellows-join__meter-track">
              <div
                className="bellows-join__meter-fill"
                style={{ width: `${localMedia.audioLevelPct}%` }}
              />
            </div>
          </div>

          <ul className="bellows-join__details">
            <li>
              <span>Device State</span>
              <strong>{localMedia.deviceMessage}</strong>
            </li>
            <li>
              <span>Audio Level</span>
              <strong>{`${localMedia.audioLevelPct}%`}</strong>
            </li>
            <li>
              <span>Preview Signal</span>
              <strong>{localMedia.hasPreview ? "Camera preview live" : "Preview unavailable"}</strong>
            </li>
          </ul>
        </section>

        <section className="bellows-join__panel">
          <div className="bellows-join__panel-header">
            <div>
              <h3>Join Progress</h3>
              <p>Bellows establishes entry in the same order the operator needs to see it.</p>
            </div>
          </div>

          <ol className="bellows-join__steps">
            <li className="bellows-join__step" data-state={resolvedLink ? "done" : phase === "error" ? "error" : "active"}>
              <strong>Validate token</strong>
              <span>Resolve the session id and access token against canonical Tongs truth.</span>
            </li>
            <li className="bellows-join__step" data-state={presenceConnected ? "done" : phase === "connecting" ? "active" : "pending"}>
              <strong>Connect presence</strong>
              <span>Attach to the Bellows Realtime session before device prompts slow the flow down.</span>
            </li>
            <li className="bellows-join__step" data-state={phase === "permissions" ? "active" : phase === "waiting" || phase === "signaled" || localMedia.readiness.overall === "blocked" ? "done" : "pending"}>
              <strong>Request devices</strong>
              <span>Bring microphone and camera into a real ready or blocked state, then publish that truth.</span>
            </li>
            <li className="bellows-join__step" data-state={localMedia.hasPreview ? "done" : phase === "permissions" ? "active" : "pending"}>
              <strong>Show preview</strong>
              <span>Confirm the local camera feed and microphone activity before recording exists.</span>
            </li>
            <li className="bellows-join__step" data-state={phase === "signaled" ? "done" : phase === "waiting" ? "active" : "pending"}>
              <strong>Wait for host</strong>
              <span>Hold in the guest waiting state until Bellows receives a real host-side room or start signal.</span>
            </li>
            <li className="bellows-join__step" data-state={hasGuestAdvancingHostSignal(hostSignal) ? "done" : phase === "waiting" ? "active" : "pending"}>
              <strong>Receive host signal</strong>
              <span>Leave the waiting state only when the host publishes live Bellows session-state signaling.</span>
            </li>
          </ol>
        </section>

        <section className="bellows-join__panel">
          <div className="bellows-join__panel-header">
            <div>
              <h3>Join Details</h3>
              <p>Canonical access truth plus the same-tab continuation guard.</p>
            </div>
          </div>

          <ul className="bellows-join__details">
            <li>
              <span>Route</span>
              <strong>{location.pathname}</strong>
            </li>
            <li>
              <span>Session Id</span>
              <strong>{(resolvedLink?.sessionId ?? sessionId) || "Missing"}</strong>
            </li>
            <li>
              <span>Join Link Id</span>
              <strong>{resolvedLink?.joinLinkId ?? "Pending"}</strong>
            </li>
            <li>
              <span>Persisted Lifecycle</span>
              <strong>{resolvedLink?.lifecycleState ?? "Pending"}</strong>
            </li>
            <li>
              <span>Host Lifecycle</span>
              <strong>{hostSignal?.lifecycle ?? "No live signal yet"}</strong>
            </li>
            <li>
              <span>Expires</span>
              <strong>{formatTimestamp(resolvedLink?.expiresAt ?? null)}</strong>
            </li>
            <li>
              <span>Uses</span>
              <strong>{resolvedLink ? `${resolvedLink.useCount}/${resolvedLink.maxUses}` : "Pending"}</strong>
            </li>
            <li>
              <span>Same-Tab Continuation</span>
              <strong>{usedCache ? "Restored" : "Fresh resolve"}</strong>
            </li>
            <li>
              <span>Last Used</span>
              <strong>{formatTimestamp(resolvedLink?.lastUsedAt ?? null)}</strong>
            </li>
            <li>
              <span>Host Signal</span>
              <strong>{hostSignal?.detail ?? "Waiting for the first host session message."}</strong>
            </li>
          </ul>
        </section>
      </main>
    </div>
  );
}
