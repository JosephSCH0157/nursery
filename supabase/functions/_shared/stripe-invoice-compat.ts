type UnknownRecord = Record<string, unknown>;

export type StripeServicePeriod = {
  start: number;
  end: number;
};

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" ? value as UnknownRecord : null;
}

function readExpandableId(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  const record = asRecord(value);
  return typeof record?.id === "string" && record.id.trim().length > 0
    ? record.id.trim()
    : null;
}

function nested(record: UnknownRecord | null, ...path: string[]): unknown {
  let current: unknown = record;
  for (const key of path) {
    const currentRecord = asRecord(current);
    if (!currentRecord) return null;
    current = currentRecord[key];
  }
  return current;
}

function readPeriod(value: unknown): StripeServicePeriod | null {
  const period = asRecord(value);
  const start = period?.start;
  const end = period?.end;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) return null;
  if ((start as number) <= 0 || (end as number) <= (start as number)) return null;
  return { start: start as number, end: end as number };
}

function readLineSubscriptionId(line: UnknownRecord): string | null {
  return readExpandableId(line.subscription)
    ?? readExpandableId(nested(line, "parent", "subscription_item_details", "subscription"));
}

export function resolveInvoiceSubscriptionId(invoice: unknown): string | null {
  const record = asRecord(invoice);
  if (!record) return null;

  const direct = readExpandableId(record.subscription)
    ?? readExpandableId(nested(record, "parent", "subscription_details", "subscription"));
  if (direct) return direct;

  const lines = nested(record, "lines", "data");
  if (!Array.isArray(lines)) return null;
  for (const value of lines) {
    const line = asRecord(value);
    if (!line) continue;
    const lineSubscriptionId = readLineSubscriptionId(line);
    if (lineSubscriptionId) return lineSubscriptionId;
  }
  return null;
}

export function resolveInvoiceServicePeriod(
  invoice: unknown,
  subscription: unknown,
  subscriptionId: string,
): StripeServicePeriod | null {
  const record = asRecord(invoice);
  const lines = nested(record, "lines", "data");
  if (Array.isArray(lines)) {
    for (const value of lines) {
      const line = asRecord(value);
      if (!line || readLineSubscriptionId(line) !== subscriptionId) continue;
      const period = readPeriod(line.period);
      if (period) return period;
    }
  }

  const subscriptionRecord = asRecord(subscription);
  const subscriptionPeriod = readPeriod({
    start: subscriptionRecord?.current_period_start,
    end: subscriptionRecord?.current_period_end,
  });
  if (subscriptionPeriod) return subscriptionPeriod;

  return readPeriod({ start: record?.period_start, end: record?.period_end });
}
