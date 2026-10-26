import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { parseHearthChatResponse } from "../src/lib/hearth-ai-runtime-contract";

const root = path.resolve(import.meta.dirname, "../../..");
const proposalId = "f8cfc55b-e07d-5597-bc74-9e0cec2e1dd5";

test("paid script response preserves the canonical persisted proposal identity", () => {
  const parsed = parseHearthChatResponse({
    assistant_text: "Draft ready.",
    ops: [{ op: "set_body", value: "[s1]\nDraft\n[/s1]" }],
    script_text: "[s1]\nDraft\n[/s1]",
    tag_audit: {},
    proposal_id: proposalId,
    proposal_state: "proposed",
    turn_result: {
      decision: {
        mode: "script_generate",
        requiresArtifact: true,
        allowsMutation: false,
        retrievalScope: "active_episode_only",
        requestedArtifact: "script",
        reasons: [],
      },
      assistantMessage: "Draft ready.",
      artifact: { kind: "script", text: "[s1]\nDraft\n[/s1]" },
      operations: [{ op: "set_body", value: "[s1]\nDraft\n[/s1]" }],
      validation: { ok: true, failureKind: "none", message: null },
      persistence: "saved",
    },
    billing_mode: "forge",
    token_balance: 7869,
    total_tokens: 6439,
  }, "forge");

  assert.equal(parsed?.proposal_id, proposalId);
  assert.equal(parsed?.proposal_state, "proposed");
});

test("migration defines append-only, user-scoped, stale-safe proposal lifecycle", () => {
  const migration = fs.readFileSync(path.join(
    root,
    "supabase/migrations/20260917094105_hearth_script_proposal_lifecycle.sql",
  ), "utf8");

  assert.match(migration, /hearth_script_generation_proposal_draft_bindings/);
  assert.match(migration, /hearth_script_generation_proposal_events/);
  assert.match(migration, /before update or delete[\s\S]*_reject_accounting_mutation/);
  assert.match(migration, /read_my_pending_hearth_script_proposal/);
  assert.match(migration, /user_id=auth\.uid\(\)[\s\S]*workspace_id=p_workspace_id[\s\S]*workpiece_id=p_workpiece_id/);
  assert.match(migration, /current_file\.revision<>binding\.expected_draft_revision/);
  assert.match(migration, /current_file\.revision<>binding\.expected_draft_revision\+1/);
  assert.match(migration, /event_type in \('applied','rejected','superseded'\)/);
  assert.match(migration, /unique index hearth_script_generation_proposal_terminal_event_idx/);
  assert.match(migration, /canonical_revision_id','hearth-script-proposal-'\|\|proposal\.id::text/);
  assert.match(migration, /for all to anon,authenticated using\(false\) with check\(false\)/);
  assert.match(migration, /jsonb_build_object\('superseded_by',new\.id\)/);
  assert.match(migration, /\(newer\.created_at,newer\.id\)>\(proposal\.created_at,proposal\.id\)/);
});

test("legacy proposal correction is append-only and prevents older proposals from resurfacing", () => {
  const migration = fs.readFileSync(path.join(
    root,
    "supabase/migrations/20260917095336_hearth_script_proposal_legacy_supersession.sql",
  ), "utf8");
  assert.match(migration, /insert into tongs\.hearth_script_generation_proposal_events/);
  assert.match(migration, /'superseded'/);
  assert.match(migration, /reason','newer_persisted_proposal'/);
  assert.match(migration, /\(newer\.created_at,newer\.id\)>\(candidate\.created_at,candidate\.id\)/);
  assert.doesNotMatch(migration, /update\s+tongs\.hearth_script_generation_proposals/i);
  assert.doesNotMatch(migration, /delete\s+from/i);
  assert.match(migration, /not exists\([\s\S]*hearth_script_generation_proposals newer/);
});

test("Hearth reload hydrates the card and application clears it only after canonical completion", () => {
  const shell = fs.readFileSync(path.join(root, "apps/hearth/src/routes/HearthShell.tsx"), "utf8");
  const surface = fs.readFileSync(path.join(root, "apps/hearth/src/views/surfaces/ChatSurface.tsx"), "utf8");
  const hydrationAt = shell.indexOf("readPendingHearthScriptProposal(workspaceId, workpieceId)");
  const beginAt = shell.indexOf("beginHearthScriptProposalApplication({");
  const persistAt = shell.indexOf("saveReason: `script_proposal:${persisted.proposalId}`");
  const revisionAt = shell.indexOf("store.saveRevision(workpieceId, revision)");
  const completeAt = shell.indexOf("completeHearthScriptProposalApplication({");
  const clearAt = shell.indexOf("setPendingAiProposal(null);", completeAt);

  assert.ok(hydrationAt > 0, "reload must query canonical pending state");
  assert.ok(beginAt > hydrationAt, "application must begin through canonical authority");
  assert.ok(persistAt > beginAt, "working script must persist only after stale-safe begin");
  assert.ok(revisionAt > persistAt, "the deterministic milestone follows the draft commit");
  assert.ok(completeAt > revisionAt, "terminal state follows canonical draft and revision persistence");
  assert.ok(clearAt > completeAt, "the pending card clears only after the terminal receipt");
  assert.match(shell.slice(beginAt, clearAt), /if \(!saved\)[\s\S]*pending card remains available to retry/i);
  assert.match(shell.slice(beginAt, clearAt), /canonicalProposalBody = findNextBodyFromOps\(/);
  assert.match(shell.slice(beginAt, clearAt), /normalizeAiProposalOpsForScriptIngress\(begun\.data\.ops\.filter/);
  assert.doesNotMatch(shell.slice(beginAt, clearAt), /begun\.data\.scriptText !== nextBody/);
  assert.match(surface, /data-proposal-id=\{props\.pendingAiProposal\.persistedProposal\?\.proposalId\}/);
  assert.match(surface, /Recording approval remains a separate producer-review step/);
  assert.match(shell, /if \(!persisted\) \{[\s\S]*approveScriptActionRef\.current/);
});

test("proposal hydration and application do not invoke generation or financial paths", () => {
  const authority = fs.readFileSync(path.join(
    root,
    "apps/hearth/src/lib/hearth-script-proposal-authority.ts",
  ), "utf8");
  assert.doesNotMatch(authority, /\/api\/hearth\/chat/);
  assert.doesNotMatch(authority, /quote|reservation|settlement|provider/i);
  assert.match(authority, /read_my_pending_hearth_script_proposal/);
  assert.match(authority, /complete_my_hearth_script_proposal_application/);
});
