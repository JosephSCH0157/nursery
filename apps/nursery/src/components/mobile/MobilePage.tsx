import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useLayoutMode } from "../../hooks/useLayoutMode";
import "./MobilePage.css";

type MobilePageProps = {
  title: string;
  children: ReactNode;
  rightAction?: ReactNode;
  overflowAction?: ReactNode;
  bottomBar?: ReactNode;
  onBack?: () => void;
  backLabel?: string;
  showBack?: boolean;
};

export default function MobilePage({
  title,
  children,
  rightAction,
  overflowAction,
  bottomBar,
  onBack,
  backLabel = "Back",
  showBack = true,
}: MobilePageProps) {
  const navigate = useNavigate();
  const layoutMode = useLayoutMode();

  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }
    navigate(-1);
  };

  return (
    <section className={`mobile-page mobile-page--${layoutMode}`}>
      <header className="mobile-page__topbar">
        <div className="mobile-page__left">
          {showBack ? (
            <button
              type="button"
              className="mobile-page__back mobile-tap-target"
              onClick={handleBack}
              aria-label={backLabel}
            >
              {backLabel}
            </button>
          ) : null}
        </div>
        <h1 className="mobile-page__title mobile-truncate">{title}</h1>
        <div className="mobile-page__right">
          {rightAction}
          {overflowAction}
        </div>
      </header>

      <div className="mobile-page__body mobile-safe-bottom">{children}</div>

      {bottomBar ? (
        <footer className="mobile-page__bottom">{bottomBar}</footer>
      ) : null}
    </section>
  );
}
