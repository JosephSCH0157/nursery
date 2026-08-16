# Acquisition locator correction and historical repair boundary

## Production contract

The storage writer returns the exact committed storage key. Reference-clip and B-roll acquisition register that key verbatim as both the durable source locator and the basis of downstream projections. MIME/container are metadata and never cause `.mp4` or `.webm` to be appended after commit. Replay uses the identical reserved key.

Authority flow is:

`Tongs acquisition asset record -> acquisition receipt/candidate -> Hammer timeline asset -> compatibility placements`.

## Historical Florida Oranges repair gate

The seven extensionless binaries are read-only evidence. No binary upload, copy, rename, regeneration, or deletion is required or authorized.

A mutation-free dry run cannot yet be completed because the repository has no narrow acquisition-asset compare-and-swap API exposing each record's current path, storage key, owner, content hash, byte size, acquisition identity, revision, and `updated_at`. Broad acquisition replay or Hammer persistence must not be used as a substitute.

This requires a Tongs persistence-contract change before historical repair. The required boundary is an editor-only, viewer-readable acquisition-record correction RPC that:

- addresses one immutable acquisition asset identity;
- compares workspace/workpiece owner, acquisition operation/token, current path, storage key, content hash, byte size, record revision and `updated_at`;
- accepts only a locator correction whose binary hash and size match the existing registered evidence;
- increments the record exactly once and returns typed optimistic metadata;
- is byte/idempotency safe on retry and has no force mode.

After that boundary exists, the dry run must freeze all seven original/intended acquisition records, then derive and freeze the one canonical timeline, compatibility placements, and auditable history bytes. It must include exact hashes, CAS metadata, write order, tested suffix resume/prefix compensation, conflict abort, and proof of zero binary operations. No data mutation is authorized by this document.

