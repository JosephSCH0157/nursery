import { TongsCommitService } from './dist/workpiece-commit-api.js';

let state = 'pending';
let taskId = null;
let providerCalls = 0;
let paidRpcCalls = [];
const operation = () => ({ state, submission_attempt_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', provider_task_id: taskId, existing_selected_candidate_id: '77777777-7777-4777-8777-777777777777' });
const authority = {
  schema() {
    return {
      async rpc(name, args) {
        paidRpcCalls.push({ source: 'authority', name, args });
        if (name === 'assert_current_broll_prompt') return { data: { disposition: 'verified', prompt_revision: { id: '55555555-5555-4555-8555-555555555555', revision: 1, content_hash: 'b'.repeat(64), final_prompt: 'A slow documentary road transition' } }, error: null };
        if (name === 'begin_broll_operation') return { data: { disposition: 'replay', operation: operation() }, error: null };
        if (name === 'begin_broll_runway_submission') { state = 'submitting'; return { data: { disposition: 'submitting', operation: operation() }, error: null }; }
        if (name === 'record_broll_runway_task') { taskId = 'runway-task-durable-1'; state = 'provider_submitted'; return { data: { disposition: 'provider_submitted', operation: operation() }, error: null }; }
        if (name === 'record_broll_runway_completion') { state = 'provider_completed'; return { data: { disposition: 'provider_completed', operation: operation() }, error: null }; }
        if (name === 'record_broll_provider_or_upload_result') return { data: { disposition: 'result_recorded', operation: { state: 'provider_or_upload_completed' } }, error: null };
        if (name === 'commit_broll_candidate') return { data: { disposition: 'committed', candidate_revision: { id: 'candidate-broll-1' } }, error: null };
        if (name === 'claim_broll_runway_poll') return { data: { disposition: 'poll_claimed', operation: operation() }, error: null };
        if (name === 'record_broll_runway_pending') return { data: { disposition: 'provider_pending', operation: operation() }, error: null };
        if (name === 'approve_and_reserve_paid_media_operation') return { data: { operation: { id: args.p_paid_media_operation_id, state: 'reserved' } }, error: null };
        if (name === 'begin_paid_media_provider_attempt') return { data: { operation: { id: args.p_paid_media_operation_id, state: 'submitting' }, attempt: { id: args.p_attempt_id, state: 'submitting' } }, error: null };
        if (name === 'record_paid_media_provider_result') return { data: { operation: { id: args.p_paid_media_operation_id, state: 'provider_completed' }, attempt: { id: args.p_attempt_id, state: 'completed' } }, error: null };
        if (name === 'mark_paid_media_delivery') return { data: { operation: { id: args.p_paid_media_operation_id, state: 'delivered' } }, error: null };
        if (name === 'settle_paid_media_operation') return { data: { operation: { id: args.p_paid_media_operation_id, state: 'settled' }, receipt: { settled_customer_charge: 1_000 } }, error: null };
        throw new Error('unexpected RPC ' + name);
      },
    };
  },
};
const supabase = {
  storage: {
    from() {
      return {
        async download() { return { data: null, error: { message: 'Object not found', statusCode: 404 } }; },
        async upload() { return { data: { Key: 'uploaded' }, error: null }; },
      };
    },
  },
  schema() {
    return {
      async rpc(name, args) {
        paidRpcCalls.push({ source: 'supabase', name, args });
        if (name === 'commit_broll_operation_asset') return { data: { disposition: 'video_asset_verified' }, error: null };
        if (name === 'create_paid_image_authorization_quote') return { data: { quote: { id: args.p_quote_id, authorized_customer_ceiling: 44_460 } }, error: null };
        if (name === 'approve_and_reserve_paid_media_operation') return { data: { operation: { id: args.p_paid_media_operation_id, state: 'reserved' } }, error: null };
        if (name === 'begin_paid_media_provider_attempt') return { data: { operation: { id: args.p_paid_media_operation_id, state: 'submitting' }, attempt: { id: args.p_attempt_id, state: 'submitting' } }, error: null };
        if (name === 'record_paid_media_provider_result') return { data: { operation: { id: args.p_paid_media_operation_id, state: 'provider_completed' }, attempt: { id: args.p_attempt_id, state: 'completed' } }, error: null };
        if (name === 'mark_paid_media_delivery') return { data: { operation: { id: args.p_paid_media_operation_id, state: 'delivered' } }, error: null };
        if (name === 'settle_paid_media_operation') return { data: { operation: { id: args.p_paid_media_operation_id, state: 'settled' }, receipt: { settled_customer_charge: 1_000 } }, error: null };
        throw new Error('unexpected RPC ' + name);
      },
    };
  },
};
const provider = {
  async submit() { providerCalls += 1; return { taskId: 'runway-task-durable-2', acceptedResponse: { id: 'runway-task-durable-2' } }; },
  async poll() { return { state: 'completed', taskId: 'runway-task-durable-2', outputUrl: 'https://example.com/out.mp4', response: { id: 'runway-task-durable-2' } }; },
  async download() { return new Uint8Array([1, 2, 3, 4]); },
};
const runtime = {
  inspectMedia: async (bytes, expected) => ({ bytes, mimeType: expected === 'video' ? 'video/mp4' : 'image/jpeg', width: 320, height: 180, durationMs: expected === 'video' ? 1000 : null }),
  derivePoster: async () => ({ bytes: new Uint8Array([4, 5, 6]), mimeType: 'image/jpeg', width: 320, height: 180, durationMs: null }),
  fetchExternalMedia: async () => { throw new Error('must not fetch'); },
  inspectReferenceImage: async () => ({ bytes: new Uint8Array([1]), mimeType: 'image/jpeg', width: 320, height: 180, durationMs: null }),
  fetchExternalBytes: async () => { throw new Error('must not fetch'); },
  renderReferenceVisual: async () => { throw new Error('must not render'); },
};
const service = new TongsCommitService(supabase, 'forge-workpieces', null, () => authority, null, provider, null, runtime);
service.assertWorkpieceInWorkspace = async () => undefined;
service.assertWorkspaceRoleFromAccessToken = async () => ({ userId: '11111111-1111-4111-8111-111111111111', role: 'editor' });
const request = { workspace_id: '33333333-3333-4333-8333-333333333333', beat_id: '44444444-4444-4444-8444-444444444444', operation_id: 'forge:broll:paid-media-test-0003', operation_fingerprint: 'a'.repeat(64), source_kind: 'generated', provider: 'runway', final_prompt: 'A slow documentary road transition', poster_required: false, confirm_spend: true, prompt_revision_id: '55555555-5555-4555-8555-555555555555', prompt_revision: 1, prompt_content_hash: 'b'.repeat(64) };
try {
  const result = await service.acquireBrollCandidate('22222222-2222-4222-8222-222222222222', request, { userAccessToken: 'token' });
  console.log('RESULT', result.disposition, providerCalls, paidRpcCalls.map((call) => call.name));
} catch (error) {
  console.error('ERROR', error.code, error.message, error.details);
}
