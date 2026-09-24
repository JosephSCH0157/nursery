export type ReferenceVisualCustomerNotice = {
  tone: "success" | "warning" | "error";
  title: string;
  message: string;
  preservation?: string;
  technicalDetail?: string;
};

const SUCCESS_NOTICES: Record<string, Omit<ReferenceVisualCustomerNotice, "tone">> = {
  "Adding supporting Source": {
    title: "Supporting Source added",
    message: "The Current Source stays in place and the new Source is available for supporting evidence.",
    preservation: "Compatible confirmed evidence and design work remain saved.",
  },
  "Saving verified supporting Sources": {
    title: "Supporting Sources added",
    message: "The verified Sources are now available without replacing the Current Source.",
    preservation: "Compatible confirmed evidence and design work remain saved.",
  },
  "Changing Current Source": {
    title: "Current Source changed",
    message: "The chosen Source now leads this visual. Earlier Sources remain attached as support.",
    preservation: "Confirmed work was preserved wherever its exact Source binding is still compatible.",
  },
  "Removing Source": {
    title: "Source removed",
    message: "The Source is no longer part of the current collection.",
    preservation: "Earlier records remain in history; compatible current work remains saved.",
  },
  "Confirming evidence": {
    title: "Evidence confirmed",
    message: "This evidence now supports the current visual.",
    preservation: "Linked Sources, Source use, and rights remain attached.",
  },
  "Saving Source use": {
    title: "Source use confirmed",
    message: "Forge saved how the Current Source will be used for this visual.",
    preservation: "Sources and confirmed evidence remain saved.",
  },
  "Saving rights": {
    title: "Rights declaration saved",
    message: "The declaration now covers the current Source collection.",
    preservation: "Earlier declarations remain available in history.",
  },
  "Preparing visual": {
    title: "Visual design prepared",
    message: "The design is ready for the next required action.",
    preservation: "Its exact Source and evidence basis remain attached.",
  },
  "Saving design": {
    title: "Design revision saved",
    message: "The updated wording is now the current design.",
    preservation: "Earlier design revisions remain available in history.",
  },
  "Rendering visual": {
    title: "Visual generated",
    message: "A current candidate is ready to review.",
    preservation: "The Source, evidence, usage, rights, and design basis remain attached.",
  },
  "Verifying archival image": {
    title: "Archival still added",
    message: "The verified still is ready in the current visual workflow.",
    preservation: "Its Source, rights, and provenance remain attached.",
  },
  "Building archival sequence": {
    title: "Archival sequence assembled",
    message: "The sequence is ready to review.",
    preservation: "The verified stills and their provenance remain unchanged.",
  },
  "Adding visual opportunity": {
    title: "Visual opportunity added",
    message: "The new visual is now part of the current plan.",
    preservation: "Existing visual opportunities remain unchanged.",
  },
  "Selecting visual": {
    title: "Finished visual selected",
    message: "This candidate is now the current visual for the plan.",
    preservation: "Other candidates remain available in history.",
  },
  "Clearing evidence": {
    title: "Evidence cleared",
    message: "Evidence-derived design and candidate work left the active workflow.",
    preservation: "Linked Sources, Source use, rights, and immutable history remain saved.",
  },
};

export function projectReferenceVisualSuccess(
  operation: string,
): ReferenceVisualCustomerNotice {
  const notice = SUCCESS_NOTICES[operation] ?? {
    title: "Change saved",
    message: "The current Reference Visual was updated.",
    preservation: "Earlier authority remains available in history.",
  };
  return { tone: "success", ...notice };
}

export function projectReferenceVisualFailure(
  detail: string,
): ReferenceVisualCustomerNotice {
  if (/couldn.t locate independent support|independently verifiable underlying citations/i.test(detail)) {
    return {
      tone: "warning",
      title: "Independent support is still needed",
      message: detail,
      preservation: "The AI summary was not promoted to verified evidence.",
    };
  }
  if (/meaningful label|numeric evidence|timeline evidence|numeric evidence contract/i.test(detail)) {
    return {
      tone: "warning",
      title: "Check the evidence details",
      message: detail,
      preservation: "Nothing was changed or removed.",
    };
  }
  if (/no usable https images|no webpage url/i.test(detail)) {
    return {
      tone: "warning",
      title: "No usable archival image was found",
      message: "Try another linked Source, upload a still, or provide a direct HTTPS image URL.",
      preservation: "Your Sources, rights, and existing candidates remain unchanged.",
      technicalDetail: detail,
    };
  }
  if (/no longer|stale|changed since|conflict/i.test(detail)) {
    return {
      tone: "warning",
      title: "This visual changed before the action finished",
      message: "Reload the current visual state, review the highlighted next step, and try again.",
      preservation: "The attempted change was not presented as saved.",
      technicalDetail: detail,
    };
  }
  return {
    tone: "error",
    title: "That change wasn’t saved",
    message: "Your existing Reference Visual work is unchanged. Review the technical detail and try again.",
    preservation: "No successful current-state change was reported.",
    technicalDetail: detail,
  };
}
