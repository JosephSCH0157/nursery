import {
  Component,
  Suspense,
  type ErrorInfo,
  type ReactNode,
} from "react";

type LazyProductionSurfaceBoundaryProps = {
  children: ReactNode;
  surfaceKey: string;
};

type LazyProductionSurfaceBoundaryState = {
  failed: boolean;
};

class ProductionChunkErrorBoundary extends Component<
  LazyProductionSurfaceBoundaryProps,
  LazyProductionSurfaceBoundaryState
> {
  state: LazyProductionSurfaceBoundaryState = { failed: false };

  static getDerivedStateFromError(): LazyProductionSurfaceBoundaryState {
    return { failed: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo): void {
    // The surface contains the chunk failure. Canonical authority state is unchanged.
  }

  componentDidUpdate(previousProps: LazyProductionSurfaceBoundaryProps): void {
    if (previousProps.surfaceKey !== this.props.surfaceKey && this.state.failed) {
      this.setState({ failed: false });
    }
  }

  render(): ReactNode {
    if (this.state.failed) {
      return (
        <section className="hs-visuals-skeleton" role="alert">
          <strong>This panel could not be loaded.</strong>
        </section>
      );
    }
    return this.props.children;
  }
}

function ProductionChunkFallback() {
  return (
    <section
      className="hs-visuals-skeleton"
      aria-busy="true"
      aria-label="Loading production panel"
    />
  );
}

export default function LazyProductionSurfaceBoundary(
  props: LazyProductionSurfaceBoundaryProps,
) {
  return (
    <ProductionChunkErrorBoundary surfaceKey={props.surfaceKey}>
      <Suspense fallback={<ProductionChunkFallback />}>
        {props.children}
      </Suspense>
    </ProductionChunkErrorBoundary>
  );
}
