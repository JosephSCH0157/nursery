import type { HearthReadyScript } from "../../lib/hearth-ready-scripts";

type HearthSeriesModeProps = {
  seriesEntries: HearthReadyScript[];
  resolveReadyAttribution: (entry: HearthReadyScript) => string;
  onOpenSeriesEntry: (entry: HearthReadyScript) => void | Promise<void>;
};

export default function HearthSeriesMode({
  seriesEntries,
  resolveReadyAttribution,
  onOpenSeriesEntry,
}: HearthSeriesModeProps) {
  return (
    <section className="hs-home">
      <header className="hs-home-header">
        <h2 className="hs-home-title">Series</h2>
        <p className="hs-home-subtext">Series-focused queue.</p>
      </header>
      {seriesEntries.length === 0 ? (
        <p className="hs-home-empty">No series-labeled Episodes yet.</p>
      ) : (
        <ul className="hs-ready-record-list">
          {seriesEntries.map((entry) => (
            <li key={entry.id} className="hs-ready-record-item">
              <button
                type="button"
                className="hs-ready-record-link"
                onClick={() => void onOpenSeriesEntry(entry)}
              >
                <div className="hs-ready-record-title">{entry.title}</div>
              </button>
              <div className="hs-ready-record-meta">{resolveReadyAttribution(entry)}</div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
