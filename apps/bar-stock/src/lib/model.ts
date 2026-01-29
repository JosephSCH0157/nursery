export type SparkId = string;

export type SparkStatus = "raw" | "warming" | "forged" | "archived";

export type SparkSource =
  | "typed"
  | "paste"
  | "voice"
  | "import"
  | "link"
  | "other";

export type SessionId = string;

export type Session = {
  id: SessionId;
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
  sessionId?: SessionId;

  // future-friendly: connection to other Forge tools without committing now
  links?: {
    hearthDraftId?: string;
    tongsAssetId?: string;
  };
};

export function newId(): SparkId {
  return crypto.randomUUID();
}

export function now(): number {
  return Date.now();
}

export function makeSpark(body: string, partial?: Partial<Spark>): Spark {
  const t = now();
  return {
    id: newId(),
    createdAt: t,
    updatedAt: t,
    body: body.trim(),
    tags: [],
    status: "raw",
    source: "typed",
    ...partial
  };
}
