export type ReferenceVisualReadinessSubtype =
  | "chart"
  | "timeline"
  | "document_excerpt"
  | "quote_card"
  | "stat_card"
  | "comparison"
  | "archival_still"
  | "archival_sequence";

export type ReferenceVisualReadinessEvidence = Record<string, unknown>;

export type ReferenceVisualReadiness = {
  evidenceReady: boolean;
  recipeCurrent: boolean;
  ready: boolean;
  code:
    | "ready"
    | "needs_numeric_evidence"
    | "needs_chart_evidence"
    | "needs_dated_evidence"
    | "needs_comparison_evidence"
    | "needs_text_evidence"
    | "needs_current_source_evidence"
    | "recipe_stale";
  message: string;
  currentEvidenceRevisionIds: string[];
  supportingEvidenceRevisionIds: string[];
  eligibleEvidenceRevisionIds: string[];
};

const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const number = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const evidenceId = (item: ReferenceVisualReadinessEvidence): string | null =>
  text(item.id) ?? text(item.evidence_revision_id);

const memberId = (item: ReferenceVisualReadinessEvidence): string | null =>
  text(item.source_set_member_id);

const hasText = (item: ReferenceVisualReadinessEvidence): boolean =>
  Boolean(
    text(item.raw_excerpt) && (text(item.label) || text(item.raw_excerpt)),
  );

const hasDate = (item: ReferenceVisualReadinessEvidence): boolean =>
  Boolean(
    text(item.evidence_date) ??
    (text(item.label) ?? text(item.raw_excerpt))?.match(
      /\b(?:1[5-9]\d{2}|20\d{2}|21\d{2})(?:\s*(?:-|–|—|to)\s*(?:1[5-9]\d{2}|20\d{2}|21\d{2}))?\b/,
    )?.[0],
  );

const hasStatNumber = (item: ReferenceVisualReadinessEvidence): boolean =>
  number(item.numeric_value) !== null &&
  Boolean(text(item.label) && text(item.unit));

const hasChartNumber = (item: ReferenceVisualReadinessEvidence): boolean =>
  number(item.numeric_value) !== null && Boolean(text(item.label));

const comparableIds = (values: readonly string[]): string[] =>
  [...new Set(values.filter(Boolean))].sort();

const EDITORIAL_STOP_WORDS = new Set([
  "about",
  "according",
  "after",
  "also",
  "based",
  "before",
  "being",
  "from",
  "into",
  "largest",
  "material",
  "that",
  "their",
  "this",
  "through",
  "usually",
  "visual",
  "with",
]);

