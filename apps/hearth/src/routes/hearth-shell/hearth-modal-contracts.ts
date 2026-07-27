import type { HearthShellModalsProps } from "../../views/modes/HearthShellModals";

export type HearthModalViewModel = Readonly<HearthShellModalsProps>;

export type HearthModalViewModelInput = Omit<
  HearthShellModalsProps,
  "hasActiveDraft"
> & {
  activeDraftId: string | null;
};
