import { Component, Suspense, lazy, type ComponentProps, type ReactNode } from "react";
import type SourcesView from "../../views/SourcesView";

type SourcesProps = ComponentProps<typeof SourcesView>;

// Module-scoped, like the other Hearth surface loaders: never recreated by a tab render.
export const HEARTH_SOURCES_PRESENTATION_LOADER = {
  load: () => import("../../views/SourcesView"),
};

class SourcesPresentationErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return <div role="alert">Sources presentation could not be loaded. Your source data remains unchanged.</div>;
    }
    return this.props.children;
  }
}

export function createHearthSourcesPresentation(load: typeof HEARTH_SOURCES_PRESENTATION_LOADER.load) {
  const LazySourcesView = lazy(load);
  return function HearthSourcesPresentation(props: SourcesProps) {
    return (
      <SourcesPresentationErrorBoundary>
        <Suspense fallback={<div role="status" aria-busy="true">Loading Sources…</div>}>
          <LazySourcesView {...props} />
        </Suspense>
      </SourcesPresentationErrorBoundary>
    );
  };
}

export default createHearthSourcesPresentation(() => HEARTH_SOURCES_PRESENTATION_LOADER.load());
