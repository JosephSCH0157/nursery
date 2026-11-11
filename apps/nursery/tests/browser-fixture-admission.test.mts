import test from "node:test";
import assert from "node:assert/strict";
import { assertDisposableAdmissionTarget, ensureBrowserFixtureAdmission } from "../scripts/browser-fixture-admission.mts";
import type { SupabaseClient } from "@supabase/supabase-js";
const env={GITHUB_ACTIONS:"true",GITHUB_REPOSITORY:"JosephSCH0157/nursery",GITHUB_RUN_ID:"123",GITHUB_RUN_ATTEMPT:"1",RUNNER_TEMP:"/runner/temp",FORGE_BROWSER_SUPABASE_WORKDIR:"/runner/temp/forge-he3-browser-123-1"};
test("admission bootstrap accepts only exact loopback job identity",()=>{
 assert.doesNotThrow(()=>assertDisposableAdmissionTarget("http://127.0.0.1:54321",env));
 for(const url of ["https://project.supabase.co","http://localhost:54321","https://127.0.0.1:54321"]) assert.throws(()=>assertDisposableAdmissionTarget(url,env));
 for(const key of Object.keys(env)) assert.throws(()=>assertDisposableAdmissionTarget("http://127.0.0.1:54321",{...env,[key]:"incorrect"}));
});
test("existing admission is verified without creating operator authority; read errors fail closed",async()=>{
 let calls=0;
 const client=(data:unknown,error:unknown)=>({schema:()=>({rpc:async(name:string)=>{assert.equal(name,"is_account_admitted");calls++;return{data,error}}})}) as unknown as SupabaseClient;
 await ensureBrowserFixtureAdmission(client(true,null),{supabaseUrl:"http://127.0.0.1:54321",anonKey:"unused",email:"synthetic@example.test"},"fixture");
 assert.equal(calls,1);
 await assert.rejects(ensureBrowserFixtureAdmission(client(null,{message:"private"}),{supabaseUrl:"http://127.0.0.1:54321",anonKey:"unused",email:"synthetic@example.test"},"fixture"),/Unable to verify/);
});
