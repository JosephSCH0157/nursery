# Baseline reference-data contract

## Classification rule

Every production data-bearing table is listed in `data-bearing-table-inventory.csv` under one of the owner-defined classes. Classification describes possible row semantics, not permission to copy rows. Tables with mixed semantics take the more restrictive class.

The inventory is derived from the production catalog plus migration-source references. A source migration reference proves only that the relation is addressed by source-controlled SQL; it does not prove that a row is deterministic reference data. Many apparent inserts are inside runtime functions, backfills, test-canary setup, or operator activation blocks.

## Proposed v1 record allowlist

The proposed allowlist is **empty: zero records in every table**.

This is explicit rather than provisional shorthand. There are no included records for which source evidence must be supplied. The later baseline may create schemas, relations, functions, triggers, indexes, policies, ACLs, owners, default privileges, and extensions, but its data phase must contain no `INSERT`, `COPY`, `MERGE`, data-changing `UPDATE`, or sequence-value restoration unless an owner-approved revision to this contract identifies each exact record and its immutable source.

The empty allowlist is sufficient for the non-financial bootstrap contract because users, personal organizations, workspaces, memberships, profiles, and balances are created by canonical signup/runtime functions. It intentionally does not make paid products available.

## Excluded classes

- **Deterministic application reference data:** no record is currently approved. Candidate capability/catalog rows must be restated record-by-record with stable keys, exact values, owning migration or specification, and a proof that they contain no actor, project, credential, environment, or observed-provider state.
- **Immutable economic contract data:** excluded from the executable baseline pending owner approval. Historical SQL and its SHA-256 manifest remain audit evidence, but historical prices, Luna assertions, contract revisions, rate evidence, and markup records are not replayed as present-day activation. If selected later, each exact economic record needs a stable contract identifier and an assertion that inserting it does not activate spending.
- **Environment-specific activation or operator configuration:** always excluded. This includes operator identities, rollout/activation decisions, financial environment revisions, provider visibility or availability observations, credential authorities, Stripe identifiers, publication state, canaries, budgets, and project/account bindings.
- **Customer, financial transaction, or operational data:** always excluded. This includes auth identities, profiles, organizations, workspaces, content, assets, balances, ledgers, grants, quotes, reservations, settlements, billing events, Stripe objects, provider receipts, and audit/event rows.
- **Unknown, requiring owner review:** excluded until reclassified and, if appropriate, approved record-by-record.

No production sequence value, timestamp, UUID, actor identifier, provider request identifier, hash of a credential/project, or operational audit row is reference data.

## Financially inactive, fail-closed initial state

A fresh baseline database must begin with:

1. no platform operator or owner-testing principal;
2. no financial/runtime environment activation revision;
3. no pricing publication, customer product availability, rollout, canary, or paid-execution scope authorization;
4. no Stripe customer, subscription, price, product, event, or environment identifier;
5. no credit/deposit/allowance/grant/balance with spendable value;
6. no provider credential, credential authority, model visibility observation, or project/account binding;
7. no open reservation, quote acceptance, supplier obligation, exposure hold, budget, or reconciliation item;
8. all RLS, ACL, owner, function-execution, and fail-closed financial functions present exactly as in the approved contract.

Expected behavior is structural readiness plus denied financial execution. A paid route must fail before provider submission when activation, pricing, funding, authorization, or environment evidence is absent. Tests may create synthetic rows inside a transaction or disposable database and must roll them back or destroy the database; those rows are test fixtures, not baseline data.

## Approval needed for a non-empty revision

For every proposed record, approval material must include: schema/table, complete primary key, complete non-generated values, canonical source file and line, SHA-256 of the source artifact, class, application consumer, why absence breaks a fresh install, why the row is environment-neutral, whether it has financial effect, and the exact idempotent assertion used to reject mismatches. Approval of a table is not approval of all rows in it.
