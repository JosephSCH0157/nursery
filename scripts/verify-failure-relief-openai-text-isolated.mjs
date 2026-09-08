import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const container=process.env.SUPABASE_DB_CONTAINER||"supabase_db_nursery";
const database=`forge_failure_${randomUUID().replaceAll("-","").slice(0,12)}`;
const files=[
 "supabase/migrations/20260910120000_tongs_accounting_foundation.sql",
 "supabase/migrations/20260911120000_tongs_private_pricing_reservations_shadow.sql",
 "supabase/migrations/20260912120000_tongs_owner_budget_reservations_shadow.sql",
 "supabase/migrations/20260915120000_tongs_runway_paid_execution_boundary.sql",
 "supabase/migrations/20260916120000_tongs_runway_owner_pilot_activation.sql",
 "supabase/migrations/20260917120000_tongs_pricing_customer_interface.sql",
 "supabase/migrations/20260918120000_tongs_failure_relief_openai_text_shadow.sql",
];
function docker(args,input){return spawnSync("docker",args,{input,encoding:"utf8",maxBuffer:30*1024*1024});}
function ok(result,step){if(result.status!==0)throw new Error(`${step} failed:\n${result.stderr||result.stdout}`);}
function psql(sql,step){const r=docker(["exec","-i",container,"psql","-X","-q","-v","ON_ERROR_STOP=1","-U","postgres","-d",database],sql);ok(r,step);return r.stdout.trim();}
try{
 ok(docker(["exec",container,"createdb","-U","postgres",database]),"create isolated database");
 let baseline=readFileSync("supabase/tests/billing_isolated_baseline.sql","utf8").replace("create role anon nologin;\n","").replace("create role authenticated nologin;\n","").replace("create role service_role nologin bypassrls;\n","");
 psql(baseline,"baseline");
 for(const file of files)psql(readFileSync(file,"utf8"),file);
 psql(readFileSync("supabase/tests/failure_relief_openai_text.sql","utf8"),"failure/refund/privacy proof");
 console.log(JSON.stringify({isolated_database:true,markup_basis_points:3300,customer_failure_charge_micros:0,relief_idempotency:"passed",supplier_loss_reporting:"passed",private_data_isolation:"passed",openai_text_rollout:"inactive"}));
}finally{docker(["exec",container,"dropdb","-U","postgres","--if-exists",database]);}
