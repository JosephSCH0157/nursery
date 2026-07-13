import { listWorkspaceReadyScripts } from "../../src/forge/ready-scripts";

const WORKSPACE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const WORKPIECE_ID = "11111111-1111-4111-8111-111111111111";

function installWindow(): void {
  window.history.replaceState({}, "", `/?workspace_id=${WORKSPACE_ID}`);
  window.localStorage.setItem("forge-auth", JSON.stringify({ access_token: "user-token" }));
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe("Anvil revision-bound Ready discovery", () => {
  beforeEach(() => {
    installWindow();
    jest.restoreAllMocks();
    globalThis.fetch = jest.fn() as unknown as typeof fetch;
  });

  test("accepts exactly one validated current Ready contract", async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue(jsonResponse({
      ok: true,
      data: {
        scripts: [{
          workspace_id: WORKSPACE_ID,
          workpiece_id: WORKPIECE_ID,
          path: "script/script.md",
          primary_script_path: "script/script.md",
          script_paths: ["script/script.md"],
          title: "Canonical Ready",
          updated_at: "2026-07-13T20:00:00.000Z",
          script_revision: 4,
          script_hash: "a".repeat(64),
          transition_id: "22222222-2222-4222-8222-222222222222",
        }],
      },
    }));

    const rows = await listWorkspaceReadyScripts();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      workpieceId: WORKPIECE_ID,
      scriptRevision: 4,
      scriptHash: "a".repeat(64),
      transitionId: "22222222-2222-4222-8222-222222222222",
    });
  });

  test("does not synthesize readiness from path-only rows", async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue(jsonResponse({
      ok: true,
      data: { scripts: [{ workpiece_id: WORKPIECE_ID, path: "script/script.md", title: "Unsafe" }] },
    }));
    await expect(listWorkspaceReadyScripts()).resolves.toEqual([]);
  });

  test("missing migration fails closed with a clear authority error", async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue(jsonResponse({ ok: false }, 503));
    await expect(listWorkspaceReadyScripts()).rejects.toThrow("migration 20260713190000 is required");
  });
});
