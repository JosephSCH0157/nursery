export type SparkId = string;

export type SparkStatus = "raw" | "warming" | "forged" | "graduated" | "archived";

export type SparkSource =
  | "typed"
  | "paste"
  | "voice"
  | "import"
  | "link"
  | "other";

export type AssignmentId = string;

export type Assignment = {
  id: AssignmentId;
  name: string;
  createdAt: number;
  updatedAt: number;
  pinned?: boolean;
};

export type Spark = {
  id: SparkId;
  createdAt: number; // epoch ms
  updatedAt: number; // epoch ms

  title?: string;    // optional: many sparks won't have titles
  body: string;      // the actual idea content (the point of Bar-Stock)

  tags: string[];    // lightweight tags (no hierarchy yet)
  status: SparkStatus;

  source: SparkSource;
  pinned?: boolean;
  assignmentId: AssignmentId | null;

  // future-friendly: connection to other Forge tools without committing now
  links?: {
    hearthDraftId?: string;
    hearthWorkpieceId?: string;
    tongsAssetId?: string;
  };
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string | null | undefined): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export function newId(): SparkId {
  return crypto.randomUUID();
}

export function now(): number {
  return Date.now();
}

export function makeSpark(body: string, assignmentId: AssignmentId | null, partial?: Partial<Spark>): Spark {
  const t = now();
  const id = isUuid(partial?.id) ? partial.id : crypto.randomUUID();
  return {
    createdAt: t,
    updatedAt: t,
    body: body.trim(),
    tags: [],
    status: "raw",
    source: "typed",
    ...partial,
    assignmentId,
    id
  };
}
