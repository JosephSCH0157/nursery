# Hammer History Epoch HE-7 — Florida Reopen Retest Acceptance

Status: passed.

Date: 2026-08-21

Application HEAD: `223d2d0695aa43dedd8ca6148b3ce885e95dfadb`

Behavioral repair baseline: `837a52e035c13ce984fc1a33471a28fef5becb41`

Production project: `wtvdjndyxegudufrompx`

## Authorized boundary

This retest opened Florida Oranges exactly once through the authenticated Hammer library. It used a direct actionable locator click followed by an explicit SPA URL wait. It did not use the failed navigation wrapper identified by HE-7C. No retry, reload, edit, save, undo, redo, recovery action, epoch/head operation, session mutation, or Anvil access occurred.

## Pre-open baseline

The read-only baseline was captured at `2026-08-21T08:48:58.842Z` and reconfirmed:

- workspace `494c2ae5-9037-4208-b898-fab4898ab430`;
- workpiece `85d076d6-54e6-4b56-ab60-5eff4c87cdd0`;
- sealed recording `6c5b0d00-f775-4611-ac67-284dd9ae7d39`;
- active revision `f642b5d9-cec2-4656-804e-49bb33bc0cb5`;
- revision token `2026-08-20T18:47:02.687149+00:00`;
- epoch `53e3a94f-9f2e-4bd7-85bb-bd311f81939d`;
- transition `ab07210d-1968-4120-a517-77621a7f45ab`;
- epoch pointer `hammer/revisions/f642b5d9-cec2-4656-804e-49bb33bc0cb5/history/epochs/53e3a94f-9f2e-4bd7-85bb-bd311f81939d.v1.json`;
- nine revision-scoped registry objects;
- one epoch row, one transition row, zero heads, and zero head transitions;
- editor session `session_fc4374ab-0097-4c0f-abd5-5a0099940abf`;
- complete canonical snapshot SHA-256 `b4a26b9ceeeee2901b832507020277b9fba40571debf25680303346548e53384`.

## Single-open evidence

The authenticated library showed Florida as the sole selected card. `Open Project` was visible and enabled. One direct locator click navigated to:

```text
http://127.0.0.1:5173/app/hammer/editor?workspace_id=494c2ae5-9037-4208-b898-fab4898ab430&workpiece_id=85d076d6-54e6-4b56-ab60-5eff4c87cdd0
```

Hammer was observed for fifteen seconds beyond route installation and hydration without further interaction.

The mounted editor proved:

- canonical persistence loaded Florida normally;
- the archived-history notice was visible;
- history reported `0 undo / 0 redo`;
- Undo and Redo were disabled at the epoch boundary;
- no canonical-base-mismatch, divergent-history, transitional-recovery, or missing-authority banner appeared;
- no epoch-start action appeared;
- the transcript contained 137 segments and reported `0 modified` / `in sync`;
- visual status remained 30 placements with the same three uncertainty flags;
- the sealed recording, active revision, polished-audio playback path, editor session, timeline, placements, and revision authority remained installed;
- the only issue banner was the pre-existing, unrelated visual-placement review notice.

The absence of a base-mismatch banner together with successful zero-entry epoch installation and the archived-history boundary proves that the existing anchor matched through the verified `json-stringify-v0` compatibility path. Under the committed HE-7B contract, the corresponding runtime canonical identity is `hammer-state:5d6bc1c6`.

The browser console contained no error or rejected promise. It recorded only the React development notice and non-mutating Source Desk preview-unavailable warnings. Those preview warnings did not prevent the canonical audio path, transcript, timeline, placements, history boundary, or authority identities from loading.

## Post-open comparison

The read-only post-open capture completed at `2026-08-21T08:50:50.486Z`.

Its complete canonical snapshot SHA-256 was again:

```text
b4a26b9ceeeee2901b832507020277b9fba40571debf25680303346548e53384
```

Baseline and post-open canonical bytes were identical. The revision token, pointer, all nine registry tuples and object bytes, editor session, epoch row, transition row, head counts, and head-transition counts were unchanged. Therefore the reopen produced:

- zero artifact or Storage writes;
- zero registry revision increments;
- zero pointer or revision-token changes;
- zero session rewrites;
- zero epoch/head rows or transitions;
- zero persisted Florida mutation.

## Evidence

External evidence directory: `D:\nursery\he7-retest-20260821`

It contains the baseline and post-open JSON/canonical snapshots, the browser DOM capture, console capture, and screenshot. It contains no credentials.

## Closure

HE-7 canonical reopen acceptance passes. HE-8 remains unstarted and requires separate authorization for the first controlled Florida edit and sequence-one immutable-head proof. The protected `apps/nursery/public/forge-nav.json` modification was excluded.
