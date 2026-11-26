// Owner-approved operational boundary, never a claim that postgres is read-only.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,relative,dirname,sep} from 'node:path';
import {ExportHold,canonical,sha256} from './storage-h444-exporter.mjs';
import {validateHostedRecoveryEvidence,RECOVERY_EVIDENCE_V1} from './hosted-recovery-readiness-policy.mjs';
export const MANAGED_ACQUISITION_SCHEMA='forge.h444-acquisition-approval.v4';
export const isManagedAcquisition=a=>a?.schema===MANAGED_ACQUISITION_SCHEMA;
const hold=(ok,code)=>{if(!ok)throw new ExportHold(code);};
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const reference=v=>typeof v==='string'&&v.trim().length>=3&&v.length<=512;

// Include the static import/read-file closure, not just the entrypoint. New
// dependencies change the commitment and therefore require a new owner digest.
export function managedExecutionCommitment(){
  const root=resolve(fileURLToPath(new URL('../..',import.meta.url))),files=new Map();
  const visit=path=>{
    path=resolve(path);hold(path.startsWith(root+sep),'managed_execution_path');
    const name=relative(root,path).split(sep).join('/');if(files.has(name))return;
    const bytes=readFileSync(path);files.set(name,sha256(bytes));
    if(path.endsWith('.mjs')){
      const text=bytes.toString('utf8');
      for(const match of text.matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g))visit(resolve(dirname(path),match[1]));
      for(const match of text.matchAll(/new URL\(\s*['"](\.[^'"]+)['"]\s*,\s*import\.meta\.url\s*\)/g)){
        if(/\.(?:mjs|sql|json|ps1)$/.test(match[1]))visit(resolve(dirname(path),match[1]));
      }
    }
  };
  for(const name of ['scripts/acquire-h444-evidence.mjs','scripts/invoke-h444-acquisition.ps1','scripts/lib/storage-h444-managed.mjs'])visit(resolve(root,name));
  const entries=[...files].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([path,sha256])=>({path,sha256}));
  return {files:entries,sha256:sha256(canonical(entries))};
}
export function validateManagedExecutionApproval(a){
  const m=a.managedExecutionApproval;
  const fields=['mode','credentialReference','credentialReadOnly','roleName','serverVersionNum','executionSha256','interventionCandidate',
    'independentReviewer','reviewReference','reviewVerdict','riskAcceptanceReference','ownerSupervisionReference','exclusiveDdlReference',
    'recoveryEvidenceSha256','recoveryApprovalPrefix','maximumAttempts','automaticRetries'];
  hold(isManagedAcquisition(a)&&a.principal==='postgres'&&!a.principalApproval,'managed_execution_identity');
  hold(m&&canonical(Object.keys(m).sort())===canonical(fields.sort()),'managed_execution_fields');
  hold(m.mode==='CONTROLLED_READ_ONLY_EXECUTION'&&m.credentialReference==='Credential001'&&m.credentialReadOnly===false,'managed_execution_boundary');
  hold(m.roleName==='postgres'&&/^17[0-9]{4}$/.test(m.serverVersionNum),'managed_execution_role_pin');
  hold(hash(m.executionSha256)&&m.executionSha256===managedExecutionCommitment().sha256,'managed_execution_changed');
  hold(/^[a-f0-9]{40}$/.test(m.interventionCandidate),'managed_intervention_candidate');
  hold(m.independentReviewer===a.independentReviewer&&m.independentReviewer!==a.operator
    &&m.reviewVerdict==='PASS_REVIEWED_CONTROLLED_READ_ONLY_PATH','managed_execution_review');
  for(const k of ['reviewReference','riskAcceptanceReference','ownerSupervisionReference','exclusiveDdlReference','recoveryApprovalPrefix'])hold(reference(m[k]),'managed_execution_decision');
  hold(hash(m.recoveryEvidenceSha256)&&m.maximumAttempts===1&&m.automaticRetries===0,'managed_execution_attempts');
  const start=Date.parse(a.notBefore),end=Date.parse(a.expiresAt);
  hold(end>start&&end-start<=1800000&&Date.parse(a.cleanupDeadline)===end+7*86400000,'managed_execution_window');
  return m;
}
export function managedInterventionContext(a){return isManagedAcquisition(a)?{...a,candidate:a.managedExecutionApproval.interventionCandidate}:a;}
export function validateManagedRecovery(bytes,a){
  const m=validateManagedExecutionApproval(a);
  hold(Buffer.isBuffer(bytes)&&bytes.length<=65536&&sha256(bytes)===m.recoveryEvidenceSha256,'managed_recovery_changed');
  try{
    const evidence=JSON.parse(bytes);hold(evidence.schema===RECOVERY_EVIDENCE_V1,'managed_recovery_v1_required');
    // Validate for the entire proposed interval, not just package preparation.
    for(const at of [a.notBefore,a.expiresAt])validateHostedRecoveryEvidence(evidence,{projectRef:a.sourceProject,
      approvalPrefix:m.recoveryApprovalPrefix,targetVersion:'20261111201029',now:new Date(at)});
  }catch(e){throw e instanceof ExportHold?e:new ExportHold('managed_recovery_invalid');}
}

