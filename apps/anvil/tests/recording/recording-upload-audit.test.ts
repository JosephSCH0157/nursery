import {
  RECORDING_UPLOAD_AUDIT_MAX_ENTRIES,
  RECORDING_UPLOAD_AUDIT_STORAGE_KEY,
  applyUploadFallbackToAuditEntries,
  applyUploadStatusToAuditEntries,
  loadRecordingUploadAuditHistory,
  saveRecordingUploadAuditHistory,
  trimRecordingUploadAuditHistory,
  type RecordingUploadAuditEntry,
} from "../../src/features/recording-upload-audit";

describe("recording upload audit history", () => {
  beforeEach(() => {
    localStorage.removeItem(RECORDING_UPLOAD_AUDIT_STORAGE_KEY);
  });

  test("creates audit entry from preflight with frozen identity", () => {
    const entries = applyUploadStatusToAuditEntries([], {
      phase: "preflight",
      strategy: "chunked",
      sessionRunKey: "run-1",
      workpieceId: "workpiece-1",
      workspaceId: "workspace-1",
      title: "Florida Oranges",
      scriptHash: "hash-1056233d",
      bytes: 1024,
      mb: 0.001,
      safeToLeave: false,
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual(
      expect.objectContaining({
        sessionRunKey: "run-1",
        workpieceId: "workpiece-1",
        workspaceId: "workspace-1",
        title: "Florida Oranges",
        strategy: "chunked",
        phase: "preflight",
        canonicalAttempted: true,
        canonicalSucceeded: false,
      }),
    );
  });

  test("updates progress in place for same upload attempt", () => {
    const first = applyUploadStatusToAuditEntries([], {
      phase: "preflight",
      strategy: "chunked",
      sessionRunKey: "run-2",
      title: "Florida Oranges",
      chunkIndex: 0,
      totalChunks: 5,
    });
    const second = applyUploadStatusToAuditEntries(first, {
      phase: "uploading",
      strategy: "chunked",
      sessionRunKey: "run-2",
      title: "Wrong Title Should Be Ignored",
      chunkIndex: 3,
      totalChunks: 5,
      progressPct: 60,
    });

    expect(second).toHaveLength(1);
    expect(second[0].title).toBe("Florida Oranges");
    expect(second[0]).toEqual(
      expect.objectContaining({
        phase: "uploading",
        chunkIndex: 3,
        chunkTotal: 5,
        progressPct: 60,
      }),
    );
  });

  test("marks success and safe-to-leave on done", () => {
    const preflight = applyUploadStatusToAuditEntries([], {
      phase: "preflight",
      strategy: "single",
      sessionRunKey: "run-3",
      title: "Florida Oranges",
    });
    const done = applyUploadStatusToAuditEntries(preflight, {
      phase: "done",
      strategy: "single",
      sessionRunKey: "run-3",
      safeToLeave: true,
      finalStorageKey: "recordings/Florida_Oranges.webm",
    });

    expect(done[0]).toEqual(
      expect.objectContaining({
        phase: "done",
        safeToLeave: true,
        canonicalAttempted: true,
        canonicalSucceeded: true,
        fallbackUsed: false,
        finalStorageKey: "recordings/Florida_Oranges.webm",
      }),
    );
  });

  test("records canonical failure with fallback usage", () => {
    const failed = applyUploadStatusToAuditEntries([], {
      phase: "failed",
      strategy: "chunked",
      sessionRunKey: "run-4",
      title: "Florida Oranges",
      errorCode: "storage_object_too_large",
      errorMessage: "Payload too large",
    });
    const fallback = applyUploadFallbackToAuditEntries(failed, {
      sessionRunKey: "run-4",
      fallbackUsed: true,
      canonicalAttempted: true,
      canonicalSucceeded: false,
      safeToLeave: true,
      finalStorageKey: "local:download:Florida_Oranges.webm",
    });

    expect(fallback).toHaveLength(1);
    expect(fallback[0]).toEqual(
      expect.objectContaining({
        phase: "failed",
        fallbackUsed: true,
        canonicalAttempted: true,
        canonicalSucceeded: false,
        safeToLeave: true,
        finalStorageKey: "local:download:Florida_Oranges.webm",
      }),
    );
  });

  test("trims history to bounded max entries", () => {
    let entries: RecordingUploadAuditEntry[] = [];
    for (let i = 0; i < RECORDING_UPLOAD_AUDIT_MAX_ENTRIES + 5; i += 1) {
      entries = applyUploadStatusToAuditEntries(entries, {
        phase: "preflight",
        strategy: "single",
        sessionRunKey: `run-trim-${i}`,
        title: `Episode ${i}`,
      });
    }

    const trimmed = trimRecordingUploadAuditHistory(entries);
    expect(trimmed).toHaveLength(RECORDING_UPLOAD_AUDIT_MAX_ENTRIES);
    expect(trimmed[0].sessionRunKey).toBe(`run-trim-${RECORDING_UPLOAD_AUDIT_MAX_ENTRIES + 4}`);
  });

  test("persists and reloads history from localStorage", () => {
    const entries = applyUploadStatusToAuditEntries([], {
      phase: "done",
      strategy: "single",
      sessionRunKey: "run-persist-1",
      title: "Florida Oranges",
      safeToLeave: true,
    });
    saveRecordingUploadAuditHistory(entries);
    const loaded = loadRecordingUploadAuditHistory();

    expect(loaded).toHaveLength(1);
    expect(loaded[0]).toEqual(expect.objectContaining({
      sessionRunKey: "run-persist-1",
      title: "Florida Oranges",
      phase: "done",
      safeToLeave: true,
    }));
  });
});

