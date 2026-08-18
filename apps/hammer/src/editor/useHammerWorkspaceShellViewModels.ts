import {
  buildPreviewBayVM,
  buildSourceBayVM,
  buildTimelineDockVM,
  buildToolbarVM,
  buildToolBayVM,
} from "./hammerWorkspaceShellViewModels";

/**
 * View-model composition receives explicit readonly state and stable commands from established
 * authorities and invokes the existing five presentation builders. It owns no domain state,
 * effects, persistence, artifact I/O, canonical mutation, or JSX.
 */

type TimelineDockInput = Parameters<typeof buildTimelineDockVM>[0];
type SourceBayInput = Parameters<typeof buildSourceBayVM>[0];
type PreviewBayInput = Parameters<typeof buildPreviewBayVM>[0];
type ToolbarInput = Parameters<typeof buildToolbarVM>[0];
type ToolBayInput = Parameters<typeof buildToolBayVM>[0];

export type HammerWorkspaceShellComposedViewModels = {
  timelineDockVM: ReturnType<typeof buildTimelineDockVM>;
  sourceBayVM: ReturnType<typeof buildSourceBayVM>;
  previewBayVM: ReturnType<typeof buildPreviewBayVM>;
  toolbarVM: ReturnType<typeof buildToolbarVM>;
  toolBayVM: ReturnType<typeof buildToolBayVM>;
};

export function composeHammerTimelineDockViewModel(input: TimelineDockInput) {
  return buildTimelineDockVM(input);
}

export function composeHammerSourceBayViewModel(input: SourceBayInput) {
  return buildSourceBayVM(input);
}

export function composeHammerPreviewBayViewModel(input: PreviewBayInput) {
  return buildPreviewBayVM(input);
}

export function composeHammerToolbarViewModel(input: ToolbarInput) {
  return buildToolbarVM(input);
}

export function composeHammerToolBayViewModel(input: ToolBayInput) {
  return buildToolBayVM(input);
}
