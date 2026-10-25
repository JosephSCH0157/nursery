# Gate 6O episode storage-tier successor

Gate 6O preserves the immutable historical migration chain, B1 baseline, Gate 6B trust anchor, and Gate 6H successor evidence. It records one new shared-tail migration after Gate 6H.

The historical migration `20260403190000_tongs_episode_deletion_modes.sql` defined `tongs.episodes.storage_tier` as `text NOT NULL DEFAULT 'hot'` with the validated `hot`/`cold` check. The approved B1 and pre-Slice-A snapshots preserve all other objects from that deletion-lifecycle contract but contain a dropped-column placeholder where `storage_tier` had existed. The catalog gate passed because its approved target carried the same omission; the authenticated browser fixture exposed the gap when it used the application-required column.

Migration `20261025070300_tongs_episode_storage_tier_parity.sql` first validates the surviving lifecycle columns, constraint, tables, and index. It rejects an incompatible pre-existing storage-tier definition or value. When the column is absent it adds only the historical definition and check constraint. It does not update episode rows, ACLs, RLS, policies, ownership, default privileges, financial state, or provider authority.

The frozen predecessor catalog remains Gate 6H's 15,901-entry contract. Gate 6O separately records a 15,903-entry successor:

- Production-normalized SHA-256: `766361f8b22a131952808335ca0719c8ddccff8f15ba50a0f348b32e88f489cd`.
- Local `wrappers` 0.5.7 SHA-256: `37c7bb1483dfa11f7aaf32ce5071d8614074b64e488bad074e028935453714ef`.
- Added entries: `column|tongs.episodes.storage_tier` and `constraint|tongs.episodes.episodes_storage_tier_check`.

The machine-readable authority is [successor-contract.v1.json](successor-contract.v1.json). The complete normalized target is [successor-catalog-fingerprint.json](successor-catalog-fingerprint.json).
