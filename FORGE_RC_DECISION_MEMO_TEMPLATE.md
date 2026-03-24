# Forge RC Decision Memo — Template

> Copy this file. Fill every field. Do not abbreviate. Archive on decision.

---

## Identity

| Field | Value |
|---|---|
| **Memo ID** | RC-[SYSTEM]-[VERSION]-[YYYY-MM-DD] |
| **System / subsystem** | e.g. Hearth VSM 1.5, Hammer Panel Mode, Quench S3 Adapter |
| **Evidence-bearing commit** | `[sha]` (branch: `[branch]`, state: clean / dirty) |
| **Decision date** | YYYY-MM-DD |
| **Decision maker** | [name / role] |
| **Gate artifact** | link to evidence-only Go/No-Go review |

---

## Decision

```
[ ] GO — All hard-stop sections pass. Evidence complete.
[ ] GO WITH LIMITATIONS — Named limitations accepted. See Limitations section.
[ ] HOLD - Fix Required — One or more hard-stop sections fail. See Blockers section.
[ ] NO-GO — Evidence indicates defect or regression. Do not ship.
```

**Decision confidence:** High / Medium / Low

---

## Scope

**This RC validates:**
- [item 1]
- [item 2]

**This RC does not certify:**
- [item 1 — downstream modules, integration partners, etc.]
- [item 2 — perf, load, production readiness, etc.]

---

## Evidence Summary

| Category | Result | Source artifact |
|---|---|---|
| Automated test suite | [N/N pass / fail / blocked] | link |
| Interactive manual pass | [pass / fail / not executed] | link |
| Export contract validation | [pass / fail / not executed] | link |
| Drift / long-project scenario | [pass / fail / not executed] | link |
| AI-disabled baseline | [preserved / degraded / not executed] | link |
| AI-enabled parity | [preserved / degraded / not executed] | link |

---

## Blockers (required for HOLD or NO-GO)

List each open blocker with its gate section, evidence gap, and the bounded action required to close it.

| # | Gate section | Gap | Required action |
|---|---|---|---|
| 1 | | | |
| 2 | | | |

---

## Limitations (required for GO WITH LIMITATIONS)

List each known limitation, scope boundary, or deferred item. Each must be explicitly accepted.

| # | Limitation | Accepted by | Date |
|---|---|---|---|
| 1 | | | |

---

## Artifact Chain

| Artifact | Role |
|---|---|
| [RC review index](link) | Package entry point |
| [Evidence-only Go/No-Go review](link) | Primary decision document |
| [Release gate checklist](link) | Hard-stop gate |
| [Pass A vs B delta summary](link) | Baseline parity |
| [Pass A run sheet](link) | AI-disabled lane |
| [Pass B run sheet](link) | AI-enabled lane |
| [Pass A execution log](link) | Command-level evidence |
| [Pass B execution log](link) | Command-level evidence |

---

## Signature

> By filing this memo, the decision maker confirms the decision is based solely on the evidence linked above, that no inferred or assumed evidence was used, and that the scope boundaries above are understood and accepted.

**Decision maker:** ___________________________  
**Date:** ___________________________

---

*Template version: 1.0 | Forge RC governance | 2026-03-24*
