# Hammer history epochs — HE-6 Florida production transition

Execution date: 2026-08-20 UTC

Result: **PASS — the single approved Florida Oranges epoch transition committed and strict read-only verification passed**

Production project: `wtvdjndyxegudufrompx`

Frozen proposal commit: `21268e88459f5340f4ec64e813ae13a01da37957`

No Hammer editor route was opened or mounted. No session-open, recovery, autosave, transcript, timeline, placement, audio, editorial-authority, recording, packaging, or unrelated writer was invoked. The live Hammer smoke test remains separately unauthorized.

## Authorized identity and preflight

- Workspace: `494c2ae5-9037-4208-b898-fab4898ab430`
- Workpiece: `85d076d6-54e6-4b56-ab60-5eff4c87cdd0`
- Sealed canonical recording: `6c5b0d00-f775-4611-ac67-284dd9ae7d39`
- Active revision: `f642b5d9-cec2-4656-804e-49bb33bc0cb5`
- Authenticated actor: `42c3de1d-bd24-41fe-abd9-640f17518b2c` (`jschramer@gmail.com`)
- Workspace role: `owner`

The ordinary authenticated localhost application transport identified the exact actor. The database commit boundary independently enforced authenticated editor authority before mutation. A scoped read-only membership verification also confirmed the actor remains the workspace owner.

Immediately before the write, the production transport reconfirmed:

- active status, workspace/workpiece/recording/revision joins, and canonical recording identity;
- revision token `2026-08-19T11:11:01.882348+00:00`;
- prior pointer `hammer/revisions/f642b5d9-cec2-4656-804e-49bb33bc0cb5/history.v1.json`;
- predecessor registry revision `80`, token `2026-08-18T15:26:50.828229+00:00`, size `208,379`, and SHA-256 `5fd59f66a0e5990553865ed06907337750dfdb82cf5504cd7306772527d43ccb`;
- all seven protected artifact bytes, hashes, registry revisions, and microsecond tokens;
- reconstructed canonical base `hammer-state:03c2c9fc`;
- frozen epoch size `1,672` and SHA-256 `9a67e89a5ebdc18af6aeb96dbf99701c7c3554e4cf2ece8a35cb88b771e3e5d0`;
- operation fingerprint `fb62f3e71e6dd4762fcb7196366cea0466790a2ce9bb7f110fd0efeb37f6dcd7`;
- unused idempotency key `hammer-epoch:9ce5376d-a1f3-4aa9-8972-c37a36bbd248`.

Any drift would have stopped the harness before its single execution branch. Every precondition matched the committed HE-5 proposal.

## Coordinator execution

Exactly one call was made through `startHammerHistoryEpoch()` and the production Tongs coordinator. It returned `committed`:

| Field | Result |
| --- | --- |
| Transition ID | `ab07210d-1968-4120-a517-77621a7f45ab` |
| Epoch ID | `53e3a94f-9f2e-4bd7-85bb-bd311f81939d` |
| Idempotency key | `hammer-epoch:9ce5376d-a1f3-4aa9-8972-c37a36bbd248` |
| Operation fingerprint | `fb62f3e71e6dd4762fcb7196366cea0466790a2ce9bb7f110fd0efeb37f6dcd7` |
| Prior revision token | `2026-08-19T11:11:01.882348+00:00` |
| Committed revision token | `2026-08-20T18:47:02.687149+00:00` |
| Committed history pointer | `hammer/revisions/f642b5d9-cec2-4656-804e-49bb33bc0cb5/history/epochs/53e3a94f-9f2e-4bd7-85bb-bd311f81939d.v1.json` |

The only new registry/storage objects were:

| Object | Bytes | SHA-256 | Registry revision | Registry token |
| --- | ---: | --- | ---: | --- |
| `hammer/revisions/f642b5d9-cec2-4656-804e-49bb33bc0cb5/history/archive/5fd59f66a0e5990553865ed06907337750dfdb82cf5504cd7306772527d43ccb.history.v1.json` | 208,379 | `5fd59f66a0e5990553865ed06907337750dfdb82cf5504cd7306772527d43ccb` | 1 | `2026-08-20T18:47:01.332921+00:00` |
| `hammer/revisions/f642b5d9-cec2-4656-804e-49bb33bc0cb5/history/epochs/53e3a94f-9f2e-4bd7-85bb-bd311f81939d.v1.json` | 1,672 | `9a67e89a5ebdc18af6aeb96dbf99701c7c3554e4cf2ece8a35cb88b771e3e5d0` | 1 | `2026-08-20T18:47:02.527958+00:00` |

The archive download is byte-identical to the revision-80 predecessor. The epoch download is byte-identical to the frozen HE-5 proposal. The CAS changed only `recording_revisions.history_path` and its row token.

## Post-transition verification

Authenticated application readback and scoped production metadata/storage reads established:

- one `hammer_history_epochs` row and one `hammer_history_epoch_transitions` row for the revision;
- zero epoch-head rows and zero epoch-head-transition rows;
- exact epoch, transition, actor, identity, path, predecessor, fingerprint, and idempotency values;
- exact registry/storage byte agreement for the archive and epoch;
- unchanged byte counts, SHA-256 values, registry revisions, and registry tokens for editor session, transcript, audio, visual timeline, visual placements, the original immutable legacy history, and editorial authority;
- exactly two workpiece-file changes in the execution window: the authorized archive and epoch;
- exactly one recording-revision row change in the execution window: the authorized history-pointer CAS;
- no unrelated Florida row, pointer, registry object, or artifact change in the coordinator scope.

Strict production-reader hydration selected the new pointer as `epoch_anchor`, installed sequence `0`, retained base `hammer-state:03c2c9fc`, and produced zero history entries. It did not use legacy fallback or traverse the divergent predecessor.

## Idempotency result

The preflight operation readback was `absent`; post-commit readback returned the single committed transition and exact operation fingerprint. No second coordinator POST was necessary, so no duplicate mutation was attempted. Database uniqueness plus the operation readback prove the idempotency key identifies exactly one transition.

## External evidence

The complete credential-free evidence is outside the repository at:

```text
D:\nursery\he6-florida-production-transition-20260820
```

| Evidence | SHA-256 |
| --- | --- |
| `preflight.json` | `49894d762ae7806c8dcd6b4a14df68d936dd0f7fd046b51cbd745eb7d2367785` |
| `coordinator-result.json` | `92d43563d3be2eaa1b6b4dc0b290148d2587a96edd7af3a3d5fe985247d93e1f` |
| `production-scope-postverify.json` | `83cb1280945c46c0366de49c569a0e8a00f3003cc85ff46dc9c99c357ae85cc1` |
| `owner-verification.json` | `672fecb160ea558eaea4c4b9626e7db03ec4d224eb54e90c2eecc5768a509a8f` |

The temporary localhost execution harness was removed before this receipt was committed. The pre-existing `apps/nursery/public/forge-nav.json` modification was neither touched nor staged.

HE-6 stops here. A live Florida Oranges Hammer smoke test requires a separate explicit order.
