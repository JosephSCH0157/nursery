import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { Link, useLocation } from "react-router-dom";
import { supabase, tongsSupabase } from "../lib/supabase";
import "./AdmissionBoundary.css";

export const ADMISSION_UI_FLAG = "VITE_FORGE_ADMISSION_ENFORCEMENT_ENABLED";

type AdmissionBoundaryState =
  | { kind: "checking" }
  | { kind: "allowed" }
  | { kind: "pending" }
  | { kind: "revoked" }
  | { kind: "error" };

type OnboardingState = {
  admitted?: boolean;
  effective_state?: string | null;
};

const EXEMPT_PREFIXES = [
  "/login",
  "/reset-password",
  "/auth/callback",
  "/welcome/invitation",
  "/beta",
  "/app/platform/admissions",
  "/apps/bellows/join/",
  "/bellows/join/",
] as const;

export function isAdmissionBoundaryExempt(pathname: string): boolean {
  return pathname === "/" || EXEMPT_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function classifyAdmissionOnboarding(
  value: OnboardingState | null,
): AdmissionBoundaryState["kind"] {
  if (value?.admitted === true && value.effective_state === "admitted") return "allowed";
  if (value?.effective_state === "revoked") return "revoked";
  return "pending";
}

function enforcementEnabled(): boolean {
  return String(import.meta.env.VITE_FORGE_ADMISSION_ENFORCEMENT_ENABLED ?? "")
    .trim()
    .toLowerCase() === "true";
}

export default function AdmissionBoundary({ children }: { children: ReactNode }) {
  const location = useLocation();
  const enabled = enforcementEnabled();
  const exempt = isAdmissionBoundaryExempt(location.pathname);
  const generation = useRef(0);
  const [state, setState] = useState<AdmissionBoundaryState>({
    kind: enabled && !exempt ? "checking" : "allowed",
  });

  const inspect = useCallback(async (session: Session | null) => {
    const current = ++generation.current;
    if (!enabled || exempt || !session) {
      setState({ kind: "allowed" });
      return;
    }

    setState({ kind: "checking" });
    const client = tongsSupabase as unknown as {
      rpc: (name: string) => Promise<{
        data: unknown;
        error: { message?: string } | null;
      }>;
    };
    try {
      const { data, error } = await client.rpc("read_my_admission_onboarding");
      if (current !== generation.current) return;
      if (error) {
        setState({ kind: "error" });
        return;
      }
      setState({ kind: classifyAdmissionOnboarding(data as OnboardingState) });
    } catch {
      if (current === generation.current) setState({ kind: "error" });
    }
  }, [enabled, exempt]);

  useEffect(() => {
    let alive = true;
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!alive) return;
      if (error && enabled && !exempt) {
        setState({ kind: "error" });
        return;
      }
      void inspect(data.session);
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (alive) void inspect(session);
    });
    const refresh = () => {
      void supabase.auth.getSession().then(({ data }) => {
        if (alive) void inspect(data.session);
      });
    };
    window.addEventListener("focus", refresh);
    return () => {
      alive = false;
      generation.current += 1;
      subscription.subscription.unsubscribe();
      window.removeEventListener("focus", refresh);
    };
  }, [enabled, exempt, inspect]);

  if (!enabled || exempt || state.kind === "allowed") return <>{children}</>;

  if (state.kind === "checking") {
    return <main className="admission-boundary" role="status">Checking account admission...</main>;
  }

  const revoked = state.kind === "revoked";
  return (
    <main className="admission-boundary">
      <section className="admission-boundary__card" role={state.kind === "error" ? "alert" : "status"}>
        <p className="admission-boundary__eyebrow">Forge beta access</p>
        <h1>{revoked ? "Account access is revoked" : state.kind === "error" ? "Admission could not be verified" : "Invitation setup is still pending"}</h1>
        <p>
          {revoked
            ? "New Forge operations are unavailable. Existing settlement and recovery work continues safely in the background."
            : state.kind === "error"
              ? "Forge failed closed because the admission authority could not be reached. Try again after connectivity is restored."
              : "Open your invitation link to finish identity binding and workspace provisioning before entering Forge."}
        </p>
        <div className="admission-boundary__actions">
          {!revoked && state.kind !== "error" ? <Link to="/welcome/invitation">Continue invitation setup</Link> : null}
          <button type="button" onClick={() => window.location.reload()}>Retry</button>
          <button type="button" onClick={() => void supabase.auth.signOut()}>Sign out</button>
        </div>
      </section>
    </main>
  );
}
