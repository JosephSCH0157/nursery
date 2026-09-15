import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import {
  TongsCommitService,
  createTongsCommitApiHandlerWithService,
} from "../../../packages/tongs/src/workpiece-commit-api.ts";
import { generateCanonicalCleanupCandidates } from "../server/tongs/hammer-cleanup-review-generator.ts";

test("actual cleanup HTTP handler verifies bearer, role, identity, canonical generation and replay", async () => {
  const workspace = "11111111-1111-4111-8111-111111111111";
  const workpiece = "22222222-2222-4222-8222-222222222222";
  const revision = "33333333-3333-4333-8333-333333333333";
  const recording = "44444444-4444-4444-8444-444444444444";
  const actor = "55555555-5555-4555-8555-555555555555";
  const options = {
    aggressiveness: "medium",
    protectIntentionalPhrasing: true,
  };
  const bytes = new TextEncoder().encode(
    JSON.stringify({
      transcript_id: "canonical-transcript",
      media_id: "canonical-media",
      segments: [
        {
          segment_id: "one",
          speaker: "A",
          text: "Um, useful words here.",
          start_sec: 0,
          end_sec: 3,
        },
      ],
    }),
  );
  const evidence = {
    workspace_id: workspace,
    workpiece_id: workpiece,
    recording_revision_id: revision,
    canonical_recording_id: recording,
    media_id: "canonical-media",
    transcript: {
      bytes: bytes.length,
      hash_value: createHash("sha256").update(bytes).digest("hex"),
      storage_bucket: "forge-workpieces",
      storage_key: "canonical-transcript",
    },
    media: { bytes: 100, hash_value: "a".repeat(64) },
  };
  let membership: string | null = "editor";
  const receipts: Record<string, unknown>[] = [];
  let downloads = 0,
    commits = 0;
  const schema = {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const query = {
        select() {
          return query;
        },
        eq(key: string, value: unknown) {
          filters[key] = value;
          return query;
        },
        async maybeSingle() {
          return {
            error: null,
            data:
              table === "workspaces"
                ? { id: workspace, created_by: "another-owner" }
                : membership
                  ? { role: membership }
                  : null,
          };
        },
        then(resolve: (result: unknown) => unknown) {
          return Promise.resolve(
            resolve({
              error: null,
              data: receipts.filter((row) =>
                Object.entries(filters).every(
                  ([key, value]) => row[key] === value,
                ),
              ),
            }),
          );
        },
      };
      return query;
    },
    async rpc(name: string, args: Record<string, unknown>) {
      assert.equal(args.p_actor, actor);
      if (!membership) return { error: { code: "42501", message: "revoked" } };
      if (
        args.p_workspace !== workspace ||
        args.p_workpiece !== workpiece ||
        args.p_revision !== revision
      )
        return { error: { code: "40001", message: "identity conflict" } };
      if (name === "read_cleanup_review_basis")
        return { error: null, data: evidence };
      assert.equal(name, "commit_cleanup_review_discard");
      commits++;
      let receipt = receipts.find(
        (row) =>
          row.candidate_fingerprint === args.p_candidate_hash &&
          row.basis_fingerprint === args.p_basis_hash,
      );
      const outcome = receipt ? "already_committed" : "committed";
      if (!receipt) {
        receipt = {
          id: "canonical-receipt",
          workspace_id: workspace,
          workpiece_id: workpiece,
          recording_revision_id: revision,
          canonical_recording_id: recording,
          authored_by: actor,
          decision: "discard",
          contract_version: "hammer-cleanup-review-v1",
          basis_fingerprint: args.p_basis_hash,
          candidate_fingerprint: args.p_candidate_hash,
        };
        receipts.push(receipt);
      }
      return { error: null, data: { outcome, receipt } };
    },
  };
  const supabase = {
    schema: () => schema,
    auth: {
      getUser: async (token: string) => ({
        data: { user: token === "verified-user" ? { id: actor } : null },
        error: null,
      }),
    },
    storage: {
      from: () => ({
        download: async () => {
          downloads++;
          return { error: null, data: new Blob([bytes]) };
        },
      }),
    },
  };
  const service = new TongsCommitService(
    supabase as unknown as ConstructorParameters<typeof TongsCommitService>[0],
    undefined,
    null,
    null,
    null,
    null,
    null,
    undefined,
    null,
    null,
    undefined,
    generateCanonicalCleanupCandidates,
  );
  const handler = createTongsCommitApiHandlerWithService(
    service,
    "isolated-service",
  );
  const request = (
    action: string,
    body: unknown,
    token: string | null = "verified-user",
    piece = workpiece,
  ) =>
    handler(
      new Request(
        `https://isolated.invalid/tongs/workspaces/${workspace}/workpieces/${piece}/hammer/revisions/${revision}/cleanup-review/${action}`,
        {
          method: "POST",
          headers: {
            authorization: "Bearer isolated-service",
            "content-type": "application/json",
            ...(token
              ? { "x-forge-user-authorization": `Bearer ${token}` }
              : {}),
          },
          body: JSON.stringify(body),
        },
      ),
    );
  assert.equal(
    (await request("read", { kind: "fillers", options }, null)).status,
    401,
  );
  assert.equal(
    (await request("read", { kind: "fillers", options }, "invalid")).status,
    401,
  );
  assert.equal(downloads, 0);
  const initial = await request("read", { kind: "fillers", options });
  assert.equal(initial.status, 200);
  const snapshot = (await initial.json()).data;
  assert.equal(snapshot.candidates.length, 1);
  const pending = {
    kind: "fillers",
    options,
    basis_fingerprint: snapshot.basis_fingerprint,
    candidate_fingerprint: snapshot.candidates[0].candidate_fingerprint,
  };
  membership = "viewer";
  assert.equal((await request("discard", pending)).status, 403);
  assert.equal(commits, 0);
  membership = "editor";
  assert.equal(
    (await request("discard", { ...pending, actor: "spoofed" })).status,
    400,
  );
  assert.equal(
    (await request("read", { kind: "fillers", options: {} })).status,
    400,
  );
  assert.equal(
    (
      await request("discard", {
        ...pending,
        candidate_fingerprint: "b".repeat(64),
      })
    ).status,
    409,
  );
  assert.equal(
    (await request("discard", pending, "verified-user", recording)).status,
    409,
  );
  assert.equal(commits, 0);
  const first = await request("discard", pending);
  assert.equal(first.status, 200);
  const replay = await request("discard", pending);
  assert.equal(replay.status, 200);
  assert.equal(
    (await first.json()).data.receipt.id,
    (await replay.json()).data.receipt.id,
  );
  assert.equal(receipts.length, 1);
  const reopened = (
    await (await request("read", { kind: "fillers", options })).json()
  ).data;
  assert.deepEqual(reopened.acknowledged, [pending.candidate_fingerprint]);
  membership = null;
  assert.equal(
    (await request("read", { kind: "fillers", options })).status,
    403,
  );
  assert.equal((await request("discard", pending)).status, 403);
  assert.equal(commits, 2);
});
