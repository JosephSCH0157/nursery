// Metadata-only temporary-principal contract. No connection or provisioning API.
import {readFileSync} from 'node:fs';
import {ExportHold,canonical,sha256} from './storage-h444-exporter.mjs';
export const TEMPORARY_PRINCIPAL='forge_h444_acquire_01';
export const CREATE_ROLE_SQL=readFileSync(new URL('../../docs/database/proposals/h444-temporary-role-create.sql',import.meta.url),'utf8');
export const CLEANUP_ROLE_SQL=readFileSync(new URL('../../docs/database/proposals/h444-temporary-role-cleanup.sql',import.meta.url),'utf8');
const hold=(ok,code)=>{if(!ok)throw new ExportHold(code);};
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const reference=v=>typeof v==='string'&&v.trim().length>=3&&v.length<=512;
export const FINANCIAL_MODE_READ='(SELECT financial_environment FROM tongs.financial_runtime_environment_revisions ORDER BY revision DESC LIMIT 1)';
export const FINANCIAL_MODE_PIN=Object.freeze({definitionSha256:'f2f3e98c50a6f78d521e9dfb0aa41924eb22dc3cf787e39f6cb1dd428bb84d1d',bodySha256:'5fd8725dae517009bd8cf6f4a7a22c5188b2a7b25917b520bbf8a1e041adf099',owner:'postgres',securityDefiner:true,volatility:'s',config:['search_path=pg_catalog']});
export const FINANCIAL_MODE_METADATA_SQL=`SELECT json_build_object(
 'definitionSha256',encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),
 'bodySha256',encode(sha256(convert_to(p.prosrc,'UTF8')),'hex'),
 'owner',pg_get_userbyid(p.proowner),'securityDefiner',p.prosecdef,'volatility',p.provolatile,'config',p.proconfig)
 FROM pg_proc p WHERE p.oid=to_regprocedure('tongs._current_financial_environment()')`;
export function validateFinancialModeDefinition(value){hold(canonical(value)===canonical(FINANCIAL_MODE_PIN),'financial_mode_definition_changed');}

// This inventory returns no table contents, credential hashes or function bodies.
// It includes PUBLIC/inherited rights via PostgreSQL's effective-privilege APIs.
// Built-in routines are retained too: volatility is NOT a safety classification.
export const PRINCIPAL_METADATA_SQL=`WITH r AS (SELECT * FROM pg_roles WHERE rolname=current_user)
SELECT json_build_object(
 'role',(SELECT json_build_object('name',rolname,'oid',oid::bigint,'login',rolcanlogin,'inherit',rolinherit,'superuser',rolsuper,
   'createRole',rolcreaterole,'createDb',rolcreatedb,'replication',rolreplication,'bypassRls',rolbypassrls,
   'connectionLimit',rolconnlimit,'validUntil',rolvaliduntil) FROM r),
 'memberships',(SELECT coalesce(json_agg(json_build_object('role',roleid::regrole::text,'grantor',grantor::regrole::text,'admin',admin_option,'inherit',inherit_option,'set',set_option) ORDER BY roleid::regrole::text),'[]') FROM pg_auth_members WHERE member=(SELECT oid FROM r)),
 'memberRoles',(SELECT coalesce(json_agg(json_build_object('member',member::regrole::text,'grantor',grantor::regrole::text,'admin',admin_option,'inherit',inherit_option,'set',set_option) ORDER BY member::regrole::text),'[]') FROM pg_auth_members WHERE roleid=(SELECT oid FROM r)),
 'inheritedRoles',(SELECT coalesce(json_agg(rolname ORDER BY rolname),'[]') FROM pg_roles WHERE oid<>(SELECT oid FROM r) AND pg_has_role(current_user,oid,'USAGE')),
 'setRoles',(SELECT coalesce(json_agg(rolname ORDER BY rolname),'[]') FROM pg_roles WHERE oid<>(SELECT oid FROM r) AND pg_has_role(current_user,oid,'SET')),
 'settings',(SELECT coalesce(json_agg(json_build_object('database',setdatabase::bigint,'settings',setconfig) ORDER BY setdatabase),'[]') FROM pg_db_role_setting WHERE setrole=(SELECT oid FROM r)),
 'ownedObjects',(SELECT count(*) FROM pg_shdepend WHERE refclassid='pg_authid'::regclass AND refobjid=(SELECT oid FROM r) AND deptype='o'),
 'defaultAcls',(SELECT count(*) FROM pg_default_acl WHERE defaclrole=(SELECT oid FROM r)),
 'databases',(SELECT coalesce(json_agg(json_build_object('name',datname,'connect',has_database_privilege(current_user,oid,'CONNECT'),'create',has_database_privilege(current_user,oid,'CREATE'),'temporary',has_database_privilege(current_user,oid,'TEMPORARY')) ORDER BY datname),'[]') FROM pg_database),
 'schemaCreate',(SELECT coalesce(json_agg(nspname ORDER BY nspname),'[]') FROM pg_namespace WHERE has_schema_privilege(current_user,oid,'CREATE')),
 'relationWrites',(SELECT coalesce(json_agg(n.nspname||'.'||c.relname ORDER BY n.nspname,c.relname),'[]') FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('r','p','v','m','f') AND (has_table_privilege(current_user,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') OR has_any_column_privilege(current_user,c.oid,'INSERT,UPDATE,REFERENCES'))),
 'sequenceWrites',(SELECT coalesce(json_agg(n.nspname||'.'||c.relname ORDER BY n.nspname,c.relname),'[]') FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='S' AND has_sequence_privilege(current_user,c.oid,'USAGE,UPDATE')),
 'largeObjectWrites',(SELECT coalesce(json_agg(m.oid::bigint ORDER BY m.oid),'[]') FROM pg_largeobject_metadata m WHERE EXISTS(SELECT 1 FROM aclexplode(coalesce(m.lomacl,acldefault('L',m.lomowner))) a WHERE a.privilege_type='UPDATE' AND CASE WHEN a.grantee=0 THEN true ELSE pg_has_role(current_user,a.grantee,'USAGE') END)),
 'parameterPrivileges',(SELECT coalesce(json_agg(parname ORDER BY parname),'[]') FROM pg_parameter_acl WHERE has_parameter_privilege(current_user,parname,'SET,ALTER SYSTEM')),
 'sessionSettingsRulesSha256',(SELECT encode(sha256(convert_to(string_agg(pg_get_ruledef(oid),E'\n' ORDER BY rulename),'UTF8')),'hex') FROM pg_rewrite WHERE ev_class='pg_catalog.pg_settings'::regclass),
 'routines',(SELECT coalesce(json_agg(json_build_object('identity',n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',
   'owner',pg_get_userbyid(p.proowner),'securityDefiner',p.prosecdef,'language',l.lanname,'volatility',p.provolatile,'config',p.proconfig,
   'acl',p.proacl::text,'definitionSha256',encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')) ORDER BY n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)),'[]')
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang
   WHERE p.prokind IN ('f','p','w') AND has_schema_privilege(current_user,n.oid,'USAGE') AND has_function_privilege(current_user,p.oid,'EXECUTE'))
)`;

