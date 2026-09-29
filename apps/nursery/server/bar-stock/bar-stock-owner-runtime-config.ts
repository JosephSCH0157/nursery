import { bootstrapHearthRuntimeEnv } from "../hearth/hearth-runtime-config";

export type BarStockOwnerRuntimeConfig = {
  /** Restricted server-only Brave credential for owner-funded Bar Stock topic discovery. */
  barStockOwnerBraveApiKey: string | null;
};

export function resolveBarStockOwnerRuntimeConfig(): BarStockOwnerRuntimeConfig {
  bootstrapHearthRuntimeEnv();
  const value = process.env.BAR_STOCK_OWNER_BRAVE_API_KEY;
  return {
    barStockOwnerBraveApiKey: typeof value === "string" && value.trim() ? value.trim() : null,
  };
}
