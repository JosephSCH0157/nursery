import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import type {
  BellowsDeviceReadinessState,
  BellowsJoinState,
  BellowsPresenceState,
  BellowsResolvedTongsJoinLink,
  BellowsRoleCode,
  SessionId,
} from "@forge/bellows";
import {
  createBellowsTongsJoinLinkRepository,
  type NurseryBellowsTongsJoinLinkRepository,
} from "../lib/bellows/bellowsTongsRepository";
import { supabase } from "../lib/supabase";
import "./BellowsJoin.css";

const BELLOWS_JOIN_CONTINUATION_KEY = "forge_bellows_join_continuation_v1";
const inflightJoinContinuations = new Map<string, Promise<JoinResolution | null>>();

type GuestReadiness = {
  readonly microphone: BellowsDeviceReadinessState;
  readonly camera: BellowsDeviceReadinessState;
  readonly overall: BellowsDeviceReadinessState;
};

type JoinPhase =
  | "resolving"
  | "connecting"
  | "permissions"
  | "waiting"
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

type BellowsGuestPresencePayload = {
  readonly guestKey: string;
  readonly displayName: string;
  readonly roleCode: BellowsRoleCode;
  readonly joinLinkId: string;
  readonly sessionId: string;
  readonly joinState: BellowsJoinState;
  readonly presenceState: BellowsPresenceState;
  readonly readiness: GuestReadiness;
  readonly joinedAt: string;
  readonly resolvedAt: string;
  readonly source: "bellows_join_route";
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
  return fallback;
}

function normalizeJoinToken(value: string | null): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function createPendingReadiness(): GuestReadiness {
  return {
    microphone: "pending",
    camera: "pending",
    overall: "pending",
  };
}

function deriveOverallReadiness(readiness: GuestReadiness): BellowsDeviceReadinessState {
  if (readiness.microphone === "blocked" || readiness.camera === "blocked") {
    return "blocked";
  }

  if (readiness.microphone === "ready" && readiness.camera === "ready") {
    return "ready";
  }

  return "pending";
}

function describeRoleCode(roleCode: BellowsRoleCode | null): string {
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

async function requestDevicePermission(
  kind: "microphone" | "camera",
): Promise<BellowsDeviceReadinessState> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return "blocked";
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia(
      kind === "microphone" ? { audio: true } : { video: true },
    );
    stream.getTracks().forEach((track) => track.stop());
    return "ready";
  } catch {
    return "blocked";
  }
}

function countPresenceEntries(value: unknown): number {
  if (!value || typeof value !== "object") return 0;

  return Object.values(value as Record<string, unknown>).reduce((count, entry) => {
    return count + (Array.isArray(entry) ? entry.length : 0);
  }, 0);
}

function buildPresencePayload(args: {
  guestKey: string;
  displayName: string;
  resolved: BellowsResolvedTongsJoinLink;
  readiness: GuestReadiness;
  joinedAt: string;
}): BellowsGuestPresencePayload {
  return {
    guestKey: args.guestKey,
    displayName: args.displayName,
    roleCode: args.resolved.roleCode,
    joinLinkId: args.resolved.joinLinkId,
    sessionId: args.resolved.sessionId,
    joinState: "pending",
    presenceState: args.readiness.overall === "ready" ? "ready" : "joining",
    readiness: args.readiness,
    joinedAt: args.joinedAt,
    resolvedAt: args.resolved.resolvedAt,
    source: "bellows_join_route",
  };
}

async function publishPresence(channel: any, payload: BellowsGuestPresencePayload): Promise<void> {
  await channel.track(payload);
}

function buildStatusTone(
  phase: JoinPhase,
  readiness: GuestReadiness,
): "ok" | "warn" | "error" {
  if (phase === "error") return "error";
  if (readiness.overall === "blocked") return "warn";
  return "ok";
}

