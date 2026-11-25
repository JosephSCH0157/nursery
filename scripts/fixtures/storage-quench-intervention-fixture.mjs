// Synthetic evidence only. Never an authentic source receipt or approval.
import {readFileSync} from 'node:fs';
import {QUENCH_FUNCTIONS,INTERVENTION_SCHEMA,CATALOG_QUERY_SHA256,canonical,digest,catalogCommitment} from '../lib/storage-quench-intervention.mjs';
import {convergenceSuccessor} from '../lib/storage-quench-successor.mjs';
export function interventionFixture(context,observed={}){
 const sql=readFileSync(new URL('../../supabase/migrations/20260904120000_tongs_quench_destination_packages_youtube_jobs.sql',import.meta.url),'utf8').replaceAll('\r\n','\n');
 let originalCatalog=[{category:'foreign_server',identity:'media_probe',canonical:'source-catalog-object'}];
 const records=QUENCH_FUNCTIONS.map((f,i)=>{
  const start=sql.indexOf('create or replace function '+f.signature.split('(')[0]+'('),first=sql.indexOf('$$',start),end=sql.indexOf('$$;',first+2);
  const body=sql.slice(first+2,end),path=i===1?"'pg_catalog', 'tongs', 'extensions'":"'pg_catalog', 'tongs'";
  const definition=`CREATE OR REPLACE FUNCTION ${f.identity}\n RETURNS jsonb\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO ${path}\nAS $function$${body}$function$\n`;
  if(digest(definition)!==f.definitionSha256)throw Error('Synthetic definition formatter changed');
  originalCatalog.push({category:'function',identity:f.identity,canonical:JSON.stringify({identity:f.identity,owner:'postgres',security_definer:true,definition,acl:['=X/postgres','authenticated=X/postgres','postgres=X/postgres','service_role=X/postgres']})});
  return {identity:f.signature,oid:80000+i,owner:'postgres',securityDefiner:true,config:[i===1?'search_path=pg_catalog, tongs, extensions':'search_path=pg_catalog, tongs'],definitionSha256:f.definitionSha256,acl:['PUBLIC','authenticated','postgres','service_role'].map(grantee=>({grantee,grantor:'postgres',privilege:'EXECUTE',grantable:false}))};
 });
 let correctedCatalog=originalCatalog.map(x=>x.category!=='function'?x:{...x,canonical:JSON.stringify({...JSON.parse(x.canonical),acl:JSON.parse(x.canonical).acl.filter(a=>a!=='=X/postgres')})});
 let beforeJson=JSON.stringify(records),afterJson=JSON.stringify(records.map(x=>({...x,acl:x.acl.filter(a=>a.grantee!=='PUBLIC')})));
 originalCatalog=observed.originalCatalog??originalCatalog;correctedCatalog=observed.correctedCatalog??correctedCatalog;
 beforeJson=observed.beforeJson??beforeJson;afterJson=observed.afterJson??afterJson;
 const a={schema:'forge.h444-quench-acl-authorization.v1',sourceProject:context.sourceProject,candidate:context.candidate,operation:'revoke-three-quench-public-execute',ownerApprovalReference:'SYNTHETIC_ONLY',securityNecessityReference:'SYNTHETIC_ONLY',operator:'SYNTHETIC_OPERATOR',independentReviewer:'SYNTHETIC_REVIEWER',reviewReference:'SYNTHETIC_ONLY',recoveryReference:'SYNTHETIC_ONLY',costApprovalReference:'SYNTHETIC_ONLY',costCeilingUsd:0,notBefore:'2026-11-19T21:00:00Z',expiresAt:'2026-11-19T21:30:00Z',sqlSha256:convergenceSuccessor.correctionSqlSha256,observationSqlSha256:convergenceSuccessor.observationSqlSha256,convergenceMigrationSha256:convergenceSuccessor.migration.sha256,originalCatalogSha256:catalogCommitment(originalCatalog).sha256,correctedCatalogSha256:catalogCommitment(correctedCatalog).sha256,beforeRecordsSha256:digest(beforeJson),afterRecordsSha256:digest(afterJson),...Object.fromEntries(['lineageSha256','historySha256','financialSha256','storageSha256'].map(k=>[k,context[k]]))};
 const authorizationSha256=digest(canonical(a));
 const versions=JSON.parse(readFileSync(new URL('../../docs/database/certification/storage-full-tail-446.json',import.meta.url))).migrations.slice(0,444).map(m=>m.version);
 const state=(phase,json)=>({sourceProject:a.sourceProject,candidate:a.candidate,observedAt:phase==='before'?'2026-11-19T21:01:00Z':'2026-11-19T21:03:00Z',snapshotId:phase+'-SYNTHETIC',lineage:'historical-v1',historyColumns:['created_by','idempotency_key','name','rollback','statements','version'],versions,...Object.fromEntries(['lineageSha256','historySha256','financialSha256','storageSha256'].map(k=>[k,a[k]])),recordsJson:json,recordsSha256:digest(json),catalogSha256:phase==='before'?a.originalCatalogSha256:a.correctedCatalogSha256,transactionOutcome:phase==='before'?'READ_ONLY_ROLLED_BACK':'COMMIT_INDEPENDENTLY_POSTVERIFIED',evidenceReference:'SYNTHETIC_ONLY'});
 const receipt={schema:INTERVENTION_SCHEMA,sourceProject:a.sourceProject,candidate:a.candidate,authorization:a,authorizationSha256,attempt:{authorizationSha256,sqlSha256:a.sqlSha256,startedAt:'2026-11-19T21:02:00Z',dispatchCount:1},before:state('before',beforeJson),after:state('after',afterJson),originalCatalog,correctedCatalog,catalogQuerySha256:CATALOG_QUERY_SHA256};
 receipt.independentReview={reviewer:a.independentReviewer,reviewReference:'SYNTHETIC_ONLY',reviewedAt:'2026-11-19T21:04:00Z',evidenceSha256:digest(canonical(receipt)),verdict:'PASS_COMMITTED_EXACT_ACL_DELTA'};
 const bytes=Buffer.from(JSON.stringify(receipt));const binding={receiptSha256:digest(bytes),authorizationSha256,originalCatalogSha256:a.originalCatalogSha256,correctedCatalogSha256:a.correctedCatalogSha256};return {receipt,bytes,binding};
}
