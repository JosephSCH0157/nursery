import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const baseUrl = process.env.ANVIL_BROWSER_BASE_URL || 'http://localhost:5173';
const workspaceId = '11111111-1111-4111-8111-111111111111';
const workpieceId = '22222222-2222-4222-8222-222222222222';
const authorityId = '33333333-3333-4333-8333-333333333333';
const completionId = '44444444-4444-4444-8444-444444444444';
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined;
const browser = await chromium.launch({
  headless: true,
  executablePath: chromiumPath,
  args: [
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
    '--autoplay-policy=no-user-gesture-required',
  ],
});

const context = await browser.newContext({ acceptDownloads: true });
const page = await context.newPage();
const authorityCalls = [];
const localBootReads = [];
const blockedNonLocalRequests = [];
const forbiddenAuthorityRequests = [];
const mediaRecorderEvents = [];
const browserMessages = [];
page.on('console', (message) => browserMessages.push(`${message.type()}: ${message.text()}`));
page.on('pageerror', (error) => browserMessages.push(`pageerror: ${error.message}`));

const localBundle = await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  write: false,
  plugins: [{
    name: 'local-recording-authority',
    setup(builder) {
      builder.onResolve({ filter: /tongs-user-auth$/ }, () => ({ path: 'local-recording-authority', namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
        loader: 'js',
        contents: `
          export class ForgeUserAuthorizationError extends Error {}
          export const resolveForgeUserAccessToken = async () => null;
          export const appendForgeUserAuthorization = async (headers) => {
            const result = new Headers(headers || {});
            result.set('x-forge-user-authorization', 'Bearer local-disposable-fixture');
            return result;
          };
          export const fetchAuthenticatedTongs = async (input, init = {}) => fetch(input, {
            ...init,
            headers: await appendForgeUserAuthorization(init.headers),
            credentials: 'same-origin',
            redirect: 'error',
          });
        `,
      }));
    },
  }],
});

await page.addInitScript(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('tp_rec_settings_v1', JSON.stringify({
    mode: 'single',
    selected: ['core'],
    recordingMode: 'av',
    enabled: { obs: false },
  }));
  window.__TP_SILENCE_OBS_LOGS = true;
  window.__armCertificationDestinationEvents = [];
  window.addEventListener('tp:recording:destination-status', (event) => {
    window.__armCertificationDestinationEvents.push(event.detail);
  });
  window.__tpVerifyRecordedArtifact = async (blob) => ({
    hasAudioStream: blob.size > 0,
    audioDurationSec: 1,
    channels: 1,
    sampleRate: 48000,
    nearSilent: false,
    rmsDbfs: -18,
    hasVideoStream: blob.type.startsWith('video/'),
  });
  const NativeMediaRecorder = window.MediaRecorder;
  window.MediaRecorder = class TrackedMediaRecorder extends NativeMediaRecorder {
    constructor(...args) {
      super(...args);
      window.__armCertificationMediaRecorderEvents ||= [];
      window.__armCertificationMediaRecorderEvents.push('constructed');
      this.addEventListener('start', () => window.__armCertificationMediaRecorderEvents.push('start'));
      this.addEventListener('stop', () => window.__armCertificationMediaRecorderEvents.push('stop'));
      this.addEventListener('dataavailable', (event) => {
        if (event.data?.size > 0) window.__armCertificationMediaRecorderEvents.push('data');
      });
    }
  };
});

await page.route('**/*', async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (!local) {
    blockedNonLocalRequests.push(request.url());
    if (/supabase|\/tongs\/|whisper|speech-to-text/i.test(request.url())) {
      forbiddenAuthorityRequests.push(request.url());
    }
    await route.abort('blockedbyclient');
    return;
  }
  if (url.pathname === '/anvil/dist/index.js') {
    await route.fulfill({ status: 200, contentType: 'text/javascript', body: '/* local certification replaces this bundle */' });
    return;
  }
  if (!url.pathname.startsWith('/tongs/')) {
    await route.continue();
    return;
  }

  if (request.method() === 'GET') {
    localBootReads.push(url.pathname);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: [] }) });
    return;
  }
  authorityCalls.push({ url: url.pathname, method: request.method() });
  const requestBody = request.postDataJSON?.() || {};
  let body;
  if (url.pathname.endsWith('/recording-capture-authority')) {
    body = { ok: true, data: {
      outcome: 'established',
      capture_authority: {
        id: authorityId,
        workspace_id: workspaceId,
        workpiece_id: workpieceId,
        recording_session_id: null,
        ready_transition_id: null,
        script_binding_kind: 'none',
        script_path: null,
        script_revision: null,
        script_hash: null,
        script_approval_id: null,
        script_approval_revision: null,
        script_approval_hash: null,
        operation_key: requestBody.operation_key,
        provenance: 'live_established',
      },
      venue_execution: { execution_id: requestBody.capture_session_id },
    } };
  } else if (url.pathname.endsWith('/commit-file')) {
    const bytes = Buffer.from(String(requestBody.bytes_base64 || ''), 'base64');
    assert.ok(bytes.length > 0, 'canonical fixture received empty MediaRecorder bytes');
    body = { ok: true, data: {
      workpiece_id: workpieceId,
      path: requestBody.path,
      hash: createHash('sha256').update(bytes).digest('hex'),
      file_row: { revision: 1 },
    } };
  } else if (url.pathname.endsWith('/recording-completion-v3')) {
    body = { ok: true, data: { outcome: 'saved', completion: { id: completionId } } };
  } else {
    throw new Error(`Unexpected local Tongs request: ${request.method()} ${url.pathname}`);
  }
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
});

