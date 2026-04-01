import { useCallback, useEffect, useRef, useState } from "react";

type AckState = Record<string, boolean>;

export function useClipboardButtonAcks(durationMs = 800) {
  const [ackState, setAckState] = useState<AckState>({});
  const timersRef = useRef<Record<string, number>>({});

  const acknowledgeCopy = useCallback((id: string) => {
    if (!id) return;
    setAckState((prev) => ({ ...prev, [id]: true }));
    const currentTimer = timersRef.current[id];
    if (currentTimer) {
      window.clearTimeout(currentTimer);
    }
    timersRef.current[id] = window.setTimeout(() => {
      setAckState((prev) => {
        if (!prev[id]) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
      delete timersRef.current[id];
    }, Math.max(200, durationMs));
  }, [durationMs]);

  const isCopyAcknowledged = useCallback((id: string) => Boolean(ackState[id]), [ackState]);

  useEffect(() => () => {
    for (const timerId of Object.values(timersRef.current)) {
      window.clearTimeout(timerId);
    }
    timersRef.current = {};
  }, []);

  return {
    acknowledgeCopy,
    isCopyAcknowledged,
  };
}
