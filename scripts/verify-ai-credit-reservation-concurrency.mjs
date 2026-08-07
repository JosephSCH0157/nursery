import { spawn, spawnSync } from "node:child_process";

const container = process.env.SUPABASE_DB_CONTAINER || "supabase_db_nursery";
const userId = "72000000-0000-4000-8000-000000000001";

function run(sql, allowFailure = false) {
  const result = spawnSync("docker", ["exec", "-i", container, "psql", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], {
    input: sql,
    encoding: "utf8",
  });
  if (!allowFailure && result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result;
}

function runAsync(sql) {
  return new Promise((resolve) => {
    const child = spawn("docker", ["exec", "-i", container, "psql", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"]);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(sql);
  });
}

run(`
  insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
  values('${userId}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','credit-concurrency@example.test','',now(),now(),now())
  on conflict do nothing;
  insert into tongs.ai_credits(user_id,token_balance) values('${userId}',100)
  on conflict(user_id) do update set token_balance=100;
`);

const calls = [
  runAsync(`select tongs.reserve_ai_credits('${userId}','test:concurrent:a','test','concurrency','image',70,repeat('a',64),'{}','72000000-0000-4000-8000-000000000011');`),
  runAsync(`select tongs.reserve_ai_credits('${userId}','test:concurrent:b','test','concurrency','image',70,repeat('b',64),'{}','72000000-0000-4000-8000-000000000012');`),
];
const results = await Promise.all(calls);
const succeeded = results.filter((result) => result.code === 0);
const rejected = results.filter((result) => result.code !== 0 && /insufficient AI credits/.test(result.stderr));
if (succeeded.length !== 1 || rejected.length !== 1) {
  throw new Error(`Expected one reservation and one insufficient-credit rejection: ${JSON.stringify(results)}`);
}
const proof = run(`select jsonb_build_object(
  'reservations',count(*),
  'held',tongs._ai_credit_active_holds('${userId}'),
  'settled',(select token_balance from tongs.ai_credits where user_id='${userId}')
) from tongs.ai_credit_reservations where user_id='${userId}';`).stdout.trim();
const parsed = JSON.parse(proof);
if (parsed.reservations !== 1 || parsed.held !== 70 || parsed.settled !== 100) {
  throw new Error(`Concurrent reservation proof failed: ${proof}`);
}
console.log(JSON.stringify({ concurrent_reservation: "passed", ...parsed }));