// Metadata only: no relation values, pg_get_expr, regprocedure rendering or
// custom type output is invoked before these handler restrictions pass.
export const MANAGED_TYPE_INVENTORY_SQL=`WITH RECURSIVE embd_types(oid) AS (
 SELECT t.oid FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='extensions' AND t.typname='embd'
 UNION SELECT t.oid FROM pg_type t JOIN embd_types e ON e.oid=t.typelem WHERE t.typcategory='A'
) SELECT json_build_object(
 'embdUses',(SELECT count(*) FROM pg_depend d WHERE d.refclassid='pg_type'::regclass AND d.refobjid IN (SELECT oid FROM embd_types)
 AND NOT (d.classid='pg_type'::regclass AND d.deptype='i' AND EXISTS(SELECT 1 FROM pg_type t WHERE t.oid=d.objid AND t.typelem=d.refobjid AND t.typcategory='A'))
 AND NOT EXISTS(SELECT 1 FROM pg_depend e WHERE e.classid=d.classid AND e.objid=d.objid AND e.deptype='e')),
 'types',(SELECT json_agg(json_build_object('oid',t.oid::bigint,'schema',n.nspname::text,'name',t.typname::text,'kind',t.typtype::text,
 'element',t.typelem::bigint,'base',t.typbasetype::bigint,'relation',t.typrelid::bigint,
 'subtype',coalesce((SELECT rngsubtype::bigint FROM pg_range WHERE rngtypid=t.oid OR rngmultitypid=t.oid),0),
 'output',json_build_object('oid',p.oid::bigint,'schema',pn.nspname::text,'name',p.proname::text,'symbol',p.prosrc,'language',l.lanname::text,'library',p.probin,
 'definitionSha256',CASE WHEN p.oid=101396 AND p.pronargdefaults=0 AND p.prosqlbody IS NULL AND p.prokind='f' AND l.lanname='c' AND p.prosrc='embd_out_wrapper' AND p.probin='wrappers-0.5.6' THEN encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') ELSE NULL END),
 'casts',(SELECT coalesce(json_agg(json_build_object('target',c.casttarget::bigint,'method',c.castmethod::text,'function',c.castfunc::bigint)),'[]') FROM pg_cast c WHERE c.castsource=t.oid AND c.casttarget IN (114,3802))) ORDER BY t.oid)
 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace JOIN pg_proc p ON p.oid=t.typoutput JOIN pg_namespace pn ON pn.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang),
 'relations',(SELECT json_agg(json_build_object('oid',c.oid::bigint,'name',n.nspname::text||'.'||c.relname::text,'kind',c.relkind::text,'accessMethod',c.relam::bigint,
 'columns',(SELECT coalesce(json_agg(json_build_object('name',a.attname::text,'type',a.atttypid::bigint) ORDER BY a.attnum),'[]') FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped)) ORDER BY c.oid)
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace),
 'inheritance',(SELECT coalesce(json_agg(json_build_object('parent',inhparent::bigint,'child',inhrelid::bigint)),'[]') FROM pg_inherits),
 'digest',(SELECT json_build_object('definitionSha256',CASE WHEN p.pronargdefaults=0 AND p.prosqlbody IS NULL AND l.lanname='c' THEN encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') ELSE NULL END,'symbol',p.prosrc,'library',p.probin,'language',l.lanname::text,'securityDefiner',p.prosecdef)
 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure('extensions.digest(text,text)')))`;
