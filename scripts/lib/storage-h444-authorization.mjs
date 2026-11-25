// Acquisition is distinct from restoration approval. No approval is generated here.
import {readFileSync} from 'node:fs';
import {resolve,isAbsolute,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {canonical,sha256,ExportHold,LIMITS} from './storage-h444-exporter.mjs';
import {PROJECT} from './storage-successor-release-contract.mjs';
import {TEMPORARY_PRINCIPAL,validatePrincipalApproval,FINANCIAL_MODE_READ} from './storage-h444-principal.mjs';

const hold=(ok,code)=>{if(!ok)throw new ExportHold(code);};
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
export const OBSERVATION_SQL=readFileSync(new URL('../../supabase/tests/storage_authentic_predecessor.sql',import.meta.url),'utf8').trim().replace(/;$/,'');
export const CONTRACT_SQL=readFileSync(new URL('../../supabase/tests/storage_successor_hosted_release_contract.sql',import.meta.url),'utf8').trim().replace(/;$/,'');
export const PROTECTED_FINANCIAL_TABLES=Object.freeze([...new Set([...OBSERVATION_SQL.matchAll(/from (tongs\.[a-z_]+) x/g)].map(m=>m[1]))].sort());
export const authenticObservationSQL=(temporaryPrincipal=false)=>{
  const sql=`with o as (${OBSERVATION_SQL}\n), c as (${CONTRACT_SQL}\n) select o.observation::jsonb || jsonb_build_object('storageStage',c.storage_stage,'storageContractOk',c.storage_contract_ok) from o cross join c`;
  return temporaryPrincipal?sql.replaceAll('tongs._current_financial_environment()',FINANCIAL_MODE_READ):sql;
};

export function validateAcquisitionAuthorization({approvalBytes,approvedSha256,plan,head,now=new Date(),synthetic=false}) {
  try {
    hold(Buffer.isBuffer(approvalBytes)&&approvalBytes.length<=65536&&hash(approvedSha256)&&sha256(approvalBytes)===approvedSha256,'acquisition_approval_digest');
    const a=JSON.parse(approvalBytes);
    const fields=['schema','allowedOperation','evidenceKind','sourceProject','candidate','planSha256','principal','clientImageId',
      'ownerApprovalReference','independentReviewer','operator','priorStopSupersededReference','scopeReviewReference','secretReviewReference',
      'riskAcceptanceReference','recoveryReference','costApprovalReference','costCeilingUsd','payer','notBefore','expiresAt','cleanupDeadline',
      'destination','bodyDirectory','bodyReceiptsSha256','inventorySha256','lineageSha256','historySha256','financialSha256','storageSha256','limits'];
    const temporary=a.schema==='forge.h444-acquisition-approval.v2';
    if(temporary)fields.push('principalApproval');
    hold(canonical(Object.keys(a).sort())===canonical(fields.sort()),'acquisition_approval_fields');
    hold((temporary||a.schema==='forge.h444-acquisition-approval.v1')&&a.allowedOperation==='read-only-h444-export-reuse-preserved-bodies','acquisition_operation');
    hold(a.principal!==TEMPORARY_PRINCIPAL||temporary,'temporary_principal_requires_v2');
    hold(a.evidenceKind===(synthetic?'synthetic-offline':'authentic-logical-acquisition'),'acquisition_evidence_kind');
    hold(a.sourceProject===plan.sourceProject&&a.sourceProject===(synthetic?'syntheticfixtureonly':PROJECT),'acquisition_source');
    hold(/^[a-f0-9]{40}$/.test(head)&&a.candidate===head&&plan.candidate===head,'acquisition_candidate');
    hold(a.planSha256===sha256(canonical(plan)),'acquisition_scope_changed');
    for(const key of ['ownerApprovalReference','independentReviewer','operator','priorStopSupersededReference','scopeReviewReference','secretReviewReference',
      'riskAcceptanceReference','recoveryReference','costApprovalReference','payer'])hold(typeof a[key]==='string'&&a[key].trim().length>=3&&a[key].length<=512,'acquisition_decision_missing');
    hold(a.operator!==a.independentReviewer,'independent_review_required');
    if(temporary)validatePrincipalApproval(a);
    hold(/^[a-z_][a-z0-9_]{2,62}$/.test(a.principal)&&!['postgres','supabase_admin','service_role','authenticator'].includes(a.principal),'least_privilege_principal');
    hold(/^sha256:[a-f0-9]{64}$/.test(a.clientImageId),'client_image_pin');
    for(const key of ['bodyReceiptsSha256','inventorySha256','lineageSha256','historySha256','financialSha256','storageSha256'])hold(hash(a[key]),'acquisition_integrity_pin');
    if(!synthetic)hold(a.bodyReceiptsSha256==='5fdc1e5a24be1530acfc9b9975ba96bbec4370bbe249d43d33ceb512a89ae154'
      &&a.inventorySha256==='7e2813b2774533a5d84330e393923a23e6e17e8efabef2504683d822966e7b07','historical_evidence_pin');
    for(const key of ['destination','bodyDirectory'])hold(typeof a[key]==='string'&&isAbsolute(a[key])&&resolve(a[key])===a[key]&&!a[key].startsWith('\\\\'),'acquisition_local_path');
    hold(a.destination.toLowerCase()!==a.bodyDirectory.toLowerCase(),'preserved_destination_forbidden');
    const start=Date.parse(a.notBefore),end=Date.parse(a.expiresAt),cleanup=Date.parse(a.cleanupDeadline);
    hold(Number.isFinite(start)&&Number.isFinite(end)&&start<=+now&&end>+now&&end-start<=3600000,'acquisition_window');
    hold(Number.isFinite(cleanup)&&cleanup>=end&&cleanup-end<=7*86400000,'acquisition_retention');
    hold(typeof a.costCeilingUsd==='number'&&Number.isFinite(a.costCeilingUsd)&&a.costCeilingUsd>=0,'acquisition_cost_decision');
    hold(canonical(Object.keys(a.limits).sort())===canonical(Object.keys(LIMITS).sort()),'acquisition_limits');
    for(const [k,max] of Object.entries(LIMITS))hold(Number.isSafeInteger(a.limits[k])&&a.limits[k]>0&&a.limits[k]<=max,'acquisition_limits');
    hold(end-+now>=a.limits.sessionMs,'acquisition_window_too_short');
    if(!synthetic) {
      const root=fileURLToPath(new URL('../..',import.meta.url));
      const privateRoot=resolve(root,'.git/forge-private-evidence/h444-acquisition')+sep;
      hold(a.destination.toLowerCase().startsWith(privateRoot.toLowerCase()),'private_evidence_destination_required');
      hold(a.bodyDirectory.toLowerCase()===resolve(root,'.git/forge-storage-investigation-20261113/accounting-repair/historical-bytes').toLowerCase(),'preserved_body_location');
      hold(plan.schema==='forge.h444-export-plan.v2'&&plan.evidenceKind==='authentic-logical-acquisition','authentic_plan_required');
      // Direct project endpoint only. No unreviewed pooler, proxy, hostaddr or fallback.
      hold(plan.endpoint.host===`db.${PROJECT}.supabase.co`&&plan.endpoint.port===5432&&plan.endpoint.database==='postgres'
        &&plan.endpoint.sslmode==='verify-full'&&plan.endpoint.caFile==='/fixture/ca.crt','authentic_endpoint');
      hold(canonical([...plan.financialTables].sort())===canonical(PROTECTED_FINANCIAL_TABLES),'complete_financial_scope');
    }
    return Object.freeze(a);
  }catch(e){throw e instanceof ExportHold?e:new ExportHold('acquisition_authorization_invalid');}
}
