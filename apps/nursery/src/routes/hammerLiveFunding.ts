export type HammerLiveFundingContext = {
  workspace_id: string;
  workpiece_id: string;
  route_code: "hammer.transcript_prep";
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function readHammerLiveFundingContext(search: string): HammerLiveFundingContext | null {
  const params = new URLSearchParams(search);
  const workspaceId = params.get("workspace_id")?.trim() ?? "";
  const workpieceId = params.get("workpiece_id")?.trim() ?? "";
  if (params.get("funding") !== "required"
      || params.get("route_code") !== "hammer.transcript_prep"
      || !UUID_PATTERN.test(workspaceId)
      || !UUID_PATTERN.test(workpieceId)) return null;
  return {
    workspace_id: workspaceId,
    workpiece_id: workpieceId,
    route_code: "hammer.transcript_prep",
  };
}
