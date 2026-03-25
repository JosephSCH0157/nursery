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
        return (
          <button
            key={item.tab}
            id={`hearth-workpiece-tab-${item.tab}`}
            type="button"
            role="tab"
            aria-selected={isActive ? "true" : "false"}
            aria-controls={`hearth-workpiece-panel-${item.tab}`}
            className={`hs-workpiece-tab${isActive ? " is-active" : ""}`}
            onClick={() => onChangeTab(item.tab)}
          >
            <span className="hs-workpiece-tab-label">
              {item.label}
              {isDirty ? <span className="hs-workpiece-tab-dirty" aria-label="Unsaved changes" /> : null}
            </span>
            <span className="hs-workpiece-tab-summary">{tabSummaryById[item.tab]}</span>
          </button>
        );
      })}
    </div>
  );
}
