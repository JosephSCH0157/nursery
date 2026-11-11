import test from 'node:test';
import assert from 'node:assert/strict';
import { recordingFixture, ids, beginInput, silentWav } from './fixtures/recording-upload.mjs';
const begin = (f, changes = {}) => f.service.beginRecordingUploadSession(ids.workpiece, { ...beginInput, ...changes });
const rejects = (p, code) => assert.rejects(p, e => e.code === code);

test('fresh deterministic and generated IDs create without overwrite; repeat preserves chunks', async () => {
  const f = recordingFixture(); const first = await begin(f);
  assert.equal(first.upload_id, beginInput.upload_id);
  const state = f.read(); state.uploaded_chunks['0'] = { bytes: 480044, updated_at: state.updated_at, sha256: 'a'.repeat(64) }; f.seed(state);
  const before = f.objects.get(f.key(first.upload_id));
  assert.deepEqual((await begin(f)).uploaded_chunks, [0]);
  assert.deepEqual(f.objects.get(f.key(first.upload_id)), before);
  const generated = await begin(f, { upload_id: undefined }); assert.match(generated.upload_id, /^upl_/);
  assert.equal(f.calls.filter(c => c.op === 'upload').length, 2);
  assert.ok(f.calls.filter(c => c.op === 'upload').every(c => c.options.upsert === false));
});

test('concurrent deterministic begin reloads the winner without replacing state', async () => {
  const f = recordingFixture(); let arrivals = 0; let release;
  const barrier = new Promise(resolve => { release = resolve; });
  f.faults.beforeCreate = async () => { if (++arrivals === 2) release(); await barrier; };
  const [a, b] = await Promise.all([begin(f), begin(f)]);
  assert.deepEqual(a, b); assert.equal(f.objects.size, 1); assert.equal(arrivals, 2);
  assert.equal(f.calls.filter(c => c.op === 'download').length, 3);
});

test('a mismatched concurrent winner is rejected without replacing it', async () => {
  const f = recordingFixture(); await begin(f); const winner = f.read(); winner.path = 'recordings/other.wav'; f.objects.clear();
  f.faults.beforeCreate = async () => f.seed(winner);
  await rejects(begin(f), 'upload_session_path_mismatch'); assert.equal(f.read().path, winner.path);
});

test('resume rejects identity, path, total bytes, chunk shape and media mismatches', async () => {
  for (const [field, value, code] of [
    ['workspace_id', ids.other, 'capture_authority_mismatch'], ['capture_authority_id', ids.other, 'capture_authority_mismatch'],
    ['path', 'recordings/other.wav', 'upload_session_path_mismatch'], ['total_bytes', 480043, 'upload_session_shape_mismatch'],
    ['total_chunks', 2, 'upload_session_shape_mismatch'], ['chunk_size_bytes', 2097152, 'upload_session_shape_mismatch'],
    ['content_type', 'video/webm', 'upload_session_shape_mismatch'], ['file_type', 'other', 'upload_session_shape_mismatch'],
  ]) {
    const f = recordingFixture(); await begin(f); const s = f.read(); s[field] = value; f.seed(s);
    await rejects(begin(f), code); assert.equal(f.calls.filter(c => c.op === 'upload').length, 1);
  }
});

test('missing token, viewer and mismatched capture authority fail before Storage', async () => {
  for (const [changes, code] of [[{ user_access_token: null }, 'missing_user_token_header'], [{ user_access_token: 'viewer' }, 'insufficient_role'], [{ capture_authority_id: ids.other }, 'capture_authority_mismatch']]) {
    const f = recordingFixture(); await rejects(begin(f, changes), code); assert.equal(f.calls.length, 0);
  }
});

