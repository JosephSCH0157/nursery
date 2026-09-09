import type { QuenchMetadataAssistDraft } from "@forge/quench";
import { QUENCH_METADATA_ASSIST_ROUTE } from "@forge/quench";
import { tongsFetch } from "../../../hammer/src/lib/tongsFetch";
import { confirmCustomerSpendingQuote, customerSpendingAcceptance, deriveCustomerOperationId, readCustomerSpendingQuote } from "../../../../packages/tongs/src/customer-spending-confirmation";

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function readObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readErrorMessage(payload: unknown): string {
  const row = readObject(payload);
  const error = readObject(row?.error);
  return readString(error?.message)
    ?? readString(row?.message)
    ?? readString(row?.detail)
    ?? "Quench metadata assist failed.";
}

function normalizeDraft(payload: unknown): QuenchMetadataAssistDraft | null {
  const row = readObject(payload);
  const data = readObject(row?.data);
  const draft = readObject(data?.draft);
  const title = readString(draft?.title);
  const description = readString(draft?.description);
  const tagsRaw = Array.isArray(draft?.tags) ? draft.tags : [];
  const tags = tagsRaw
    .map((value) => readString(value))
    .filter((value): value is string => Boolean(value))
    .slice(0, 12);
  if (!title || !description) return null;
  return { title, description, tags };
}

export async function requestQuenchMetadataAssist(args: {
  workspace_id: string;
  workpiece_id: string;
  title: string;
  description: string;
  tags: string[];
}): Promise<QuenchMetadataAssistDraft> {
  const operationPayload = {
    workspace_id: args.workspace_id,
    workpiece_id: args.workpiece_id,
    title: args.title,
    description: args.description,
    tags: args.tags,
  };
  const requestBody: Record<string, unknown> = {
    ...operationPayload,
    operation_id: await deriveCustomerOperationId("forge:quench-metadata", operationPayload),
  };
  let payload: unknown = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await tongsFetch(QUENCH_METADATA_ASSIST_ROUTE, {
      method: "POST",
      json: requestBody,
      timeoutMs: 120_000,
    });
    payload = await response.json().catch(() => null);
    if (response.ok) break;
    const quote = readCustomerSpendingQuote(payload);
    if (attempt === 0 && quote?.funding_eligible && confirmCustomerSpendingQuote(quote)) {
      requestBody.spending_acceptance = customerSpendingAcceptance(quote);
      continue;
    }
    throw new Error(quote && !quote.funding_eligible
      ? `${readErrorMessage(payload)} ${quote.funding_label}.`
      : readErrorMessage(payload));
  }

  const draft = normalizeDraft(payload);
  if (!draft) {
    throw new Error("Quench metadata assist returned an invalid draft payload.");
  }
  return draft;
}

