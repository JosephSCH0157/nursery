# Gate 6P Storage provisioning successor

Gate 6P adds only the deterministic private Storage bucket records that the
historical lineage created and the B1 schema and application already require.
The frozen B1 baseline and all historical migration bytes remain unchanged.

`forge-workpieces` is the canonical workpiece artifact bucket. Historical SQL
creates it as private and later raises its object limit to 500 MiB.
`bellows-capture` is the private one-GiB capture bucket restricted to the four
MIME types recorded in its original migration. Neither record contains customer
identity, objects, credentials, activation state, or financial data.

The shared-tail migration validates Storage RLS and the eight existing object
policies before inserting a missing record. A compatible existing row is not
updated. Conflicting visibility, size, MIME, AVIF, name, or bucket type aborts
the transaction. No object is deleted, recreated, or rewritten.

The authoritative record-level contract is
[`storage-bucket-contract.v1.json`](storage-bucket-contract.v1.json). Structural
catalog evidence remains the unchanged Gate 6O fingerprint because bucket rows
are deterministic provisioning data, not catalog objects.
