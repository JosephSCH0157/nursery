import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';

// Only capture/encoding/file I/O are real. All cloud/AI boundaries are isolated
// synthetic substitutes; this test never contacts Supabase or a paid provider.
const authority = `export const beginRecordingCaptureSession = () => 'synthetic-capture';
export const ensureRecordingCaptureTarget = async () => ({ ok: true, captureAuthority: { id: 'synthetic', captureSessionId: 'synthetic-capture' } });
export const commitRecordingBytesToTongs = async () => ({ ok: false, reason: 'isolated_cloud_unavailable' });
export const commitRecordingFileToTongs = async () => ({ ok: false, reason: 'isolated_cloud_unavailable' });
export const commitRecordingJsonArtifactToTongs = async () => ({ ok: false });
export const readPendingRecordingDecisions = async () => [];
export const transitionRecordingCompleted = async () => ({ ok: false });
export const transitionRecordingDiscarded = async () => ({ ok: false });
export const transitionRecordingKept = async () => ({ ok: false });`;
const stubs = {
  'workpiece-commit': authority,
  'workpiece-context': "export const resolveActiveWorkpieceId = () => 'synthetic-workpiece';",
  'scripts-store': 'export const ScriptStore = { getAll: () => [] };',
  'speech-loader': 'export const startSpeechBackendForSession = async () => false; export const stopSpeechBackendForSession = () => {};',
  'recordingTranscriptController': 'export class RecordingTranscriptController { async startSession() {} async stopSession() { return null; } }',
  'recording-decision-dialog': 'export const hideRecordingFinalizeIndicator = () => {}; export const showRecordingFinalizeIndicator = () => {}; export const isRecordingDecisionPending = () => false; export const showRecordingDecisionDialog = async () => {};',
  'recording-dir': 'export {};',
};
const bundled = await build({
  stdin: { contents: `import './src/recording/local-auto'; export { setSettings } from './recorders-core'; export * from './src/recording/recorderRegistry'; export { initRecorderBackends } from './src/recording/registerRecorders';`, resolveDir: process.cwd() },
  bundle: true, format: 'iife', globalName: 'CaptureTest', platform: 'browser', write: false,
  plugins: [{ name: 'isolated-recording-boundaries', setup(builder) {
    builder.onResolve({ filter: /.*/ }, (args) => {
      const name = args.path.split('/').pop();
      if (name in stubs) return { path: name, namespace: 'isolated' };
    });
    builder.onLoad({ filter: /.*/, namespace: 'isolated' }, (args) => ({ contents: stubs[args.path], loader: 'js' }));
  } }],
});
const browser = await chromium.launch({ headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
try {
  const context = await browser.newContext({ permissions: ['camera', 'microphone'] });
  const page = await context.newPage();
  await page.route('**/*', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Isolated recording</title>' }));
  await page.goto('http://127.0.0.1:8091/');
  await page.addScriptTag({ content: bundled.outputFiles[0].text });
  const result = await page.evaluate(async () => {
    const folder = await (await navigator.storage.getDirectory()).getDirectoryHandle('Hearth-recordings', { create: true });
    window.__tpRecDir = { init: async () => {}, get: () => folder, isManaged: () => true, localPersistenceExpected: () => true };
    const destinations = [];
    window.addEventListener('tp:recording:destination-status', (event) => destinations.push(event.detail));
    CaptureTest.setSettings({ mode: 'single', selected: ['core'], recordingMode: 'av' });
    CaptureTest.initRecorderBackends();
    await CaptureTest.startSessionRecording({ engine: 'core' });
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await CaptureTest.stopSessionRecording();
    const files = [];
    for await (const entry of folder.values()) if (entry.kind === 'file') files.push(await entry.getFile());
    const file = files[0];
    const video = document.createElement('video'); video.muted = true; video.src = URL.createObjectURL(file); document.body.appendChild(video);
    await new Promise((resolve, reject) => { video.onloadeddata = resolve; video.onerror = reject; });
    await video.play();
    await new Promise((resolve) => setTimeout(resolve, 400));
    const stream = video.captureStream();
    const playable = { width: video.videoWidth, height: video.videoHeight, currentTime: video.currentTime,
      audio: stream.getAudioTracks().length, video: stream.getVideoTracks().length };
    video.pause(); stream.getTracks().forEach((track) => track.stop());
    return { fileCount: files.length, bytes: file.size, playable, recording: CaptureTest.isSessionRecording(), destination: destinations.at(-1) };
  });
  assert.equal(result.fileCount, 1); assert.ok(result.bytes > 1000);
  assert.ok(result.playable.width > 0 && result.playable.height > 0 && result.playable.currentTime > 0);
  assert.equal(result.playable.audio, 1); assert.equal(result.playable.video, 1);
  assert.equal(result.recording, false);
  assert.equal(result.destination.configuredFolder.state, 'succeeded');
  assert.equal(result.destination.cloudUpload.state, 'failed');
  assert.equal(result.destination.browserDownload.state, 'skipped');
  console.log(JSON.stringify({ test: 'synthetic-core-av-local-finalization-playback', ...result }));
} finally { await browser.close(); }
