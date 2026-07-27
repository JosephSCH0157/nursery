import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  HEARTH_SHELL_RESET_MATRIX,
  rowsOwnedByResetDomain,
} from "../src/routes/hearth-shell/hearth-shell-reset-matrix";
import { createHearthIdentityResetKey } from "../src/routes/hearth-shell/useHearthShellIdentity";
import { createHearthOperationAuthority } from "../src/lib/hearth-operation-authority";

test("reset matrix assigns domain state to domain owners rather than identity", () => {
  assert.deepEqual(rowsOwnedByResetDomain("identity").map((row) => row.state), [
    "workspace identity",
    "workpiece identity",
  ]);
  assert.equal(
    HEARTH_SHELL_RESET_MATRIX.some((row) => row.owner === "identity" && /draft|approval|package|artifact/i.test(row.state)),
    false,
  );
});

test("workspace and workpiece reset keys normalize canonical identity", () => {
  assert.equal(
    createHearthIdentityResetKey(
      " AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA ",
      " BBBBBBBB-BBBB-4BBB-8BBB-BBBBBBBBBBBB ",
    ),
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  );
  assert.equal(createHearthIdentityResetKey("malformed", null), "none:none");
});

test("stale async tokens are rejected across every identity discriminator", () => {
  const authority = createHearthOperationAuthority({
    workspaceId: "workspace-a",
    workpieceId: "workpiece-a",
    draftId: "draft-a",
    draftVersion: 1,
    revisionId: "revision-a",
  }, { createAuthorityId: () => "phase-2" });

  for (const nextScope of [
    { workspaceId: "workspace-b", workpieceId: "workpiece-a", draftId: "draft-a", draftVersion: 1, revisionId: "revision-a" },
    { workspaceId: "workspace-b", workpieceId: "workpiece-b", draftId: "draft-a", draftVersion: 1, revisionId: "revision-a" },
    { workspaceId: "workspace-b", workpieceId: "workpiece-b", draftId: "draft-b", draftVersion: 1, revisionId: "revision-a" },
    { workspaceId: "workspace-b", workpieceId: "workpiece-b", draftId: "draft-b", draftVersion: 2, revisionId: "revision-a" },
    { workspaceId: "workspace-b", workpieceId: "workpiece-b", draftId: "draft-b", draftVersion: 2, revisionId: "revision-b" },
  ]) {
    const token = authority.begin("load");
    authority.updateScope(nextScope);
    assert.equal(authority.isCurrent(token), false);
  }
});

test("identity and navigation modules do not import canonical loaders or repositories", async () => {
  const sources = await Promise.all([
    readFile(new URL("../src/routes/hearth-shell/useHearthShellIdentity.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/routes/hearth-shell/useHearthShellNavigation.ts", import.meta.url), "utf8"),
  ]);
  const combined = sources.join("\n");
  const repositoryImports = combined
    .split(/\r?\n/)
    .filter((line) => /^import\b/.test(line))
    .filter((line) => /repo|repository|supabase|tongs|episode-package-loader/i.test(line))
    .filter((line) => !line.includes("/sources-repo"));

  assert.deepEqual(repositoryImports, []);
  assert.doesNotMatch(combined, /createHearthStore|commitHearth|listHearth|readCanonical/i);
  assert.match(combined, /hearth-shell-preferences/);
});
