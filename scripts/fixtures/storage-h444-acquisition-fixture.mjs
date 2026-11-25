// Catalog-shaped SYNTHETIC test data only. No historical migrations are replayed.
// Stub routines prove collector wiring, never authentic Storage behavior.
import {readFileSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {canonical,sha256,LIMITS} from '../lib/storage-h444-exporter.mjs';
import {PROTECTED_FINANCIAL_TABLES,CONTRACT_SQL,authenticObservationSQL} from '../lib/storage-h444-authorization.mjs';
export async function prepareAcquisitionFixture(f,directory) {
  const sql=['CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions;',
    'CREATE ROLE authenticated; CREATE ROLE service_role; ALTER ROLE fixture_reader BYPASSRLS; GRANT pg_read_all_data TO fixture_reader;',
    'GRANT USAGE ON SCHEMA extensions TO fixture_reader;'];
  for(const name of PROTECTED_FINANCIAL_TABLES)if(!f.plan.tables.some(t=>t.name===name)){
    sql.push(`CREATE TABLE ${name}(id text); GRANT SELECT ON ${name} TO fixture_reader;`);
    f.plan.tables.push({name,columns:['id']});
  }
  f.plan.financialTables=[...PROTECTED_FINANCIAL_TABLES];
  const fnPart=CONTRACT_SQL.split('functions(first_stage')[1].split('tables(first_stage')[0];
  const triggerNames=new Set(['_enforce_storage_capacity','_immutable_subscription_evidence','_guard_subscription_refresh','_guard_storage_quarantine']);
  for(const m of fnPart.matchAll(/\((\d+),'([^']+)','([^']*)'\)/g)){
    if(+m[1]>4)continue;
    const signature=m[2],name=signature.split('(')[0],trigger=triggerNames.has(name);
    const invoker=['_immutable_subscription_evidence','_storage_capacity_temporary','_storage_quarantine_identity'].includes(name);
    sql.push(`CREATE FUNCTION tongs.${signature} RETURNS ${trigger?'trigger':'text'} LANGUAGE plpgsql ${invoker?'':'SECURITY DEFINER'} SET search_path=pg_catalog AS $$BEGIN ${trigger?'RETURN NULL;':"RETURN 'SYNTHETIC_STUB_NOT_CERTIFICATION';"} END$$;`,
      `REVOKE ALL ON FUNCTION tongs.${signature} FROM PUBLIC;`);
    if(m[3])sql.push(`GRANT EXECUTE ON FUNCTION tongs.${signature} TO ${m[3]};`);
  }
  const tablePart=CONTRACT_SQL.split('tables(first_stage')[1].split('triggers(first_stage')[0];
  for(const m of tablePart.matchAll(/\((\d+),'([^']+)'\)/g))if(+m[1]<=4)sql.push(`CREATE TABLE tongs.${m[2]}(id text); ALTER TABLE tongs.${m[2]} ENABLE ROW LEVEL SECURITY;`);
  const triggerPart=CONTRACT_SQL.split('triggers(first_stage')[1].split('select n as')[0];
  for(const m of triggerPart.matchAll(/\((\d+),'([^']+)','([^']+)',(true|false)\)/g)){
    if(+m[1]>4)continue;
    const fn=m[3].includes('capacity')?'_enforce_storage_capacity':m[3]==='billing_subscription_refresh_guard'?'_guard_subscription_refresh':m[3].includes('quarantine')?'_guard_storage_quarantine':'_immutable_subscription_evidence';
    sql.push(`CREATE ${m[4]==='true'?'CONSTRAINT ':''}TRIGGER ${m[3]} AFTER INSERT ON ${m[2]} ${m[4]==='true'?'DEFERRABLE INITIALLY DEFERRED ':''}FOR EACH ROW EXECUTE FUNCTION tongs.${fn}();`);
  }
  await f.admin(sql.join('\n'));
  f.expectedPlanSha256=sha256(canonical(f.plan));
  const obs=JSON.parse((await f.admin(authenticObservationSQL()+';')).toString());
  const bodyDirectory=resolve(directory,'bodies');await mkdir(bodyDirectory);
  const receipts=[];
  for(const o of f.transport.rows.get('storage.objects')){
    const b=Buffer.alloc(o.metadata.size,65);await writeFile(join(bodyDirectory,o.id+'.bin'),b,{flag:'wx'});
    // Reproduce the preserved weak HTTP / quoted metadata representation mix.
    receipts.push({object_id:o.id,path:o.name,bytes:b.length,sha256:sha256(b),etag:(receipts.length<414?'W/':'')+o.metadata.eTag,version:o.version,read_at:new Date().toISOString()});
  }
  const receiptBytes=Buffer.from(canonical(receipts)),inventoryBytes=Buffer.from('SYNTHETIC_INVENTORY');
  const a={schema:'forge.h444-acquisition-approval.v1',allowedOperation:'read-only-h444-export-reuse-preserved-bodies',evidenceKind:'synthetic-offline',
    sourceProject:f.plan.sourceProject,candidate:f.plan.candidate,planSha256:f.expectedPlanSha256,principal:'fixture_reader',clientImageId:f.imageId,
    ownerApprovalReference:'SYNTHETIC_OWNER_NOT_APPROVAL',independentReviewer:'SYNTHETIC_REVIEWER',operator:'SYNTHETIC_OPERATOR',
    priorStopSupersededReference:'SYNTHETIC_STOP',scopeReviewReference:'SYNTHETIC_SCOPE',secretReviewReference:'SYNTHETIC_SECRET_REVIEW',
    riskAcceptanceReference:'SYNTHETIC_RISK',recoveryReference:'SYNTHETIC_RECOVERY',costApprovalReference:'SYNTHETIC_COST',costCeilingUsd:0,payer:'SYNTHETIC_PAYER',
    notBefore:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+1800000).toISOString(),cleanupDeadline:new Date(Date.now()+3600000).toISOString(),
    destination:resolve(directory,'output'),bodyDirectory,bodyReceiptsSha256:sha256(receiptBytes),inventorySha256:sha256(inventoryBytes),
    lineageSha256:obs.lineageSha256,historySha256:obs.originalHistorySha256,financialSha256:obs.financialSha256,storageSha256:obs.storageSha256,limits:{...LIMITS}};
  const approvalBytes=Buffer.from(canonical(a));
  return {plan:f.plan,versions:f.versions,receiptBytes,inventoryBytes,caBytes:await f.exec(['cat','/fixture/ca.crt']),
    authorization:{approvalBytes,approvedSha256:sha256(approvalBytes),head:f.plan.candidate},observation:obs};
}