test('corrupt or malformed session state never creates a replacement', async () => {
  for (const change of [() => '{broken', s => ({ ...s, schema: 'wrong' }), s => ({ ...s, upload_id: 'another' }),
    s => ({ ...s, workpiece_id: ids.other }), s => ({ ...s, total_bytes: -1 }), s => ({ ...s, uploaded_chunks: [] }),
    s => ({ ...s, uploaded_chunks: { '2': { bytes: 1, updated_at: s.updated_at } } }), s => ({ ...s, finalized_at: s.updated_at, final_result: null }),
    s => ({ ...s, written_by: null }), s => ({ ...s, updated_at: 'not-a-date' })]) {
    const f = recordingFixture(); await begin(f); f.seed(change(f.read()));
    await assert.rejects(begin(f)); assert.equal(f.calls.filter(c => c.op === 'upload').length, 1);
  }
});

test('permission, timeout, unavailable and misleading not-found failures fail closed', async () => {
  for (const error of [{ statusCode: '403', message: 'not found' }, { status: 403, statusCode: '404' },
    { statusCode: '404', code: 'NoSuchBucket' }, { statusCode: '404', code: 'TenantNotFound' }, { statusCode: '404', code: 'AccessDenied' }, { statusCode: '500', message: 'not found' }, { message: 'not found' }, new Error('timeout'), { status: 429 }, { statusCode: '403', originalError: new Response('{}', { status: 404 }) }, { statusCode: '500', originalError: new Response('{}', { status: 404 }) }]) {
    const f = recordingFixture(); f.faults.read = error; await rejects(begin(f), 'storage_read_failed'); assert.equal(f.objects.size, 0);
    assert.equal(f.calls.filter(c => c.op === 'upload').length, 0);
  }
  const empty = recordingFixture(); empty.faults.emptyRead = true; await rejects(begin(empty), 'storage_read_failed');
  for (const error of [{ statusCode: '403' }, { statusCode: '500' }, new Error('timeout')]) {
    const f = recordingFixture(); f.faults.write = error; await rejects(begin(f), 'storage_write_failed'); assert.equal(f.objects.size, 0);
  }
});

async function finalizedFixture() {
  const f = recordingFixture(); const result = await begin(f);
  await f.service.uploadRecordingChunk(ids.workpiece, result.upload_id, { index: 0, total_chunks: 1, bytes_base64: silentWav().toString('base64') });
  const receipt = await f.service.finalizeRecordingUpload(ids.workpiece, result.upload_id);
  return { f, receipt };
}

test('valid finalized replay preserves canonical hash, revision and session bytes', async () => {
  const { f, receipt } = await finalizedFixture(); const before = f.objects.get(f.key(receipt.upload_id));
  const replay = await begin(f); assert.equal(replay.finalized_result.hash, receipt.hash); assert.equal(replay.finalized_result.file_row.revision, receipt.file_row.revision);
  assert.deepEqual(f.objects.get(f.key(receipt.upload_id)), before); assert.equal(f.objects.has(`workpieces/${ids.workpiece}/_uploads/${receipt.upload_id}/chunks/000.part`), false);
});

test('finalized replay validates session and receipt before returning and checks current registry', async () => {
  for (const change of [s => { s.path = 'recordings/other.wav'; }, s => { s.capture_authority_id = ids.other; },
    s => { s.final_result.hash = 'b'.repeat(64); }, s => { s.final_result.file_row.revision = 99; },
    s => { s.final_result.workspace_id = ids.other; }, s => { s.final_result.storage_key = 'foreign'; }]) {
    const { f } = await finalizedFixture(); const s = f.read(); change(s); f.seed(s); await assert.rejects(begin(f));
  }
  const { f } = await finalizedFixture(); f.tables.workpiece_files.find(r => r.path === beginInput.path).hash_value = 'c'.repeat(64);
  await rejects(begin(f), 'upload_session_receipt_mismatch');
  f.faults.registry = { message: 'unavailable' }; await rejects(begin(f), 'db_read_failed');
});


test('explicit Storage response-body 404 is supported, other conflicts fail closed', async () => {
  const f = recordingFixture();
  f.faults.read = { originalError: new Response(JSON.stringify({ statusCode: '404', error: 'not_found' }), { status: 400 }) };
  await begin(f); assert.equal(f.objects.size, 1);
  delete f.faults.read;
  f.faults.write = { statusCode: '409', code: 'BucketAlreadyExists' };
  await rejects(begin(f, { upload_id: 'obs_another_new_id' }), 'storage_write_failed');
});
