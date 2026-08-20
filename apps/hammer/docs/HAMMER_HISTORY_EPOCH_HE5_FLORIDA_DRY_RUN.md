# Hammer history epochs — HE-5 Florida production dry run

Dry run: 2026-08-20 UTC

Result: **PASS — authenticated, mutation-free production reconstruction and isolated epoch projection completed**

This checkpoint constructed a single proposed Florida Oranges history-epoch transition using the committed Hammer and Tongs implementations. It did not mount Hammer, open a session, upload an object, register a file, call either history RPC, alter the revision pointer, create an epoch/head/transition, retry, or invoke recovery.

## Scope and authenticated identity

- Production project: `wtvdjndyxegudufrompx`
- Reconstruction baseline HEAD: `862a67aa14a966cd9d0946ba58e6d5433765182c`
- Workspace: `494c2ae5-9037-4208-b898-fab4898ab430`
- Workpiece: `85d076d6-54e6-4b56-ab60-5eff4c87cdd0`
- Sealed canonical recording: `6c5b0d00-f775-4611-ac67-284dd9ae7d39`
- Active recording revision: `f642b5d9-cec2-4656-804e-49bb33bc0cb5`
- Authenticated browser account: `jschramer@gmail.com`
- Authenticated actor: `42c3de1d-bd24-41fe-abd9-640f17518b2c`
- Workspace role: `owner` (satisfies the migration's editor-role predicate)

The localhost application reported an authenticated Forge Cloud session for the named account and selected Black Anvil Workspace. A scoped read of that exact Auth user and workspace membership proved that the proposed actor UUID belongs to the browser account and has owner/editor authority. No browser credential was extracted or recorded.

## Fresh production preconditions

The active revision remained:

- status `active`;
- `updated_at` token `2026-08-19T11:11:01.882348+00:00`;
- history pointer `hammer/revisions/f642b5d9-cec2-4656-804e-49bb33bc0cb5/history.v1.json`;
- canonical recording `6c5b0d00-f775-4611-ac67-284dd9ae7d39` with status `sealed`.

All seven advertised revision artifacts were downloaded through scoped, read-only production Storage GETs and checked against their registry byte counts and SHA-256 values:

| Artifact | Bytes | SHA-256 | Registry revision | Registry token |
| --- | ---: | --- | ---: | --- |
| editor session | 1,477 | `dbb55ed1d7a4ce7122daf2582f0d87762a4d3bec7bd200e5785c826dee6f11a3` | 151 | `2026-08-19T09:02:13.322908+00:00` |
| transcript | 20,204 | `005e41d5a16c4ed813324a50589243f8257dd664b04dc440d7b078d690c078ef` | 150 | `2026-08-19T09:02:14.488718+00:00` |
| audio | 83,717 | `1795e76c65badd8bd85eebb822cbb31bd3b5827c22c2c16f62adfacd5302a7b4` | 212 | `2026-08-19T09:02:15.624366+00:00` |
| visual timeline | 81,728 | `b25949c9346245e0f44cc7db2021db0f366edf284cf2b7869a2a4382dab460e3` | 150 | `2026-08-19T09:02:16.657883+00:00` |
| visual placements | 66,394 | `ec26a26fbc0be12e90581dad49b8d225c6d5e223cfa81a3da9a8375aac4eb4e6` | 192 | `2026-08-19T09:02:17.641662+00:00` |
| legacy history | 208,379 | `5fd59f66a0e5990553865ed06907337750dfdb82cf5504cd7306772527d43ccb` | 80 | `2026-08-18T15:26:50.828229+00:00` |
| editorial authority | 751 | `4a233d406b37abab0d9fb7ae708464aacc03cba6a188af96211669b6bde2a7bc` | 2 | `2026-08-19T09:02:21.504185+00:00` |

The exact current legacy bytes still classify as `history_current_head_mismatch`; the dry run did not reinterpret, repair, merge, or rewrite them.

## Canonical base reconstruction

The committed Hammer hydration/state adapters reconstructed the proposed epoch base from:

- 137 canonical transcript segments;
- the strict v2 visual timeline;
- 30 persisted placements, retaining the existing uncertainty evidence;
- the persisted audio edit projection;
- the default studio-rack state used by canonical baseline installation;
- revision-owned editorial authority revision 2;
- persisted output selection and selected transcript segment;
- mount baseline playhead `0` and null timing hint.

The exact resulting editor-state identity is:

```text
hammer-state:03c2c9fc
```

The epoch pins the five independently persisted component hashes for audio, editorial authority, transcript, visual placements, and visual timeline. Hammer's serializer and Tongs' canonical-byte serializer produced identical bytes. Parsing those bytes and serializing them a second time was byte-identical.

## Frozen proposed transition

| Field | Proposed value |
| --- | --- |
| Epoch ID | `53e3a94f-9f2e-4bd7-85bb-bd311f81939d` |
| Idempotency key | `hammer-epoch:9ce5376d-a1f3-4aa9-8972-c37a36bbd248` |
| Initiating user | `42c3de1d-bd24-41fe-abd9-640f17518b2c` |
| Creation timestamp | `2026-08-20T16:48:00.996Z` |
| Expected revision token | `2026-08-19T11:11:01.882348+00:00` |
| Expected prior history pointer | `hammer/revisions/f642b5d9-cec2-4656-804e-49bb33bc0cb5/history.v1.json` |
| Predecessor registry revision | 80 |
| Predecessor registry token | `2026-08-18T15:26:50.828229+00:00` |
| Predecessor bytes | 208,379 |
| Predecessor SHA-256 | `5fd59f66a0e5990553865ed06907337750dfdb82cf5504cd7306772527d43ccb` |
| Archive path | `hammer/revisions/f642b5d9-cec2-4656-804e-49bb33bc0cb5/history/archive/5fd59f66a0e5990553865ed06907337750dfdb82cf5504cd7306772527d43ccb.history.v1.json` |
| Epoch path | `hammer/revisions/f642b5d9-cec2-4656-804e-49bb33bc0cb5/history/epochs/53e3a94f-9f2e-4bd7-85bb-bd311f81939d.v1.json` |
| Epoch bytes | 1,672 |
| Epoch SHA-256 | `9a67e89a5ebdc18af6aeb96dbf99701c7c3554e4cf2ece8a35cb88b771e3e5d0` |
| Operation fingerprint | `fb62f3e71e6dd4762fcb7196366cea0466790a2ce9bb7f110fd0efeb37f6dcd7` |

This proposal preserves the predecessor original path and bytes. It would stage one byte-identical content-addressed archive and one empty epoch anchor, then CAS the active revision history pointer exactly once. It proposes no head and no edit.

## Local production-code validation

The frozen request passed:

- Tongs strict request/envelope identity validation;
- canonical archive and epoch path validation;
- exact predecessor registry and byte validation;
- deterministic epoch serialization and SHA-256 generation;
- complete operation-fingerprint generation;
- an in-memory execution of the real two-phase Tongs coordinator, producing one projected archive candidate, one projected epoch candidate, and one projected commit;
- Hammer strict epoch-envelope hydration using the proposed registry tuple;
- installation as sequence-zero `epoch_anchor` with zero entries and base `hammer-state:03c2c9fc`.

The isolated hydration did not use legacy fallback and did not traverse the divergent predecessor.

## Post-run no-write proof

A second read-only production capture completed after construction:

- revision row: identical;
- all seven registry tuples and downloaded artifact bytes: identical;
- proposed archive registry rows: 0;
- proposed epoch registry rows: 0;
- epoch rows for the recording revision: 0;
- transition rows for the recording revision: 0;
- pointer changes: 0;
- production writes: 0.

No Anvil identity or artifact was queried.

## Evidence and next authorization boundary

The external evidence package is:

```text
D:\nursery\he5-florida-dry-run-20260820
```

Key evidence hashes:

| File | SHA-256 |
| --- | --- |
| `production-read.json` | `3d352728b021a391970f96483f60c3cefd0b94963a8b0cee9c9ed29df8ac8809` |
| `proposed-epoch.v1.json` | `9a67e89a5ebdc18af6aeb96dbf99701c7c3554e4cf2ece8a35cb88b771e3e5d0` |
| `he5-manifest.json` | `1abd145cf7284019fa57ed5fc3073bc61c0121963e86db18fd0e4890b8d667c8` |
| `actor-auth-verification.json` | `b18e73dea18ca5ba7927153d8958ec23a6439386d566e4fa0823684d8fac0293` |
| `post-read-verification.json` | `aba84c5b80da40326f4d837a5a82e97b98752b301f6b9af8ae0716f586e53f33` |

The package contains no committed credential. Any production transition remains separately unauthorized. A later single-use approval must name the project, identities, epoch/archive paths, epoch bytes and SHA-256, predecessor tuple, revision token, idempotency key, and operation fingerprint above; it must require an immediate pre-write revalidation and stop without mutation if any value differs.
