import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";

const root = path.resolve(import.meta.dirname, "..");
const [command, projectId, rawBasePort = "56320", rawMigrationCutoff, migrationExclusionManifest] = process.argv.slice(2);
const migrationCutoff = rawMigrationCutoff === "none" ? undefined : rawMigrationCutoff;
assert.match(projectId ?? "", /^forge-he3-[a-z0-9-]+$/, "project ID must be a unique forge-he3-* identity");
assert.notEqual(projectId, "nursery");
assert.notEqual(projectId, "wtvdjndyxegudufrompx");
const basePort = Number(rawBasePort);
assert(Number.isInteger(basePort) && basePort >= 20000 && basePort <= 65490, "base port is invalid");
const workdir = path.join(root, ".he3a", projectId);
const supabaseDir = path.join(workdir, "supabase");
const networkName = `${projectId}-network`;
const manifestPath = path.join(workdir, "he3a-isolation-manifest.json");
const requiredContainers = ["db", "kong", "studio", "inbucket", "analytics"];
const allowedHostIps = new Set(["127.0.0.1", "::1"]);

function run(exe, args, options = {}) {
  const result = spawnSync(exe, args, { cwd: root, encoding: "utf8", maxBuffer: 30 * 1024 * 1024, ...options });
  if (result.status !== 0) throw new Error(`${exe} ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
}
function dockerJson(args) { const value = run("docker", args); return value ? JSON.parse(value) : []; }
function projectContainers(id) {
  const ids = run("docker", ["ps", "-aq", "--filter", `label=com.supabase.cli.project=${id}`]).split(/\r?\n/).filter(Boolean);
  return ids.length ? dockerJson(["inspect", ...ids]) : [];
}
function identityContainers(id) {
  const ids = run("docker", ["ps", "-aq", "--filter", `label=forge.he3a.identity=${id}`]).split(/\r?\n/).filter(Boolean);
  return ids.length ? dockerJson(["inspect", ...ids]) : [];
}
function projectVolumes(id) {
  return run("docker", ["volume", "ls", "-q", "--filter", `label=com.supabase.cli.project=${id}`]).split(/\r?\n/).filter(Boolean).sort();
}
function nurserySnapshot() {
  return { containers: projectContainers("nursery").map((c) => ({ id: c.Id, name: c.Name, created: c.Created, image: c.Config.Image, mounts: c.Mounts.map((m) => `${m.Name ?? m.Source}:${m.Destination}`).sort() })).sort((a, b) => a.name.localeCompare(b.name)), volumes: projectVolumes("nursery") };
}
function stableNurserySnapshot(snapshot) {
  return { containers: snapshot.containers.map(({ id, name, created, image, mounts }) => ({ id, name, created, image, mounts })), volumes: snapshot.volumes };
}
function writeConfig() {
  fs.cpSync(path.join(root, "supabase"), supabaseDir, { recursive: true });
  if (migrationCutoff) {
    assert.match(migrationCutoff, /^\d{8,14}$/, "migration cutoff must be an 8-14 digit canonical migration version");
    const migrationsDir = path.join(supabaseDir, "migrations");
    for (const entry of fs.readdirSync(migrationsDir)) {
      const match = entry.match(/^(\d{8,14})_.*\.sql$/);
      if (match && match[1].localeCompare(migrationCutoff) > 0) fs.rmSync(path.join(migrationsDir, entry));
    }
  }
  if (migrationExclusionManifest) {
    const manifestPath = path.resolve(root, migrationExclusionManifest);
    const allowedRoot = path.join(root, "supabase", "tests", "fixtures") + path.sep;
    assert(manifestPath.startsWith(allowedRoot), "migration exclusion manifest must be a test fixture");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    assert.equal(manifest.schema, "forge.local-migration-replay-exclusions.v1");
    assert(Array.isArray(manifest.migrations) && manifest.migrations.length > 0, "migration exclusion manifest is empty");
    assert.equal(new Set(manifest.migrations).size, manifest.migrations.length, "migration exclusions must be unique");
    const migrationsDir = path.join(supabaseDir, "migrations");
    for (const entry of manifest.migrations) {
      assert.match(entry, /^\d{8,14}_[a-z0-9_]+\.sql$/, `invalid migration exclusion: ${entry}`);
      const target = path.resolve(migrationsDir, entry);
      assert(target.startsWith(migrationsDir + path.sep), "migration exclusion escaped the disposable directory");
      assert(fs.existsSync(target), `excluded migration is absent: ${entry}`);
      fs.rmSync(target);
    }
  }
  const configPath = path.join(supabaseDir, "config.toml");
  let config = fs.readFileSync(configPath, "utf8");
  config = `project_id = "${projectId}"\n\n${config}`.replace(/\[api\]\r?\n/, `[api]\nport = ${basePort + 1}\n`);
  config += `\n[db]\nport = ${basePort + 2}\nshadow_port = ${basePort}\n\n[db.pooler]\nenabled = true\nport = ${basePort + 9}\n\n[studio]\nport = ${basePort + 3}\n\n[inbucket]\nport = ${basePort + 4}\n\n[analytics]\nport = ${basePort + 7}\n`;
  fs.writeFileSync(configPath, config);
}
async function tcpConnect(host, port, expectSuccess) {
  await new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    const timer = setTimeout(() => { socket.destroy(); expectSuccess ? reject(new Error(`timeout ${host}:${port}`)) : resolve(); }, 900);
    socket.once("connect", () => { clearTimeout(timer); socket.destroy(); expectSuccess ? resolve() : reject(new Error(`LAN connectivity unexpectedly succeeded: ${host}:${port}`)); });
    socket.once("error", () => { clearTimeout(timer); expectSuccess ? reject(new Error(`connection failed ${host}:${port}`)) : resolve(); });
  });
}
function lanAddresses() {
  const script = "Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.IPAddress -ne '127.0.0.1' -and $_.IPAddress -notlike '169.254.*' -and $_.AddressState -eq 'Preferred'} | Select-Object -ExpandProperty IPAddress";
  return run("powershell", ["-NoProfile", "-Command", script]).split(/\r?\n/).map((v) => v.trim()).filter(Boolean);
}
function publishedBindings(containers) {
  const rows = [];
  for (const container of containers) for (const [containerPort, entries] of Object.entries(container.NetworkSettings.Ports ?? {})) {
    for (const entry of entries ?? []) rows.push({ container: container.Name.slice(1), container_port: containerPort, host_ip: entry.HostIp, host_port: Number(entry.HostPort) });
  }
  return rows.sort((a, b) => a.host_port - b.host_port);
}
async function verify() {
  assert(fs.existsSync(manifestPath), "isolation manifest is absent");
  const startManifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  assert.deepEqual(nurserySnapshot(), stableNurserySnapshot(startManifest.nursery_before), "existing nursery stack changed");
  const containers = projectContainers(projectId);
  assert(containers.length > 0, "disposable containers are absent");
  assert(containers.every((c) => c.Config.Labels?.["com.supabase.cli.project"] === projectId), "foreign container entered disposable set");
  assert(containers.every((c) => c.Config.Labels?.["forge.he3a.identity"] === projectId), "a disposable container bypassed the HE-3A creation guard");
  const unhealthy = containers.filter((c) => c.State.Health && c.State.Health.Status !== "healthy").map((c) => `${c.Name}:${c.State.Health.Status}`);
  assert.deepEqual(unhealthy, [], `disposable service health failed: ${unhealthy.join(",")}`);
  for (const suffix of requiredContainers) assert(containers.some((c) => c.Name === `/supabase_${suffix}_${projectId}`), `required ${suffix} service is absent`);
  const bindings = publishedBindings(containers);
  assert(bindings.length > 0, "no published ports found");
  assert(bindings.every((b) => allowedHostIps.has(b.host_ip)), `non-loopback Docker binding found: ${JSON.stringify(bindings)}`);
  const listenerScript = `$ports=@(${bindings.map((b) => b.host_port).join(",")}); Get-NetTCPConnection -State Listen | Where-Object {$ports -contains $_.LocalPort} | Select-Object LocalAddress,LocalPort | ConvertTo-Json -Compress`;
  const listenerRaw = run("powershell", ["-NoProfile", "-Command", listenerScript]);
  const listeners = listenerRaw ? [JSON.parse(listenerRaw)].flat() : [];
  assert(bindings.every((b) => listeners.some((l) => Number(l.LocalPort) === b.host_port && allowedHostIps.has(l.LocalAddress))), `host listener proof failed: ${listenerRaw}`);
  for (const binding of bindings) await tcpConnect("127.0.0.1", binding.host_port, true);
  const lans = lanAddresses();
  assert(lans.length > 0, "no LAN address available for negative-connectivity proof");
  for (const lan of lans) for (const binding of bindings) await tcpConnect(lan, binding.host_port, false);
  const volumes = projectVolumes(projectId);
  assert(volumes.every((name) => name.includes(projectId)), "disposable volume identity is not unique");
  const network = dockerJson(["network", "inspect", networkName])[0];
  assert(network?.Name === networkName, "disposable network identity is absent");
  const evidence = { schema: "forge.he3a-loopback-isolation.v1", project_id: projectId, workdir, network: networkName, bindings, listeners, lan_addresses_tested: lans, localhost_connectivity: "passed", lan_connectivity: "refused", nursery_unchanged: true, container_count: containers.length, volumes };
  fs.writeFileSync(path.join(workdir, "he3a-isolation-evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}
async function start() {
  assert(!fs.existsSync(workdir), "disposable workdir already exists");
  assert.equal(projectContainers(projectId).length, 0, "disposable containers already exist");
  fs.mkdirSync(workdir, { recursive: true });
  const nurseryBefore = nurserySnapshot();
  writeConfig();
  run("docker", ["network", "create", "--label", `forge.he3a.identity=${projectId}`, networkName]);
  const proxyPort = basePort + 80;
  const proxy = spawn(process.execPath, [path.join(root, "scripts", "he3a-docker-loopback-proxy.mjs")], { cwd: root, env: { ...process.env, HE3A_PROJECT_ID: projectId, HE3A_DOCKER_PROXY_PORT: String(proxyPort) }, stdio: ["ignore", "pipe", "inherit"] });
  try {
    let ready = "";
    while (!ready.includes("HE3A_DOCKER_PROXY_READY")) ready += String((await once(proxy.stdout, "data"))[0]);
    const env = { ...process.env, DOCKER_HOST: `tcp://127.0.0.1:${proxyPort}` };
    run("supabase", ["start", "--workdir", workdir, "--network-id", networkName, "--ignore-health-check", "--yes"], { env });
  } finally { proxy.kill("SIGTERM"); }
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const pending = projectContainers(projectId).filter((c) => c.State.Health && c.State.Health.Status !== "healthy");
    if (!pending.length) break;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  fs.writeFileSync(manifestPath, `${JSON.stringify({ project_id: projectId, base_port: basePort, migration_cutoff: migrationCutoff ?? null, migration_exclusion_manifest: migrationExclusionManifest ?? null, nursery_before: nurseryBefore }, null, 2)}\n`);
  await verify();
}
function stop() {
  const containers = projectContainers(projectId);
  assert(containers.every((c) => c.Config.Labels?.["com.supabase.cli.project"] === projectId), "cleanup refused foreign container");
  if (fs.existsSync(supabaseDir)) run("supabase", ["stop", "--workdir", workdir, "--no-backup", "--yes"]);
  const remaining = identityContainers(projectId);
  assert(remaining.every((c) => c.Config.Labels?.["forge.he3a.identity"] === projectId), "cleanup refused foreign container");
  if (remaining.length) run("docker", ["rm", "-f", ...remaining.map((c) => c.Id)]);
  assert.equal(identityContainers(projectId).length, 0, "disposable containers remain after stop");
  const networkResult = spawnSync("docker", ["network", "inspect", networkName], { encoding: "utf8" });
  if (networkResult.status === 0) {
    const network = JSON.parse(networkResult.stdout)[0];
    assert.equal(network.Labels?.["forge.he3a.identity"], projectId, "cleanup refused foreign network");
    run("docker", ["network", "rm", networkName]);
  }
  fs.rmSync(workdir, { recursive: true, force: true });
  const parent = path.dirname(workdir); if (fs.existsSync(parent) && fs.readdirSync(parent).length === 0) fs.rmdirSync(parent);
  process.stdout.write(`HE-3A cleanup complete for ${projectId}.\n`);
}

if (command === "start") await start();
else if (command === "verify") await verify();
else if (command === "stop") stop();
else throw new Error("usage: node scripts/he3a-disposable-supabase.mjs <start|verify|stop> <forge-he3-id> [base-port] [migration-cutoff|none] [migration-exclusion-manifest]");
