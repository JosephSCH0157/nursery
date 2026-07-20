begin;

alter table tongs.thumbnail_candidate_revisions
  add column style_source text,
  add column style_provenance_hash text,
  add column canonical_hash_version text not null default 'v1';

-- Candidate revisions are normally immutable. The table lock held by ALTER plus
-- this transaction-scoped trigger suspension permits only the deterministic
-- additive legacy backfill below; the trigger is restored before commit.
alter table tongs.thumbnail_candidate_revisions disable trigger trg_thumbnail_candidate_revisions_immutable;

update tongs.thumbnail_candidate_revisions c
set style_source = case when b.state = 'profile' then 'brand_profile' else 'forge_standard' end,
    style_provenance_hash = encode(extensions.digest(convert_to(jsonb_strip_nulls(jsonb_build_object(
      'contract_version','forge.thumbnail-style-provenance.v1',
      'style_source',case when b.state = 'profile' then 'brand_profile' else 'forge_standard' end,
      'legacy_candidate_revision_id',c.id,
      'binding_id',c.candidate_binding_id,
      'binding_revision',c.candidate_binding_revision,
      'profile_content_hash',c.candidate_binding_content_hash,
      'standard_recipe_id',case when b.state <> 'profile' then 'forge-thumbnail-standard' else null end,
      'standard_recipe_version',case when b.state <> 'profile' then 1 else null end
    ))::text,'UTF8'),'sha256'),'hex')
from tongs.workpiece_brand_bindings b
where b.id = c.candidate_binding_id;

alter table tongs.thumbnail_candidate_revisions enable trigger trg_thumbnail_candidate_revisions_immutable;

alter table tongs.thumbnail_candidate_revisions
  alter column style_source set not null,
  alter column style_provenance_hash set not null,
  add constraint thumbnail_candidate_style_source_check check(style_source in ('brand_profile','forge_standard')),
  add constraint thumbnail_candidate_style_provenance_hash_check check(style_provenance_hash~'^[a-f0-9]{64}$'),
  add constraint thumbnail_candidate_hash_version_check check(canonical_hash_version in ('v1','v2'));

