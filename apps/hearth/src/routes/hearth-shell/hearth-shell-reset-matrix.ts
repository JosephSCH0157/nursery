export type HearthIdentityBoundary =
  | "workspace"
  | "workpiece"
  | "draft_revision"
  | "approved_script";

export type HearthResetDisposition = "survives" | "clears" | "reloads" | "revalidates";

export type HearthResetMatrixRow = Readonly<{
  state: string;
  owner: "identity" | "navigation" | "collection" | "editorial" | "production";
  workspace: HearthResetDisposition;
  workpiece: HearthResetDisposition;
  draft_revision: HearthResetDisposition;
  approved_script: HearthResetDisposition;
}>;

export const HEARTH_SHELL_RESET_MATRIX: readonly HearthResetMatrixRow[] = Object.freeze([
  { state: "workspace identity", owner: "identity", workspace: "reloads", workpiece: "survives", draft_revision: "survives", approved_script: "survives" },
  { state: "workpiece identity", owner: "identity", workspace: "clears", workpiece: "reloads", draft_revision: "survives", approved_script: "survives" },
  { state: "responsive layout and density preference", owner: "navigation", workspace: "reloads", workpiece: "survives", draft_revision: "survives", approved_script: "survives" },
  { state: "mode and focus tab", owner: "navigation", workspace: "clears", workpiece: "reloads", draft_revision: "survives", approved_script: "survives" },
  { state: "workpiece workspace tab", owner: "navigation", workspace: "clears", workpiece: "reloads", draft_revision: "survives", approved_script: "survives" },
  { state: "mobile overlay", owner: "navigation", workspace: "clears", workpiece: "reloads", draft_revision: "survives", approved_script: "survives" },
  { state: "Sparks, Episodes, Ready, and Series collections", owner: "collection", workspace: "reloads", workpiece: "survives", draft_revision: "survives", approved_script: "survives" },
  { state: "active draft, revisions, planning, chat, attachments, and presence", owner: "editorial", workspace: "clears", workpiece: "reloads", draft_revision: "reloads", approved_script: "survives" },
  { state: "canonical approval", owner: "editorial", workspace: "clears", workpiece: "reloads", draft_revision: "revalidates", approved_script: "reloads" },
  { state: "episode package and visual workspace selections", owner: "production", workspace: "clears", workpiece: "reloads", draft_revision: "survives", approved_script: "revalidates" },
  { state: "thumbnail, image-map, B-roll, metadata, and release artifacts", owner: "production", workspace: "clears", workpiece: "reloads", draft_revision: "survives", approved_script: "revalidates" },
]);

export function rowsOwnedByResetDomain(
  owner: HearthResetMatrixRow["owner"],
): readonly HearthResetMatrixRow[] {
  return HEARTH_SHELL_RESET_MATRIX.filter((row) => row.owner === owner);
}
