import type { Spark } from "./model";

export type HearthPacketV2 = {
  from: "bar-stock";
  type: "spark_to_hearth";
  version: 2;
  createdAt: string; // ISO
  sparkId: string;
  episodeId: string;
  episodeLabel: string;
  tags: string[];
  status: string;
  body: string;
};

export function buildHearthPacket(s: Spark, episodeLabel: string): HearthPacketV2 {
  return {
    from: "bar-stock",
    type: "spark_to_hearth",
    version: 2,
    createdAt: new Date().toISOString(),
    sparkId: s.id,
    episodeId: s.assignmentId,
    episodeLabel,
    tags: s.tags ?? [],
    status: s.status,
    body: s.body
  };
}

export function packetToClipboardText(p: HearthPacketV2): string {
  return JSON.stringify(p, null, 2);
}
