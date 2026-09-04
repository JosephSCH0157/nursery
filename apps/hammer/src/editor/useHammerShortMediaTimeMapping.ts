import { useCallback, useMemo } from "react";
import { activeMediaTimeToTransportTime, transportTimeToActiveMediaTime, type HammerPackagingTransport } from "./hammerPackagingTransport";
import { hammerShortOutputTimeToSourceTime, hammerShortSourceTimeToOutputTime, normalizeHammerShortTimingMap } from "./hammerShortTimingMap";

export function useHammerShortMediaTimeMapping(transport: HammerPackagingTransport, timingAuthority: unknown) {
  const timingMap = useMemo(() => normalizeHammerShortTimingMap(timingAuthority), [timingAuthority]);
  const resolveMediaTimeForTransportTime = useCallback((transportTimeSec: number) => {
    const activeTime = transportTimeToActiveMediaTime({ transport, timeSec: transportTimeSec });
    return transport.phase === "composition" && timingMap ? hammerShortOutputTimeToSourceTime(timingMap, activeTime) : activeTime;
  }, [timingMap, transport]);
  const resolveTransportTimeForMediaTime = useCallback((mediaTimeSec: number) => activeMediaTimeToTransportTime({
    transport,
    timeSec: transport.phase === "composition" && timingMap ? hammerShortSourceTimeToOutputTime(timingMap, mediaTimeSec) : mediaTimeSec,
  }), [timingMap, transport]);
  return { resolveMediaTimeForTransportTime, resolveTransportTimeForMediaTime };
}
