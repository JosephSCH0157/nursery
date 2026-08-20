# HE-7B canonical editor-state hash repair

Date: 2026-08-20

Baseline: `90604a1cadcb78f5160203adebeafebff0a51857`

Scope: local implementation and isolated synthetic verification only

## Decision

Editor-state hashes now use `canonical-json-v1`: object keys are recursively sorted, array order is retained, and JSON values retain their existing distinctions. The FNV-1a token shape remains `hammer-state:xxxxxxxx`; only the serialized input is versioned.

The prior raw `JSON.stringify` behavior is named `json-stringify-v0`. A legacy epoch anchor is accepted only when the exact persisted-state reconstruction produces its stored legacy hash and the five component registry SHA-256 values still equal the hashes pinned by the epoch. The installed state retains the separately computed canonical hash for later history operations.

The immutable epoch base remains unchanged. The first head after a verified legacy anchor carries an explicit base discriminator plus `canonical_editor_state_hash`, while the head result is explicitly `canonical-json-v1`. The database RPC continues to bind `base.editor_state_hash` to the immutable epoch row; no RPC, migration, RLS, grant, or CAS predicate changed.

## Florida-shaped offline proof

Only the frozen HE-7A files were read. No production request or Hammer mount occurred.

- legacy anchor: `hammer-state:03c2c9fc`
- legacy reopen: `hammer-state:fbacc72a`
- canonical anchor: `hammer-state:5d6bc1c6`
- canonical reopen: `hammer-state:5d6bc1c6`
- result: the 91 timeline object-key permutations are nonsemantic under `canonical-json-v1`

Tests retain array order, missing/null/false/zero/empty distinctions, and demonstrate that real value changes still change the hash. Random legacy hashes and component-authority drift remain fail-closed. Existing valid legacy ledger verification remains available.

## Isolated lifecycle

Disposable project: `forge-he3-he7b-20260820c`

API/DB and all published services: loopback only

Synthetic identities: `a31…` through `a3a…`; forbidden-host and forbidden-identity hits: zero

The fixture deliberately reversed timeline object-key order between creation and reopen. Both sides produced `hammer-state:ec205e9b`. The authenticated lifecycle completed:

`archive → sequence-0 anchor → edit → sequence-1 head → reopen → undo → redo`

The predecessor remained byte-identical, the head committed once, undo returned playhead `0`, redo returned playhead `2`, and the fixture performed no mount/reopen persistence. The named containers, volumes, network, and temporary files were removed; the existing Nursery stack was unchanged.

## Verification

- Hammer focused history/epoch/reopen tests: pass
- Hammer full suite: 161/161 pass
- Tongs full suite: 364/364 pass; focused coordinator suite: 18/18 pass
- Hammer and Tongs typechecks: pass
- Hammer type-safety and architecture ratchets: pass
- Epoch/head database verifiers: pass
- Migration contract suite: 9/9 pass
- Hammer lint: 0 errors; 78/84 grandfathered Hook warnings (no new debt)
- Tongs lint: pass
- Hammer production build: pass; entry 215,999/225,000 bytes, total JS 262,554/275,000 bytes, gzip 86,687/90,000 bytes
- `git diff --check`: pass (line-ending notices only)

## Security review

The change adds no endpoint, role, permission, storage path, database object, or mutation route. Legacy acceptance requires both the exact legacy state hash and all five pinned component hashes. Unsupported discriminator shapes, forged hashes, mismatched identities, invalid anchors/heads, stale CAS state, and component drift remain terminal. The Tongs transport accepts only the two named algorithm values and only the exact optional field sets.

No production endpoint, Florida reopen, artifact write, pointer change, or HE-8 action occurred. `apps/nursery/public/forge-nav.json` remains protected and excluded.
