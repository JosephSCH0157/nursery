import * as React from "react";
import { Link } from "react-router-dom";
import type { ForgeNavItem, ForgeNavSection } from "./forgeNavTree";
import "./ForgeNav.css";

type Props = {
  tree: ForgeNavSection[];
  extraItems?: ForgeNavItem[];
  onNavigate?: () => void;
  onAction?: (actionId: string) => void;
  renderSectionTitle?: (section: ForgeNavSection) => React.ReactNode;
  renderDividerAfterSectionId?: string;
};

export function ForgeNav({
  tree,
  extraItems = [],
  onNavigate,
  onAction,
  renderSectionTitle,
  renderDividerAfterSectionId = "forge",
}: Props) {
  function renderItemContent(item: ForgeNavItem): React.ReactNode {
    if (!item.badge) {
      return item.label;
    }

    return (
      <span className="forge-nav__item-content">
        <span>{item.label}</span>
        <span className="forge-nav__item-badge" aria-label="Under construction" title="Under construction">
          {item.badge}
        </span>
      </span>
    );
  }

  return (
    <>
      {tree.map((section, idx) => {
        const isFirst = idx === 0;

        const titleNode = renderSectionTitle?.(section) ?? (
          section.title
            ? (
              section.id === "forge"
                ? <h3 className="forge-nav__section-title-forge">{section.title}</h3>
                : (
                  <div className="forge-nav__section-title-muted">
                    {section.title}
                  </div>
                )
            )
            : null
        );
        const navClassName = section.id === "settings"
          ? "forge-nav__section-items forge-nav__section-items--settings"
          : "forge-nav__section-items";
        const sectionClassName = isFirst
          ? "forge-nav__section"
          : "forge-nav__section forge-nav__section--spaced";

        return (
          <div key={section.id} className={sectionClassName}>
            {titleNode}

            <nav className={navClassName}>
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
                      className="forge-nav__action-item"
                    >
                      {renderItemContent(item)}
                    </button>
                  );
                }

                if (item.href) {
                  return (
                    <a
                      key={item.id}
                      href={item.href}
                      onClick={onNavigate}
                      className="forge-nav__item-link"
                    >
                      {renderItemContent(item)}
                    </a>
                  );
                }

                return (
                  <Link
                    key={item.id}
                    to={item.to ?? "#"}
                    onClick={onNavigate}
                    className="forge-nav__item-link"
                  >
                    {renderItemContent(item)}
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
