# Forge Production Current State

Status: **Current operational record**

Record reviewed: **2026-11-01 (America/New_York)**

This record reports verified production deployment state. Deployment policy is
defined by [`../../AGENTS.md`](../../AGENTS.md#production-deployment-policy-canonical);
this file cannot authorize a deployment or change that policy.

## Evidence boundary

The 2026-11-01 review was repository-only and made no Netlify, Supabase, DNS,
Git-host, or production-runtime query. Repository policy and configuration are
verified at Git commit `454e1bbfa0cc397403c9dce973316cd6cd954a3e`, but current
provider state is `Unverified` without fresh operational evidence.

## Verified repository facts

| Fact | Evidence | Verified |
| --- | --- | --- |
| Production releases must be Git-backed deployments triggered from `main`; manual production deploys are prohibited. | [`../../AGENTS.md`](../../AGENTS.md#production-deployment-policy-canonical) at commit `454e1bbfa0cc397403c9dce973316cd6cd954a3e` | 2026-11-01 repository review |
| Checked-in Netlify intent builds from the repository root with `pnpm install && pnpm build`, publishes `apps/nursery/dist`, and uses `apps/nursery/netlify/functions`. | [`../../netlify.toml`](../../netlify.toml) at commit `454e1bbfa0cc397403c9dce973316cd6cd954a3e` | 2026-11-01 repository review; intended configuration only |

## Current operational values

| Operational value | State | Evidence and verification |
| --- | --- | --- |
| Production hostname and DNS target | **Unverified** | No fresh DNS or production-runtime observation was obtained on 2026-11-01. |
| Netlify production site and account identity | **Unverified** | No fresh Netlify provider evidence was obtained. |
| Currently published deployment ID | **Unverified** | No fresh Netlify provider evidence was obtained. |
| Currently served Git commit | **Unverified** | The local `origin/main` tracking ref is not proof of the published production commit. |
| Deployment branch and Git integration health | **Unverified** | Policy requires `main`; current provider configuration was not queried. |
| Production readiness/published status and publish time | **Unverified** | No fresh deployment receipt was obtained. |
| Hosted database lineage and migration head | **Unverified** | No fresh canonical hosted read was obtained. |
| Production financial activation | **Unverified** | See [`../billing/BILLING_CURRENT.md`](../billing/BILLING_CURRENT.md). |

Historical evidence in
[`../releases/forge-v1.2.12-hearth-auth-context-diagnosis-2026-09-03.md`](../releases/forge-v1.2.12-hearth-auth-context-diagnosis-2026-09-03.md)
records a Netlify deployment observed on 2026-09-03. It is retained as
historical evidence and is not evidence of production state on 2026-11-01.

## Maintenance

Update this record when an actual production deployment changes verified
operational state. Cite the immutable deployment ID, exact Git commit,
ready/published result, and verification timestamp. Ordinary code or
documentation changes that do not change verified production state do not
require an update.
