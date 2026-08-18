# Hammer Editorial Authority CP-1 Migration/RLS/RPC Review

Review scope: local migration and application diff only. No remote schema query, deployment, or database mutation was performed.

Baseline: `5f56b6412a39275d1a2e851ac3d2ce0ca6bc6de8`.

## Findings and dispositions

| Area | Finding | Disposition |
|---|---|---|
| Columns | The three nullable/monotonic revision-owned fields are additive. The authority revision has a nonnegative check. | Pass |
| RPC authorization | The RPC checks `tongs.has_workspace_role(workspace_id, 'editor')`. | Pass |
| RPC execution | The original invoker function required a broad authenticated table-update grant. That allowed authenticated editors to address unrelated revision columns directly. | Corrected locally: locked `SECURITY DEFINER`, PostgreSQL-owned function, authenticated execute only, and authenticated table update revoked. Not deployed. |
| Search path | The original path included `public`. | Corrected locally to `pg_catalog, tongs`; `auth.uid()` remains explicitly schema-qualified. |
| Path validation | The API validated the revision-scoped path, but direct RPC calls did not. | Corrected locally: RPC independently requires `hammer/revisions/<p_revision_id>/editorial-authority.v1.json`. |
| CAS | Active status, workspace/workpiece/recording/revision identities, revision `updated_at`, prior authority revision, and prior authority path are predicates. The prior fingerprint is transitively protected by `updated_at` plus the monotonic tuple. | Pass |
| Artifact acknowledgement | Tongs rereads the artifact, validates all envelope identities, and compares the canonical file hash before invoking the pointer RPC. | Pass |
| Artifact write authorization | The generic file route previously protected only ready-script paths. | Corrected locally: revision authority paths require an authenticated token and editor role before commit. |
| Compensation | A pointer-untouched artifact can be removed only through the revision-scoped authenticated route, with active-revision, pointer-not-committed, exact-path, and file-`updated_at` CAS checks. Manifest and event state are updated. | Pass |
| Pointer-present read | Missing, malformed, unreadable, wrong-path, identity-mismatched, or hash-mismatched artifacts fail closed. | Pass |
| Service role | Service-role table access remains for controlled server/deployment tasks; browser/runtime writes use authenticated user authorization. | Pass with existing trust boundary |

## Role matrix

| Principal | Read revision | Write authority artifact | Acknowledge pointer | Direct revision update |
|---|---:|---:|---:|---:|
| Anonymous | No | No | No | No |
| Authenticated viewer | Yes | No | No | No |
| Authenticated editor in owning workspace | Yes | Yes, exact revision path | Yes, RPC CAS only | No |
| Authenticated user in another workspace | No | No | No | No |
| Service role | Yes | Controlled server use | Controlled server use | Yes |

## Residual considerations

- The migration is intentionally undeployed at CP-4. Live behavior cannot use the new writer until the separately authorized CP-5+ rollout.
- Revoking direct authenticated updates is correct for the narrow authority boundary. Before deployment, staging must confirm that no separate browser flow relies on direct `recording_revisions` updates; Hammer's commit API uses the server/service boundary for ordinary revision artifacts.
- Storage-object deletion follows metadata/manifest CAS compensation. A storage deletion failure leaves a noncanonical orphan and surfaces a compensation failure; it does not clear or replace a committed pointer.
- No history or placement-reconciliation code is part of this review.

## CP-1 result

Pass for local implementation review, contingent on CP-3 tests and CP-4 verification. This result does not authorize deployment.
