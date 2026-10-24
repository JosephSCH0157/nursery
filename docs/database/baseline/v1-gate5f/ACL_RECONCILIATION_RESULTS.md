# Gate 5F historical fixture ACL reconciliation

Date: 2026-10-23

Status: **passed after the 2026-10-24 catalog-output reconciliation; no hosted request or authentic metadata transfer occurred in either local reconciliation**.

This record supersedes `STAGE_A_RESULTS.md` as the current Gate 5F synthetic execution evidence. The earlier record remains retained evidence. Gate 5B is not superseded because the fixture itself was proved correct and remains byte-for-byte unchanged.

## Authoritative pre-Slice-A ACL

The read-only 411-version hosted catalog capture retained the SHA-256 entry `09b3494fa1ad36a6c27b5d6bacd175da9b3e5abf66c4bf79ce9120de9b200676` for `function|public.start_trial_on_first_login()`. The fixture produced that same complete normalized function entry in both ambient-default lanes and reproduced the approved application catalog contract `49d06bfb75f11053662c5966e021b13e96ac78006759ca39b33bede71db7266f`.

The resulting historical ACL is:

- `PUBLIC`: no direct `EXECUTE` grant;
- `anon`: no effective `EXECUTE` privilege;
- `authenticated`: no effective `EXECUTE` privilege;
- `service_role`: effective `EXECUTE` retained;
- owner `postgres`: owner authority retained.

The fixture already neutralizes ambient `postgres` default grants before creating application functions, then restores the hosted default-privilege contract after explicit object ACLs are installed. Adding new fixture revocations would not have reconciled a genuine historical difference and was therefore rejected.

Fixture SHA-256 remains `abf0d6f03dd25dc9d4af3f30bcca8d8be6047045033b399d6ba2918315bc9751`; the Gate 5B manifest and conclusions remain unchanged.

## Failure cause and correction

Gate 5F previously loaded SQL files by converting UTF-8 file bytes to a PowerShell string and piping that string to native `docker exec`. Native-pipe encoding is controlled by the caller's `$OutputEncoding`. The affected function body contains U+2019 in a comment. A local reproduction produced different native-pipe SHA-256 values for UTF-8 and ASCII and showed that ASCII replaces U+2019 with `?`. Because function definitions are fingerprinted exactly, that transport mutation appeared as a one-function catalog mismatch.

Gate 5B did not have this input defect: it used `docker cp` followed by `psql -f`, which preserves source bytes. Gate 5F now uses the same byte-preserving input transport and removes each temporary container file in `finally`.

Regression assertions now require the exact historical role privileges, absence of a direct `PUBLIC` grant, retention of the U+2019 UTF-8 sentinel, and the same effective function ACL after the four-migration upgrade. The two security tests are now included in the Gate 5D/5F tooling hash manifest.

## Synthetic certification

The complete Gate 5F `StageASynthetic` coordinator passed while the caller deliberately used ASCII `$OutputEncoding`, proving that reviewed SQL-file transport no longer depends on caller encoding.

Both permissive and restrictive lanes independently reported:

- 411 restored synthetic history rows;
- seven matching source-to-target hashes;
- pending versions exactly `20261020171517`, `20261020171519`, `20261020171522`, and `20261022000000`;
- normal CLI application of those four migrations;
- 415 final history rows and marker `historical-v1`;
- original 411 rows and all seven hashes unchanged;
- pre- and post-upgrade catalog SHA-256 `49d06bfb75f11053662c5966e021b13e96ac78006759ca39b33bede71db7266f` with 15,901 entries;
- only the approved local `wrappers` 0.5.7 environmental difference;
- catalog, ACL, RLS, cross-user, Auth/profile/workspace, Anvil, pairing, Quench, subscription/billing, Storage, Data API, and financial-inactivity checks passed;
- two isolated users, profiles, and workspaces and three global Quench scopes through the local Data API;
- zero paid-provider operations and zero hosted requests;
- duplicate, incomplete, corrupted-ciphertext, mismatched-digest, and interrupted-restoration rollback checks passed;
- task cleanup and existing Nursery resource preservation passed.

The seven synthetic history hashes were:

- all columns: `1332167f52bea8aa71b9f89d88cd3cae3515f451cc07a6a4ef29dc5ef9ad0c20`;
- version: `9ff71b75bde4fbe4d06f511d024c84702200b1c4349ad08eecbd3a9022913596`;
- statements: `6acdaacc75a4533225761ade9e8014b80396390143c12b165467000e361247ca`;
- name: `8badd1aa410a4f4c14e7c7f371c2bcb27ed272d88e2076749e0eede01b922afc`;
- created by: `5bb44411aa9c9901f5127568dedf39a20bb5ef7cae26a8bc7f7d738e873d81bb`;
- idempotency key: `aa83caf58949fe1556ac2e1945e3cbced4704b28ba7d296e932966f240c4f3fc`;
- rollback: `7b99bb16d1e9b0b1027f020a7820c4e7ab2d80088058202fee02a182470951dd`.

## Superseded 2026-10-23 decision boundary

The input-only result originally recommended a separately owner-authorized authentic retry. The next owner-run attempt disproved that readiness conclusion and failed at the still-encoding-dependent catalog-output boundary. This paragraph is retained to make that supersession explicit rather than silently rewriting the earlier conclusion.

## 2026-10-24 catalog-output reconciliation

The next owner-run authentic attempt reproduced the same one-function mismatch despite the byte-preserving SQL input fix. Local reproduction established the remaining defect: `capture-canonical-baseline-v1-catalog.ps1` routed Supabase CLI CSV stdout through PowerShell text decoding. `[Console]::OutputEncoding = IBM437` reproduced the exact `public.start_trial_on_first_login()` mismatch while all database-side ACL and UTF-8 assertions passed first.

The catalog reader now captures Supabase CLI stdout directly as bytes, strictly validates UTF-8, preserves quoted multiline CSV records, and explicitly sets the child process workdir to PowerShell's pushed disposable workdir. The capture script is now frozen in the Gate 5D/5F tooling manifest at SHA-256 `4e1cce30b99029443a9230548d8371844fdf54ac22ac854254efa6eb8b4a87a7`.

The focused permissive fixture lane passed with `[Console]::OutputEncoding = IBM437`. The complete `StageASynthetic` coordinator then passed with both `$OutputEncoding = ASCII` and `[Console]::OutputEncoding = IBM437`. Both permissive and restrictive lanes again restored 411 rows, matched all seven hashes, discovered and normally applied the exact four migrations, finished with 415 rows and `historical-v1`, matched the 15,901-entry catalog before and after upgrade, passed all application/security/financial tests, made zero hosted requests and paid operations, and cleaned all task resources while preserving Nursery.

The local synthetic workflow is ready for owner review. A further authentic retry still requires a fresh reviewed token and separate explicit authorization. This result does not exercise production customer or financial rows and authorizes no integration, deployment, hosted migration, or production write.
