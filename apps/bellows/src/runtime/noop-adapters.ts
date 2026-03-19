import type { BellowsRuntimeAdapters } from "./adapters.js";

const noop = async () => {};

export function createBellowsNoopRuntimeAdapters(
  overrides: Partial<BellowsRuntimeAdapters> = {},
): BellowsRuntimeAdapters {
  return {
    studioShell: {
      runPreflightChecks: noop,
      startCountdown: noop,
    },
    capture: {
      establishTimebase: noop,
      emitSyncMarker: noop,
      startLocalRecording: noop,
      finalizeLocalSegments: noop,
    },
    broadcast: {
      startBroadcast: noop,
      stopBroadcast: noop,
    },
    persistence: {
      resumePendingUploads: noop,
      verifyIntegrity: noop,
      assembleManifest: noop,
      sealSessionRecord: noop,
    },
    signaling: {
      generateInviteLinks: noop,
      promoteCoHost: noop,
      enterEngineStewardship: noop,
    },
    ...overrides,
  };
}
