import type { DestinationCapabilityRevisionId, ExecutableDestinationId, ProviderCredentialGenerationId } from "./publishing-destination-authority.js";

export type PublicationOperationId = string & { readonly __brand: "PublicationOperationId" };
export type PublicationAttemptId = string & { readonly __brand: "PublicationAttemptId" };
export type PublicationReceiptId = string & { readonly __brand: "PublicationReceiptId" };

export type PublicationAttemptState =
  | "reserved" | "preparing_execution" | "submitting" | "succeeded"
  | "confirmed_failure" | "recoverable_failure" | "blocked" | "outcome_unknown";
export type PublicationOperationState = "reserved" | "executing" | "succeeded" | "retryable_failure" | "blocked" | "outcome_unknown";
export type PublicationOutcome = "succeeded" | "confirmed_failure" | "recoverable_failure" | "blocked" | "outcome_unknown";

export type PublicationOperationAuthority = {
  publicationOperationId: PublicationOperationId;
  operationKey: string;
  authorityFingerprint: string;
  workspaceId: string;
  workpieceId: string;
  manifestSnapshotId: string;
  manifestContentHash: string;
  releaseDecisionId: string;
  releaseDecisionRevision: number;
  releaseDecisionContentHash: string;
  executableDestinationId: ExecutableDestinationId;
  destinationCapabilityRevisionId: DestinationCapabilityRevisionId;
  destinationCapabilityRevision: number;
  destinationCapabilityContentHash: string;
  publicationIntentContractVersion: string;
  publicationIntent: Readonly<Record<string, unknown>>;
  publicationIntentContentHash: string;
  establishedAt: string;
};

export type EstablishPublicationOperationRequest = {
  operationKey: string;
  workspaceId: string;
  workpieceId: string;
  manifestSnapshotId: string;
  manifestContentHash: string;
  releaseDecisionId: string;
  releaseDecisionRevision: number;
  executableDestinationId: ExecutableDestinationId;
  destinationCapabilityRevisionId: DestinationCapabilityRevisionId;
  publicationIntentContractVersion: string;
  publicationIntent: Readonly<Record<string, unknown>>;
};

export type EstablishPublicationOperationResult =
  | { disposition: "established" | "replayed"; publicationOperationId: PublicationOperationId; authorityFingerprint: string }
  | { disposition: "blocked" | "invalid" | "publication_operation_idempotency_conflict"; code?: PublicationAuthorityError };

export type PublicationAttempt = {
  publicationAttemptId: PublicationAttemptId;
  publicationOperationId: PublicationOperationId;
  attemptNumber: number;
  state: PublicationAttemptState;
  sideEffectPossible: boolean;
  credentialGenerationId?: ProviderCredentialGenerationId | null;
  adapterId?: string | null;
  adapterVersion?: string | null;
  providerRequestId?: string | null;
  providerUploadSessionId?: string | null;
  externalObjectId?: string | null;
  externalUrl?: string | null;
  failureCode?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
};

export type PublicationReceipt = {
  publicationReceiptId: PublicationReceiptId;
  publicationOperationId: PublicationOperationId;
  publicationAttemptId: PublicationAttemptId;
  outcome: PublicationOutcome;
  workspaceId: string;
  workpieceId: string;
  manifestSnapshotId: string;
  manifestContentHash: string;
  releaseDecisionId: string;
  releaseDecisionRevision: number;
  executableDestinationId: ExecutableDestinationId;
  destinationCapabilityRevisionId: DestinationCapabilityRevisionId;
  credentialGenerationId?: ProviderCredentialGenerationId | null;
  provider: string;
  externalObjectId?: string | null;
  externalUrl?: string | null;
  observedAt: string;
};

export type RetryPublicationOperationRequest = { publicationOperationId: PublicationOperationId };
export type RetryPublicationOperationResult =
  | { disposition: "claimed"; publicationOperationId: PublicationOperationId; publicationAttemptId: PublicationAttemptId; attemptNumber: number; state: "reserved" }
  | { disposition: "blocked"; code: PublicationAuthorityError };

export type PublicationExecutionEvidence = {
  credentialGenerationId?: ProviderCredentialGenerationId | null;
  adapterId: string;
  adapterVersion: string;
  providerRequestId?: string | null;
  providerUploadSessionId?: string | null;
  normalizedProviderEvidence?: Readonly<Record<string, unknown>>;
};

export type PublicationAuthorityError =
  | "publication_manifest_mismatch" | "publication_media_not_ready"
  | "publication_release_decision_mismatch" | "publication_destination_unavailable"
  | "publication_destination_decision_mismatch" | "publication_capability_revision_mismatch" | "publication_capability_incompatible" | "publication_operation_idempotency_conflict"
  | "publication_operation_missing" | "publication_operation_already_succeeded"
  | "publication_operation_blocked" | "publication_attempt_already_active"
  | "publication_safe_retry_unavailable" | "publication_outcome_unknown"
  | "publication_external_reconciliation_required" | "publication_attempt_state_conflict";