function editorialTokens(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(/\s+/)
      .filter((token) => token.length >= 4 && !EDITORIAL_STOP_WORDS.has(token)),
  );
}
export function referenceVisualEvidenceSupportsEditorialFocus(
  evidence: ReferenceVisualReadinessEvidence,
  editorialFocus: string,
  desiredMaterial = "",
): boolean {
  const expected = editorialTokens(`${editorialFocus} ${desiredMaterial}`);
  if (!expected.size) return true;
  const actual = editorialTokens(
    `${text(evidence.label) ?? ""} ${text(evidence.raw_excerpt) ?? ""}`,
  );
  return [...expected].some((token) => actual.has(token));
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  const a = comparableIds(left);
  const b = comparableIds(right);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/**
 * The single canonical application predicate for Reference Visual evidence.
 * Callers may omit recipeEvidenceRevisionIds while evidence is still being
 * collected. Recipe preparation and render preflight pass the exact binding.
 */
export function evaluateReferenceVisualReadiness(args: {
  subtype: ReferenceVisualReadinessSubtype;
  evidence: readonly ReferenceVisualReadinessEvidence[];
  currentSourceMemberIds?: readonly string[];
  recipeEvidenceRevisionIds?: readonly string[] | null;
  editorialFocus?: string;
  desiredMaterial?: string;
}): ReferenceVisualReadiness {
  const currentMembers = new Set(args.currentSourceMemberIds ?? []);
  const enforceMembership = currentMembers.size > 0;
  const current = args.evidence.filter((item) => {
    const id = evidenceId(item);
    if (!id) return false;
    const confirmation = text(item.confirmation_state);
    if (confirmation && confirmation !== "creator_confirmed") return false;
    return (
      !enforceMembership ||
      Boolean(memberId(item) && currentMembers.has(memberId(item)!))
    );
  });
  const currentIds = current.flatMap((item) =>
    evidenceId(item) ? [evidenceId(item)!] : [],
  );
  const supportingIds = current
    .filter(hasText)
    .flatMap((item) => [evidenceId(item)!]);

  let eligible = current;
  let evidenceReady = false;
  let code: ReferenceVisualReadiness["code"] = "needs_current_source_evidence";
  let message =
    "Confirm evidence from the current Source collection before preparing this visual.";

  if (args.subtype === "stat_card") {
    eligible = current.filter(hasStatNumber);
    evidenceReady = eligible.length > 0;
    code = evidenceReady ? "ready" : "needs_numeric_evidence";
    message = evidenceReady
      ? "Supported numeric evidence is ready for this stat card."
      : current.length
        ? "Source evidence is confirmed, but this stat card still needs a supported numeric value with a clear label and unit."
        : "This stat card needs a supported numeric value with a clear label and unit from the current Source collection.";
  } else if (args.subtype === "chart") {
    eligible = current.filter(hasChartNumber);
    evidenceReady = eligible.length > 0;
    code = evidenceReady ? "ready" : "needs_chart_evidence";
    message = evidenceReady
      ? "Supported numeric evidence is ready for this chart."
      : "This chart requires confirmed numeric evidence with labels for its intended structure.";
  } else if (args.subtype === "timeline") {
    eligible = current.filter(hasDate);
    evidenceReady = eligible.length >= 2;
    code = evidenceReady ? "ready" : "needs_dated_evidence";
    message = evidenceReady
      ? "Dated evidence is ready for this timeline."
      : "A timeline requires at least two confirmed evidence items with explicit dates from the current Source collection.";
  } else if (args.subtype === "comparison") {
    eligible = current.filter((item) =>
      Boolean(memberId(item) && (hasText(item) || hasChartNumber(item))),
    );
    const represented = new Set(
      eligible.flatMap((item) => (memberId(item) ? [memberId(item)!] : [])),
    );
    evidenceReady =
      represented.size === 2 &&
      (!enforceMembership || represented.size === currentMembers.size);
    code = evidenceReady ? "ready" : "needs_comparison_evidence";
    message = evidenceReady
      ? "Confirmed evidence from exactly two current Sources is ready for comparison."
      : "A comparison requires confirmed evidence from exactly two canonical Source members in the current collection.";
  } else if (
    args.subtype === "document_excerpt" ||
    args.subtype === "quote_card"
  ) {
    eligible = current.filter(hasText);
    evidenceReady = eligible.length > 0;
    code = evidenceReady ? "ready" : "needs_text_evidence";
    message = evidenceReady
      ? "Confirmed excerpt evidence is ready for this visual."
      : `This ${args.subtype === "quote_card" ? "quote card" : "document excerpt"} needs an exact confirmed excerpt from the current Source collection.`;
  } else {
    eligible = current;
    evidenceReady = current.length > 0;
    code = evidenceReady ? "ready" : "needs_current_source_evidence";
    message = evidenceReady
      ? "Current Source evidence is ready."
      : "Confirm evidence from the current Source collection before continuing.";
  }

  const subtypeReadyFor = (
    items: ReferenceVisualReadinessEvidence[],
  ): boolean => {
    if (args.subtype === "timeline") return items.length >= 2;
    if (args.subtype === "comparison")
      return (
        new Set(
          items.flatMap((item) => (memberId(item) ? [memberId(item)!] : [])),
        ).size === 2
      );
    return items.length > 0;
  };
  if (args.editorialFocus) {
    const readyBeforeEditorialFilter = evidenceReady;
    eligible = eligible.filter((item) =>
      referenceVisualEvidenceSupportsEditorialFocus(
        item,
        args.editorialFocus!,
        args.desiredMaterial,
      ),
    );
    evidenceReady = evidenceReady && subtypeReadyFor(eligible);
    if (readyBeforeEditorialFilter && !evidenceReady) {
      code =
        args.subtype === "stat_card"
          ? "needs_numeric_evidence"
          : "needs_current_source_evidence";
      message =
        "Confirmed evidence does not support the current editorial focus. Confirm relevant evidence before preparing this design.";
    }
  }
  const eligibleIds = eligible.flatMap((item) =>
    evidenceId(item) ? [evidenceId(item)!] : [],
  );
  const recipeCurrent =
    args.recipeEvidenceRevisionIds == null ||
    (evidenceReady && sameIds(args.recipeEvidenceRevisionIds, eligibleIds));
  if (evidenceReady && !recipeCurrent) {
    code = "recipe_stale";
    message =
      "Confirmed evidence changed. Re-prepare and review the visual design before rendering.";
  }

  return {
    evidenceReady,
    recipeCurrent,
    ready: evidenceReady && recipeCurrent,
    code,
    message,
    currentEvidenceRevisionIds: currentIds,
    supportingEvidenceRevisionIds: supportingIds,
    eligibleEvidenceRevisionIds: eligibleIds,
  };
}
