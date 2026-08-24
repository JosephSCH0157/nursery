import type { JSX } from "react";
import { buildHammerAcceptanceDiagnostic, type HammerAcceptanceDiagnostic } from "./hammerAcceptanceDiagnostic";

export default function HammerAcceptanceDiagnosticOutput(props: Omit<HammerAcceptanceDiagnostic, "schema" | "historyCurrentHeadMismatch"> & { historyStatus: string | null }): JSX.Element {
  return <output id="hammer-acceptance-diagnostic" hidden aria-hidden="true">{JSON.stringify(buildHammerAcceptanceDiagnostic(props))}</output>;
}
