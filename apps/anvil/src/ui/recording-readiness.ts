import { appStore } from '../state/app-store';
import { getRecorderSettings, subscribeRecorderSettings } from '../state/recorder-settings';
import { getRecordingEngine } from '../recording/recording-settings';
import { isRecordingBusy, isSessionRecording } from '../recording/recorderRegistry';

let disposeCurrent: (() => void) | null = null;
export function initRecordingReadiness(): () => void {
  if (disposeCurrent) return disposeCurrent;
  let error = '';
  const render = () => {
    let engine = 'Recording engine not selected';
    try { engine = getRecordingEngine() === 'obs' ? 'OBS' : 'Core Recorder'; } catch {}
    const arm = (window as any).__tpRecordingArm?.getSnapshot?.();
    const active = isSessionRecording();
    const connection = engine === 'OBS' ? `OBS connection: ${getRecorderSettings().obsStatus}. ` : '';
    const armLabel = arm?.state === 'armed' ? 'armed (capture has not started)' : arm?.state === 'arming' ? 'arming' : arm?.state === 'error' ? `arming failed (${String(arm.failure || 'unavailable').replace(/_/g, ' ')}); check Recording Settings` : 'disarmed';
    const policy = appStore.get('autoRecord')
      ? 'Auto-record is on: starting a script session requests recording when ready.'
      : 'Auto-record is off: starting script scrolling will not start recording. Use Start recording for a manual take.';
    const reason = appStore.get('session.recordReason');
    const skipped: Record<string, string> = {
      'no-camera': 'Camera is not ready. Arm Core Recorder or check camera settings.',
      'no-mic': 'Microphone is not ready. Arm Core Recorder or check microphone settings.',
      'recorder-not-ready': 'The recorder is unavailable. Check Recording Settings.',
      'rehearsal-mode': 'Rehearsal does not automatically record. Use manual Start recording for a take.',
      error: 'Recording readiness could not be established. Check the selected engine in Recording Settings.',
    };
    const sessionBlocked = !active && ['preroll', 'live'].includes(String(appStore.get('session.phase'))) && !appStore.get('session.recordOnLive') ? skipped[String(reason)] || '' : '';
    const message = active
      ? `${engine}: recording active (confirmed).`
      : `${connection}${engine}: ${armLabel}. ${policy}${isRecordingBusy() ? ' Capture status is pending or unconfirmed; check the recorder and use Stop before another take.' : ''}`;
    const text = [message, error ? `Recording could not proceed: ${error}` : sessionBlocked].filter(Boolean).join('\n');
    document.querySelectorAll<HTMLElement>('[data-recording-readiness]').forEach((element) => {
      if (element.textContent !== text) element.textContent = text;
      element.dataset.state = error || sessionBlocked ? 'error' : active ? 'recording' : 'ready';
    });
  };
  const onError = (event: Event) => { error = String((event as CustomEvent).detail?.message || 'Check Recording Settings.'); render(); };
  const onState = () => { if (isSessionRecording()) error = ''; render(); };
  const events: Array<[string, EventListener]> = [
    ['tp:recording:error', onError], ['tp:recording:state', onState],
    ['tp:recording:arm-state', render], ['tp:recording-settings:changed', render],
  ];
  events.forEach(([name, listener]) => window.addEventListener(name, listener));
  const off = [subscribeRecorderSettings(render), ...(['autoRecord', 'session.phase', 'session.recordReason', 'session.recordOnLive'] as const).map((key) => appStore.subscribe(key, render))];
  const observer = new MutationObserver(render);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  render();
  disposeCurrent = () => { observer.disconnect(); off.forEach((fn) => fn()); events.forEach(([name, listener]) => window.removeEventListener(name, listener)); disposeCurrent = null; };
  return disposeCurrent;
}
