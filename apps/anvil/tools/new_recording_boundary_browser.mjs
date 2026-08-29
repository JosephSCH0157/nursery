import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const bundled = await build({
  entryPoints: ['src/features/new-recording-workpiece.ts'],
  bundle: true,
  format: 'iife',
  globalName: 'AnvilBoundary',
  platform: 'browser',
  write: false,
  plugins: [{
    name: 'boundary-auth-stub',
    setup(builder) {
      builder.onResolve({ filter: /forge\/tongs-user-auth$/ }, () => ({ path: 'boundary-auth', namespace: 'boundary' }));
      builder.onLoad({ filter: /.*/, namespace: 'boundary' }, () => ({
        contents: 'export const fetchAuthenticatedTongs = (...args) => window.__boundaryFetch(...args);',
        loader: 'js',
      }));
    },
  }],
});

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.route('http://127.0.0.1:8091/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Anvil boundary</title>' }));
  await page.goto('http://127.0.0.1:8091/teleprompter_pro.html?workspace_id=11111111-1111-4111-8111-111111111111');
  await page.setContent('<input id="scriptTitle"><textarea id="editor"></textarea><main id="viewer" style="height:10px;overflow:auto"><div id="script" style="height:1000px"></div></main><button id="scriptRefreshBtn"></button>');
  await page.addScriptTag({ content: bundled.outputFiles[0].text });
  const result = await page.evaluate(async () => {
    const calls = [];
    window.__boundaryFetch = async (...args) => {
      calls.push(args);
      return { ok: true, json: async () => ({ data: { outcome: 'created', workpiece_id: '22222222-2222-4222-8222-222222222222' } }) };
    };
    editor.value = 'Temporary pasted teleprompter text';
    script.innerHTML = '<p>Temporary pasted teleprompter text</p>';
    scriptTitle.value = 'Local title';
    viewer.scrollTop = 175;
    window.__forgeCanonicalScriptIdentity = { workpieceId: '33333333-3333-4333-8333-333333333333' };
    window.__forgeCanonicalReadyScript = { workpieceId: '33333333-3333-4333-8333-333333333333' };
    const created = await AnvilBoundary.createNewRecordingWorkpiece('Browser boundary', 'recording-workpiece:anvil:browser-boundary');
    const body = JSON.parse(calls[0][1].body);
    return {
      created,
      editorValue: editor.value,
      renderedText: script.textContent,
      title: scriptTitle.value,
      scrollTop: viewer.scrollTop,
      routeWorkpiece: new URL(location.href).searchParams.get('workpiece_id'),
      canonicalScriptIdentityPresent: '__forgeCanonicalScriptIdentity' in window,
      canonicalReadyPresent: '__forgeCanonicalReadyScript' in window,
      requestCount: calls.length,
      requestKeys: Object.keys(body).sort(),
    };
  });
  assert.equal(result.created.outcome, 'created');
  assert.equal(result.editorValue, 'Temporary pasted teleprompter text');
  assert.equal(result.renderedText, 'Temporary pasted teleprompter text');
  assert.equal(result.title, 'Local title');
  assert.equal(result.scrollTop, 175);
  assert.equal(result.routeWorkpiece, '22222222-2222-4222-8222-222222222222');
  assert.equal(result.canonicalScriptIdentityPresent, false);
  assert.equal(result.canonicalReadyPresent, false);
  assert.equal(result.requestCount, 1);
  assert.deepEqual(result.requestKeys, ['operation_key', 'origin_venue', 'title']);

  const existing = await page.evaluate(() => {
    const before = window.__boundaryFetch;
    AnvilBoundary.initNewRecordingWorkpieceEntry();
    return { button: Boolean(document.getElementById('newRecordingWorkpieceBtn')), fetchUnchanged: before === window.__boundaryFetch };
  });
  assert.deepEqual(existing, { button: true, fetchUnchanged: true });
  process.stdout.write('Anvil recording-workpiece Chromium boundary verification passed.\n');
} finally {
  await browser.close();
}
