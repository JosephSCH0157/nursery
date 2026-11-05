import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

const pwsh = process.platform === "win32"
  ? "C:\\Program Files\\PowerShell\\7\\pwsh.exe"
  : "/mnt/c/Program Files/PowerShell/7/pwsh.exe";
const repo = "D:\\nursery\\nursery";
const resolver = `${repo}\\scripts\\lib\\forge-node-runtime.ps1`;
const windowsPathWithoutNode = "C:\\Windows\\System32;C:\\Program Files\\Git\\cmd";
const run = (command) => execFileSync(pwsh, ["-NoProfile", "-Command", command], { encoding: "utf8" }).trim();

test("resolves the repository-pinned Volta runtime when Node is absent from inherited PATH", () => {
  const output = run(`$env:PATH='${windowsPathWithoutNode}'; . '${resolver}'; $node=Resolve-ForgeNodeExecutable -RepositoryRoot '${repo}'; $result=Invoke-ForgeNode -RepositoryRoot '${repo}' -Executable $node -Arguments @('--version'); [pscustomobject]@{path=$node;version=$result.StandardOutput.Trim()}|ConvertTo-Json -Compress`);
  const value = JSON.parse(output);
  assert.equal(value.version, "v20.20.0");
  assert.match(value.path, /node\.exe$/i);
  assert.doesNotMatch(value.path, /scripts[\\/]fixtures|node_modules/i);
});

test("fails clearly when no approved runtime source is available", () => {
  const output = run(`$env:PATH='${windowsPathWithoutNode}'; . '${resolver}'; try { Resolve-ForgeNodeExecutable -RepositoryRoot '${repo}' -SkipPathLookup -SkipVoltaFallback; exit 2 } catch { $_.Exception.Message }`);
  assert.match(output, /Approved repository Node runtime v20\.20\.0 is unavailable/);
});

test("nested frozen-evidence verification succeeds with Node absent from PATH", () => {
  const output = run(`$env:PATH='${windowsPathWithoutNode}'; $raw=& '${repo}\\scripts\\invoke-frozen-git-evidence.ps1' -RepositoryRoot '${repo}' -Scope historical; $value=$raw|ConvertFrom-Json; [pscustomobject]@{ok=$value.ok;commit=$value.certifiedSourceCommit;count=$value.fileCount}|ConvertTo-Json -Compress`);
  const value = JSON.parse(output);
  assert.equal(value.ok, true);
  assert.equal(value.commit, "87524f872e76f24de631d1cbf58580674c9df2a9");
  assert.ok(value.count > 0);
});
