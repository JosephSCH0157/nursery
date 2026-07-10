import HammerRoute from "./routes/Hammer";
import HammerEditorRoute from "./routes/HammerEditor";
import HammerStandalone from "./routes/HammerStandalone";

export const hammerProductionRoutes = Object.freeze({
  library: HammerRoute,
  editor: HammerEditorRoute,
  standalone: HammerStandalone,
});