create or replace function tongs.prepare_thumbnail_candidate_style_provenance() returns trigger
language plpgsql set search_path=pg_catalog,tongs as $$
declare v_asset tongs.assets%rowtype; v_binding tongs.workpiece_brand_bindings%rowtype; v_has_canonical_style boolean;
begin
  select * into v_asset from tongs.assets where id=new.composite_asset_id;
  select * into v_binding from tongs.workpiece_brand_bindings where id=new.candidate_binding_id;
  v_has_canonical_style := v_asset.metadata_json->>'style_source' in ('brand_profile','forge_standard');
  new.style_source := case when v_has_canonical_style then v_asset.metadata_json->>'style_source'
    when v_binding.state='profile' then 'brand_profile' else 'forge_standard' end;
  new.style_provenance_hash := case when v_has_canonical_style then v_asset.metadata_json->>'style_provenance_hash'
    else encode(extensions.digest(convert_to(jsonb_strip_nulls(jsonb_build_object(
      'contract_version','forge.thumbnail-style-provenance.v1','style_source',new.style_source,
      'legacy_composite_asset_id',new.composite_asset_id,'binding_id',new.candidate_binding_id,
      'binding_revision',new.candidate_binding_revision,'profile_content_hash',new.candidate_binding_content_hash,
      'standard_recipe_id',case when new.style_source='forge_standard' then 'forge-thumbnail-standard' else null end,
      'standard_recipe_version',case when new.style_source='forge_standard' then 1 else null end,
      'resolution_basis','rolling_deployment_legacy_composite'
    ))::text,'UTF8'),'sha256'),'hex') end;
  if new.style_source not in ('brand_profile','forge_standard') or new.style_provenance_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'candidate styling-source provenance is incomplete' using errcode='22023';
  end if;
  if v_has_canonical_style and v_asset.metadata_json->>'style_provenance_hash' <> new.style_provenance_hash then
    raise exception 'candidate styling-source provenance hash mismatch' using errcode='22023';
  end if;
  if v_has_canonical_style and new.style_source = 'forge_standard' and (
    v_asset.metadata_json#>>'{style_application_provenance,standard_recipe_id}' <> 'forge-thumbnail-standard'
    or (v_asset.metadata_json#>>'{style_application_provenance,standard_recipe_version}')::int <> 1
    or coalesce((v_asset.metadata_json#>>'{brand_application_provenance,applied}')::boolean,true) is not false
    or v_asset.metadata_json#>>'{brand_application_provenance,profile_revision_id}' is not null
  ) then raise exception 'Forge standard candidate falsely claims brand treatment' using errcode='22023';
  end if;
  if v_has_canonical_style and new.style_source = 'brand_profile' and (
    v_asset.metadata_json#>>'{style_application_provenance,applied_profile_revision_id}' is null
    or v_asset.metadata_json#>>'{style_application_provenance,applied_profile_content_hash}' is null
    or v_asset.metadata_json#>>'{brand_application_provenance,profile_revision_id}'
      is distinct from v_asset.metadata_json#>>'{style_application_provenance,applied_profile_revision_id}'
  ) then raise exception 'Brand candidate applied provenance is incomplete' using errcode='22023';
  end if;
  if coalesce(v_asset.metadata_json#>>'{brand_binding_context,binding_id}',v_asset.metadata_json#>>'{brand_application_provenance,binding_id}') <> new.candidate_binding_id::text
    or coalesce((v_asset.metadata_json#>>'{brand_binding_context,binding_revision}')::int,(v_asset.metadata_json#>>'{brand_application_provenance,binding_revision}')::int) <> new.candidate_binding_revision then
    raise exception 'candidate styling binding context mismatch' using errcode='22023';
  end if;
  new.canonical_hash_version := 'v2';
  new.canonical_content_hash := encode(extensions.digest(convert_to(jsonb_strip_nulls(jsonb_build_object(
    'schema','forge.thumbnail-candidate.v2','recipe_id',new.recipe_id,'recipe_revision',new.recipe_revision,
    'recipe_hash',new.recipe_hash,'title_revision_id',new.title_revision_id,'title_revision',new.title_revision,
    'concept_revision_id',new.concept_revision_id,'base_artwork_asset_id',new.base_artwork_asset_id,
    'base_artwork_content_hash',new.base_artwork_content_hash,'structural_composition_fingerprint',new.structural_composition_fingerprint,
    'composite_asset_id',new.composite_asset_id,'composite_content_hash',new.composite_content_hash,
    'candidate_binding_id',new.candidate_binding_id,'candidate_binding_revision',new.candidate_binding_revision,
    'candidate_binding_content_hash',new.candidate_binding_content_hash,'style_source',new.style_source,
    'style_provenance_hash',new.style_provenance_hash,'readability_contract_version',new.readability_contract_version,
    'readability_evaluator_version',new.readability_evaluator_version,'readability_evidence_hash',new.readability_evidence_hash,
    'compositor_version',new.compositor_version
  ))::text,'UTF8'),'sha256'),'hex');
  return new;
end $$;

create trigger trg_thumbnail_candidate_style_provenance
before insert on tongs.thumbnail_candidate_revisions
for each row execute function tongs.prepare_thumbnail_candidate_style_provenance();

create or replace function tongs.thumbnail_candidate_eligibility(p_candidate_id uuid,p_active_binding_id uuid) returns text
language plpgsql stable security definer set search_path=pg_catalog,tongs as $$
declare c tongs.thumbnail_candidate_revisions%rowtype; d text; v_latest_set uuid; v_asset tongs.assets%rowtype;
begin
 select * into c from tongs.thumbnail_candidate_revisions where id=p_candidate_id;
 if c.id is null then return 'blocked'; end if;
 select * into v_asset from tongs.assets where id=c.composite_asset_id;
 if v_asset.id is null or v_asset.status<>'ready' or v_asset.content_hash<>c.composite_content_hash then return 'blocked'; end if;
 select id into v_latest_set from tongs.thumbnail_candidate_sets where workpiece_id=c.workpiece_id order by revision desc limit 1;
 if v_latest_set is null or not exists(select 1 from tongs.thumbnail_candidate_set_members where candidate_set_id=v_latest_set and candidate_revision_id=c.id) then return 'historical_brand'; end if;
 if c.style_source='forge_standard' then return 'current'; end if;
 if c.candidate_binding_id=p_active_binding_id then return 'current'; end if;
 select decision into d from tongs.thumbnail_candidate_brand_decisions where candidate_revision_id=c.id and active_binding_id=p_active_binding_id order by decision_revision desc limit 1;
 if d='approved' then return 'approved_historical_brand'; end if;
 return 'requires_reapproval';
end $$;

comment on column tongs.thumbnail_candidate_revisions.style_source is 'Canonical styling source actually applied to the immutable composite; distinct from episode brand binding context.';
comment on column tongs.thumbnail_candidate_revisions.style_provenance_hash is 'SHA-256 of the immutable styling application receipt stored on the composite asset.';

revoke all on function tongs.prepare_thumbnail_candidate_style_provenance() from public,anon,authenticated;
grant execute on function tongs.prepare_thumbnail_candidate_style_provenance(),tongs.thumbnail_candidate_eligibility(uuid,uuid) to service_role;

commit;
