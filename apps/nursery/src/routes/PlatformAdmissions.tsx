import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  bindExistingBetaIdentity,
  decideBetaApplication,
  dispatchBetaInvitation,
  listBetaInvitationApplications,
  type BetaInvitationApplication,
} from "../lib/admission/betaInvitation";
import "./PlatformAdmissions.css";

function describeState(application: BetaInvitationApplication): string {
  if (application.effective_admission_state === "revoked") return "revoked";
  if (application.bound_user_id) return "bound";
  if (application.invitation_state === "dispatch_succeeded") return "invited";
  return application.operator_state.replaceAll("_", " ");
}

export default function PlatformAdmissions() {
  const [applications, setApplications] = useState<BetaInvitationApplication[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    setError("");
    try {
      setApplications(await listBetaInvitationApplications());
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Unable to load applications.");
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function run(applicationId: string, work: () => Promise<unknown>, success: string) {
    setBusy(applicationId);
    setError("");
    setNotice("");
    try {
      await work();
      setNotice(success);
      await refresh();
    } catch (workError) {
      setError(workError instanceof Error ? workError.message : "Operation failed.");
    } finally {
      setBusy(null);
    }
  }

  function decision(application: BetaInvitationApplication, value: "approved" | "denied") {
    const reason = window.prompt(`Reason for ${value} decision:`)?.trim();
    if (!reason) return;
    void run(
      application.application_id,
      () => decideBetaApplication(application.application_id, value, reason),
      `Application ${value}.`,
    );
  }

  function dispatch(application: BetaInvitationApplication) {
    const reason = window.prompt("Invitation and provisioning reason:")?.trim();
    if (!reason) return;
    void run(
      application.application_id,
      () => dispatchBetaInvitation(application, reason),
      "Invitation identity was bound and provisioned.",
    );
  }

  function acknowledge(application: BetaInvitationApplication) {
    const exactUserId = application.exact_auth_user_id;
    if (!exactUserId) return;
    const confirmation = window.prompt(
      `Type the exact Auth UUID to acknowledge this confirmed identity:\n${exactUserId}`,
    )?.trim().toLowerCase();
    if (confirmation !== exactUserId.toLowerCase()) {
      setError("Exact Auth UUID acknowledgement did not match.");
      return;
    }
    const reason = window.prompt("Binding and provisioning reason:")?.trim();
    if (!reason) return;
    void run(
      application.application_id,
      () => bindExistingBetaIdentity(application, exactUserId, reason),
      "Existing confirmed identity was acknowledged, bound, and provisioned.",
    );
  }

  return (
    <main className="platform-admissions">
      <header className="platform-admissions__header">
        <div>
          <p className="platform-admissions__eyebrow">Platform operator</p>
          <h1>Beta admissions</h1>
          <p>Approval, invitation identity, binding, and provisioning are separate audited steps.</p>
        </div>
        <Link to="/app">Back to Forge</Link>
      </header>

      {error ? <div className="platform-admissions__notice is-error" role="alert">{error}</div> : null}
      {notice ? <div className="platform-admissions__notice" role="status">{notice}</div> : null}

      <div className="platform-admissions__list">
        {applications.map((application) => {
          const isBusy = busy === application.application_id;
          return (
            <article className="platform-admissions__card" key={application.application_id}>
              <div className="platform-admissions__summary">
                <div>
                  <h2>{application.applicant_email}</h2>
                  <p>{new Date(application.submitted_at).toLocaleString()}</p>
                </div>
                <span>{describeState(application)}</span>
              </div>
              <dl>
                <div><dt>Decision</dt><dd>{application.current_decision}</dd></div>
                <div><dt>Auth match</dt><dd>{application.exact_auth_match_count}</dd></div>
                <div><dt>Bound UUID</dt><dd>{application.bound_user_id ?? "—"}</dd></div>
                <div><dt>Attempt</dt><dd>{application.invitation_attempt_id ?? "—"}</dd></div>
              </dl>
              {application.exact_auth_user_id ? (
                <p className="platform-admissions__identity">
                  Exact Auth UUID: <code>{application.exact_auth_user_id}</code><br />
                  Email confirmed: {application.exact_auth_email_confirmed ? "yes" : "no"}
                </p>
              ) : null}
              <div className="platform-admissions__actions">
                {application.current_decision === "pending" ? (
                  <>
                    <button disabled={isBusy} onClick={() => decision(application, "approved")}>Approve</button>
                    <button disabled={isBusy} onClick={() => decision(application, "denied")}>Deny</button>
                  </>
                ) : null}
                {application.current_decision === "approved" && !application.bound_user_id
                  && application.operator_state === "existing_confirmed_requires_ack" ? (
                    <button disabled={isBusy} onClick={() => acknowledge(application)}>
                      Acknowledge exact UUID and bind
                    </button>
                  ) : null}
                {application.current_decision === "approved" && !application.bound_user_id
                  && application.operator_state !== "existing_confirmed_requires_ack" ? (
                    <button disabled={isBusy} onClick={() => dispatch(application)}>
                      {application.invitation_attempt_id ? "Reconcile / retry" : "Send beta invitation"}
                    </button>
                  ) : null}
              </div>
            </article>
          );
        })}
        {!error && applications.length === 0 ? <p>No beta applications are available.</p> : null}
      </div>
    </main>
  );
}
