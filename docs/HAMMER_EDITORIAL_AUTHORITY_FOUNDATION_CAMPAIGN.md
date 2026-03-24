# HAMMER_EDITORIAL_AUTHORITY_FOUNDATION

This campaign installs the structural editorial authority seam for Hammer.

Scope lock:
- In scope: canonical editorial authority contract, render assembly seam, preview truth labeling, history/persistence/handoff wiring, and migration compatibility (`dual-read + dual-write`).
- Out of scope: new feature execution slices (for example `ripple_delete`, `insert_broll`, `audio_duck` runtime behavior), UI expansion beyond truth-state plumbing, and unrelated edit-model changes.

Freeze rule:
- During this campaign, no non-campaign changes may mutate edit-truth models or add parallel edit-truth paths.
- UI/transcript/timeline state are views over canonical operations, never hidden authority sources.
