import type { WorkpieceWorkspaceTab } from "../../lib/hearth-workpiece-tab-shell";

type WorkpieceTabBarProps = {
  activeTab: WorkpieceWorkspaceTab;
  tabSummaryById: Record<WorkpieceWorkspaceTab, string>;
  tabDirtyById: Record<WorkpieceWorkspaceTab, boolean>;
  onChangeTab: (tab: WorkpieceWorkspaceTab) => void;
};

function renderTabButton(args: {
  tab: WorkpieceWorkspaceTab;
  label: string;
  activeTab: WorkpieceWorkspaceTab;
  tabSummaryById: Record<WorkpieceWorkspaceTab, string>;
  tabDirtyById: Record<WorkpieceWorkspaceTab, boolean>;
  onChangeTab: (tab: WorkpieceWorkspaceTab) => void;
}) {
  const isActive = args.activeTab === args.tab;
  const isDirty = args.tabDirtyById[args.tab];
  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      className={`hs-workpiece-tab${isActive ? " is-active" : ""}`}
      onClick={() => args.onChangeTab(args.tab)}
    >
      <span className="hs-workpiece-tab-label">
        {args.label}
        {isDirty ? <span className="hs-workpiece-tab-dirty" aria-label="Unsaved changes" /> : null}
      </span>
      <span className="hs-workpiece-tab-summary">{args.tabSummaryById[args.tab]}</span>
    </button>
  );
}

export default function WorkpieceTabBar({
  activeTab,
  tabSummaryById,
  tabDirtyById,
  onChangeTab,
}: WorkpieceTabBarProps) {
  return (
    <div className="hs-workpiece-tabs" role="tablist" aria-label="Workpiece workspace tabs">
      {renderTabButton({
        tab: "script",
        label: "Script",
        activeTab,
        tabSummaryById,
        tabDirtyById,
        onChangeTab,
      })}
      {renderTabButton({
        tab: "visuals",
        label: "Visuals",
        activeTab,
        tabSummaryById,
        tabDirtyById,
        onChangeTab,
      })}
      {renderTabButton({
        tab: "metadata",
        label: "Metadata",
        activeTab,
        tabSummaryById,
        tabDirtyById,
        onChangeTab,
      })}
      {renderTabButton({
        tab: "release",
        label: "Release",
        activeTab,
        tabSummaryById,
        tabDirtyById,
        onChangeTab,
      })}
      {renderTabButton({
        tab: "history",
        label: "History",
        activeTab,
        tabSummaryById,
        tabDirtyById,
        onChangeTab,
      })}
    </div>
  );
}
