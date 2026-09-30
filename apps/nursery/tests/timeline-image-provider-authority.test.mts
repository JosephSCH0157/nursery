import assert from "node:assert/strict";
import test from "node:test";
import {
  TongsCommitService,
  type ImageProvider,
  type OwnerImageExecutionExecutor,
} from "../../../packages/tongs/src/workpiece-commit-api";

const customerProvider = {
  async generateImage() {
    throw new Error("customer provider should not execute in the availability test");
  },
} satisfies ImageProvider;

function service(
  imageProvider: ImageProvider | null,
  ownerImageExecutionExecutor: OwnerImageExecutionExecutor | null,
): TongsCommitService {
  return new TongsCommitService(
    {} as never,
    "forge-workpieces",
    imageProvider,
    null,
    null,
    null,
    null,
    undefined,
    null,
    null,
    { rpc: async () => ({ data: null, error: null }) },
    undefined,
    undefined,
    null,
    null,
    null,
    ownerImageExecutionExecutor,
  );
}

const request = {
  workspace_id: "11111111-1111-4111-8111-111111111111",
  image_map_entry_id: "image-map-01",
  confirm_spend: true,
  lane: "forge" as const,
};

async function assertAvailabilityPasses(candidate: TongsCommitService): Promise<void> {
  const reached = new Error("availability guard passed");
  candidate.getWorkspaceOrThrow = async () => {
    throw reached;
  };
  await assert.rejects(
    candidate.generateImageMapCandidates(
      "22222222-2222-4222-8222-222222222222",
      request,
    ),
    (error) => error === reached,
  );
}

test("timeline image availability accepts either customer or owner authority and rejects neither", async () => {
  await assertAvailabilityPasses(service(customerProvider, null));
  await assertAvailabilityPasses(service(null, async () => null));
  await assert.rejects(
    service(null, null).generateImageMapCandidates(
      "22222222-2222-4222-8222-222222222222",
      request,
    ),
    (error) => {
      const failure = error as { status?: number; code?: string };
      assert.equal(failure.status, 503);
      assert.equal(failure.code, "image_map_candidate_provider_unavailable");
      return true;
    },
  );
});

const paidArgs = {
  workpieceId: "22222222-2222-4222-8222-222222222222",
  input: request,
  userAccessToken: "test-token",
  authUserId: "33333333-3333-4333-8333-333333333333",
  current: {
    metadataUpdatedAt: "2026-09-30T00:00:00.000Z",
    episodePackage: { spoken_beats: [], image_map: { entries: [] } },
  },
  canonical: {
    authority: {
      revisionId: "44444444-4444-4444-8444-444444444444",
      revision: 1,
      scriptApprovalId: "55555555-5555-4555-8555-555555555555",
      scriptApprovalRevision: 1,
    },
  },
  entry: {
    id: "image-map-01",
    description: "A deterministic timeline image",
    style_preset: "photographic",
  },
  canonicalPromptId: "66666666-6666-4666-8666-666666666666",
  canonicalPromptRevision: 1,
  canonicalPromptHash: "a".repeat(64),
  canonicalPrompt: "A deterministic timeline image prompt",
  semanticAuthorityHash: "b".repeat(64),
};

type PaidTimelineMethod = {
  generateTimelineImageCandidatesPaid(args: typeof paidArgs): Promise<unknown>;
};

test("owner timeline authority executes without a customer provider", async () => {
  let ownerCalls = 0;
  const owner: OwnerImageExecutionExecutor = async () => {
    ownerCalls += 1;
    return { state: "succeeded", result: { owner: true } };
  };
  const result = await (service(null, owner) as unknown as PaidTimelineMethod)
    .generateTimelineImageCandidatesPaid(paidArgs);
  assert.deepEqual(result, { owner: true });
  assert.equal(ownerCalls, 1);
});

test("ordinary customer cannot use owner authority and no customer fallback is invented", async () => {
  let ownerCalls = 0;
  const deniedOwner: OwnerImageExecutionExecutor = async () => {
    ownerCalls += 1;
    return null;
  };
  await assert.rejects(
    (service(null, deniedOwner) as unknown as PaidTimelineMethod)
      .generateTimelineImageCandidatesPaid(paidArgs),
    (error) => {
      const failure = error as { status?: number; code?: string };
      assert.equal(failure.status, 503);
      assert.equal(failure.code, "timeline_image_provider_contract_unavailable");
      return true;
    },
  );
  assert.equal(ownerCalls, 1);
});
