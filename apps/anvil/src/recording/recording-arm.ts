import { isSessionRecording } from './recorderRegistry';
import {
  readSavedRecordingConfiguration,
  type SavedRecordingConfiguration,
} from './recording-settings';
import { setRecorderEnabled } from '../state/recorder-settings';

export type RecordingArmState = 'idle' | 'arming' | 'armed' | 'recording' | 'error';
export type RecordingArmFailure =
  | 'configuration_missing'
  | 'configuration_invalid'
  | 'media_unsupported'
  | 'microphone_missing'
  | 'camera_missing'
  | 'microphone_denied'
  | 'camera_denied'
  | 'microphone_failed'
  | 'camera_failed'
  | 'obs_unavailable'
  | 'obs_failed'
  | 'obs_disconnected';

export type RecordingArmSnapshot = {
  state: RecordingArmState;
  configuration: SavedRecordingConfiguration | null;
  failure: RecordingArmFailure | null;
};

type MicApi = {
  isOpen?: () => boolean;
  requestMic?: (deviceId?: string) => Promise<MediaStream | void>;
  releaseMic?: () => Promise<void> | void;
};

type CameraApi = {
  isActive?: () => boolean;
  setDevice?: (deviceId: string | null) => Promise<boolean> | boolean;
  start?: () => Promise<boolean> | boolean;
  stop?: () => void;
  getLastStartFailure?: () => 'permission_denied' | 'failed' | null;
};

type ObsApi = {
  armed?: () => boolean;
  setArmed?: (on: boolean) => void | boolean | Promise<void | boolean>;
  maybeConnect?: () => void | boolean | Promise<void | boolean>;
  disconnect?: () => void | Promise<void>;
  on?: (event: string, callback: () => void) => void | (() => void);
};

export type RecordingArmDependencies = {
  readConfiguration: typeof readSavedRecordingConfiguration;
  enumerateDevices: () => Promise<MediaDeviceInfo[]>;
  getMicApi: () => MicApi | null;
  getCameraApi: () => CameraApi | null;
  getObsApi: () => ObsApi | null;
  setObsEnabled: (enabled: boolean) => void;
  readSavedMicDeviceId: () => string | null;
  readSavedCameraDeviceId: () => string | null;
  isRecording: () => boolean;
  dispatch: (snapshot: RecordingArmSnapshot) => void;
};

function permissionDenied(error: unknown): boolean {
  const name = String((error as { name?: unknown } | null)?.name || '');
  return name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError';
}

function defaultDependencies(): RecordingArmDependencies {
  const readStored = (key: string): string | null => {
    try {
      const value = String(window.localStorage.getItem(key) || '').trim();
      return value || null;
    } catch {
      return null;
    }
  };
  return {
    readConfiguration: readSavedRecordingConfiguration,
    enumerateDevices: async () => {
      if (!navigator.mediaDevices?.enumerateDevices) throw new Error('media_unsupported');
      return Array.from(await navigator.mediaDevices.enumerateDevices());
    },
    getMicApi: () => (window as any).__tpMic || null,
    getCameraApi: () => (window as any).__tpCamera || null,
    getObsApi: () => {
      const controller = (window as any).__tpObs;
      if (!controller) return null;
      const events = (window as any).__obsBridge;
      return {
        armed: typeof controller.armed === 'function' ? () => controller.armed() : undefined,
        setArmed: typeof controller.setArmed === 'function' ? (on) => controller.setArmed(on) : undefined,
        maybeConnect: typeof controller.maybeConnect === 'function' ? () => controller.maybeConnect() : undefined,
        disconnect: typeof controller.disconnect === 'function'
          ? () => controller.disconnect()
          : typeof events?.disconnect === 'function'
            ? () => events.disconnect()
            : undefined,
        on: typeof events?.on === 'function' ? (event, callback) => events.on(event, callback) : undefined,
      };
    },
    setObsEnabled: (enabled) => setRecorderEnabled('obs', enabled),
    readSavedMicDeviceId: () => readStored('tp_mic_device_v1'),
    readSavedCameraDeviceId: () => readStored('tp_camera_device_v1'),
    isRecording: isSessionRecording,
    dispatch: (snapshot) => {
      window.dispatchEvent(new CustomEvent('tp:recording:arm-state', { detail: snapshot }));
    },
  };
}

