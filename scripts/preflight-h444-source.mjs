#!/usr/bin/env node
// Preparation entrypoint. Deliberately no hosted endpoint or credential options.
import {pathToFileURL} from 'node:url';
import {startPreflightFixture} from './fixtures/storage-h444-preflight-fixture.mjs';
import {createLocalPostgresTransport} from './lib/storage-h444-postgres.mjs';
import {collectSyntheticH444Preflight} from './lib/storage-h444-preflight.mjs';

export async function runOfflinePreflight(args){
  if(args.length!==1||args[0]!=='--synthetic')throw Error('preflight_authentic_execution_not_approved');
  const f=await startPreflightFixture();
  try{
    const transport=await createLocalPostgresTransport(f);
    const result=await collectSyntheticH444Preflight({transport});
    return {...result,imageId:f.imageId,psqlVersion:f.psqlVersion,libpqSha256:f.libpqSha256};
  }finally{await f.stop();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{console.log(JSON.stringify(await runOfflinePreflight(process.argv.slice(2))));}
  catch{console.error('H444 synthetic preflight failed; no authentic preflight or acquisition is authorized.');process.exitCode=1;}
}
