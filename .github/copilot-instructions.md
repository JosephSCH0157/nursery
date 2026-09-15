# Podcaster's Forge — Repository Instructions for AI Agents

All AI coding assistants and contributors MUST follow the canonical architecture rules defined in this repository.

Authority hierarchy:
- System and Agent Canonical Policy: `AGENTS.md`
- Canonical Lifecycle Constitution: `FORGE_SPARK_TO_ANVIL_LIFECYCLE_CANON.md`
- Canonical Financial Architecture: `docs/billing/FORGE_FINANCIAL_ARCHITECTURE.md`
- Canonical Storage Contract: `TONGS_PATH_CHARTER.md`

If code behavior contradicts these documents, the code is wrong.

---

## 1. Test / Live Financial Parity — Non-Negotiable

Forge has ONE customer financial system.

Development, testing, beta, and production MUST use the same application paths for:

- subscriptions and purchases
- customer credits/value and entitlements
- pricing
- model/provider selection
- reservations and admission
- spend controls
- settlement
- refunds
- accounting and journals
- storage and AI purchases
- failure handling

During development and beta, customer money flows through Stripe Test credentials.
At launch, the same system runs through Stripe Live credentials.

Test and Live may differ only where external providers require environment-specific
credentials or identifiers. Those differences MUST enter through configuration,
not separate product logic.

A customer using Stripe Test MUST exercise the same Forge product behavior that a
customer using Stripe Live will exercise.

Provider execution during testing may incur real Forge wholesale cost. That does
not justify a separate customer financial path.

Go-live MUST NOT require new billing, pricing, reservation, settlement, accounting,
entitlement, or customer-funding implementation. It is an environment activation,
not a product rewrite.

If proposed work introduces separate Test and Live financial behavior:

STOP.

Do not patch around it.
Raise an architecture issue.

If existing code contradicts this rule, the code is wrong.

See `docs/billing/FORGE_FINANCIAL_ARCHITECTURE.md` for the full canonical manifest.

---

## 2. SSOT / Persistence Policy (Canonical)

The Supabase database (`tongs` schema) is the canonical single source of truth (SSOT) for all persisted state: workspaces, projects, sparks, episodes/workpieces, links, approvals, credits, and any user data that must survive refresh/reload/device changes.

- Local storage and in-memory state are non-canonical caches only (UI convenience). They MUST NOT be relied on for persistence or correctness.
- If a feature requires saving, syncing, or retrieving persisted state, it MUST go through Supabase (direct queries/RPC via the existing data access layer).
- If an edit request would require schema changes, migrations, RLS policies, or triggers, the agent MUST:
  1. STOP and call it out explicitly ("This requires a DB migration / RLS update.")
  2. Provide the SQL migration and the exact app code changes needed to use it.
- The agent MUST NEVER fake persistence by writing to local files or `localStorage` as a substitute.
- Hard gate: if a requested change touches persistence semantics, relationships, lifecycle, or query behavior, the agent MUST NOT implement only UI changes and hope. It MUST either include migration + RLS updates in the same change set, or stop and state: "DB changes required; here is the migration."

---

## 3. Production Deployment Policy (Canonical)

The Podcaster's Forge Netlify production site is released only by the Git-backed deployment triggered from `main`.

- Do not use `netlify deploy --prod`, artifact uploads, or equivalent Netlify API calls for production deployment.
- For an authorized release, run the required checks, fetch the remote state, integrate the reviewed changes through the repository's established Git workflow, and push without force.
- Never change site configuration to permit manual production deployment.

---

## 4. Single-Checkout Workflow (Canonical)

- Use only `D:\nursery\nursery` for Forge source work. Do not create additional clones, worktrees, runnable source snapshots, or full-source backup archives.
- Preserve unfinished work in named Git branches within this repository before integration.
- Store necessary private evidence/configuration in access-restricted local storage excluded from Git, serving, and deployment.

---

## 5. Docker Desktop Ownership

Docker Desktop is user-owned infrastructure. Agents MUST NOT launch, restart, quit, kill, reset, or alter Docker Desktop. Check availability with `docker info`. If unavailable, STOP and ask the user to start Docker Desktop manually.
