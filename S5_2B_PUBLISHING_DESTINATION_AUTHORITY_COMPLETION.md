# S5-2B — Publishing Connection & Destination Persistence Authority

Status: implementation complete; live transactional migration proof pending a running Supabase environment.

## Boundary

S5-2B adds the durable authority graph required before provider integration:

```text
Forge user
  -> publishing provider connection
  -> server-only credential authority / immutable credential generations
  -> verified provider account
  -> exact executable destination
  -> explicit workspace destination grant revision
  -> immutable destination capability revision
```

It does not implement OAuth initiation/callbacks, token acquisition or refresh calls, provider discovery APIs, adapters, Quench behavior, publication operations, or receipts.

## Locked policy

- A publishing connection is owned by the Forge user who authorizes it.
- A workspace receives access to one exact destination only through an explicit, revisioned grant.
- Revoking a workspace grant does not revoke the user's provider connection.
- A revoked, disconnected, expired, or otherwise non-active connection makes every dependent destination non-executable without rewriting grant history.
- A terminally revoked/disconnected/invalid connection cannot be reactivated merely by committing another credential generation; a later provider slice must establish an explicit reauthorization transition and re-prove provider identity.
- One connection may expose multiple verified provider accounts and destinations.
- Credentials prove that Forge may call a provider. They do not identify a publishing destination.
- Capability evidence belongs to one exact destination and is immutable by revision.
- `quench_destination_scopes.connection_ref` remains legacy/unresolved and is not promoted.

## Persistence and trust boundary

Migration: `supabase/migrations/20260827230000_tongs_publishing_destination_authority_s5_2b.sql`

The migration adds eight separate authority tables. Secret ciphertext exists only in immutable credential-generation rows. Authenticated clients receive no table privilege or RLS policy for those rows; provider/credential/account/destination/capability observation operations are service-role-only. Quench-facing/public contracts contain status and identity metadata but no token or ciphertext fields.

Credential rotation is append-then-advance in one transaction. A generation conflict fails before insertion. The current authority pointer advances only after the replacement generation has been validated and inserted, so transaction failure preserves the prior generation.

Workspace grant mutation is an authenticated authority operation requiring both workspace administration and ownership of the user connection. Grant history is immutable and the mutable head uses optimistic revision agreement.

An active grant is not sufficient by itself. Executability additionally requires:

- active provider connection;
- available credential authority;
- active executable destination;
- pinned current capability revision;
- authorized workspace membership.

## Public contract lock

`packages/tongs/src/publishing-destination-authority.ts` introduces distinct branded identities for provider connection, credential authority/generation, provider account, executable destination, capability revision, and workspace grant revision. `ExecutableDestinationAuthority` is explicitly non-secret and keeps destination identity separate from connection and capability evidence.

The checked-in database types include the new tables and operations. They were updated manually because the local Supabase runtime was unavailable; regeneration from the deployed schema remains part of the live migration proof.

## Verification

- `pnpm --filter @forge/tongs typecheck`
- `pnpm --filter @forge/tongs test:publishing-destination-authority`
- migration/contract ratchets cover separation, server-only credential material, atomic generation rotation, complete executability dependencies, one-to-many destinations, immutable capabilities, and legacy `connection_ref` containment
- `git diff --check`

## Deferred to provider implementation

- provider OAuth client configuration and callbacks;
- actual envelope-encryption/decryption integration and key rotation runner;
- refresh-token calls and provider token-rotation validation;
- provider account/destination enumeration;
- capability discovery;
- adapter execution;
- Quench destination selection and publication authority.

## Completion condition

The repository now has durable, non-conflated owners for authorization, secret credentials, external accounts, executable destinations, workspace delegation, and capability revisions. Future provider code has an authority target to populate; it does not need to invent that model while handling OAuth callbacks.
