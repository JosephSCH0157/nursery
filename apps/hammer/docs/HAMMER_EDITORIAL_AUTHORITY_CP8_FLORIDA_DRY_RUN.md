# Hammer editorial authority CP-8 Florida dry-run verification

## Decision

CP-8 passed on 2026-08-19. An authenticated, mutation-free production read of Florida Oranges reconstructed the frozen revision-owned editorial-authority artifact and validated it through the production serializer, revision artifact reader, strict timeline validator, and canonical reopen hydration path in an isolated in-memory projection. No production write or Hammer mount occurred. CP-9 has not begun and remains separately unauthorized.

## Execution boundary

- Production project: `wtvdjndyxegudufrompx`
- Repository HEAD during verification: `b7f00f2d3397f4b059a2e677f0c146740aa1c0d1`
- Worktree before creating this record: clean
- Workspace: `494c2ae5-9037-4208-b898-fab4898ab430`
- Workpiece: `85d076d6-54e6-4b56-ab60-5eff4c87cdd0`
- Canonical recording: `6c5b0d00-f775-4611-ac67-284dd9ae7d39`
- Active recording revision: `f642b5d9-cec2-4656-804e-49bb33bc0cb5`
- External evidence directory: `D:\nursery\cp8-florida-dry-run-20260819-0530` (ACL-restricted; contains no credential)
- Hammer was not opened. The session-open endpoint, writer, acknowledgement RPC, autosave, recovery controls, and all mutation endpoints were not invoked.
- Anvil was not accessed.

The production reads were a data-only `tongs` schema dump and authenticated Storage GETs for the six paths already advertised by the active revision. The temporary credential carrier used for Storage reads was access-restricted and deleted immediately after download. No credential or token is present in this record or evidence manifest.

## Double-read identity and pointer proof

The production state was captured twice. The normalized initial and final records are byte-identical: 8,602 bytes with SHA-256 `cba7773357e34184258c4c71390d05d9f9677c68c67152798fd17bcf83f0c2a7`.

Both reads established:

- the episode belongs to the authorized workspace and points to the authorized sealed canonical recording and active revision;
- the recording is `sealed`, has media path `recordings/Episode_85d076d6_2026-08-15_08-42-01.webm`, media identity `capture-session:4d85f684-1c96-4bf5-bd32-5619777d606a`, 91,774,859 bytes, and duration 494,890 ms;
- the revision is `active`, belongs to the same workspace/workpiece/recording tuple, and has exact concurrency token `2026-08-18 15:26:51.680213+00`;
- the authority tuple remains `(editorial_authority_path = null, editorial_authority_fingerprint = null, editorial_authority_revision = 0)`;
- exactly six advertised revision artifacts exist; no editorial-authority registry row or pointer exists.

## Canonical source evidence

Every downloaded artifact matched its production registry byte count and SHA-256:

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| Editor session | 1,521 | `57d10606dc21855549aea803545e4690503a93c20dfd2e5092f40b4020c2efe2` |
| Revision transcript | 20,204 | `005e41d5a16c4ed813324a50589243f8257dd664b04dc440d7b078d690c078ef` |
| Audio polish | 83,717 | `1795e76c65badd8bd85eebb822cbb31bd3b5827c22c2c16f62adfacd5302a7b4` |
| Visual timeline | 81,774 | `36779b5c15475679354050e8a2aaf0f1cea89b3ea2159c2b60c9c5c65b212a1a` |
| Visual placements | 66,394 | `ec26a26fbc0be12e90581dad49b8d225c6d5e223cfa81a3da9a8375aac4eb4e6` |
| History | 208,379 | `5fd59f66a0e5990553865ed06907337750dfdb82cf5504cd7306772527d43ccb` |

The transcript has 137 segments. The strict v2 timeline has revision 3, 30 assets, 30 clips, and one lane. Placements contain 30 rows. Current history has three entries, base `hammer-state:beaa7731`, and head `entry:4bb8bdbc-1412-413d-ab90-d777b45d5ea9`.

