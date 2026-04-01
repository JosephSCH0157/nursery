# Hearth Research Contract (Stage 1)

Status: canonical draft for implementation  
Date: 2026-04-01  
Owners: Hearth chat + Find Sources surfaces

## Purpose

Hearth research is a canonical evidence-acquisition capability used by both chat and Find Sources, with real-source retrieval when available and honest first-pass degradation when not.

## North-Star Contract

Both entry surfaces must use one shared request/result shape:

- Chat surface: conversational answer-first presentation
- Find Sources surface: source-first inspection presentation

Only presentation differs. Runtime contract and result data are shared.

## Canonical Request Shape

Defined in [hearth-research-contract.ts](/d:/nursery/nursery/apps/hearth/src/lib/hearth-research-contract.ts).

`HearthResearchRequest` fields:

- `query`: user research query
- `intent`: `news | background | examples | mixed`
- `recencyPreference`: `none | recent | strict_recent`
- `maxSources`: bounded count for retrieval attempt
- `requireDates`: caller requests date-preserving output
- `requireFullExtraction`: caller requests full page extraction attempt

## Canonical Result Shape

Defined in [hearth-research-contract.ts](/d:/nursery/nursery/apps/hearth/src/lib/hearth-research-contract.ts).

`HearthResearchResult` fields:

- `mode`: `knowledge_first | retrieval_first | partial_retrieval`
- `runtimeStatus`: `ok | partial | no_results | error`
- `sources`: normalized source list
- `synthesis.summary`: short synthesis
- `synthesis.keyPoints`: key findings
- `synthesis.uncertainties`: explicit unknowns
- `synthesis.coverageNote`: source coverage/quality note

Each source includes:

- URL, domain, title, published date (if available)
- snippet and extracted body text
- per-source extraction status
- extraction error text when applicable

## Runtime Status Semantics

- `ok`: retrieval and synthesis completed with usable coverage
- `partial`: some steps failed, but usable partial output exists
- `no_results`: search/retrieval returned no strong matches
- `error`: runtime failed to produce usable retrieval payload

## Mode Semantics

- `knowledge_first`: no live retrieval used in this pass
- `retrieval_first`: synthesis grounded primarily in retrieved set
- `partial_retrieval`: retrieval attempted, partially successful, explicitly marked

## Non-Drift Rule

Chat and Find Sources must not define private research payload formats.

- Shared contract types are the only allowed runtime payload schema.
- Surface-specific projection happens after contract parse.

## Stage 1 Exit Criteria

- One written contract exists (this file + shared TS contract).
- Chat and Find Sources agree on request/result shapes.
- No private competing result formats are introduced.
