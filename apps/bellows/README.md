# Bellows

Bellows is the Forge remote production studio package.

Bellows contains the package boundary, pure domain layer, session engine, runtime
contracts, studio-shell and recovery adapters, canonical join links, and the first
record-only capture contract. Nursery now wires a real desktop Chromium capture
path: `MediaRecorder` output is held as ordered upload parts in IndexedDB, verified
through canonical Storage readback, reconstructed as a playable segment, and
adopted through Hammer's existing recording-import authority.

Current certification status:

- Gate A implementation exists for desktop Chrome and Edge; a production 60-minute
  proof run on Windows and macOS is still required before support is certified.
- Gate B (three-person desktop), Safari, mobile, Firefox, and Bellows-managed
  broadcast remain unavailable and must not be advertised as supported.
- IndexedDB is temporary recovery custody only. Tongs remains canonical truth.
- Local media is retained until every upload part has verified canonical receipt.
- Upload parts are reconstruction inputs, not assumed independently playable files.

Canonical references:

- `BELLOWS_V1_MANIFEST.md`
- `/d:/nursery/nursery/BELLOWS_V1_RECOMMENDED_BUILD_SEQUENCE.md`
- `/d:/nursery/nursery/BELLOWS_V1_PACKAGE_AND_FILE_STRUCTURE_PROPOSAL.md`
- `/d:/nursery/nursery/BELLOWS_V1_DOMAIN_TYPE_INVENTORY.md`
- `/d:/nursery/nursery/BELLOWS_V1_PURE_SESSION_ENGINE_STATE_SPEC.md`
- `/d:/nursery/nursery/BELLOWS_V1_RUNTIME_ADAPTER_CONTRACT_LAYER.md`
- `/d:/nursery/nursery/BELLOWS_V1_STUDIO_SHELL_ADAPTER_SLICE.md`
- `/d:/nursery/nursery/BELLOWS_V1_PERSISTENCE_ADAPTER_SLICE.md`
- `/d:/nursery/nursery/BELLOWS_V1_PHASE_SEVEN_TONGS_RECOVERY_PERSISTENCE.md`
- `/d:/nursery/nursery/BELLOWS_V1_PHASE_EIGHT_A_JOIN_LINKS.md`
