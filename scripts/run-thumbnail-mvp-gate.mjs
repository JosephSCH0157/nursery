import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root=process.cwd();
const evidenceDirectory=join(root,"test-results");
const goldenEvidencePath=join(evidenceDirectory,"slice7-thumbnail-golden-path.json");
const finalEvidencePath=join(evidenceDirectory,"slice7-thumbnail-mvp-gate.json");
mkdirSync(evidenceDirectory,{recursive:true});
rmSync(goldenEvidencePath,{force:true});
const stages=[];
const startedAt=new Date().toISOString();

function command(label,cmd,args,{capture=false}={}){const started=Date.now();const result=spawnSync(cmd,args,{cwd:root,encoding:"utf8",stdio:capture?"pipe":"inherit",shell:process.platform==="win32"});const record={label,command:[cmd,...args].join(" "),status:result.status===0?"passed":"failed",duration_ms:Date.now()-started};stages.push(record);if(capture){if(result.stdout)process.stdout.write(result.stdout);if(result.stderr)process.stderr.write(result.stderr);}if(result.status!==0)throw new Error(`${label} failed with exit ${result.status??"unknown"}.`);return result.stdout??"";}

function migrationParity(){const output=command("remote migration parity","pnpm",["exec","supabase","migration","list","--linked"],{capture:true});const rows=[...output.matchAll(/^\s*(\S+)\s*\|\s*(\S+)\s*\|/gm)].map((match)=>({local:match[1],remote:match[2]})).filter((row)=>/^\d+$/.test(row.local)||/^\d+$/.test(row.remote));if(rows.length===0)throw new Error("Remote migration parity returned no migration rows.");const mismatches=rows.filter((row)=>row.local!==row.remote);if(mismatches.length)throw new Error(`Migration parity mismatch: ${JSON.stringify(mismatches)}`);const localFiles=readdirSync(join(root,"supabase","migrations")).filter((name)=>/^\d+_.*\.sql$/.test(name)).sort();const localHead=localFiles.at(-1)?.split("_")[0]??null;const remoteHead=rows.at(-1)?.remote??null;if(!localHead||localHead!==remoteHead)throw new Error(`Migration head mismatch: local=${localHead} remote=${remoteHead}`);return{local_head:localHead,remote_head:remoteHead};}
function authenticatedEnvironment(){const started=Date.now();const envPath=join(root,"apps","nursery",".env.local");let text="";try{text=readFileSync(envPath,"utf8");}catch{throw new Error("Authenticated golden path requires apps/nursery/.env.local.");}const values=Object.fromEntries(text.split(/\r?\n/).flatMap((line)=>{const match=/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);return match?[[match[1],match[2].trim().replace(/^(['"])(.*)\1$/,"$2")]]:[];}));const required=[values.TONGS_SUPABASE_URL||values.VITE_SUPABASE_URL,values.VITE_SUPABASE_ANON_KEY,values.TONGS_SERVICE_ROLE_KEY];if(required.some((value)=>!value))throw new Error("Authenticated golden path credentials are incomplete in apps/nursery/.env.local.");stages.push({label:"authenticated golden-path environment",command:"credential preflight",status:"passed",duration_ms:Date.now()-started});}

let migrationHeads=null;
let failure=null;
try{
  command("workspace and manifest contracts","node",["scripts/verify-workspace-contracts.mjs"]);
  authenticatedEnvironment();
  migrationHeads=migrationParity();
  command("Tongs typecheck","pnpm",["--filter","@forge/tongs","typecheck"]);
  command("Hearth thumbnail contracts","pnpm",["--filter","@nursery/hearth","test:thumbnail-v3"]);
  command("Tongs authority tests","pnpm",["--filter","@forge/tongs","test"]);
  command("Quench release contracts","pnpm",["--filter","@forge/quench","test"]);
  command("Nursery application typecheck","pnpm",["--dir","apps/nursery","typecheck"]);
  command("Brand Library authority tests","pnpm",["--filter","nursery","test:brand-library"]);
  command("authenticated cross-tool golden path","pnpm",["--filter","nursery","test:playwright:thumbnail-v3"]);
}catch(error){failure=error instanceof Error?error.message:String(error);}

const gitCommit=spawnSync("git",["rev-parse","HEAD"],{cwd:root,encoding:"utf8"}).stdout?.trim()??null;
let goldenPath=null;
try{goldenPath=JSON.parse(readFileSync(goldenEvidencePath,"utf8"));}catch{}
if(!failure&&!goldenPath)failure="Golden-path evidence was not produced.";
const evidence={schema:"forge.thumbnail-mvp-release-gate.v1",started_at:startedAt,completed_at:new Date().toISOString(),status:failure?"failed":"passed",failure,git_commit:gitCommit,migrations:migrationHeads,stages,golden_path:goldenPath};
writeFileSync(finalEvidencePath,JSON.stringify(evidence,null,2));
console.log(`Slice 7 evidence: ${finalEvidencePath}`);
if(failure){console.error(failure);process.exit(1);}
console.log(`Slice 7 thumbnail MVP release gate passed for ${goldenPath.run.workpiece_id}.`);
