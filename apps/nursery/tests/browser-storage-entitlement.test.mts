import assert from 'node:assert/strict';
import test from 'node:test';
import { assertStorageFixtureTarget } from '../scripts/browser-storage-entitlement.mts';
const url='http://127.0.0.1:58621';
const env={GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:'JosephSCH0157/nursery',GITHUB_RUN_ID:'123',GITHUB_RUN_ATTEMPT:'1',RUNNER_TEMP:'/tmp/runner',
FORGE_BROWSER_SUPABASE_WORKDIR:'/tmp/runner/forge-he3-browser-123-1',SUPABASE_URL:url,TONGS_SUPABASE_URL:url,VITE_SUPABASE_URL:url,
SUPABASE_ANON_KEY:'synthetic',TONGS_SUPABASE_ANON_KEY:'synthetic',VITE_SUPABASE_ANON_KEY:'synthetic'};
test('billing fixture requires exact job path, CI identity, and loopback agreement',()=>{
 assert.doesNotThrow(()=>assertStorageFixtureTarget(url,env));
 for(const patch of [{GITHUB_ACTIONS:'false'},{GITHUB_REPOSITORY:'other/repo'},{FORGE_BROWSER_SUPABASE_WORKDIR:'/tmp/shared'},
  {SUPABASE_URL:'https://wtvdjndyxegudufrompx.supabase.co'},{TONGS_SUPABASE_URL:'http://localhost:58621'},{SUPABASE_ANON_KEY:'different'}]){
  assert.throws(()=>assertStorageFixtureTarget(url,{...env,...patch}));
 }
 assert.throws(()=>assertStorageFixtureTarget('https://wtvdjndyxegudufrompx.supabase.co',env));
});
