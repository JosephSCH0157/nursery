import { useMemo, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { supabase, tongsSupabase } from "../lib/supabase";
import { AdmissionBoundaryView } from "./AdmissionBoundaryView";
import { isAdmissionBoundaryExempt, type AdmissionBoundaryRuntime } from "./AdmissionBoundaryRuntime";
import "./AdmissionBoundary.css";

function enforcementEnabled(): boolean {
  return String(import.meta.env.VITE_FORGE_ADMISSION_ENFORCEMENT_ENABLED ?? "").trim().toLowerCase() === "true";
}

export default function AdmissionBoundary({ children, runtime }: { children: ReactNode; runtime?: AdmissionBoundaryRuntime }) {
  const location = useLocation();
  const defaultRuntime = useMemo<AdmissionBoundaryRuntime>(() => ({
    enforcementEnabled: enforcementEnabled(),
    getSession: () => supabase.auth.getSession(),
    onAuthStateChange: (callback) => {
      const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session));
      return () => data.subscription.unsubscribe();
    },
    readAdmission: () => (tongsSupabase as unknown as {
      rpc: (name: string) => Promise<{ data: unknown; error: { message?: string } | null }>;
    }).rpc("read_my_admission_onboarding"),
    reload: () => window.location.reload(),
    signOut: () => supabase.auth.signOut(),
  }), []);
  return <AdmissionBoundaryView runtime={runtime ?? defaultRuntime} exempt={isAdmissionBoundaryExempt(location.pathname)}>
    {children}
  </AdmissionBoundaryView>;
}