export function validatePrincipalApproval(a){
  const p=a.principalApproval;
  const keys=['roleOid','validUntil','privilegesSha256','routinesSha256','createSqlSha256','cleanupSqlSha256','independentReviewer','reviewReference','routineReviewVerdict','publicCapabilitiesRiskAcceptance','broadReadRiskAcceptance','cleanupAuthorizationReference'];
  hold(p&&canonical(Object.keys(p).sort())===canonical(keys.sort()),'temporary_principal_approval_fields');
  hold(a.principal===TEMPORARY_PRINCIPAL&&Number.isSafeInteger(p.roleOid)&&p.roleOid>0,'temporary_principal_identity');
  for(const key of ['privilegesSha256','routinesSha256'])hold(hash(p[key]),'temporary_principal_pin');
  hold(p.createSqlSha256===sha256(CREATE_ROLE_SQL)&&p.cleanupSqlSha256===sha256(CLEANUP_ROLE_SQL),'temporary_principal_procedure_changed');
  hold(p.independentReviewer===a.independentReviewer&&p.independentReviewer!==a.operator,'temporary_principal_independent_review');
  for(const key of ['reviewReference','publicCapabilitiesRiskAcceptance','broadReadRiskAcceptance','cleanupAuthorizationReference'])hold(reference(p[key]),'temporary_principal_decision_missing');
  hold(p.routineReviewVerdict==='PASS_NO_UNREVIEWED_OR_UNSAFE_CAPABILITIES','temporary_principal_routine_review');
  const expiry=Date.parse(p.validUntil),end=Date.parse(a.expiresAt),start=Date.parse(a.notBefore);
  hold(Number.isFinite(expiry)&&expiry===end&&expiry>start&&expiry-start<=1800000,'temporary_principal_expiry');
  return p;
}

export function validatePrincipalObservation(value,a){
  const p=validatePrincipalApproval(a),r=value?.role;
  hold(r?.name===TEMPORARY_PRINCIPAL&&r.oid===p.roleOid&&r.login===true&&r.inherit===true&&r.bypassRls===true
    &&r.superuser===false&&r.createRole===false&&r.createDb===false&&r.replication===false&&r.connectionLimit===2
    &&Date.parse(r.validUntil)===Date.parse(p.validUntil),'temporary_principal_attributes');
  hold(Array.isArray(value.memberships)&&canonical(value.memberships.map(({grantor,...membership})=>membership))===canonical([{role:'pg_read_all_data',admin:false,inherit:true,set:false}])
    &&canonical(value.inheritedRoles)===canonical(['pg_read_all_data'])&&canonical(value.setRoles)==='[]','temporary_principal_memberships');
  for(const key of ['schemaCreate','sequenceWrites','largeObjectWrites','parameterPrivileges'])hold(Array.isArray(value[key])&&value[key].length===0,'temporary_principal_effective_write');
  // Stock PostgreSQL permits PUBLIC to update session settings through this
  // system view. Its exact rules are reviewed/pinned, never a schema wildcard.
  hold(Array.isArray(value.relationWrites)&&value.relationWrites.every(n=>n==='pg_catalog.pg_settings')
    &&hash(value.sessionSettingsRulesSha256),'temporary_principal_effective_write');
  hold(value.ownedObjects===0&&value.defaultAcls===0&&Array.isArray(value.memberRoles)&&Array.isArray(value.databases)&&value.databases.length>0
    &&value.databases.every(d=>d.create===false)&&value.databases.some(d=>d.name==='postgres'&&d.connect===true),'temporary_principal_ownership');
  const requiredSettings=['default_transaction_read_only=on','row_security=off','statement_timeout=30s','lock_timeout=2s',
    'idle_in_transaction_session_timeout=10min','transaction_timeout=10min','work_mem=4MB','max_parallel_workers_per_gather=0','search_path=pg_catalog'];
  hold(value.settings?.length===1&&value.settings[0].database===0
    &&canonical([...value.settings[0].settings].sort())===canonical(requiredSettings.sort()),'temporary_principal_settings');
  hold(Array.isArray(value.routines)&&value.routines.length>0&&sha256(canonical(value.routines))===p.routinesSha256,'temporary_principal_routines_changed');
  hold(sha256(canonical(value))===p.privilegesSha256,'temporary_principal_privileges_changed');
  return value;
}
