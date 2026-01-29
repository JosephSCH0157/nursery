import type { Spark } from "./model";

export type HearthPacketV1 = {
  from: "bar-stock";
  type: "spark_to_hearth";
  version: 1;
  createdAt: string; // ISO
  sparkId: string;
  session?: string;
  tags: string[];
  status: string;
  body: string;
};

export function buildHearthPacket(s: Spark, sessionName?: string): HearthPacketV1 {
  return {
    from: "bar-stock",
    type: "spark_to_hearth",
    version: 1,
    createdAt: new Date().toISOString(),
    sparkId: s.id,
    session: sessionName,
    tags: s.tags ?? [],
    status: s.status,
    body: s.body
  };
}

export function packetToClipboardText(p: HearthPacketV1): string {
  return JSON.stringify(p, null, 2);
}