export function createRecordingArmController(overrides: Partial<RecordingArmDependencies> = {}) {
  const deps = { ...defaultDependencies(), ...overrides };
  let snapshot: RecordingArmSnapshot = { state: 'idle', configuration: null, failure: null };
  let ownsMic = false;
  let ownsCamera = false;
  let ownsObsArm = false;
  let removeObsDisconnectListener: (() => void) | null = null;
  const listeners = new Set<(next: RecordingArmSnapshot) => void>();

  const publish = (next: RecordingArmSnapshot) => {
    snapshot = next;
    deps.dispatch({ ...next });
    listeners.forEach((listener) => listener({ ...next }));
  };

  const cleanupOwnedMedia = async () => {
    removeObsDisconnectListener?.();
    removeObsDisconnectListener = null;
    if (ownsObsArm) {
      const obs = deps.getObsApi();
      try { await obs?.setArmed?.(false); } catch {}
      try { await obs?.disconnect?.(); } catch {}
      try { deps.setObsEnabled(false); } catch {}
      ownsObsArm = false;
    }
    if (ownsCamera) {
      try { deps.getCameraApi()?.stop?.(); } catch {}
      ownsCamera = false;
    }
    if (ownsMic) {
      try { await deps.getMicApi()?.releaseMic?.(); } catch {}
      ownsMic = false;
    }
  };

  const fail = async (failure: RecordingArmFailure, configuration: SavedRecordingConfiguration | null) => {
    await cleanupOwnedMedia();
    publish({ state: 'error', configuration, failure });
    return { ok: false as const, failure };
  };

  return {
    getSnapshot: () => ({ ...snapshot }),
    subscribe(listener: (next: RecordingArmSnapshot) => void) {
      listeners.add(listener);
      listener({ ...snapshot });
      return () => listeners.delete(listener);
    },
    async arm() {
      if (snapshot.state === 'armed' || snapshot.state === 'recording') return { ok: true as const };
      const saved = deps.readConfiguration();
      if (!saved.ok) {
        return fail(saved.reason === 'missing' ? 'configuration_missing' : 'configuration_invalid', null);
      }
      const configuration = saved.configuration;
      publish({ state: 'arming', configuration, failure: null });

      // OBS owns its capture devices outside the browser. Arming it must not open
      // browser media or start an OBS recording.
      if (configuration.engine === 'obs') {
        const obs = deps.getObsApi();
        if (!obs?.setArmed || !obs.armed) return fail('obs_unavailable', configuration);
        if (obs.armed()) {
          deps.setObsEnabled(true);
          publish({ state: 'armed', configuration, failure: null });
          return { ok: true as const };
        }
        try {
          deps.setObsEnabled(true);
          const armResult = await obs.setArmed(true);
          if (armResult === false) return fail('obs_failed', configuration);
          ownsObsArm = obs.armed();
          const connectResult = await obs.maybeConnect?.();
          if (connectResult === false || !obs.armed()) return fail('obs_failed', configuration);
          if (obs.on) {
            const cleanup = obs.on('disconnect', () => {
              if (!ownsObsArm || snapshot.configuration?.engine !== 'obs') return;
              ownsObsArm = false;
              publish({ state: 'error', configuration, failure: 'obs_disconnected' });
            });
            if (typeof cleanup === 'function') removeObsDisconnectListener = cleanup;
          }
          publish({ state: 'armed', configuration, failure: null });
          return { ok: true as const };
        } catch {
          return fail('obs_failed', configuration);
        }
      }

      if (!navigator.mediaDevices?.getUserMedia) return fail('media_unsupported', configuration);
      let devices: MediaDeviceInfo[];
      try {
        devices = await deps.enumerateDevices();
      } catch {
        return fail('media_unsupported', configuration);
      }
      const micId = deps.readSavedMicDeviceId();
      const cameraId = deps.readSavedCameraDeviceId();
      if (micId && !devices.some((device) => device.kind === 'audioinput' && device.deviceId === micId)) {
        return fail('microphone_missing', configuration);
      }
      if (
        configuration.mode === 'av'
        && cameraId
        && !devices.some((device) => device.kind === 'videoinput' && device.deviceId === cameraId)
      ) {
        return fail('camera_missing', configuration);
      }

      const mic = deps.getMicApi();
      if (!mic?.requestMic) return fail('microphone_failed', configuration);
      if (!mic.isOpen?.()) {
        try {
          await mic.requestMic(micId || undefined);
          ownsMic = true;
        } catch (error) {
          return fail(permissionDenied(error) ? 'microphone_denied' : 'microphone_failed', configuration);
        }
      }

      if (configuration.mode === 'av') {
        const camera = deps.getCameraApi();
        if (!camera?.start) return fail('camera_failed', configuration);
        if (!camera.isActive?.()) {
          try {
            if (cameraId && camera.setDevice) {
              const selected = await camera.setDevice(cameraId);
              if (selected === false) return fail('camera_failed', configuration);
            }
            const started = await camera.start();
            if (started === false) {
              const failure = camera.getLastStartFailure?.() === 'permission_denied'
                ? 'camera_denied'
                : 'camera_failed';
              return fail(failure, configuration);
            }
            ownsCamera = true;
          } catch (error) {
            return fail(permissionDenied(error) ? 'camera_denied' : 'camera_failed', configuration);
          }
        }
      }

      publish({ state: 'armed', configuration, failure: null });
      return { ok: true as const };
    },
    async disarm() {
      if (deps.isRecording() || snapshot.state === 'recording') return false;
      await cleanupOwnedMedia();
      publish({ state: 'idle', configuration: null, failure: null });
      return true;
    },
    setRecordingActive(active: boolean) {
      if (active) {
        publish({ state: 'recording', configuration: snapshot.configuration, failure: null });
      } else if (snapshot.state === 'recording') {
        publish({
          state: ownsMic || ownsCamera || ownsObsArm || snapshot.configuration?.engine === 'obs' && !!deps.getObsApi()?.armed?.()
            ? 'armed'
            : 'idle',
          configuration: snapshot.configuration,
          failure: null,
        });
      }
    },
  };
}

export type RecordingArmController = ReturnType<typeof createRecordingArmController>;
