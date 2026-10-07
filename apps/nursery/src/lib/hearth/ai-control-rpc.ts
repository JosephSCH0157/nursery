import { supabase } from "../supabase";

type RpcResult = { data: unknown; error: { message?: string } | null };
type RpcClient = { rpc: (name: string, args?: Record<string, unknown>) => PromiseLike<RpcResult> };

export function aiControlRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export async function aiControlRpc(
  name: string,
  args?: Record<string, unknown>,
  fallback?: string,
): Promise<unknown> {
  const result = await (supabase.schema("tongs") as unknown as RpcClient).rpc(name, args);
  if (result.error) throw new Error(result.error.message || (fallback ?? `${name} failed`));
  return result.data;
}
