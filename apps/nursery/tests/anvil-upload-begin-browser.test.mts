import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { recordingFixture, ids, silentWav } from '../../../packages/tongs/tests/fixtures/recording-upload.mjs';

const requireAnvil = createRequire(new URL('../../anvil/package.json', import.meta.url));
const { build } = requireAnvil('esbuild');
type ImportWindow = Window & {
  __tpObsImport?: { retryWithFilePicker?: () => Promise<void> };
  importEvents: { phase: string }[];
};

test('real Anvil finished-file import reaches Tongs create/chunk/finalize/hash/probe/completion on loopback only', { timeout: 60000 }, async () => {
  const fixture = recordingFixture();
  const jwt = `e30.${Buffer.from(JSON.stringify({ sub: ids.owner, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.local-only`;
  fixture.faults.ownerToken = jwt;
  const entry = fileURLToPath(new URL('../../anvil/src/recording/obs-finished-import.ts', import.meta.url));
  const bundled = await build({ entryPoints: [entry], bundle: true, write: false, platform: 'browser', format: 'iife', logLevel: 'silent' });
  const requests: { path: string; status: number; bytes: number }[] = [];
  let origin = '';
  const server = http.createServer(async (req, res) => {
    try {
      const path = new URL(req.url!, origin).pathname;
      if (path === '/entry.js') { res.setHeader('content-type', 'text/javascript'); res.end(bundled.outputFiles[0].contents); return; }
      if (path === '/') {
        res.setHeader('content-type', 'text/html');
        res.end(`<input id="fixture" type="file"><button id="import">Import selected fixture</button><script>
          window.__forgeSupabaseUrl=${JSON.stringify(origin)}; window.__forgeSupabaseAnonKey='local-fixture';
          localStorage.setItem('forge-auth',JSON.stringify({access_token:${JSON.stringify(jwt)},refresh_token:'local-only',expires_at:${Math.floor(Date.now()/1000)+3600},expires_in:3600,token_type:'bearer',user:{id:${JSON.stringify(ids.owner)}}}));
          window.__forgeCanonicalScriptIdentity={scriptApprovalId:${JSON.stringify(ids.other)},scriptApprovalRevision:1,scriptApprovalHash:'a'.repeat(64)};
          window.importEvents=[];window.addEventListener('tp:obs:recording-import',e=>window.importEvents.push(e.detail));
          // Only the OS selection boundary is substituted. The real import,
          // authenticated client, routes, service, registry/hash and ffprobe run.
          window.showOpenFilePicker=async()=>[{getFile:async()=>document.querySelector('#fixture').files[0]}];
          document.querySelector('#import').onclick=()=>window.__tpObsImport.retryWithFilePicker();
        </script><script src="/entry.js"></script>`); return;
      }
      assert.ok(path.startsWith(`/tongs/workpieces/${ids.workpiece}/`), `Unexpected request ${path}`);
      const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const body = Buffer.concat(chunks);
      const response = await fixture.handler(new Request(origin + req.url, {
        method: req.method, headers: req.headers as Record<string,string>, body: body.length ? body : undefined,
      }));
      requests.push({ path, status: response.status, bytes: body.length });
      res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) { res.statusCode = 500; res.end(JSON.stringify({ error: String(error) })); }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext(); const unexpected: string[] = [];
    await context.route('**/*', route => {
      if (new URL(route.request().url()).origin !== origin) { unexpected.push(route.request().url()); return route.abort(); }
      return route.continue();
    });
    const page = await context.newPage();
    await page.goto(`${origin}/?workspace_id=${ids.workspace}&workpiece_id=${ids.workpiece}`);
    await page.waitForFunction(() => typeof (window as ImportWindow).__tpObsImport?.retryWithFilePicker === 'function');
    await page.locator('#fixture').setInputFiles({ name: 'silence.wav', mimeType: 'audio/wav', buffer: silentWav() });
    await page.locator('#import').click();
    await page.waitForFunction(() => (window as ImportWindow).importEvents.some((e) => e.phase === 'failed' || e.phase === 'decision-required'));
    const events = await page.evaluate(() => (window as ImportWindow).importEvents);
    assert.equal(events.at(-1).phase, 'decision-required', JSON.stringify({ events, requests }));
    assert.deepEqual(requests.map(r => r.path.split('/').at(-1)), ['recording-capture-authority', 'begin', 'chunk', 'finalize', 'recording-completion-v3']);
    assert.ok(requests.every(r => r.status === 200)); assert.deepEqual(unexpected, []);
    const file = fixture.tables.workpiece_files.find(r => r.path === 'recordings/silence.wav');
    assert.equal(file.revision, 1); assert.equal(file.bytes, 480044);
    assert.equal(file.hash_value, '1f9a9a27e445258f17fed9738b0e0b40a2db04a0999438f6eb2b68a3df4037cd');
    const completion = fixture.calls.find(c => c.name === 'recording_transition_take_completed_verified');
    assert.equal(completion.args.p_expected_media_hash, file.hash_value); assert.equal(completion.args.p_expected_media_bytes, 480044);
    assert.equal(completion.args.p_duration_ms, 30000); assert.equal(completion.args.p_has_audio_stream, true);
    assert.equal(completion.args.p_completed_by, ids.owner);
    const mediaReads = fixture.calls.filter(c => c.op === 'download' && (c.key.endsWith('.part') || c.key.endsWith('silence.wav')));
    assert.equal(mediaReads.length, 2); // assembly plus canonical readback
    assert.equal([...fixture.objects.keys()].filter(k => k.endsWith('.part')).length, 0);
    assert.equal([...fixture.objects.keys()].filter(k => k.endsWith('session.v1.json')).length, 1);
    await assert.doesNotReject(() => page.locator('#tp-recording-decision-modal').waitFor());
  } finally { await browser.close(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
