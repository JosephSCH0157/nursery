import MetadataSurface from "../../views/surfaces/MetadataSurface";
import ReleaseSurface from "../../views/surfaces/ReleaseSurface";
import VisualsSurface from "../../views/surfaces/VisualsSurface";
import type { HearthProductionViewModel } from "./buildHearthProductionViewModel";

type HearthProductionContentProps = {
  viewModel: HearthProductionViewModel;
};

export default function HearthProductionContent({
  viewModel,
}: HearthProductionContentProps) {
  return (
    <>
      {viewModel.release ? <ReleaseSurface {...viewModel.release} /> : null}
      <MetadataSurface {...viewModel.metadata} />
      <VisualsSurface {...viewModel.visuals} />
    </>
  );
}