The deterministic authority provenance is the earlier canonical recovery-history replacement at entry `entry:33beba0f-d06b-461a-a9f6-b4d8890b7c33`, timestamp `2026-08-15T23:04:47.193Z`. It contains one complete identity-only authority graph and zero operations. The current history contains no competing `/editorialAuthorityGraph` patch; its three entries are timing/audio state changes. The recovered timeline and placement hashes still match production exactly.

## Proposed CP-9 payload

- Canonical path: `hammer/revisions/f642b5d9-cec2-4656-804e-49bb33bc0cb5/editorial-authority.v1.json`
- Exact byte size: `751`
- SHA-256 fingerprint: `6d6c4a4d3ca2ae9a792326d6d3bc011076d07aefc31f03e78bff4c0cbc025d35`
- Authority revision transition: `0 -> 1`
- Pre-write revision row token: `2026-08-18 15:26:51.680213+00`
- Expected prior pointer tuple: `(null, null, 0)`
- Graph ID: `85d076d6-54e6-4b56-ab60-5eff4c87cdd0:plan:authority`
- Graph version: `1`
- Session ID: `session_fc4374ab-0097-4c0f-abd5-5a0099940abf`
- Source transcript ID: `hammer_transcript_85d076d6-54e6-4b56-ab60-5eff4c87cdd0_20260815124901`
- Operations and operation order: empty

Production `serializeHammerRevisionEditorialAuthorityArtifact()` produced the exact 751 bytes. Re-parse and re-serialization were byte-idempotent. Production `sha256Hex()` produced the fingerprint above. `projectEditorialAuthorityGraphFromEditPlan()` reproduced the frozen graph exactly from the persisted transcript/session identities and frozen timestamps.

## Isolated installation and reopen proof

The proposed pointer tuple and bytes were installed only into an in-memory revision projection. `loadHammerRecordingRevisionArtifacts()` read the six captured artifacts plus the proposed artifact through a local fetch stub that rejected any session or acknowledgement route. The production reader accepted the revision-scoped path, registry fingerprint, envelope schema, and workspace/workpiece/recording/revision identities.

`hydrateHammerOpenLaunchContext()` then selected `persistence`, reported a canonical basis, and retained:

- all 137 transcript segments and the transcript identity;
- the exact v2 visual timeline and all 30 placements;
- the current history bytes, base, head, and three entries (authority installation does not rewrite history);
- the editor session, audio-polish payload, sealed recording/media identity, active revision identity, and authority graph identities.

This proves the proposed authority closes the canonical reopen seam without altering Florida's editorial payload.

## Commands and controls

Representative commands (credentials omitted):

```text
supabase db dump --linked --schema tongs --data-only --use-copy -f <external-read-only-capture>
authenticated GET forge-workpieces/workpieces/<authorized-workpiece>/<advertised-revision-path>
pnpm --filter @forge/hammer exec tsx <external-cp8-verifier>
supabase db dump --linked --schema tongs --data-only --use-copy -f <external-final-read-only-capture>
```

The verifier used production implementation functions, issued no network request during its isolated installation phase, and asserted that no mocked request targeted the Hammer session or authority acknowledgement routes.

## External evidence manifest

The external package contains the exact proposed bytes, the machine-readable comparison, and initial/final normalized state records. `manifest.json` records:

- proposed bytes SHA-256: `6d6c4a4d3ca2ae9a792326d6d3bc011076d07aefc31f03e78bff4c0cbc025d35`;
- comparison record SHA-256: `29e824415923dd14fd8baf0098fdc1e42ef62c7ed52fcff83798acde0cb3a8e6`;
- identical initial/final state SHA-256: `cba7773357e34184258c4c71390d05d9f9677c68c67152798fd17bcf83f0c2a7`.

## CP-9 review gate

CP-9 remains unstarted and unauthorized. A separate single-use authorization must name the exact path, fingerprint, 751-byte payload, expected prior tuple `(null, null, 0)`, and exact row token above. Before any future write, the caller must re-read and require every identity, artifact hash, active-revision status, row token, and prior pointer tuple to match this record; any difference is a stop condition.
