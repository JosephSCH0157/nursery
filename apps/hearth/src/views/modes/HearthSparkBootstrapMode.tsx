import type { BarStockSpark } from "../../lib/barstock-sparks";

type HearthSparkBootstrapModeProps = {
  routeSpark: BarStockSpark | null;
  deriveSparkTitle: (spark: BarStockSpark) => string;
  forgeError: string | null;
};

export default function HearthSparkBootstrapMode({
  routeSpark,
  deriveSparkTitle,
  forgeError,
}: HearthSparkBootstrapModeProps) {
  const sparkTitle = routeSpark ? deriveSparkTitle(routeSpark) : "Opening spark";
  return (
    <section className="hs-home hs-sparks-landing">
      <header className="hs-home-header">
        <h2 className="hs-home-title">Lighting the forge...</h2>
        <p className="hs-home-subtext">
          {routeSpark
            ? `Opening ${sparkTitle} from Bar Stock.`
            : "Opening your spark from Bar Stock."}
        </p>
      </header>
      {forgeError ? (
        <div className="hs-error-text-small">{forgeError}</div>
      ) : (
        <div className="hs-resume-context">
          Preparing the workpiece and dropping you into the fire.
        </div>
      )}
    </section>
  );
}