function buildStatusHeading(phase: JoinPhase): string {
  switch (phase) {
    case "resolving":
      return "Validating access";
    case "connecting":
      return "Connecting live session";
    case "permissions":
      return "Checking devices";
    case "waiting":
      return "Waiting for host";
    case "error":
      return "Join blocked";
  }
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
  const [readiness, setReadiness] = useState<GuestReadiness>(() => createPendingReadiness());
  const [presenceCount, setPresenceCount] = useState(0);
  const [usedCache, setUsedCache] = useState(false);

  const sessionId = routeSessionId?.trim() ?? "";
  const guestLabel = guestKey ? `Guest ${guestKey.slice(-6).toUpperCase()}` : "Guest";
  const statusTone = buildStatusTone(phase, readiness);
  const channelName = resolvedLink ? `bellows:session:${resolvedLink.sessionId}` : null;
  const backHref = "/app";

  useEffect(() => {
    if (!sessionId) {
      setResolvedLink(null);
      setGuestKey(null);
      setPhase("error");
      setReadiness(createPendingReadiness());
      setErrorMessage("Bellows could not find a session id in this join route.");
      setStatusMessage("Join link is missing its session id.");
      return;
    }

    if (!token) {
      setResolvedLink(null);
      setGuestKey(null);
      setPhase("error");
      setReadiness(createPendingReadiness());
      setErrorMessage("Bellows join links require a token query parameter.");
      setStatusMessage("Join link is missing its access token.");
      return;
    }

    let active = true;
    setResolvedLink(null);
    setGuestKey(null);
    setPresenceCount(0);
    setReadiness(createPendingReadiness());
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
    if (!resolvedLink || !guestKey) return;

    let active = true;
    const joinedAt = new Date().toISOString();
    const channel = supabase.channel(`bellows:session:${resolvedLink.sessionId}`, {
      config: {
        presence: {
          key: guestKey,
        },
      },
    }) as any;

    const syncPresenceCount = () => {
      if (!active) return;
      setPresenceCount(countPresenceEntries(channel.presenceState?.() ?? {}));
    };

    channel.on("presence", { event: "sync" }, syncPresenceCount);
    channel.on("presence", { event: "join" }, syncPresenceCount);
    channel.on("presence", { event: "leave" }, syncPresenceCount);

    setPhase("connecting");
    setStatusMessage(
      usedCache
        ? "Rejoining the Bellows session channel from this tab."
        : "Connecting to the Bellows session channel.",
    );

    channel.subscribe((status: string) => {
      if (!active) return;

      if (status === "SUBSCRIBED") {
        void (async () => {
          try {
            const initialReadiness = createPendingReadiness();
            await publishPresence(channel, buildPresencePayload({
              guestKey,
              displayName: guestLabel,
              resolved: resolvedLink,
              readiness: initialReadiness,
              joinedAt,
            }));

            if (!active) return;

            setPhase("permissions");
            setStatusMessage("Presence connected. Checking microphone and camera access...");
            syncPresenceCount();

            const microphone = await requestDevicePermission("microphone");
            if (!active) return;

            const afterMicrophone: GuestReadiness = {
              microphone,
              camera: "pending",
              overall: deriveOverallReadiness({
                microphone,
                camera: "pending",
                overall: "pending",
              }),
            };

            setReadiness(afterMicrophone);
            await publishPresence(channel, buildPresencePayload({
              guestKey,
              displayName: guestLabel,
              resolved: resolvedLink,
              readiness: afterMicrophone,
              joinedAt,
            }));

            const camera = await requestDevicePermission("camera");
            if (!active) return;

            const finalReadiness: GuestReadiness = {
              microphone,
              camera,
              overall: deriveOverallReadiness({
                microphone,
                camera,
                overall: "pending",
              }),
            };

            setReadiness(finalReadiness);
            await publishPresence(channel, buildPresencePayload({
              guestKey,
              displayName: guestLabel,
              resolved: resolvedLink,
              readiness: finalReadiness,
              joinedAt,
            }));

            if (!active) return;

            setPhase("waiting");
            setStatusMessage(
              finalReadiness.overall === "ready"
                ? "Waiting for host. Bellows sees your devices and your join state is live."
                : "Waiting for host. Bellows connected you, but device permissions still need attention.",
            );
            syncPresenceCount();
          } catch (error) {
            if (!active) return;
            setPhase("error");
            setErrorMessage(getErrorMessage(error, "Bellows guest presence could not be published."));
            setStatusMessage("Bellows could not finish guest entry.");
          }
        })();
        return;
      }

      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        setPhase("error");
        setErrorMessage("Bellows could not connect to the live session presence channel.");
        setStatusMessage("Bellows guest entry stopped before the waiting room.");
      }
    });

    return () => {
      active = false;
      void channel.unsubscribe();
    };
  }, [guestKey, guestLabel, resolvedLink, usedCache]);

  return (
    <div className="bellows-join">
      <header className="bellows-join__header">
        <div>
          <div className="bellows-join__eyebrow">Bellows Guest Surface</div>
          <h1 className="bellows-join__title">Bellows Join</h1>
          <p className="bellows-join__subtitle">
            Public guest entry validates access first, then goes live on Bellows session presence.
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
                Bellows guest flow: validate token, attach presence, request devices, publish readiness, wait.
              </p>
            </div>
            <span className="bellows-join__pill">
              {resolvedLink ? describeRoleCode(resolvedLink.roleCode) : "Awaiting role"}
            </span>
          </div>

          <div className="bellows-join__status-banner" data-state={statusTone}>
            <strong>{buildStatusHeading(phase)}</strong>
            <span>{errorMessage ?? statusMessage}</span>
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
              <span>Guests Seen</span>
              <strong>{presenceCount}</strong>
            </article>
            <article className="bellows-join__state-card">
              <span>Microphone</span>
              <strong>{describeReadinessState(readiness.microphone)}</strong>
            </article>
            <article className="bellows-join__state-card">
              <span>Camera</span>
              <strong>{describeReadinessState(readiness.camera)}</strong>
            </article>
            <article className="bellows-join__state-card">
              <span>Waiting Room</span>
              <strong>{phase === "waiting" ? "Waiting for host" : "Booting"}</strong>
            </article>
          </div>
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
            <li className="bellows-join__step" data-state={channelName ? "done" : phase === "connecting" ? "active" : "pending"}>
              <strong>Connect presence</strong>
              <span>Attach to the Bellows Realtime session before device prompts slow the flow down.</span>
            </li>
            <li className="bellows-join__step" data-state={phase === "permissions" ? "active" : phase === "waiting" || readiness.overall === "blocked" ? "done" : "pending"}>
              <strong>Request devices</strong>
              <span>Probe microphone and camera access, then publish readiness updates.</span>
            </li>
            <li className="bellows-join__step" data-state={phase === "waiting" ? "done" : "pending"}>
              <strong>Wait for host</strong>
              <span>Hold in the guest waiting state until host-side admission behavior arrives.</span>
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
              <span>Lifecycle</span>
              <strong>{resolvedLink?.lifecycleState ?? "Pending"}</strong>
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
          </ul>
        </section>
      </main>
    </div>
  );
}
