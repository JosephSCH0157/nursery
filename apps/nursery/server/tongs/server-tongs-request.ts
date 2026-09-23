export class ServerTongsRequestError extends Error {
  readonly code: "tongs_api_credential_missing" | "tongs_user_authorization_missing";

  constructor(code: ServerTongsRequestError["code"], message: string) {
    super(message);
    this.name = "ServerTongsRequestError";
    this.code = code;
  }
}

function requiredCredential(value: string | null | undefined, code: ServerTongsRequestError["code"]): string {
  const normalized = value?.trim();
  if (!normalized) {
    throw new ServerTongsRequestError(
      code,
      code === "tongs_api_credential_missing"
        ? "The server Tongs API credential is unavailable."
        : "The customer Tongs authorization is unavailable.",
    );
  }
  return normalized;
}

export function buildServerTongsHeaders(args: {
  apiToken: string | null | undefined;
  userAccessToken: string | null | undefined;
  headers?: HeadersInit;
}): Headers {
  const apiToken = requiredCredential(args.apiToken, "tongs_api_credential_missing");
  const userAccessToken = requiredCredential(args.userAccessToken, "tongs_user_authorization_missing");
  const headers = new Headers(args.headers);
  headers.set("authorization", `Bearer ${apiToken}`);
  headers.set("x-forge-user-authorization", `Bearer ${userAccessToken}`);
  return headers;
}

export async function serverTongsRequest(args: {
  requestUrl: string;
  path: string;
  apiToken: string | null | undefined;
  userAccessToken: string | null | undefined;
  init?: RequestInit;
  fetchImpl?: typeof fetch;
}): Promise<Response> {
  const url = new URL(args.path, args.requestUrl);
  return (args.fetchImpl ?? fetch)(url, {
    ...args.init,
    headers: buildServerTongsHeaders({
      apiToken: args.apiToken,
      userAccessToken: args.userAccessToken,
      headers: args.init?.headers,
    }),
  });
}
