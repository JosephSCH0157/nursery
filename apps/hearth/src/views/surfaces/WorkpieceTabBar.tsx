import type { WorkpieceWorkspaceTab } from "../../lib/hearth-workpiece-tab-shell";

type WorkpieceTabBarProps = {
  activeTab: WorkpieceWorkspaceTab;
  tabSummaryById: Record<WorkpieceWorkspaceTab, string>;
  tabDirtyById: Record<WorkpieceWorkspaceTab, boolean>;
  onChangeTab: (tab: WorkpieceWorkspaceTab) => void;
};

const WORKPIECE_TAB_ITEMS: Array<{
  tab: WorkpieceWorkspaceTab;
  label: string;
}> = [
  { tab: "script", label: "Script" },
  { tab: "visuals", label: "Visuals" },
  { tab: "metadata", label: "Metadata" },
  { tab: "release", label: "Release" },
  { tab: "history", label: "History" },
];

export default function WorkpieceTabBar({
  activeTab,
  tabSummaryById,
  tabDirtyById,
  onChangeTab,
}: WorkpieceTabBarProps) {
  return (
    <div className="hs-workpiece-tabs" role="tablist" aria-label="Workpiece workspace tabs">
      {WORKPIECE_TAB_ITEMS.map((item) => {
        const isActive = activeTab === item.tab;
        const isDirty = tabDirtyById[item.tab];
        const content = (
          <>
            <span className="hs-workpiece-tab-label">
              {item.label}
              {isDirty ? <span className="hs-workpiece-tab-dirty" aria-hidden="true" /> : null}
            </span>
            <span className="hs-workpiece-tab-summary">{tabSummaryById[item.tab]}</span>
          </>
        );

        if (isActive) {
          return (
            <button
              key={item.tab}
              id={`hearth-workpiece-tab-${item.tab}`}
              type="button"
              role="tab"
              aria-label={isDirty ? `${item.label} (Unsaved changes)` : item.label}
              aria-selected="true"
              aria-controls={`hearth-workpiece-panel-${item.tab}`}
              tabIndex={0}
              className="hs-workpiece-tab is-active"
              onClick={() => onChangeTab(item.tab)}
            >
              {content}
            </button>
          );
        }

        return (
          <button
            key={item.tab}
            id={`hearth-workpiece-tab-${item.tab}`}
            type="button"
            role="tab"
            aria-label={isDirty ? `${item.label} (Unsaved changes)` : item.label}
            aria-selected="false"
            aria-controls={`hearth-workpiece-panel-${item.tab}`}
            tabIndex={-1}
            className="hs-workpiece-tab"
            onClick={() => onChangeTab(item.tab)}
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}
