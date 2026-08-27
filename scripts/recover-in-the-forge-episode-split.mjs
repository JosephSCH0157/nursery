import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const IDS = Object.freeze({
  workspace: "494c2ae5-9037-4208-b898-fab4898ab430",
  project: "95ac3ae5-dbd6-4ddc-882d-4097c5bd306b",
  sourceWorkpiece: "661a1d04-2ff1-46c0-b5f5-1e762d68f712",
  sourceSpark: "043281d6-e321-48cf-8f8f-ca7ded08ff20",
  destinationSpark: "b5a0393c-12c2-4da0-a0da-3a9e0dec09cf",
  sourceApproval: "9cad9955-539f-43ae-b65c-c94e4fe87137",
  destinationSourceApproval: "b5a68d63-a13f-4352-8552-3a5d19135c8c",
  destinationWorkpiece: "c991711e-2d9b-4fd2-be94-2c5285e4c9f6",
  destinationApproval: "d572f9c8-9064-4bbd-bb3a-685308cc7332",
  destinationLink: "d72b4cdb-4f66-4c6b-b871-7fc6b6f2a5bd",
  operationKey: "incident:in-the-forge:2026-08-26:split-v1",
});
const EXPECTED = Object.freeze({
  sourceHash: "4459838726906ef7f643a483359d30d30e624f4987382a4fa68d72cae95eb982",
  destinationHash: "07962918abc5962f725d54db176f3c59c154bbf7d46215fb5ad4630b73f847a9",
  chatRevision: 77,
  chatHash: "3026c3428d39ee50caff710ee961fcddb50294825ff7a6e97a17d2c63983e045",
  currentImage: "5a874d76-481f-4824-bb53-2c81ba25a7f0", restoreImage: ["f0368d18-bce2-4952-ad9b-e225097cd8cf",12],
  currentBroll: "8251c296-422f-4136-a205-b85d2da7bfee", restoreBroll: ["00df1d31-85ae-4fe4-a97d-0c812c975981",3],
  currentReferenceClip: "c64ec118-d938-40f3-8d55-8befc4f32751", restoreReferenceClip: ["f187fceb-db71-4133-a656-b9136e3482bd",3],
  currentReferenceVisual: "609ce1cc-1eb3-444b-90dc-a0bebad560d3", restoreReferenceVisual: ["931a8564-19ba-4c35-866c-729be9920363",3],
});
const canonical = (v) => Array.isArray(v) ? v.map(canonical) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical(v[k])])) : v;
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const hashJson = (value) => hash(Buffer.from(JSON.stringify(canonical(value))));
const must = (condition, message) => { if (!condition) throw new Error(message); };

