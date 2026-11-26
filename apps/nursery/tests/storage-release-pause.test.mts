import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {storageReleasePauseResponse} from '../../../supabase/functions/_shared/storage-release-pause.ts';

test('actual Netlify Tongs boundary blocks old clients and direct function URLs before service work',async()=>{
  const source=readFileSync(new URL('../netlify/functions/_tongs-handler.ts',import.meta.url),'utf8');
  const executable=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
    .replace(/^import[\s\S]*?from ["'][^"']+["'];\s*/gm,'').replace(/^export /gm,'');
  const env={FORGE_STORAGE_RELEASE_MODE:'paused'};
  let serviceCalls=0,admissionCalls=0;
  const context:any={Request,Response,Headers,URL,process:{env},storageReleasePauseResponse,
    resolveTongsRuntimeConfig:()=>({missing:[],options:{apiToken:'synthetic'}}),
    resolveNurseryTongsProviderBoundary:()=>({options:{}}),
    createTongsCommitApiHandler:()=>async()=>{serviceCalls++;return new Response(null,{status:204});},
    runWithOwnerRuntimeEnvironment:(_context:unknown,fn:()=>unknown)=>fn(),
    withAdmissionEnforcement:(_req:Request,_kind:string,fn:()=>unknown)=>{admissionCalls++;return fn();},
  };
  runInNewContext(executable,context);
  const handler=context.createNetlifyTongsFunction();
  for(const mode of ['paused','invalid','']){
    env.FORGE_STORAGE_RELEASE_MODE=mode;
    for(const path of ['/tongs/workpieces/fixture/commit-file','/.netlify/functions/tongs/workpieces/fixture/commit-file']){
      for(const method of ['GET','POST','PATCH','DELETE']){
        const response=await handler(new Request(`https://fixture.invalid${path}?FORGE_STORAGE_RELEASE_MODE=open`,{method,headers:{'x-forge-release-mode':'open'}}));
        assert.equal(response.status,503);assert.equal(response.headers.get('retry-after'),'60');
      }
    }
  }
  assert.equal(serviceCalls,0);assert.equal(admissionCalls,0);
  env.FORGE_STORAGE_RELEASE_MODE='open';
  assert.equal((await handler(new Request('https://fixture.invalid/tongs/workpieces/fixture/commit-file',{method:'POST'}))).status,204);
  assert.equal(serviceCalls,1);assert.equal(admissionCalls,1,'resume retains ordinary admission');
});
