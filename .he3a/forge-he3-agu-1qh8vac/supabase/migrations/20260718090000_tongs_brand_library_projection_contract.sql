-- Keep the Brand Library RPC projection aligned with the shared client contract.
create or replace function tongs.list_workspace_brand_library(
  p_workspace_id uuid,
  p_include_archived boolean default false
) returns jsonb
language plpgsql
security definer
set search_path=tongs,public
as $$
begin
  perform tongs.assert_workspace_role(p_workspace_id,'viewer');
  return jsonb_build_object(
    'profiles',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.internal_label)
      from (
        select p.*,d.profile_id is not null is_default
        from tongs.brand_profiles p
        left join tongs.workspace_default_brand_profiles d
          on d.workspace_id=p.workspace_id and d.profile_id=p.id
        where p.workspace_id=p_workspace_id
          and (p_include_archived or p.archived_at is null)
      ) x
    ),'[]'::jsonb),
    'revisions',coalesce((
      select jsonb_agg(
        to_jsonb(r) || jsonb_build_object(
          'rules',r.rules_json,
          'validation',r.validation_json || jsonb_build_object(
            'verified_at',r.verified_at,
            'verification_version',r.verification_version
          )
        )
        order by r.profile_id,r.revision desc
      )
      from tongs.brand_profile_revisions r
      where r.workspace_id=p_workspace_id
    ),'[]'::jsonb),
    'assets',coalesce((
      select jsonb_agg(to_jsonb(a))
      from tongs.brand_assets a
      where a.workspace_id=p_workspace_id
    ),'[]'::jsonb),
    'asset_revisions',coalesce((
      select jsonb_agg(to_jsonb(ar) order by ar.asset_id,ar.revision desc)
      from tongs.brand_asset_revisions ar
      where ar.workspace_id=p_workspace_id
    ),'[]'::jsonb)
  );
end
$$;

revoke all on function tongs.list_workspace_brand_library(uuid,boolean) from public;
grant execute on function tongs.list_workspace_brand_library(uuid,boolean) to authenticated,service_role;
