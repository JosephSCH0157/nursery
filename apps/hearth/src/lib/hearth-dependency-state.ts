export type HearthDependencyFailureKind = "unavailable" | "failed";

export class HearthDependencyError extends Error {
  readonly dependency: string;
  readonly kind: HearthDependencyFailureKind;
  readonly status: number | null;

  constructor(args: {
    dependency: string;
    kind: HearthDependencyFailureKind;
    message: string;
    status?: number | null;
    cause?: unknown;
  }) {
    super(args.message, { cause: args.cause });
    this.name = "HearthDependencyError";
    this.dependency = args.dependency;
    this.kind = args.kind;
    this.status = args.status ?? null;
  }
}

export function classifyHttpDependencyFailure(status: number): HearthDependencyFailureKind {
  return status === 404 || status === 501 || status === 503 ? "unavailable" : "failed";
}

export function describeHearthDependencyFailure(error: unknown, fallback: string): string {
  if (error instanceof HearthDependencyError) return error.message;
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}
