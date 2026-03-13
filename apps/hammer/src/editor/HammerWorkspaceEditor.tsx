import { useEffect, useMemo, useRef, useState } from "react";
import type { JSX } from "react";
import type { HammerLaunchContext } from "../../../../packages/contracts/hammer/launch-context.contract";
import TranscriptSeekMock from "../dev/TranscriptSeekMock";
import type { HammerWorkspaceSnapshot } from "./hammerWorkspaceSnapshot";
import {
  buildHammerLaunchContextFromPersistence,
  buildHammerPersistenceSaveRequest,
  loadHammerPersistenceSnapshot,
  readHammerPersistenceTarget,
  saveHammerPersistenceSnapshot,
  upsertHammerPresence,
} from "../persistence/hammerPersistence";

export interface HammerWorkspaceEditorProps {
  launchContext?: HammerLaunchContext;
  routeSearch?: string;
  persistenceMode?: "canonical" | "disabled";
}

const HEARTBEAT_INTERVAL_MS = 30_000;
const SAVE_DEBOUNCE_MS = 400;

function buildTargetKey(workspaceId: string, workpieceId: string): string {
  return `${workspaceId}:${workpieceId}`;
}

export default function HammerWorkspaceEditor(
  props: HammerWorkspaceEditorProps,
): JSX.Element {
  const persistenceMode = props.persistenceMode ?? "disabled";
  const persistenceTarget = useMemo(
    () => (persistenceMode === "canonical"
      ? readHammerPersistenceTarget(props.routeSearch ?? "", props.launchContext)
      : null),
    [persistenceMode, props.launchContext, props.routeSearch],
  );
  const targetKey = persistenceTarget
    ? buildTargetKey(persistenceTarget.workspaceId, persistenceTarget.workpieceId)
    : null;
  const [effectiveLaunchContext, setEffectiveLaunchContext] = useState<HammerLaunchContext | undefined>(
    props.launchContext,
  );
  const [hydrationReady, setHydrationReady] = useState(persistenceMode !== "canonical");
  const [hasCanonicalBasis, setHasCanonicalBasis] = useState(Boolean(props.launchContext));
  const [workspaceSnapshot, setWorkspaceSnapshot] = useState<HammerWorkspaceSnapshot | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const lastSavedPayloadRef = useRef<string | null>(null);

  useEffect(() => {
    lastSavedPayloadRef.current = null;
    setWorkspaceSnapshot(null);
    setEffectiveLaunchContext(props.launchContext);

    if (persistenceMode !== "canonical" || !persistenceTarget) {
      setHydrationReady(true);
      setHasCanonicalBasis(Boolean(props.launchContext));
      return;
    }

    let active = true;
    setHydrationReady(false);
    setHasCanonicalBasis(Boolean(props.launchContext));

    void loadHammerPersistenceSnapshot(persistenceTarget)
      .then((result) => {
        if (!active) return;
        if (result.ok) {
          const hydrated = buildHammerLaunchContextFromPersistence(
            persistenceTarget,
            result.data,
            props.launchContext,
          );
          if (hydrated) {
            setEffectiveLaunchContext(hydrated.launchContext);
            setHasCanonicalBasis(true);
          } else {
            setEffectiveLaunchContext(props.launchContext);
            setHasCanonicalBasis(Boolean(props.launchContext));
          }
        } else {
          setEffectiveLaunchContext(props.launchContext);
          setHasCanonicalBasis(Boolean(props.launchContext));
        }
        setHydrationReady(true);
      })
      .catch(() => {
        if (!active) return;
        setEffectiveLaunchContext(props.launchContext);
        setHasCanonicalBasis(Boolean(props.launchContext));
        setHydrationReady(true);
      });

    return () => {
      active = false;
    };
  }, [persistenceMode, persistenceTarget, props.launchContext]);

  const canPersistCanonicalState = persistenceMode === "canonical"
    && hydrationReady
    && Boolean(persistenceTarget)
    && hasCanonicalBasis;

  useEffect(() => {
    if (!canPersistCanonicalState || !persistenceTarget || !workspaceSnapshot) {
      return;
    }

    const request = buildHammerPersistenceSaveRequest(workspaceSnapshot);
    const payloadKey = JSON.stringify({
      target: persistenceTarget,
      request,
    });
    if (payloadKey === lastSavedPayloadRef.current) {
      return;
    }

    if (saveTimerRef.current != null) {
      window.clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = window.setTimeout(() => {
      void saveHammerPersistenceSnapshot(persistenceTarget, request)
        .then((result) => {
          if (!result.ok) return;
          lastSavedPayloadRef.current = payloadKey;
        })
        .finally(() => {
          saveTimerRef.current = null;
        });
    }, SAVE_DEBOUNCE_MS);

    return () => {
      if (saveTimerRef.current != null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [canPersistCanonicalState, persistenceTarget, targetKey, workspaceSnapshot]);

  useEffect(() => {
    if (!canPersistCanonicalState || !persistenceTarget) return;

    const sessionId = workspaceSnapshot?.sessionId ?? effectiveLaunchContext?.session_id ?? null;
    if (!sessionId) return;

    const sendHeartbeat = () => {
      void upsertHammerPresence(persistenceTarget, {
        mode: "editing",
        session_id: sessionId,
      });
    };

    sendHeartbeat();
    const intervalId = window.setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [
    canPersistCanonicalState,
    effectiveLaunchContext?.session_id,
    persistenceTarget,
    targetKey,
    workspaceSnapshot?.sessionId,
  ]);

  if (persistenceMode === "canonical" && persistenceTarget && !hydrationReady) {
    return (
      <section
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#0f172a",
          color: "#dbe8ff",
          fontFamily: "\"IBM Plex Sans\", sans-serif",
        }}
      >
        <div style={{ display: "grid", gap: 8, textAlign: "center" }}>
          <strong>Loading Hammer workspace…</strong>
          <span style={{ color: "#94a3b8", fontSize: 14 }}>
            Restoring session state and prep artifacts from Tongs.
          </span>
        </div>
      </section>
    );
  }

  return (
    <TranscriptSeekMock
      launchContext={effectiveLaunchContext}
      onWorkspaceSnapshotChange={canPersistCanonicalState ? setWorkspaceSnapshot : undefined}
    />
  );
}
