# Forge Account-Admission Activation Contract

Status: deployment-ready Slice 2C contract; inactive until a separately authorized production activation.

This contract governs activation of the authority prepared by migrations `20261031123320`, `20261101084703`, `20261101201817`, and `20261102032722`. Supabase Auth remains the identity authority. Tongs remains the only admission authority. Email, service credentials, operator membership, profile existence, and workspace membership never independently grant customer admission.

## Canonical predicate and account states

Every protected customer request is decided by the authenticated Auth UUID and `tongs.current_request_is_admitted()`. That predicate reads the canonical current-state projection, which is derived from immutable admission events and identity bindings. A later explicit revocation wins over legacy-cohort membership.

| Identity state | Protected Data API / Storage / new server operation | Onboarding RPC | Bellows guest signaling | Settlement and recovery |
| --- | --- | --- | --- | --- |
| Anonymous | Denied, except existing anonymous trial paths outside authenticated customer data | Not applicable | Link resolution and ephemeral public channel only | Not applicable |
| Legacy, effective admitted | Allowed by existing authorization plus admission | Allowed | Allowed | Continues |
| Bound beta, effective admitted | Allowed by existing authorization plus admission | Allowed | Allowed | Continues |
| Approved / invited / pending binding | Denied | Exact `POST /rpc/read_my_admission_onboarding` allowed | Exact join-link exception allowed | Existing work only |
| Revoked | New operations denied | Exact onboarding status allowed | Public guest exception remains bounded as below | Existing settlement, reconciliation, failure relief, and recovery continue |
| Platform operator without customer admission | Customer paths denied; operator RPCs still require their exact operator contract | Allowed only as an authenticated identity status read | Public guest exception only | Operator role adds no financial authority |
| Service role / trusted background worker | Not treated as a customer admission; only explicitly classified server work may use it | Not a customer grant | No additional Bellows right | Existing trusted cleanup and settlement continue |

All 136 migration-time legacy UUIDs retain their existing origin, effective revocation state, profiles, and workspaces. Activation performs no account backfill and creates no identity or workspace.

## Enforcement surfaces

### Data API

Activation registers `tongs.account_admission_pre_request()` as the authenticator's PostgREST pre-request hook. It permits `anon` and `service_role`, admits an authenticated UUID only when the canonical predicate is true, and otherwise fails with SQLSTATE `42501`. Two exact unauthenticated-to-admission transitions are permitted for authenticated but unadmitted identities:

- `POST /rpc/read_my_admission_onboarding`
- `POST /rpc/resolve_bellows_join_link`

Four exact authenticated operator RPC paths are separately permitted only after the canonical platform-operator table confirms the caller UUID: list/decide the beta applications, change admission state, and list invitation applications. The RPCs retain their own actor/operation checks. This exception gives no customer-table or general RPC admission and platform-operator status still does not imply customer admission.

PostgREST 14.7 was observed locally to expose the raw setting as `/rpc/function`, while the documented canonical representation is `rpc/function`. The pre-request function removes exactly one leading transport slash before comparing the six canonical slash-free names. It does not trim repeated slashes, use prefix matching, or inspect query parameters; double slashes, alternate routes, methods other than `POST`, and every other RPC remain denied.

Every other method/path fails closed. The hook also sets `forge.account_admission_enforcement=on` transaction-locally, activating the already-certified insert-only spending-acceptance and reservation guards for Data API transactions. It does not establish a persistent database or role GUC.

Activation also composes one restrictive `FOR ALL TO authenticated` policy with every existing permissive policy on each authenticated Data API base/partitioned table in `public` and `tongs`. The reviewed activation inventory is 250 tables. Views and RPC calls are covered by the global pre-request hook; underlying table RLS remains authoritative for table access.

### Storage

PostgREST pre-request hooks do not protect the Storage API. Activation therefore installs exact restrictive `SELECT`, `INSERT`, and `UPDATE` policies on `storage.objects` for `authenticated`, composed with the existing eight Storage policies. New signed-URL issuance and authenticated object operations require admission. Service-role Storage operations retain their existing trusted boundary and never confer customer admission.

Already issued signed URLs remain bearer capabilities until their existing expiry. Client branding URLs currently use a 15-minute expiry; trusted Tongs/Hammer URLs currently use a one-hour expiry. Revocation blocks new issuance and new authenticated operations, but does not recall an already issued URL.

### Realtime and Bellows

Database Changes inherit the underlying table RLS. Slice 2C deliberately installs no new `realtime.messages` admission policy, preserving Bellows' public guest signaling exception.

Bellows join links carry a randomly generated two-UUID token (approximately 256 bits of entropy); only a digest is persisted. Link resolution enforces expiry, revocation, and use limits and returns an opaque session UUID. The public channel carries only ephemeral Broadcast/Presence UI events. It does not expose canonical workspace rows, Storage objects, credentials, admission state, financial authority, provider execution, or Data API access.

Residual exception boundaries are explicit: a participant who knows the opaque session identifier can observe or spoof ephemeral guest signals; public Broadcast/Presence does not provide durable participant authenticity or immediate revocation of an already connected holder. Bellows must not place customer data, credentials, provider requests, or financial instructions on that channel. Redesign of this bounded public exception is outside Slice 2C.

### Server and frontend

