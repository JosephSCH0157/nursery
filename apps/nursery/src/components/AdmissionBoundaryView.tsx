import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { Link } from "react-router-dom";
import {
  ADMISSION_REFRESH_INTERVAL_MS,
  classifyAdmissionOnboarding,
  type AdmissionBoundaryRuntime,
  type AdmissionBoundaryState,
  type AdmissionOnboardingState,
} from "./AdmissionBoundaryRuntime";

export function AdmissionBoundaryView({ children, runtime, exempt }: { children: ReactNode; runtime: AdmissionBoundaryRuntime; exempt: boolean }) {
  const enabled = runtime.enforcementEnabled;
  const generation = useRef(0);
  const [state, setState] = useState<AdmissionBoundaryState>({ kind: enabled && !exempt ? "checking" : "allowed" });
  const inspect = useCallback(async (session: Session | null, showChecking: boolean) => {
    const current = ++generation.current;
    if (!enabled || exempt || !session) { setState({ kind: "allowed" }); return; }
    setState((previous) => showChecking || previous.kind !== "allowed" ? { kind: "checking" } : previous);
    try {
      const { data, error } = await runtime.readAdmission();
      if (current !== generation.current) return;
      setState(error ? { kind: "error" } : { kind: classifyAdmissionOnboarding(data as AdmissionOnboardingState) });
    } catch { if (current === generation.current) setState({ kind: "error" }); }
  }, [enabled, exempt, runtime]);
  useEffect(() => {
    let alive = true;
    void runtime.getSession().then(({ data, error }) => {
      if (!alive) return;
      if (error && enabled && !exempt) setState({ kind: "error" }); else void inspect(data.session, true);
    });
    const unsubscribe = runtime.onAuthStateChange((session) => { if (alive) void inspect(session, false); });
    const refresh = () => { void runtime.getSession().then(({ data }) => { if (alive) void inspect(data.session, false); }); };
    const refreshWhenVisible = () => { if (document.visibilityState === "visible") refresh(); };
    const interval = window.setInterval(refresh, ADMISSION_REFRESH_INTERVAL_MS);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      alive = false; generation.current += 1; unsubscribe(); window.clearInterval(interval);
      window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [enabled, exempt, inspect, runtime]);
  if (!enabled || exempt || state.kind === "allowed") return <>{children}</>;
  if (state.kind === "checking") return <main className="admission-boundary" role="status">Checking account admission...</main>;
  const revoked = state.kind === "revoked";
  return <main className="admission-boundary"><section className="admission-boundary__card" role={state.kind === "error" ? "alert" : "status"}>
    <p className="admission-boundary__eyebrow">Forge beta access</p>
    <h1>{revoked ? "Account access is revoked" : state.kind === "error" ? "Admission could not be verified" : "Invitation setup is still pending"}</h1>
    <p>{revoked ? "New Forge operations are unavailable. Existing settlement and recovery work continues safely in the background." : state.kind === "error" ? "Forge failed closed because the admission authority could not be reached. Try again after connectivity is restored." : "Open your invitation link to finish identity binding and workspace provisioning before entering Forge."}</p>
    <div className="admission-boundary__actions">
      {!revoked && state.kind !== "error" ? <Link to="/welcome/invitation">Continue invitation setup</Link> : null}
      <button type="button" onClick={runtime.reload}>Retry</button>
      <button type="button" onClick={() => void runtime.signOut()}>Sign out</button>
    </div>
  </section></main>;
}
