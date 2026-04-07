## Podcaster’s Forge v1.2.7

Date: 2026-04-07  
Tag: `v1.2.7`

### Highlights
- Hammer: new **media intake on the Project Library** with two parallel entry points:
  - **Attach Media** on an episode/workpiece card (imports as authoritative kept take).
  - **Standalone Import** in the header (creates a new workpiece cradle, then imports).
- Tongs: **asset variant resolver + bandwidth discipline foundations** (variant serving + telemetry).
- Nursery: **Admin Panel v1** (AI usage overview, inspection, exports) and org/workspace access tooling.
- Anvil: substantial **ASR scroll stability** tuning and **WhisperBridge** hardening (FFmpeg fallback paths and better error handling).

### Hammer — Intake (Editing)
- Added `Attach Media` per workpiece card and `Standalone Import` in the header.
- Intake writes imported media to `recordings/imported-*` via Tongs `commit-file`, then marks it authoritative with `take_kept`.
- Standalone import creates a new cradle via `POST /tongs/cradles` (label defaults to `Standalone Edit — <filename>`).
- Adds structured debug logging under `[hammer-intake]` for mode/ids/type/path/result.

### Tongs — Storage + Variants (Canonical)
- Added canonical asset variant contract and resolver (`original | preview | thumb`) with strict non-escalation rules.
- Added variant-serving API surface and supporting telemetry primitives.

### Nursery — Admin + Access
- Added Admin panel surfaces and exports for operational visibility.
- Added org/workspace sharing and access management wiring + smoke coverage.

### Supabase / Migrations
This release includes new migrations (apply in order during deploy):
- `supabase/migrations/20260404103000_tongs_asset_variant_contract.sql`
- `supabase/migrations/20260404121500_tongs_admin_panel_v1.sql`
- `supabase/migrations/20260404133000_tongs_admin_panel_exports.sql`
- `supabase/migrations/20260404151500_tongs_workspace_access_union_rpc.sql`

### Notes
- Cleanup: removed tracked test artifact `.last-run.json` files and added ignore rules to prevent reintroducing them.

