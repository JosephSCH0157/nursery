# Gate 5D Stage 1B synthetic certification evidence

Certification date: 2026-10-22

Branch: `codex/supabase-public-slice-a`

Input commit: `5b269727b9daaf1665d73dc67d6fae00387278b0`

Supabase CLI: `2.84.2`

The integrated command was:

```powershell
./scripts/invoke-gate5d-authentic-history-certification.ps1 `
  -Mode Stage1Synthetic `
  -RepositoryRoot D:\nursery\nursery
```

No authentic metadata, hosted request, provider operation, production write, or customer/financial data was used. The deterministic synthetic history contained 411 records and exercised all six metadata columns, NULLs, arrays, multiline SQL, Unicode, quoting, and backslashes.

## Seven synthetic-history hashes

| Contract field | SHA-256 |
| --- | --- |
| all columns | `1332167f52bea8aa71b9f89d88cd3cae3515f451cc07a6a4ef29dc5ef9ad0c20` |
| version | `9ff71b75bde4fbe4d06f511d024c84702200b1c4349ad08eecbd3a9022913596` |
| statements | `6acdaacc75a4533225761ade9e8014b80396390143c12b165467000e361247ca` |
| name | `8badd1aa410a4f4c14e7c7f371c2bcb27ed272d88e2076749e0eede01b922afc` |
| created_by | `5bb44411aa9c9901f5127568dedf39a20bb5ef7cae26a8bc7f7d738e873d81bb` |
| idempotency_key | `aa83caf58949fe1556ac2e1945e3cbced4704b28ba7d296e932966f240c4f3fc` |
| rollback | `7b99bb16d1e9b0b1027f020a7820c4e7ab2d80088058202fee02a182470951dd` |

Both privilege lanes verified all seven hashes before commit and verified them unchanged after the shared tail. Normal CLI discovery found exactly `20261020171517`, `20261020171519`, `20261020171522`, and `20261022000000`. Both lanes ended at 415 rows with lineage `historical-v1`.

## Passed controls

- permissive and restrictive default-privilege lanes;
- duplicate and incomplete history rejection;
- corrupted ciphertext rejection;
- mismatched digest and injected interruption full rollback;
- pre- and post-upgrade catalog/security parity;
- normalized catalog SHA-256 `49d06bfb75f11053662c5966e021b13e96ac78006759ca39b33bede71db7266f` with 15,901 entries;
- only the approved local `wrappers` 0.5.7 compatibility difference;
- signup, profile/workspace bootstrap, Anvil persistence, pairing, subscription/billing, Quench discovery, Data API access, cross-user isolation, and financial inactivity/paid-operation denial;
- success and failure teardown, with existing Nursery containers and volumes unchanged.

## Remaining boundary

This proves the integrated local synthetic workflow, not authenticity of hosted migration metadata and not production-data-dependent upgrade behavior. The local token fingerprint attestation cannot independently verify Supabase-side permissions, project restrictions, revocation state, or operator authority. Authentic export remains blocked pending separate Stage 2 owner authorization and immediate Supabase-side scope review.
