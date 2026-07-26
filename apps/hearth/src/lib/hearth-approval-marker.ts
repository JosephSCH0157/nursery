export function buildApprovalMarkerLines(args: {
  version: number;
  approvedAt: number;
  graduatedSparkId: string | null;
  styleAlignmentMarker: string | null;
}): string[] {
  return [
    `🔥 Script Version ${args.version} Approved`,
    `script_version: ${args.version}`,
    `timestamp: ${new Date(args.approvedAt).toISOString()}`,
    "saved_to_cloud: ok",
    "local_mirror: independent_best_effort_sync",
    args.graduatedSparkId
      ? `spark_status: graduated (${args.graduatedSparkId})`
      : "spark_status: no_linked_spark",
    ...(args.styleAlignmentMarker ? [args.styleAlignmentMarker] : []),
    "Production Mode available",
  ];
}
