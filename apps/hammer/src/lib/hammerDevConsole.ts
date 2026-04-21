type DevConsoleMethod = (message?: unknown, ...optionalParams: unknown[]) => void;

function getConsoleMethod(name: "log" | "warn" | "error"): DevConsoleMethod {
  const runtimeConsole = (globalThis as typeof globalThis & { console?: Console }).console;
  if (!runtimeConsole) return () => undefined;
  const method = (runtimeConsole as unknown as Record<string, unknown>)[name];
  return typeof method === "function" ? (method as DevConsoleMethod).bind(runtimeConsole) : () => undefined;
}

function canUseConsoleGroups(): boolean {
  const runtimeConsole = (globalThis as typeof globalThis & { console?: Console }).console;
  if (!runtimeConsole) return false;
  const candidate = runtimeConsole as unknown as Record<string, unknown>;
  return typeof candidate.groupCollapsed === "function" && typeof candidate.groupEnd === "function";
}

function normalizeLogToggle(value: string | null): "on" | "off" | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (["0", "false", "off", "no"].includes(normalized)) return "off";
  if (["1", "true", "on", "yes", "verbose", "chatty"].includes(normalized)) return "on";
  return "on";
}

export type HammerDevConsoleRun = {
  log: (event: string, data?: Record<string, unknown>) => void;
  warn: (event: string, data?: Record<string, unknown>) => void;
  error: (event: string, data?: Record<string, unknown>) => void;
  span: (event: string, data?: Record<string, unknown>) => {
    end: (data?: Record<string, unknown>) => void;
    fail: (error: unknown, data?: Record<string, unknown>) => void;
  };
  end: (data?: Record<string, unknown>) => void;
};

export type HammerDevConsoleLogger = {
  enabled: boolean;
  run: (title: string, data?: Record<string, unknown>) => HammerDevConsoleRun;
  log: (event: string, data?: Record<string, unknown>) => void;
  warn: (event: string, data?: Record<string, unknown>) => void;
  error: (event: string, data?: Record<string, unknown>) => void;
};

export function isHammerDevConsoleEnabled(routeSearch?: string | null): boolean {
  const env = (typeof import.meta !== "undefined"
    && typeof import.meta.env === "object"
    && import.meta.env)
    ? import.meta.env as unknown as Record<string, unknown>
    : null;
  if (!env || env.DEV !== true) return false;
  const envToggle = normalizeLogToggle(typeof env.VITE_HAMMER_DEV_LOG === "string" ? env.VITE_HAMMER_DEV_LOG : null);
  if (envToggle === "off") return false;
  const search = routeSearch
    ?? ((typeof window !== "undefined" && typeof window.location?.search === "string")
      ? window.location.search
      : "");
  try {
    const params = new URLSearchParams(search);
    const queryToggle = normalizeLogToggle(
      params.get("hammerLog")
      ?? params.get("hammer_log")
      ?? params.get("hammerDevLog")
      ?? params.get("hammer_dev_log"),
    );
    if (queryToggle === "off") return false;
    if (queryToggle === "on") return true;
  } catch {
    // ignore query parsing errors
  }
  return envToggle === "on";
}

function readPerfNow(): number {
  const candidate = (globalThis as typeof globalThis & { performance?: unknown }).performance as { now?: () => number } | undefined;
  return typeof candidate?.now === "function" ? candidate.now() : Date.now();
}

function toErrorSummary(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: typeof error.stack === "string" ? error.stack : null,
    };
  }
  return { error: String(error) };
}

export function createHammerDevConsoleLogger(args: {
  scope: string;
  routeSearch?: string | null;
}): HammerDevConsoleLogger {
  const enabled = isHammerDevConsoleEnabled(args.routeSearch);
  const logFn = getConsoleMethod("log");
  const warnFn = getConsoleMethod("warn");
  const errorFn = getConsoleMethod("error");
  const prefix = `[${args.scope}]`;
  const hasGroups = enabled && canUseConsoleGroups();

  const log = (event: string, data?: Record<string, unknown>) => {
    if (!enabled) return;
    data ? logFn(prefix, event, data) : logFn(prefix, event);
  };
  const warn = (event: string, data?: Record<string, unknown>) => {
    if (!enabled) return;
    data ? warnFn(prefix, event, data) : warnFn(prefix, event);
  };
  const error = (event: string, data?: Record<string, unknown>) => {
    if (!enabled) return;
    data ? errorFn(prefix, event, data) : errorFn(prefix, event);
  };

  const run = (title: string, data?: Record<string, unknown>): HammerDevConsoleRun => {
    if (!enabled) {
      return {
        log: () => undefined,
        warn: () => undefined,
        error: () => undefined,
        span: () => ({ end: () => undefined, fail: () => undefined }),
        end: () => undefined,
      };
    }

    const runtimeConsole = (globalThis as typeof globalThis & { console?: Console }).console;
    let ended = false;

    if (hasGroups && runtimeConsole) {
      const titlePayload = data ? { ...data } : undefined;
      if (titlePayload) {
        runtimeConsole.groupCollapsed(prefix, title, titlePayload);
      } else {
        runtimeConsole.groupCollapsed(prefix, title);
      }
    } else {
      log(title, data);
    }

    const span = (event: string, spanData?: Record<string, unknown>) => {
      const startedAt = readPerfNow();
      log(`${event}:start`, spanData);
      return {
        end: (endData?: Record<string, unknown>) => {
          const elapsedMs = Math.round((readPerfNow() - startedAt) * 100) / 100;
          log(`${event}:ok`, { ...(spanData ?? {}), ...(endData ?? {}), elapsed_ms: elapsedMs });
        },
        fail: (spanError: unknown, failData?: Record<string, unknown>) => {
          const elapsedMs = Math.round((readPerfNow() - startedAt) * 100) / 100;
          error(`${event}:fail`, {
            ...(spanData ?? {}),
            ...(failData ?? {}),
            elapsed_ms: elapsedMs,
            ...toErrorSummary(spanError),
          });
        },
      };
    };

    const end = (endData?: Record<string, unknown>) => {
      if (ended) return;
      ended = true;
      if (endData) {
        log("run:end", endData);
      } else {
        log("run:end");
      }
      if (hasGroups && runtimeConsole) {
        runtimeConsole.groupEnd();
      }
    };

    return {
      log,
      warn,
      error,
      span,
      end,
    };
  };

  return {
    enabled,
    run,
    log,
    warn,
    error,
  };
}
