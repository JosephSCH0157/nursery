# Forge v1.2.12 Hearth Authentication-Context Diagnosis

Date: 2026-09-03

Status: **NO-GO pending repaired-candidate recertification**

## Deployment identity

- The production deploy serving `podcastersforge.com` is Netlify deploy `6a9a1330104e740008ef6896` from `main` commit `846e99e99b0edba0c65fa607ae1b459f365b3f3f`, which is tagged `v1.2.12`.
- The certified RC was `3689ffbc`.
- The only Hearth file changed between the RC and the tagged merge is `apps/hearth/src/storage/tongs-store.ts`, where unused cradle-creation code was removed. No Forge-shell, Supabase-session, Reference Material rollout, Reference Clip token, or Reference Material loader behavior changed between the RC and the deployed tag.
- The production page on which the defect was observed was opened at 2026-09-03 20:18:25 America/New_York. The tagged production deploy was published at 20:41:00, so that already-open page was executing the preceding production deploy, commit `05636ddb474c69119ab9406783c044a868c7e55d`.

## Identity and token trace

The Forge shell uses the primary Nursery Supabase client. `AuthGate.tsx` and `AppShell.tsx` hydrate from `supabase.auth.getSession()` and remain synchronized through `supabase.auth.onAuthStateChange`. The cloud-connected indicator is true when that shell session has an access token.

Nursery publishes the same primary client as `window.__forge_supabase_client__`. Hearth's `resolveTongsUserAccessToken()` asks that runtime client's `auth.getSession()` first, attempts `refreshSession()`, and only then checks the compatibility keys `forge-auth-tongs`, `forge-auth`, and matching `sb-*-auth-token` entries.

The canonical Reference Clip reader calls `read_current_reference_clip_plan` through Supabase REST. It supplies the anon key and `Authorization: Bearer <resolved user access token>`. When the URL, anon key, or user token is unavailable, it returns `reference_clip_auth_unavailable` with `Sign in to load canonical Reference Clips.` before calling `fetch`.

## Failure classification

The reported text is emitted only by the client-side preflight described above. Therefore the failing occurrence had no rejected server request: Hearth resolved no usable user access token, omitted the request entirely, and surfaced the fail-closed 401 result locally. It was not a stale token, malformed Bearer value, or server rejection.

The relevant components had two one-shot hydration races:

1. `ReferenceClipPlanPanel` read the canonical workspace rollout authority once for a workspace/workpiece pair. If that read ran before the shell session became available, it stayed `unavailable` and did not retry on authentication.
2. `CanonicalReferenceMaterialPanel` loaded its canonical authorities on mount and on canonical content-change events only. If a load ran before session hydration, it retained the sign-in error and did not retry when the shell later announced an authenticated session.

This preserved fail-closed access, but split presentation state: the shell could become authenticated while the already-failed Hearth loader remained unauthenticated.

## Reproduction evidence

- The production report showed the shell authenticated and cloud-connected while Reference Material displayed the exact local preflight error.
- Reloading the same production tab after the tagged deploy, waiting for shell hydration, and then opening Reference Material succeeded without logout or another login. This established that the session and canonical data were valid, while also demonstrating the timing dependency.
- A detached local worktree at exact RC `3689ffbc` retained an authenticated shell but failed the delayed-session browser reproduction: the rollout authority remained unavailable and the canonical Reference Clip request was never issued. Static inspection of that exact commit confirmed no auth-state subscription in either loader.
- The repaired branch passes the same forced-split scenario. The test temporarily makes the Hearth token resolver observe no session while the shell remains visibly authenticated, confirms the fail-closed message, restores the shell session, and then requires a canonical `read_current_reference_clip_plan` request with a non-empty Bearer header and HTTP 200 without another login.

## Repair and regression coverage

- `subscribeToForgeUserAccessToken()` now subscribes to the primary Forge Supabase client's auth state and invokes consumers only when a usable, non-expired access token is present.
- Both the workspace rollout loader and canonical Reference Material loader retry when that authenticated session becomes available.
- Canonical Reference Material assigns each refresh a sequence number so an older unauthenticated completion cannot overwrite a newer successful authenticated result.
- The non-production browser fixture enables the canonical Reference Material rollout explicitly.
- `hearth-shell-auth-reference-material.test.ts` covers runtime token handoff, subscription cleanup, rollout retry wiring, canonical loader retry wiring, and stale-refresh suppression.
- `hearth.phase5.image-map.spec.ts` covers the authenticated browser boundary and inspects the actual canonical RPC request and response.

Validation completed on the repair branch:

- Hearth full suite: PASS, 136 registered test files.
- Hearth TypeScript: PASS.
- Authenticated forced-split Reference Material Playwright test: PASS.
- Canonical RPC evidence: non-empty `Authorization: Bearer ...`; response HTTP 200.

## Release disposition

Because the authentication-context split reproduces at exact RC `3689ffbc`, the prior GO is withdrawn. The deployed `v1.2.12` tag must not be treated as the deploy source for a further promotion. The repair requires a new candidate commit, the full release certification chain, and a new exact tag/deployment decision.
