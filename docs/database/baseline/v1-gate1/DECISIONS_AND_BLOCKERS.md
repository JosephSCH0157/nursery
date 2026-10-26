# Gate 1 decisions and blockers

Owner decisions required before baseline generation or routing implementation:

1. **Reference rows:** approve the proposed zero-record v1 allowlist, or supply record-level approvals using the evidence fields in `REFERENCE_DATA_CONTRACT.md`. Without this decision, no baseline data section may be generated.
2. **Full contract fingerprint:** approve acquisition and review of a normalized, schema/security-only production capture. The public Slice A oracle is exact; table names alone are not an exact 491-table Tongs contract.
3. **Baseline version reservation:** choose the `B1` start/end versions after the baseline file count is known. The range must be above `20261020171522`, and future shared-tail versions must be above the frozen baseline end.
4. **Lineage marker:** approve the administrative schema/name and whether the first shared-tail migration may establish `historical-v1` only after validating the complete 414-version set. This is a new tail migration, not a historical amendment.
5. **Tail source:** approve root `supabase/migrations` as the canonical historical-plus-tail source, with the fresh assembler selecting only versions above the baseline cutoff, or approve another single canonical tail location after proving CLI workdir assembly.
6. **CLI pin:** reconcile the exact 2.84.2 certification pin with the repository's `supabase` package range `^2.84.4` and the separate workflow job on CLI 2.72.7.
7. **Hosted-upgrade capsule:** decide whether importing an immutable, signed schema-plus-genuine-history snapshot into a disposable project is acceptable certification fixture restoration. If this counts as prohibited manual history manipulation, a supported provider mechanism that creates a no-customer-data clone while preserving genuine history is required. None has yet been verified, so capsule implementation is blocked.
8. **Legacy certification tools:** decide whether `scripts/certify-mid-september-migration-replay.ps1`, `scripts/certify-anvil-migration-chain.mjs`, and `scripts/verify-tongs-clean-migration-chain.mjs` should be quarantined/renamed. They use `--include-all` or directly alter local migration history and must not be mistaken for supported lineage gates.

Hard stop conditions remain: any additional historical amendment, production behavior change, customer/operational data in a fixture, financial activation, broader grant, relaxed assertion, destructive production action, or reliance on unsupported CLI discovery/history behavior.
