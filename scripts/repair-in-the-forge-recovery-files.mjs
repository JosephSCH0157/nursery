import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const source="661a1d04-2ff1-46c0-b5f5-1e762d68f712", destination="c991711e-2d9b-4fd2-be94-2c5285e4c9f6", workspace="494c2ae5-9037-4208-b898-fab4898ab430", bucket="forge-workpieces";
const envText=await readFile(new URL("../apps/nursery/.env.local",import.meta.url),"utf8"),env=Object.fromEntries(envText.split(/\r?\n/).flatMap(line=>{const m=/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);return m?[[m[1],m[2].trim().replace(/^(['"])(.*)\1$/,"$2")]]:[]}));
const admin=createClient(env.TONGS_SUPABASE_URL||env.VITE_SUPABASE_URL,env.TONGS_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}}),db=admin.schema("tongs"),sha=b=>createHash("sha256").update(b).digest("hex");
const approval=async id=>{const r=await db.from("script_approval_revisions").select("script_text").eq("id",id).single();if(r.error)throw r.error;return Buffer.from(r.data.script_text,"utf8")};
const sourceScript=await approval("9cad9955-539f-43ae-b65c-c94e4fe87137"),destScript=await approval("d572f9c8-9064-4bbd-bb3a-685308cc7332");
const staged=await admin.storage.from(bucket).download("recovery/incident-in-the-forge-2026-08-26-split-v1/destination/chat.v1.json");if(staged.error)throw staged.error;
const oldChat=JSON.parse(await staged.data.text()),entries=Object.values(oldChat.chats??{}),chosen=entries.sort((a,b)=>(b.updatedAt??0)-(a.updatedAt??0))[0]??{messages:[],updatedAt:0};
const destChat=Buffer.from(JSON.stringify({schema:"hearth.chat.v1",updatedAt:chosen.updatedAt??0,chats:{[destination]:{...chosen,draftId:destination}}}),"utf8");
const emptyChat=Buffer.from(JSON.stringify({schema:"hearth.chat.v1",updatedAt:0,chats:{}}),"utf8");
const sourceNow="2026-08-25T15:58:07.695Z",destinationNow="2026-08-26T14:27:40.104Z";
const sourceDrafts=Buffer.from(JSON.stringify({schemaVersion:1,workspaceId:workspace,updatedAt:sourceNow,drafts:[{id:source,title:"in the forge 8/25/26",body:sourceScript.toString("utf8"),createdAt:Date.parse(sourceNow),updatedAt:Date.parse(sourceNow),revisionCount:1,archived:false,pinned:false,createdBy:null,updatedBy:null,scriptValidationMeta:null,scriptAuthoringMeta:null}]}),"utf8");
const drafts=Buffer.from(JSON.stringify({schemaVersion:1,workspaceId:workspace,updatedAt:destinationNow,drafts:[{id:destination,title:"in the forge 8/26/26",body:destScript.toString("utf8"),createdAt:Date.parse(destinationNow),updatedAt:Date.parse(destinationNow),revisionCount:1,archived:false,pinned:false,createdBy:null,updatedBy:null,scriptValidationMeta:null,scriptAuthoringMeta:null}]}),"utf8");
const metadata=Buffer.from("{}","utf8");
const files=[
  [source,"script/script.md",sourceScript,"script","text/markdown; charset=utf-8",4],
  [source,"hearth/chat.v1.json",emptyChat,"json","application/json",78],
  [source,"hearth/drafts.v1.json",sourceDrafts,"json","application/json",5],
  [destination,"script/script.md",destScript,"script","text/markdown; charset=utf-8",1],
  [destination,"hearth/chat.v1.json",destChat,"json","application/json",1],
  [destination,"hearth/drafts.v1.json",drafts,"json","application/json",1],
  [destination,"metadata.json",metadata,"json","application/json",1],
];
for(const[wp,path,bytes,fileType,contentType,revision]of files){const key=`workpieces/${wp}/${path}`,uploaded=await admin.storage.from(bucket).upload(key,bytes,{upsert:true,contentType});if(uploaded.error)throw uploaded.error;const row={workpiece_id:wp,path,file_type:fileType,content_type:contentType,bytes:bytes.length,hash_algo:"sha256",hash_value:sha(bytes),storage_bucket:bucket,storage_key:key,written_by_tool:"tongs-recovery",written_by_tool_version:"forge-v1.2.0",written_by_lane:"incident-recovery",revision};const saved=await db.from("workpiece_files").upsert(row,{onConflict:"workpiece_id,path"});if(saved.error)throw saved.error;}
console.log(JSON.stringify({outcome:"repaired",source_workpiece_id:source,destination_workpiece_id:destination,destination_chat_draft_id:destination,canonical_file_count:files.length},null,2));