try {
  const url = `${baseUrl}/anvil/teleprompter_pro.html?ci=1&workspace_id=${workspaceId}&workpiece_id=${workpieceId}&scroll_mode=timed`;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.addScriptTag({ type: 'module', content: localBundle.outputFiles[0].text });
  await page.waitForFunction(() => Boolean(window.__tpRecordingArm));

  await page.locator('#armRecordingBtn').click();
  await page.waitForFunction(() => window.__tpRecordingArm?.getSnapshot?.().state === 'armed');
  assert.equal(await page.locator('#armRecordingBtn').textContent(), 'Disarm Recording');

  await page.locator('#settingsBtn').click();
  await page.locator('[data-settings-tab="recording"]').click();
  await page.locator('#startRecBtn').click();
  await page.waitForFunction(() => window.__tpRecordingArm?.getSnapshot?.().state === 'recording');
  assert.equal(await page.locator('#armRecordingBtn').textContent(), 'Recording Active');
  assert.equal(await page.locator('#armRecordingBtn').isDisabled(), true);
  assert.equal(await page.evaluate(() => window.__tpRecordingArm.disarm()), false);

  await page.waitForTimeout(1500);
  await page.locator('#stopRecBtn').click();
  await page.waitForFunction(() => window.__tpRecordingArm?.getSnapshot?.().state === 'armed');
  try {
    await page.waitForFunction(() => document.body.textContent?.includes('Keep this take for editing?'));
  } catch (error) {
    const diagnostics = await page.evaluate(() => ({
      text: document.body.textContent?.slice(-1500),
      destinations: window.__armCertificationDestinationEvents || [],
      mediaRecorderEvents: window.__armCertificationMediaRecorderEvents || [],
    }));
    throw new Error(`Decision dialog did not appear: ${JSON.stringify({ authorityCalls, blockedNonLocalRequests, forbiddenAuthorityRequests, diagnostics, browserMessages: browserMessages.slice(-40) })}`, { cause: error });
  }

  const afterStop = await page.evaluate(() => ({
    armState: window.__tpRecordingArm?.getSnapshot?.().state,
    cameraActive: window.__tpCamera?.isActive?.() === true,
    micOpen: window.__tpMic?.isOpen?.() === true,
    mediaRecorderEvents: window.__armCertificationMediaRecorderEvents || [],
    speechState: window.__tpCanonicalAsrAuthority || null,
    asrLifecycle: window.__tpAsrLifecycleLast || null,
  }));
  mediaRecorderEvents.push(...afterStop.mediaRecorderEvents);
  assert.equal(afterStop.armState, 'armed');
  assert.equal(afterStop.cameraActive, true);
  assert.equal(afterStop.micOpen, true);
  assert.deepEqual(afterStop.mediaRecorderEvents.filter((event) => event === 'constructed' || event === 'start' || event === 'stop'), ['constructed', 'start', 'stop']);
  assert.equal(afterStop.asrLifecycle?.asrArmed === true, false);
  assert.equal(afterStop.asrLifecycle?.speechRunningActual === true, false);

  await page.evaluate(() => document.getElementById('armRecordingBtn')?.click());
  await page.waitForFunction(() => window.__tpRecordingArm?.getSnapshot?.().state === 'idle');
  const afterDisarm = await page.evaluate(() => ({
    cameraActive: window.__tpCamera?.isActive?.() === true,
    micOpen: window.__tpMic?.isOpen?.() === true,
  }));
  assert.deepEqual(afterDisarm, { cameraActive: false, micOpen: false });
  assert.equal(forbiddenAuthorityRequests.length, 0, `hosted authority request attempted: ${forbiddenAuthorityRequests.join(', ')}`);
  assert.deepEqual(authorityCalls.map((call) => call.url.replace(/^.*\/workpieces\/[^/]+/, '')), [
    '/recording-capture-authority',
    '/commit-file',
    '/recording-completion-v3',
  ]);
  assert.equal(authorityCalls.some((call) => /asr|whisper|speech/i.test(call.url)), false);

  process.stdout.write(`${JSON.stringify({
    ok: true,
    sequence: ['armed', 'recording', 'armed', 'idle'],
    mediaRecorderEvents,
    authorityCalls,
    localBootReads,
    blockedNonLocalRequests,
    forbiddenAuthorityRequests,
    canonicalAuthority: 'disposable-route-fixture',
  }, null, 2)}\n`);
} finally {
  await context.close();
  await browser.close();
}
