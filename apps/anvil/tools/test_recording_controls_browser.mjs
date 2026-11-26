import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { chromium } from 'playwright';

// Isolated UI contract: synthetic OBS/backend only; no cloud, hardware or paid calls.
const bundled = await build({ stdin: { resolveDir: process.cwd(), contents: `
export { appStore } from './src/state/app-store';
export { setSettings } from './recorders-core';
export { setObsStatus, setRecorderEnabled } from './src/state/recorder-settings';
export * from './src/recording/recorderRegistry';
export { createStartOnPlay } from './src/recording/startOnPlay';
export { initRecordingArmControl } from './src/features/recording-arm-control';
export { initRecordingReadiness } from './src/ui/recording-readiness';
export { initRecordingDestinationWarning } from './src/ui/recording-destination-warning';
export { bindObsStatusPills } from './src/ui/obs-status-bind';
export { wireRecordButtons } from './src/ui/recordButtons';
` }, bundle: true, format: 'iife', globalName: 'ControlsTest', platform: 'browser', write: false });
const html = await readFile('teleprompter_pro.html', 'utf8');
const header = '<div class="topbar">' + html.split('<div class="topbar">')[1].split('\n</div>')[0] + '</div>';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.route('**/*', (route) => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: '<!doctype html><meta charset="utf-8"><title>Recording controls fixture</title>' + header }));
  await page.goto('http://127.0.0.1:8092/');
  await page.addStyleTag({ content: await readFile('teleprompter_pro.css', 'utf8') });
  await page.addScriptTag({ content: bundled.outputFiles[0].text });
  await page.evaluate(() => {
    const api = ControlsTest; window.__tpStore = api.appStore;
    api.setSettings({ mode: 'single', selected: ['obs'], recordingMode: 'av' });
    api.appStore.set('autoRecord', false);
    let armed = false; window.fixtureConnected = true; window.fixtureStarts = 0; window.fixtureStops = 0; window.fixtureMediaRequests = 0;
    window.__tpObs = window.__obsBridge = {
      armed: () => armed, setArmed: (on) => { armed = on; return true; },
      isConnected: () => window.fixtureConnected, maybeConnect: async () => window.fixtureConnected, on: () => () => {},
    };
    window.__tpMic = { requestMic: async () => { window.fixtureMediaRequests++; throw Error('OBS must not request browser media'); } };
    window.__tpCamera = { start: () => { window.fixtureMediaRequests++; throw Error('OBS must not request browser media'); } };
    api.registerRecorder({ id: 'obs', label: 'OBS', isAvailable: async () => window.fixtureConnected, start: async () => { window.fixtureStarts++; }, stop: async () => { window.fixtureStops++; } });
    api.initRecordingArmControl(); api.initRecordingReadiness(); api.initRecordingDestinationWarning(); api.bindObsStatusPills(); api.wireRecordButtons(api.appStore);
    window.fixturePlay = api.createStartOnPlay(api.appStore);
    api.setRecorderEnabled('obs', true);
  });
  for (const [state, label] of [['disconnected', 'Disconnected'], ['connecting', 'Connecting…'], ['connected', 'Connected'], ['error', 'Error']]) {
    await page.evaluate((state) => ControlsTest.setObsStatus(state), state);
    assert.match(await page.locator('#obsChip').innerText(), new RegExp(label));
    assert.equal(await page.locator('#obsChip').isVisible(), true);
  }
  await page.evaluate(() => ControlsTest.setObsStatus('connected'));
  const box = await page.locator('#obsChip').boundingBox();
  assert.ok(box && box.x >= 0 && box.x + box.width <= 1280 && box.y < 160, 'OBS pill must be visible in the upper-right controls viewport');
  await page.locator('#armRecordingBtn').click();
  await page.waitForFunction(() => document.getElementById('armRecordingBtn').textContent === 'Disarm Recording');
  await page.evaluate(() => window.fixturePlay.onSessionStart());
  assert.equal(await page.evaluate(() => window.fixtureStarts), 0);
  assert.match(await page.locator('[data-recording-readiness]').innerText(), /starting script scrolling will not start recording/);
  await page.locator('#toolbarStartRecBtn').click();
  await page.waitForFunction(() => ControlsTest.isSessionRecording());
  await page.locator('#toolbarStopRecBtn').click();
  await page.waitForFunction(() => !ControlsTest.isRecordingBusy());
  await page.evaluate(async () => { ControlsTest.appStore.set('autoRecord', true); await window.fixturePlay.onSessionStart(); await window.fixturePlay.onSessionStop(); });
  assert.equal(await page.evaluate(() => window.fixtureStarts), 2); assert.equal(await page.evaluate(() => window.fixtureStops), 2);
  assert.equal(await page.evaluate(() => window.fixtureMediaRequests), 0);
  await page.locator('#armRecordingBtn').click();
  await page.waitForFunction(() => document.getElementById('armRecordingBtn').textContent === 'Arm Recording');
  await page.evaluate(() => { window.fixtureConnected = false; ControlsTest.setObsStatus('disconnected'); });
  await page.locator('#toolbarStartRecBtn').click();
  await page.waitForFunction(() => document.querySelector('[data-recording-readiness]').textContent.includes('Recording could not proceed'));
  await page.screenshot({ path: '../../.git/forge-anvil-controls-20261126/recording-controls.png' });
  console.log(JSON.stringify({ test: 'recording-controls-real-header', pillBox: box, manualAndAutomaticTakes: 2, browserMediaRequests: 0, persistentFailure: await page.locator('[data-recording-readiness]').innerText() }));
} finally { await browser.close(); }
