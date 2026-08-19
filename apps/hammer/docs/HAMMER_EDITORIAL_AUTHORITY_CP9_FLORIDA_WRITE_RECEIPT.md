# Hammer editorial authority CP-9 Florida write receipt

## Result

CP-9 completed successfully on 2026-08-19 against production project `wtvdjndyxegudufrompx`. Exactly one production runtime-writer invocation installed the authorized Florida Oranges revision-owned editorial-authority artifact. No manual retry occurred. Canonical reopen acceptance was not performed and remains separately unauthorized.

## Authorized scope

- Workspace: `494c2ae5-9037-4208-b898-fab4898ab430`
- Workpiece: `85d076d6-54e6-4b56-ab60-5eff4c87cdd0`
- Sealed canonical recording: `6c5b0d00-f775-4611-ac67-284dd9ae7d39`
- Active revision: `f642b5d9-cec2-4656-804e-49bb33bc0cb5`
- Path: `hammer/revisions/f642b5d9-cec2-4656-804e-49bb33bc0cb5/editorial-authority.v1.json`
- SHA-256: `6d6c4a4d3ca2ae9a792326d6d3bc011076d07aefc31f03e78bff4c0cbc025d35`
- Bytes: `751`
- Expected authority revision transition: `0 -> 1`
- Expected prior tuple: `(null, null, 0)`
- Expected row token: `2026-08-18 15:26:51.680213+00`
- Repository HEAD before receipt: `452e35a4dabbe64e9bb11f71e48e076d25fced8a`

## Immediate preflight

The authenticated single-use page ran from the neutral `/app` route and did not mount or navigate to Hammer. Before the writer invocation it used the production transport to require:

- the exact active workspace/workpiece/recording/revision identity tuple;
- the exact microsecond row-token instant, including `.680213` precision;
- the null/null/zero authority tuple;
- absence of the intended authority artifact;
- exact production serialization of the frozen payload to 751 bytes and the approved SHA-256;
- unchanged registry hashes for editor session, revision transcript, audio polish, visual timeline, visual placements, and history.

The production adapter then performed its own fresh revision and absent-artifact preflight immediately before its existing two-phase coordinator. The local runner contained exactly one call to `persistHammerRevisionEditorialAuthority()` and no retry loop.

## Transaction and ambiguous-outcome handling

The runtime transaction committed the artifact and acknowledged its pointer. The page's result renderer then failed because its display variable collided with the browser's `window.status` property. This made the browser presentation ambiguous but did not trigger a retry. In accordance with the authorized procedure, execution stopped and switched directly to metadata and byte readback.

No second writer call, manual artifact write, acknowledgement RPC call, or compensating action was issued.

## Readback evidence

Production metadata readback established:

- revision authority path: `hammer/revisions/f642b5d9-cec2-4656-804e-49bb33bc0cb5/editorial-authority.v1.json`;
- revision authority fingerprint: `6d6c4a4d3ca2ae9a792326d6d3bc011076d07aefc31f03e78bff4c0cbc025d35`;
- revision authority revision: `1`;
- resulting revision row token: `2026-08-19 08:38:06.030311+00`;
- registry file type: `hammer_revision_editorial_authority`;
- registry content type: `application/json`;
- registry bytes: `751`;
- registry hash algorithm: `sha256`;
- registry hash: `6d6c4a4d3ca2ae9a792326d6d3bc011076d07aefc31f03e78bff4c0cbc025d35`;
- registry revision: `1`;
- registry created/updated token: `2026-08-19 08:38:04.196909+00`;
- writer identity: `hammer`, `forge-v1.2.0/hammer-runtime`, `forge-managed`.

An authenticated Storage GET downloaded the committed object. It was exactly 751 bytes, hashed to the approved fingerprint, parsed as the authorized identity-bound envelope, and was byte-for-byte equal to the CP-8 frozen payload.

## No-unrelated-change proof

Comparing the final CP-8 state with the post-transaction production read showed:

- episode row unchanged;
- sealed canonical recording row and media identity unchanged;
- editor-session, transcript, audio-polish, timeline, placement, and history pointers unchanged;
- all six source registry rows retained identical hashes, registry revisions, and `updated_at` tokens;
- revision row differences were limited to `updated_at`, `editorial_authority_path`, `editorial_authority_fingerprint`, and `editorial_authority_revision`;
- no transcript, timeline, placement, history, recording, session, or Anvil operation was invoked;
- Florida was not opened in Hammer.

The temporary single-use browser runner was removed after readback. The authenticated browser was returned to the neutral workspace `/app` page.

## Evidence package

The ACL-restricted external evidence directory is `D:\nursery\cp8-florida-dry-run-20260819-0530`. It contains:

- the frozen authorized payload;
- initial and final CP-8 state captures;
- the post-CP-9 production state capture;
- the independently downloaded stored authority bytes;
- the read-only production dump used for post-transaction comparison;
- execution and verification scripts containing no credential.

The protected `apps/nursery/public/forge-nav.json` worktree modification was preserved and excluded from this receipt commit.

## Next gate

CP-9 is complete. Canonical reopen/acceptance has not begun and is not authorized by this transaction. No further Florida access or mutation is permitted without a separate checkpoint authorization.
