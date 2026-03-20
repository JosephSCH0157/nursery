import test from "node:test";
import assert from "node:assert/strict";
import { normalizeRegistry, STORAGE_REGISTRY_VERSION } from "../dist/index.js";

function getMount(registry, role) {
  const mount = registry.mounts.find((entry) => entry.role === role);
  assert.ok(mount, `missing mount for role ${role}`);
  return mount;
}

test("normalizeRegistry migrates v2 recordings local mount to cloud with mirror enabled", () => {
  const registry = normalizeRegistry({
    workspaceId: "ws-recordings",
    version: 2,
    mounts: [
      {
        role: "recordings",
        target: "local",
        local: {
          vaultKey: "vault:recordings:local",
          hint: "Recordings Folder",
        },
      },
    ],
  });

  assert.equal(registry.version, STORAGE_REGISTRY_VERSION);
  const recordings = getMount(registry, "recordings");
  assert.equal(recordings.target, "tongs_cloud");
  assert.deepEqual(recordings.mirror, {
    enabled: true,
    policy: "readThrough",
    vaultKey: "vault:recordings:local",
    hint: "Recordings Folder",
  });
  assert.deepEqual(recordings.local, {
    vaultKey: "vault:recordings:local",
    hint: "Recordings Folder",
  });
});

test("normalizeRegistry migrates v2 exports local mount to cloud with mirror enabled", () => {
  const registry = normalizeRegistry({
    workspaceId: "ws-exports",
    version: 2,
    mounts: [
      {
        role: "exports",
        target: "local",
        local: {
          vaultKey: "vault:exports:local",
          hint: "Exports Folder",
        },
      },
    ],
  });

  assert.equal(registry.version, STORAGE_REGISTRY_VERSION);
  const exportsMount = getMount(registry, "exports");
  assert.equal(exportsMount.target, "tongs_cloud");
  assert.equal(exportsMount.mirror?.enabled, true);
  assert.equal(exportsMount.mirror?.vaultKey, "vault:exports:local");
  assert.equal(exportsMount.mirror?.hint, "Exports Folder");
});

test("normalizeRegistry preserves legacy local hint and vault in migrated mirror fields", () => {
  const registry = normalizeRegistry({
    workspaceId: "ws-preserve",
    version: 2,
    mounts: [
      {
        role: "recordings",
        target: "local",
        local: {
          vaultKey: "vault:legacy:recordings",
          hint: "Legacy Recording Mirror",
        },
      },
    ],
  });

  const recordings = getMount(registry, "recordings");
  assert.equal(recordings.mirror?.vaultKey, "vault:legacy:recordings");
  assert.equal(recordings.mirror?.hint, "Legacy Recording Mirror");
});

test("normalizeRegistry enables mirror after migrating legacy recordings and exports mounts", () => {
  const registry = normalizeRegistry({
    workspaceId: "ws-mirror-enabled",
    version: 2,
    mounts: [
      { role: "recordings", target: "local" },
      { role: "exports", target: "local" },
    ],
  });

  assert.equal(getMount(registry, "recordings").mirror?.enabled, true);
  assert.equal(getMount(registry, "exports").mirror?.enabled, true);
});

test("normalizeRegistry normalizes invalid legacy values to sane cloud-plus-mirror defaults", () => {
  const registry = normalizeRegistry({
    workspaceId: "ws-invalid-legacy",
    version: 2,
    mounts: [
      {
        role: "recordings",
        target: "bogus-target",
        local: {
          vaultKey: 123,
          hint: ["bad"],
        },
        mirror: {
          enabled: "yes",
          policy: 42,
          vaultKey: { invalid: true },
        },
      },
      {
        role: "exports",
        target: "local",
        mirror: {
          enabled: false,
        },
      },
    ],
  });

  const recordings = getMount(registry, "recordings");
  assert.equal(recordings.target, "tongs_cloud");
  assert.equal(recordings.mirror?.enabled, true);
  assert.equal(recordings.mirror?.policy, "readThrough");
  assert.equal(recordings.mirror?.vaultKey, undefined);
  assert.equal(recordings.mirror?.hint, undefined);

  const exportsMount = getMount(registry, "exports");
  assert.equal(exportsMount.target, "tongs_cloud");
  assert.equal(exportsMount.mirror?.enabled, true);
  assert.equal(exportsMount.mirror?.policy, "readThrough");
});