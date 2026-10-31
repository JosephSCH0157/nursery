import {
  getBetaAdmissionServiceClient,
  ingestVerifiedBetaApplication,
  isBetaAdmissionIntakeEnabled,
  type VerifiedBetaApplicationEventData,
} from "../../server/auth/beta-admission-service";

type FormSubmittedEvent = {
  data: VerifiedBetaApplicationEventData;
};

export default {
  async formSubmitted(event: FormSubmittedEvent): Promise<void> {
    if (!isBetaAdmissionIntakeEnabled()) return;
    try {
      await ingestVerifiedBetaApplication(event.data, getBetaAdmissionServiceClient());
    } catch {
      // Avoid logging applicant content or server configuration. Throwing keeps
      // ingestion failure visible to Netlify's verified event infrastructure.
      throw new Error("Forge beta application ingestion failed");
    }
  },
};
