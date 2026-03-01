import type { EpisodeThumbnailVersion } from "../../lib/episode-package-v2";

function formatVersionTimestamp(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "Unknown time";
  try {
    return new Date(timestamp).toLocaleString();
  } catch {
    return value;
  }
}

type ThumbnailVersionsProps = {
  versions: EpisodeThumbnailVersion[];
  selectedVersionId: string | null;
  primaryVersionId: string | null;
  disabled?: boolean;
  onSelectVersion: (versionId: string) => void;
  onSetPrimary: (versionId: string) => void;
  onRetryVersion: (version: EpisodeThumbnailVersion) => void;
};

export default function ThumbnailVersions({
  versions,
  selectedVersionId,
  primaryVersionId,
  disabled = false,
  onSelectVersion,
  onSetPrimary,
  onRetryVersion,
}: ThumbnailVersionsProps) {
  if (versions.length === 0) {
    return <div className="hs-thumb-empty">No versions yet.</div>;
  }

  return (
    <div className="hs-thumb-versions-list">
      {versions
        .slice()
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map((version) => {
          const selected = version.id === selectedVersionId;
          const primary = version.id === primaryVersionId;
          const failed = version.status === "failed";
          const ready = version.status === "ready";

          return (
            <article
              key={version.id}
              className={`hs-thumb-version-card${selected ? " is-selected" : ""}${primary ? " is-primary" : ""}${failed ? " is-failed" : ""}`}
            >
              <div className="hs-thumb-version-header">
                <div className="hs-thumb-version-title">
                  {version.id.slice(0, 8)}
                  {primary ? " (Primary)" : ""}
                </div>
                <div className={`hs-thumb-version-status is-${failed ? "failed" : ready ? "ready" : "pending"}`}>
                  {version.status}
                </div>
              </div>
              <div className="hs-thumb-version-meta">
                {formatVersionTimestamp(version.created_at)} · {version.provider}
              </div>
              {failed && version.error ? (
                <div className="hs-error-text-small">{version.error}</div>
              ) : null}
              <div className="hs-thumb-version-actions">
                <button
                  type="button"
                  onClick={() => onSelectVersion(version.id)}
                  disabled={disabled}
                >
                  Preview
                </button>
                {ready ? (
                  <button
                    type="button"
                    onClick={() => onSetPrimary(version.id)}
                    disabled={disabled || primary}
                  >
                    {primary ? "Primary" : "Set as Primary"}
                  </button>
                ) : null}
                {failed ? (
                  <button
                    type="button"
                    onClick={() => onRetryVersion(version)}
                    disabled={disabled}
                  >
                    Retry
                  </button>
                ) : null}
              </div>
            </article>
          );
        })}
    </div>
  );
}
