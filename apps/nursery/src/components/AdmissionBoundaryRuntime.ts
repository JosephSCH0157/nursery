import type { Session } from "@supabase/supabase-js";

export const ADMISSION_REFRESH_INTERVAL_MS = 30_000;
export const ADMISSION_UI_FLAG = "VITE_FORGE_ADMISSION_ENFORCEMENT_ENABLED";
const EXEMPT_PREFIXES = ["/login", "/reset-password", "/auth/callback", "/welcome/invitation", "/beta", "/app/platform/admissions", "/apps/bellows/join/", "/bellows/join/"] as const;

export function isAdmissionBoundaryExempt(pathname: string): boolean {
  return pathname === "/" || EXEMPT_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export type AdmissionBoundaryState = { kind: "checking" | "allowed" | "pending" | "revoked" | "error" };
export type AdmissionOnboardingState = { admitted?: boolean; effective_state?: string | null };

export function classifyAdmissionOnboarding(value: AdmissionOnboardingState | null): AdmissionBoundaryState["kind"] {
  if (value?.admitted === true && value.effective_state === "admitted") return "allowed";
  if (value?.effective_state === "revoked") return "revoked";
  return "pending";
}

export type AdmissionBoundaryRuntime = Readonly<{
  enforcementEnabled: boolean;
  getSession: () => Promise<{ data: { session: Session | null }; error: unknown }>;
  onAuthStateChange: (callback: (session: Session | null) => void) => () => void;
  readAdmission: () => Promise<{ data: unknown; error: { message?: string } | null }>;
  reload: () => void;
  signOut: () => void | Promise<unknown>;
}>;
