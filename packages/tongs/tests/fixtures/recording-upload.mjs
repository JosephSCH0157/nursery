import {randomUUID} from 'node:crypto';
import { TongsCommitService, createTongsCommitApiHandlerWithService } from '../../dist/workpiece-commit-api.js';

export const ids = {
  workspace: '11111111-1111-4111-8111-111111111111',
  workpiece: '22222222-2222-4222-8222-222222222222',
  owner: '33333333-3333-4333-8333-333333333333',
  capture: '44444444-4444-4444-8444-444444444444',
  other: '55555555-5555-4555-8555-555555555555',
};
export const beginInput = {
  capture_authority_id: ids.capture, upload_id: 'obs_deterministic_fixture',
  path: 'recordings/silence.wav', content_type: 'audio/wav',
  written_by: { tool: 'anvil', tool_version: 'test', lane: 'forge-managed' },
  user_access_token: 'owner', total_bytes: 480044, total_chunks: 1, chunk_size_bytes: 3145728,
};

// Disposable in-memory Storage/DB transport, never a hosted client. Service,
// route dispatch, role checks, assembly, hashes and registry writes stay real.
export function recordingFixture() {
  const objects = new Map(), versions = new Map(), calls = [], faults = {};
  const tables = {
    workspaces: [{ id: ids.workspace, created_by: ids.owner }],
    workspace_members: [{ workspace_id: ids.workspace, user_id: ids.other, role: 'viewer' }],
    episodes: [{ id: ids.workpiece, workspace_id: ids.workspace, created_at: new Date().toISOString() }],
    recording_capture_authorities: [{ id: ids.capture, workspace_id: ids.workspace, workpiece_id: ids.workpiece }],
    workpiece_files: [], workpiece_events: [],
  };
  function from(table) {
    if (!(table in tables)) throw Error(`Unexpected fixture table: ${table}`);
    const filters = []; let write = null;
    const query = {
      select() { return query; }, eq(k, v) { filters.push([k, v]); return query; },
      insert(rows) { write = { rows: Array.isArray(rows) ? rows : [rows], upsert: false }; return query; },
      upsert(rows) { write = { rows: Array.isArray(rows) ? rows : [rows], upsert: true }; return query; },
      async execute(single) {
        if (faults.registry && table === 'workpiece_files') return { data: null, error: faults.registry };
        let data;
        if (write) {
          data = write.rows.map(row => {
            const existing = write.upsert ? tables[table].find(r => r.workpiece_id === row.workpiece_id && r.path === row.path) : null;
            const saved = { ...existing, ...structuredClone(row), revision: (existing?.revision ?? 0) + 1, updated_at: new Date().toISOString() };
            if (table === 'workpiece_events') saved.id = tables[table].length + 1;
            if (existing) Object.assign(existing, saved); else tables[table].push(saved);
            return saved;
          });
        } else data = tables[table].filter(row => filters.every(([k, v]) => row[k] === v));
        return { data: structuredClone(single ? data[0] ?? null : data), error: null };
      },
      single() { return query.execute(true); }, maybeSingle() { return query.execute(true); },
      then(resolve, reject) { return query.execute(false).then(resolve, reject); },
    };
    return query;
  }
  const schema = { from, async rpc(name, args) {
    calls.push({ op: 'rpc', name, args: structuredClone(args) });
    if (name === 'read_workpiece_manifest_version') {const version=versions.get(`workpieces/${args.p_workpiece_id}/manifest.json`);return {data:{exists:!!version,version:version??null},error:null};}
    if (name === 'establish_recording_capture_authority') {
      const authority = { ...tables.recording_capture_authorities[0], operation_key: args.p_operation_key,
        script_binding_kind: 'approved_canonical_script', ready_transition_id: ids.other,
        script_path: 'script/script.md', script_revision: 1, script_hash: 'a'.repeat(64),
        script_approval_id: ids.other, script_approval_revision: 1, script_approval_hash: 'a'.repeat(64), provenance: 'live_established' };
      return { data: { outcome: 'established', capture_authority: authority, venue_execution: { execution_id: args.p_execution_id } }, error: null };
    }
    if (name !== 'recording_transition_take_completed_verified') throw Error(`Unexpected fixture RPC: ${name}`);
    return { data: { outcome: 'saved', completion: { id: ids.other }, verified_duration_ms: args.p_duration_ms }, error: null };
  } };
  const supabase = {
    schema: () => schema,
    auth: { async getUser(token) { return token === 'owner' || token === faults.ownerToken || token === 'viewer'
      ? { data: { user: { id: token === 'owner' || token === faults.ownerToken ? ids.owner : ids.other } }, error: null }
      : { data: {}, error: { message: 'invalid token' } }; } },
    storage: { from(bucket) { return {
      async download(key) {
        calls.push({ op: 'download', bucket, key });
        if (faults.read) return { data: null, error: faults.read };
        if (faults.emptyRead) return { data: null, error: null };
        return objects.has(key) ? { data: new Blob([objects.get(key)]), error: null }
          : { data: null, error: { statusCode: '404', message: 'Object not found' } };
      },
      async upload(key, data, options) {
        calls.push({ op: 'upload', bucket, key, options, bytes: data.byteLength });
        if (faults.write) return { error: faults.write };
        if (faults.beforeCreate && !options.upsert) await faults.beforeCreate(key);
        if (!options.upsert && objects.has(key)) return { error: { statusCode: '409', message: 'The resource already exists' } };
        if(key.endsWith('/manifest.json')) {
          const proof=options.metadata.forge_manifest_publication;
          if(proof.expected_version!==(versions.get(key)??null))return {error:{message:'PF003 manifest version conflict'}};
          const registration=await from('workpiece_files').upsert([{workpiece_id:ids.workpiece,path:'manifest.json',file_type:'manifest',content_type:'application/json',bytes:data.byteLength,hash_algo:'sha256',hash_value:proof.sha256,storage_bucket:bucket,storage_key:key}]);
          if(registration.error)return {error:registration.error};
        }
        versions.set(key,randomUUID());
        objects.set(key, Buffer.from(data)); return { data: { path: key }, error: null };
      },
      async remove(keys) { calls.push({ op: 'remove', bucket, keys }); keys.forEach(key => objects.delete(key)); return { error: null }; },
    }; } },
  };
  const service = new TongsCommitService(supabase, 'forge-workpieces', null, () => ({ schema: () => schema }));
  const handler = createTongsCommitApiHandlerWithService(service);
  const key = uploadId => `workpieces/${ids.workpiece}/_uploads/${uploadId}/session.v1.json`;
  const read = (uploadId = beginInput.upload_id) => JSON.parse(objects.get(key(uploadId)).toString());
  const seed = (state, uploadId = beginInput.upload_id) => objects.set(key(uploadId), Buffer.from(typeof state === 'string' ? state : JSON.stringify(state)));
  return { service, handler, objects, tables, calls, faults, key, read, seed };
}

export function silentWav() {
  const b = Buffer.alloc(480044); b.write('RIFF'); b.writeUInt32LE(480036, 4); b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(8000, 24);
  b.writeUInt32LE(16000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(480000, 40);
  return b;
}