The existing server wrapper verifies the bearer token with Supabase Auth, resolves the exact UUID, and calls the canonical admission predicate with server-only credentials when `FORGE_ADMISSION_ENFORCEMENT_ENABLED=true`. Tongs-specific credentials take precedence over standard server Supabase credentials. No service key is exposed to the browser. New customer operations are protected; callbacks, settlement, reconciliation, failure relief, key disconnection, and recovery are explicitly classified existing-authorized operations.

The frontend boundary is defense in depth and user guidance, not the security authority. When `VITE_FORGE_ADMISSION_ENFORCEMENT_ENABLED=true`, it checks on auth changes, focus, visibility restoration, and every 30 seconds. Admission-check errors fail closed. Anonymous trial behavior remains available. Revocation during a session stops the next protected database/server operation even before the UI refreshes.

## Dependency and operation inventory

| Class | Examples | Activation behavior |
| --- | --- | --- |
| Protected customer operation | workspace/project mutations; media metadata; Storage issue/upload/update; AI/publish request initiation; spending acceptance; reservation creation | Requires exact Auth UUID admission plus all existing authorization |
| Trusted settlement/recovery | provider callbacks, existing authorized background assembly, settlement, cost reconciliation, failure relief, key cleanup | Preserved; no new work may be initiated on behalf of an unadmitted UUID |
| Anonymous public | landing, login, beta information, anonymous trial | Preserved |
| Admission transition | onboarding status, invitation callback/binding | Exact reviewed RPC paths only; binding remains journal-aware |
| Bellows public guest | opaque join-link resolution, ephemeral Broadcast/Presence | Bounded exception above; no canonical data authority |
| Platform operation | approval, invitation orchestration, revocation | Requires exact platform-operator/service contract; never implies customer admission |

The captured database surface is frozen in `ADMISSION_ACTIVATION_DATABASE_SURFACE.v1.json`: 259 authenticated Data API relations (250 base tables and nine views), 492 authenticated functions, and eight pre-activation authenticated Storage policies.

## Coordinated activation

Activation is a separately authorized operational change, not a migration side effect.

1. Install and PostVerify migration 431 while every enforcement flag and hook remains inactive.
2. Obtain fresh project-bound v2 recovery evidence and a unique `FORGE-ADMISSION-S2C-ACTIVATION:` change window.
3. Disable hosted public signup and independently verify the Auth configuration. Keep the Google provider configured but do not add a Google UI.
4. Publish the exact reviewed application commit with server enforcement, frontend boundary, and invitation dispatch enabled; keep beta intake disabled. Existing production must remain healthy.
5. Prepare a fresh private `forge.account-admission-runtime-probe-bundle.v1` containing project-bound short-lived access tokens for four distinct existing identities: admitted, unadmitted non-operator, revoked, and unadmitted platform operator. The wrapper validates each token through the pinned project's Auth `/user` endpoint, checks UUID/issuer/audience/role/expiry, and confirms canonical admission/operator state. Tokens, refresh tokens, UUIDs, and customer data never enter receipts or logs. Missing or incomplete hosted probe identities make Preflight `BLOCKED`; the wrapper never creates or changes hosted Auth identities or admission state.
6. Run governed `Preflight`. It independently verifies GitHub/Netlify commit identity, Netlify flags and scopes, Auth signup state, project/lineage/head/catalog, the 136 legacy UUID snapshot, projections, authority fingerprints, surface fingerprints, the inactive database state, and runtime-probe readiness.
7. With explicit owner token `ACTIVATE-FORGE-ACCOUNT-ADMISSION-ENFORCEMENT-V1`, run exactly one governed activation transaction.
8. Immediately run structural `PostVerify` and the real authenticated PostgREST runtime probes. They must prove admitted success, unadmitted and revoked denial, the narrow operator exception, non-operator denial, and operator denial on protected customer work. Static catalog/source predicates and service-role requests are not runtime-probe evidence. Do not send invitations or enable intake as part of activation.

The application-first gap is intentionally fail-closed for authenticated Forge work: server and frontend guards become restrictive before database activation. Anonymous public/trial paths remain available. The database transaction then adds Data API/Storage/financial enforcement atomically.

## Recovery and deactivation

The normal emergency recovery is governed deactivation, not database restoration:

1. Keep server and frontend enforcement enabled.
2. Authorize `DEACTIVATE-FORGE-ACCOUNT-ADMISSION-ENFORCEMENT-V1`.
3. Run the single deactivation transaction, which removes only the named Slice 2C restrictive policies and resets only the pre-request hook.
4. Run `PostDeactivate`; compare legacy cohort, projection, and financial-authority fingerprints with the pre-action snapshot.
5. Only after database deactivation is certified may a separately authorized Git-backed application change disable frontend/server flags.

If activation is interrupted or ambiguous, do not retry blindly. Inspect the hosted state read-only. The exact active or inactive state may be safely classified; a mixed state fails the policy contract and requires reviewed recovery. Whole-database restoration remains a last resort with explicit unrelated-data-impact acknowledgement.

## Non-goals and inactive controls

This candidate does not itself deploy, change Auth settings, close signup, send invitations, enable beta intake, backfill applications, add a Google button, activate paid-provider authority, or change financial pricing. The preparation migration does not register the pre-request hook or create restrictive policies. Until the separately governed activation, all runtime admission enforcement remains inactive.