const envText = await readFile(new URL("../apps/nursery/.env.local", import.meta.url), "utf8");
const env = Object.fromEntries(envText.split(/\r?\n/).flatMap((line) => { const m=/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line); return m ? [[m[1],m[2].trim().replace(/^(['"])(.*)\1$/,"$2")]] : []; }));
const url=env.TONGS_SUPABASE_URL||env.VITE_SUPABASE_URL, key=env.TONGS_SERVICE_ROLE_KEY, bucket=env.TONGS_WORKPIECE_BUCKET||"forge-workpieces";
must(url&&key,"Missing Tongs service configuration.");
const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}), db=admin.schema("tongs");
const one=async(table,query)=>{const r=await query(db.from(table));if(r.error)throw r.error;must(r.data,`${table} row missing`);return r.data;};
const priorReceipt=await db.from("episode_split_recovery_receipts").select("manifest_hash,receipt_json,destination_workpiece_id").eq("workspace_id",IDS.workspace).eq("project_id",IDS.project).eq("operation_key",IDS.operationKey).maybeSingle();
if(priorReceipt.error)throw priorReceipt.error;
if(priorReceipt.data){
  must(priorReceipt.data.destination_workpiece_id===IDS.destinationWorkpiece,"Existing recovery receipt targets a different destination.");
  console.log(JSON.stringify({mode:APPLY?"replay":"already-applied",...priorReceipt.data.receipt_json},null,2));
  process.exit(0);
}
const assignment=await one("barstock_assignments",q=>q.select("created_by").eq("id",IDS.project).eq("workspace_id",IDS.workspace).single());
const approvals=await one("script_approval_revisions",q=>q.select("id,script_text,script_content_hash").eq("workspace_id",IDS.workspace).eq("workpiece_id",IDS.sourceWorkpiece).in("id",[IDS.sourceApproval,IDS.destinationSourceApproval]));
const byId=new Map(approvals.map((row)=>[row.id,row]));
must(byId.get(IDS.sourceApproval)?.script_content_hash===EXPECTED.sourceHash,"Original approval changed.");
must(byId.get(IDS.destinationSourceApproval)?.script_content_hash===EXPECTED.destinationHash,"Destination source approval changed.");
const chatRow=await one("workpiece_files",q=>q.select("*").eq("workpiece_id",IDS.sourceWorkpiece).eq("path","hearth/chat.v1.json").single());
must(chatRow.revision===EXPECTED.chatRevision&&chatRow.hash_value===EXPECTED.chatHash,"Chat authority changed.");
const downloaded=await admin.storage.from(chatRow.storage_bucket).download(chatRow.storage_key);if(downloaded.error)throw downloaded.error;
const chatBytes=Buffer.from(await downloaded.data.arrayBuffer());must(hash(chatBytes)===EXPECTED.chatHash,"Downloaded chat bytes failed hash verification.");
const sourceScriptBytes=Buffer.from(byId.get(IDS.sourceApproval).script_text,"utf8"), destinationScriptBytes=Buffer.from(byId.get(IDS.destinationSourceApproval).script_text,"utf8");
must(hash(sourceScriptBytes)===EXPECTED.sourceHash&&hash(destinationScriptBytes)===EXPECTED.destinationHash,"Approval bytes failed hash verification.");
const emptyChatBytes=Buffer.from(JSON.stringify({schema:"hearth.chat.v1",updatedAt:0,chats:{}}),"utf8");
const prefix=`recovery/${IDS.operationKey.replaceAll(":","-")}`;
const staged={
  source_script:{storage_bucket:bucket,storage_key:`${prefix}/source/script.md`,bytes:sourceScriptBytes.length,hash_value:hash(sourceScriptBytes)},
  source_chat:{storage_bucket:bucket,storage_key:`${prefix}/source/chat.v1.json`,bytes:emptyChatBytes.length,hash_value:hash(emptyChatBytes)},
  destination_script:{storage_bucket:bucket,storage_key:`${prefix}/destination/script.md`,bytes:destinationScriptBytes.length,hash_value:hash(destinationScriptBytes)},
  destination_chat:{storage_bucket:bucket,storage_key:`${prefix}/destination/chat.v1.json`,bytes:chatBytes.length,hash_value:hash(chatBytes)},
};
const manifest={workspace_id:IDS.workspace,project_id:IDS.project,source_workpiece_id:IDS.sourceWorkpiece,destination_workpiece_id:IDS.destinationWorkpiece,destination_label:"in the forge 8/26/26",destination_link_id:IDS.destinationLink,destination_approval_id:IDS.destinationApproval,source_restore_approval_id:IDS.sourceApproval,destination_source_approval_id:IDS.destinationSourceApproval,source_restore_script_hash:EXPECTED.sourceHash,destination_script_hash:EXPECTED.destinationHash,expected_source_approval_revision:2,expected_chat_revision:EXPECTED.chatRevision,expected_chat_hash:EXPECTED.chatHash,expected_image_revision_id:EXPECTED.currentImage,expected_broll_revision_id:EXPECTED.currentBroll,expected_reference_clip_revision_id:EXPECTED.currentReferenceClip,expected_reference_visual_revision_id:EXPECTED.currentReferenceVisual,restore_image_revision_id:EXPECTED.restoreImage[0],restore_image_revision:EXPECTED.restoreImage[1],restore_broll_revision_id:EXPECTED.restoreBroll[0],restore_broll_revision:EXPECTED.restoreBroll[1],restore_reference_clip_revision_id:EXPECTED.restoreReferenceClip[0],restore_reference_clip_revision:EXPECTED.restoreReferenceClip[1],restore_reference_visual_revision_id:EXPECTED.restoreReferenceVisual[0],restore_reference_visual_revision:EXPECTED.restoreReferenceVisual[1],source_spark_id:IDS.sourceSpark,destination_spark_id:IDS.destinationSpark,staged_files:staged};
const serverHash=await db.rpc("episode_split_recovery_manifest_hash",{p_manifest:manifest});
if(serverHash.error&&APPLY)throw serverHash.error;
const manifestHash=serverHash.error?hashJson(manifest):serverHash.data;
console.log(JSON.stringify({mode:APPLY?"apply":"dry-run",manifest_hash:manifestHash,operation_key:IDS.operationKey,source_workpiece_id:IDS.sourceWorkpiece,destination_workpiece_id:IDS.destinationWorkpiece},null,2));
if(!APPLY)process.exit(0);
for(const [name,bytes] of [["source_script",sourceScriptBytes],["source_chat",emptyChatBytes],["destination_script",destinationScriptBytes],["destination_chat",chatBytes]]){
  const item=staged[name], existing=await admin.storage.from(item.storage_bucket).download(item.storage_key);
  if(!existing.error){must(hash(Buffer.from(await existing.data.arrayBuffer()))===item.hash_value,`Staged ${name} conflicts with existing bytes.`);continue;}
  const uploaded=await admin.storage.from(item.storage_bucket).upload(item.storage_key,bytes,{upsert:false,contentType:name.includes("script")?"text/markdown; charset=utf-8":"application/json"});if(uploaded.error)throw uploaded.error;
}
const applied=await db.rpc("apply_episode_split_recovery",{p_manifest:manifest,p_manifest_hash:manifestHash,p_operation_key:IDS.operationKey,p_actor_id:assignment.created_by});if(applied.error)throw applied.error;
must(applied.data?.outcome==="applied","Recovery did not return an applied receipt.");
console.log(JSON.stringify(applied.data,null,2));