const scalarTypes=new Map([
 [16,['bool','boolout']],[17,['bytea','byteaout']],[18,['char','charout']],[19,['name','nameout']],[20,['int8','int8out']],
 [21,['int2','int2out']],[22,['int2vector','int2vectorout']],[23,['int4','int4out']],[25,['text','textout']],[26,['oid','oidout']],[28,['xid','xidout']],[30,['oidvector','oidvectorout']],
 [29,['cid','cidout']],[114,['json','json_out']],[700,['float4','float4out']],[701,['float8','float8out']],
 [650,['cidr','cidr_out']],[869,['inet','inet_out']],[829,['macaddr','macaddr_out']],[774,['macaddr8','macaddr8_out']],
 [1042,['bpchar','bpcharout']],[1043,['varchar','varcharout']],[1082,['date','date_out']],[1083,['time','time_out']],
 [1114,['timestamp','timestamp_out']],[1184,['timestamptz','timestamptz_out']],[1186,['interval','interval_out']],
 [1266,['timetz','timetz_out']],[1560,['bit','bit_out']],[1562,['varbit','varbit_out']],[1700,['numeric','numeric_out']],
 [2950,['uuid','uuid_out']],[3220,['pg_lsn','pg_lsn_out']],[3802,['jsonb','jsonb_out']],[5069,['xid8','xid8out']],
 [24,['regproc','regprocout']],[2202,['regprocedure','regprocedureout']],[2203,['regoper','regoperout']],
 [2204,['regoperator','regoperatorout']],[2205,['regclass','regclassout']],[2206,['regtype','regtypeout']],
 [3734,['regconfig','regconfigout']],[3769,['regdictionary','regdictionaryout']],
 [4089,['regnamespace','regnamespaceout']],[4096,['regrole','regroleout']],[4191,['regcollation','regcollationout']],
]);
export function validateManagedTypeInventory(value,plan){
  hold(Array.isArray(value?.types)&&Array.isArray(value?.relations)&&Array.isArray(value?.inheritance),'managed_type_inventory');
  const types=new Map(value.types.map(t=>[t.oid,t])),relations=new Map(value.relations.map(r=>[r.oid,r]));
  hold(types.size===value.types.length&&relations.size===value.relations.length,'managed_type_inventory');
  const checked=new Set(),checking=new Set();
  const safe=(oid,projection=false)=>{
    const t=types.get(oid);hold(t,'managed_unknown_type');
    if(projection)hold(!['c','d','r','m','p'].includes(t.kind),'managed_projected_type');
    const key=oid+':'+projection;if(checked.has(key))return;
    hold(!checking.has(key),'managed_recursive_type');checking.add(key);
    const out=t.output;
    // The installed wrappers type has a deliberately lossy length-only output.
    // It is never eligible as data, nor in any non-extension object/constant.
    // Permit its omitted extension metadata only with the exact reviewed handler
    // pointer and zero non-extension dependencies, including through its arrays.
    if(t.schema==='extensions'&&t.name==='embd'&&t.kind==='b'){
      hold(!projection&&value.embdUses===0&&t.casts?.length===0&&out?.oid===101396&&out.schema==='extensions'
        &&out.name==='embd_out'&&out.symbol==='embd_out_wrapper'&&out.language==='c'&&out.library==='wrappers-0.5.6'
        &&out.definitionSha256==='8ad98efddc22c158b40c3570f728f5804f882fa35d7835ea4399cfd1880cb37a','managed_embd_not_unused');
      checking.delete(key);checked.add(key);return;
    }
    hold(out?.schema==='pg_catalog'&&out.language==='internal'&&out.name===out.symbol,'managed_type_output');
    hold(Array.isArray(t.casts)&&t.casts.every(c=>c.function===0&&['i','b'].includes(c.method)),'managed_json_cast');
    const scalar=scalarTypes.get(oid);
    if(scalar){hold(t.schema==='pg_catalog'&&t.name===scalar[0]&&out.symbol===scalar[1],'managed_unreviewed_type');}
    else if(t.element){hold(out.symbol==='array_out','managed_type_output');safe(t.element,projection);}
    else if(t.kind==='e')hold(out.symbol==='enum_out','managed_type_output');
    else if(t.kind==='c'){
      hold(out.symbol==='record_out'&&relations.has(t.relation),'managed_type_output');
      for(const col of relations.get(t.relation).columns)safe(col.type);
    }else if(t.kind==='d'){
      hold(canonical(out)===canonical(types.get(t.base)?.output),'managed_domain_output');safe(t.base);
    }
    else if(t.kind==='r'||t.kind==='m'){hold(out.symbol===(t.kind==='r'?'range_out':'multirange_out'),'managed_type_output');safe(t.subtype);}
    else{const expected=scalarTypes.get(oid);hold(expected&&t.schema==='pg_catalog'&&t.name===expected[0]&&out.symbol===expected[1],'managed_unreviewed_type');}
    checking.delete(key);checked.add(key);
  };
  // Catalog deparsing can output typed constants anywhere in the selected dump
  // schemas. Fail closed even on extension types rather than executing a handler
  // whose effects have not been reviewed; never silently omit such evidence.
  for(const t of value.types)if(t.schema!=='pg_catalog'||t.oid>=16384)safe(t.oid);
  for(const table of plan.tables){
    const r=value.relations.find(r=>r.name===table.name);
    hold(r&&['r','p'].includes(r.kind),'managed_relation_kind');
    const descendants=new Set();
    const heap=relation=>{
      hold(relation&&['r','p'].includes(relation.kind),'managed_relation_kind');
      hold(relation.kind==='r'?relation.accessMethod===2:[0,2].includes(relation.accessMethod),'managed_table_access_method');
      hold(!descendants.has(relation.oid),'managed_relation_inheritance');descendants.add(relation.oid);
      for(const edge of value.inheritance.filter(e=>e.parent===relation.oid))heap(relations.get(edge.child));
    };heap(r);
    for(const name of table.columns){const col=r.columns.find(c=>c.name===name);hold(col,'managed_column_type');safe(col.type,true);}
  }
  const d=value.digest;
  hold(d?.definitionSha256==='ab7a61f8768189dc1783433785f02808cfb17a200faa4ce270284f76e0156226'
    &&d.symbol==='pg_digest'&&d.library==='$libdir/pgcrypto'&&d.language==='c'&&d.securityDefiner===false,'managed_digest_changed');
  return {inventorySha256:sha256(canonical(value)),checkedTypes:checked.size,digestDefinitionSha256:d.definitionSha256};
}
