// Application body budget: 1,500,000 bytes below Netlify's documented 6 MB
// request limit. Count UTF-8 JSON, not JavaScript characters or raw media bytes.
export const RECORDING_REQUEST_MAX_BYTES = 4_500_000;
export const RECORDING_CHUNK_MAX_BYTES = 3 * 1024 * 1024;
// Current verified forge-workpieces limit (2026-11-10). This is a conservative
// application admission limit, not permission to raise the hosted bucket limit.
export const RECORDING_MAX_BYTES = 500 * 1024 * 1024;

export class RecordingUploadAdmissionError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'RecordingUploadAdmissionError';
  }
}

export function assertRecordingSize(bytes: number): void {
  if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > RECORDING_MAX_BYTES) {
    throw new RecordingUploadAdmissionError(
      'recording_size_unsupported',
      'Recording exceeds the supported 500 MiB object size or has an invalid size. No upload was started.',
    );
  }
}

export function serializeRecordingRequest(payload: Record<string, unknown>): string {
  const body = JSON.stringify(payload);
  if (new TextEncoder().encode(body).byteLength > RECORDING_REQUEST_MAX_BYTES) {
    throw new RecordingUploadAdmissionError(
      'recording_request_too_large',
      'Recording upload request exceeds the safe request size, including metadata. The request was not sent.',
    );
  }
  return body;
}

export function boundedUploadMb(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.min(value, 3) : 3;
}
