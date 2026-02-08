import * as React from "react";
import { Link } from "react-router-dom";
import type { ForgeNavSection } from "./forgeNavTree";

type Props = {
  tree: ForgeNavSection[];
  onNavigate?: () => void;
  renderSectionTitle?: (section: ForgeNavSection) => React.ReactNode;
  renderDividerAfterSectionId?: string;
  getNavStyle?: (section: ForgeNavSection) => React.CSSProperties;
  getItemStyle?: (section: ForgeNavSection) => React.CSSProperties | undefined;
};

export function ForgeNav({
  tree,
  onNavigate,
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
              {section.items.map((item) => (
                item.href
                  ? (
                    <a
                      key={item.id}
                      href={item.href}
                      onClick={onNavigate}
                      style={itemStyle}
                    >
                      {item.label}
                    </a>
                  )
                  : (
                    <Link
                      key={item.id}
                      to={item.to ?? "#"}
                      onClick={onNavigate}
                      style={itemStyle}
                    >
                      {item.label}
                    </Link>
                  )
              ))}
            </nav>

            {section.id === renderDividerAfterSectionId && <hr />}
          </div>
        );
      })}
    </>
  );
}
