import * as React from "react";
import { Link } from "react-router-dom";
import type { ForgeNavItem, ForgeNavSection } from "./forgeNavTree";

type Props = {
  tree: ForgeNavSection[];
  extraItems?: ForgeNavItem[];
  onNavigate?: () => void;
  onAction?: (actionId: string) => void;
  renderSectionTitle?: (section: ForgeNavSection) => React.ReactNode;
  renderDividerAfterSectionId?: string;
  getNavStyle?: (section: ForgeNavSection) => React.CSSProperties;
  getItemStyle?: (section: ForgeNavSection) => React.CSSProperties | undefined;
};

export function ForgeNav({
  tree,
  extraItems = [],
  onNavigate,
  onAction,
  renderSectionTitle,
  renderDividerAfterSectionId = "forge",
  getNavStyle,
  getItemStyle,
}: Props) {
  return (
    <>
      {tree.map((section, idx) => {
        const isFirst = idx === 0;

        const titleNode = renderSectionTitle?.(section) ?? (
          section.title
            ? (
              section.title === "Nursery"
                ? <h3 style={{ marginTop: 0 }}>{section.title}</h3>
                : (
                  <div style={{ fontSize: "0.85rem", color: "var(--forge-text-muted)" }}>
                    {section.title}
                  </div>
                )
            )
            : null
        );

        const navStyle = getNavStyle?.(section) ?? {
          display: "grid",
          gap: section.id === "settings" ? 6 : 8,
          marginTop: section.id === "settings" ? 4 : 0,
        };

        const itemStyle = getItemStyle?.(section);

        return (
          <div key={section.id} style={{ marginTop: isFirst ? 0 : 12 }}>
            {titleNode}

            <nav style={navStyle}>
              {(section.id === "settings" ? [...section.items, ...extraItems] : section.items).map((item) => {
                if (item.actionId) {
                  const actionId = item.actionId;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        onAction?.(actionId);
                        onNavigate?.();
                      }}
                      style={{
                        ...itemStyle,
                        width: "100%",
                        textAlign: "left",
                        background: "transparent",
                        border: "none",
                        padding: 0,
                        color: "inherit",
                        cursor: "pointer",
                        font: "inherit",
                      }}
                    >
                      {item.label}
                    </button>
                  );
                }

                if (item.href) {
                  return (
                    <a
                      key={item.id}
                      href={item.href}
                      onClick={onNavigate}
                      style={itemStyle}
                    >
                      {item.label}
                    </a>
                  );
                }

                return (
                  <Link
                    key={item.id}
                    to={item.to ?? "#"}
                    onClick={onNavigate}
                    style={itemStyle}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            {section.id === renderDividerAfterSectionId && <hr />}
          </div>
        );
      })}
    </>
  );
}
