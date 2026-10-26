# Gate 5F Stage A results

> Superseded for current execution evidence by
> [`ACL_RECONCILIATION_RESULTS.md`](ACL_RECONCILIATION_RESULTS.md). This record
> is preserved unchanged below as the original Stage A conclusion.

Date: 2026-10-23

Status: **passed with synthetic six-column history only; no hosted request or authentic metadata transfer occurred**.

## Frozen inputs

- Historical migrations: 414.
- Historical manifest SHA-256: `66a094037af456e95b34ec0ca3fb18bcc791d296fa6c2619af9639a87f7d7f40`.
- Pre-Slice-A fixture SHA-256: `abf0d6f03dd25dc9d4af3f30bcca8d8be6047045033b399d6ba2918315bc9751`.
- Approved normalized catalog: 15,901 entries, SHA-256 `49d06bfb75f11053662c5966e021b13e96ac78006759ca39b33bede71db7266f`.
- Supabase CLI: `2.84.2`.

## Exporter certification

- Dedicated endpoint and frozen single-SELECT query only.
- Successful synthetic response size: 7,177,708 bytes.
- Maximum accepted response size: 12,582,912 bytes (12 MiB).
- DPAPI CurrentUser encryption preceded the first payload disk write.
- Exact six-column shape, 411 records, chronological frozen prefix, and seven hashes were required.
- Malformed, partial/count-mismatched, extra-field, oversized, interrupted, stale, expired, wrong-project, extra-permission, bad-fingerprint, legacy, missing, and broader credentials were rejected.
- Raw response and credential sentinels did not appear in errors.
- Process-token and capsule cleanup passed.

## Two-lane coordinator

Both `permissive` and `restrictive` default-privilege lanes passed independently:

- 411 synthetic source records restored transactionally.
- All seven source-to-target hashes matched.
- Pending versions were exactly `20261020171517`, `20261020171519`, `20261020171522`, and `20261022000000`.
- Normal local CLI migration execution produced 415 records and marker `historical-v1`.
- The original 411 records and all seven hashes remained unchanged.
- Duplicate, incomplete, corrupted-ciphertext, mismatched-digest, and interrupted-restoration tests rolled back completely.
- Pre- and post-upgrade catalog hashes both matched `49d06bfb75f11053662c5966e021b13e96ac78006759ca39b33bede71db7266f` with 15,901 entries.
- The only normalized environmental difference was local `wrappers` 0.5.7 under CLI 2.84.2.
- Catalog, ACL, RLS, cross-user isolation, signup/profile/workspace bootstrap, Anvil compatibility, pairing, Quench discovery, subscription/billing, Storage policy, Data API, and financial inactivity checks passed.
- Paid provider operations: zero.
- Hosted requests: zero.
- Existing Nursery resources were unchanged and all task-created resources were removed.

The authentic mode remains unexecuted and requires separate owner authorization plus a freshly reviewed credential. Authentic-history certification will not exercise production customer or financial rows, so production data-dependent upgrade risk remains for later authorization.
