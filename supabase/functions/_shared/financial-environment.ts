export type FinancialEnvironment = "test" | "live";

type RpcClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export async function readTrustedFinancialEnvironment(
  tongsRpc: RpcClient,
): Promise<FinancialEnvironment> {
  const { data, error } = await tongsRpc.rpc("read_financial_runtime_environment");
  if (error) throw new Error(`Financial environment unavailable: ${error.message ?? "unknown error"}`);
  const row = record(data);
  const environment = row.financial_environment;
  if (environment !== "test" && environment !== "live") {
    throw new Error("Financial environment unavailable: invalid server configuration");
  }
  return environment;
}

export function assertStripeModeMatchesEnvironment(
  environment: FinancialEnvironment,
  livemode: boolean,
): void {
  const stripeEnvironment: FinancialEnvironment = livemode ? "live" : "test";
  if (stripeEnvironment !== environment) {
    throw new Error("Stripe object mode does not match the active financial environment");
  }
}
