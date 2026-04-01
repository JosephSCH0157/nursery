## Podcaster’s Forge v1.2.3

### Highlights
- Rolled out the canonical Stripe catalog wiring for explicit one-product-per-offer billing.
- Added real Account actions in Forge Billing:
  - Edit Profile now persists `display_name`.
  - Update Password now uses the real auth password update flow with clear success/error states.
- Fixed local mirror behavior for workspace-scoped storage so mirror writes resolve against the active workspace.

### Billing and Catalog
- Updated Stripe catalog integration to use live canonical product/price IDs for:
  - Creator monthly/quarterly
  - Pro monthly/quarterly
  - Studio monthly/quarterly
  - Seat add-on monthly/quarterly
  - AI packs (2k / 6k / 15k)
  - Storage add-ons (50/150/500 GB monthly recurring)
- Preserved legacy compatibility paths in catalog/webhook mapping.

### Storage and Entitlements
- Improved recurring storage entitlement handling via billing contract/migration updates.
- Aligned entitlement logic to recurring period boundaries and improved storage policy consistency.

### Hearth Improvements
- Refined ready-scripts lifecycle internals.
- Added/updated timeline image prompt deduplication coverage and related tests.
- Small supporting cleanup in Hearth provider profile handling.

### Database and Backend
- Added migration:
  - `20260401120000_tongs_billing_pro_membership_and_ai_credits.sql`
- Updated canonical billing contract migration and Stripe function mappings:
  - checkout session
  - one-time checkout session
  - webhook entitlement mapping

### Included Commits
- `6c06aed` Wire account profile/password flows and fix workspace-scoped mirror writes
- `b52ccdb` update live product/price IDs in Stripe catalog
- `c192509` billing/subscription management enhancements
- plus supporting refactors/tests in Hearth and registry wiring
