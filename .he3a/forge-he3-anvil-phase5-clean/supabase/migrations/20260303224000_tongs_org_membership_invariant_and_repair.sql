-- Enforce org/team membership coherence:
-- - Backfill missing org members for existing team members.
-- - Ensure future team member inserts always have org membership.
-- - Expose org-scoped mismatch count + repair RPCs for UI guardrails.

begin;

create or replace function tongs._insert_missing_org_members_from_teams(
  p_org_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = tongs, public
as $$
declare
  v_inserted integer := 0;
begin
  with missing as (
    select
      t.org_id,
      tm.user_id,
      coalesce(tm.created_at, now()) as created_at,
      coalesce(
        tm.created_by,
        (
          select owner_row.user_id
          from tongs.org_members owner_row
          where owner_row.org_id = t.org_id
            and owner_row.org_role = 'owner'
          order by owner_row.created_at asc nulls last
          limit 1
        )
      ) as created_by
    from tongs.team_members tm
    join tongs.teams t
      on t.id = tm.team_id
    left join tongs.org_members om
      on om.org_id = t.org_id
     and om.user_id = tm.user_id
    where om.user_id is null
      and (p_org_id is null or t.org_id = p_org_id)
  ),
  inserted as (
    insert into tongs.org_members (
      org_id,
      user_id,
      org_role,
      created_at,
      created_by
    )
    select
      m.org_id,
      m.user_id,
      'member',
      m.created_at,
      m.created_by
    from missing m
    on conflict (org_id, user_id) do nothing
    returning 1
  )
  select count(*)
  into v_inserted
  from inserted;

  return v_inserted;
end;
$$;

create or replace function tongs.ensure_org_member_for_team_member()
returns trigger
language plpgsql
security definer
set search_path = tongs, public
as $$
declare
  v_org_id uuid;
  v_fallback_created_by uuid;
begin
  select t.org_id
  into v_org_id
  from tongs.teams t
  where t.id = new.team_id;

  if v_org_id is null then
    return new;
  end if;

  select owner_row.user_id
  into v_fallback_created_by
  from tongs.org_members owner_row
  where owner_row.org_id = v_org_id
    and owner_row.org_role = 'owner'
  order by owner_row.created_at asc nulls last
  limit 1;

  insert into tongs.org_members (
    org_id,
    user_id,
    org_role,
    created_at,
    created_by
  )
  values (
    v_org_id,
    new.user_id,
    'member',
    coalesce(new.created_at, now()),
    coalesce(new.created_by, v_fallback_created_by)
  )
  on conflict (org_id, user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_team_members_ensure_org_member on tongs.team_members;
create trigger trg_team_members_ensure_org_member
after insert on tongs.team_members
for each row
execute function tongs.ensure_org_member_for_team_member();

create or replace function tongs.count_missing_org_members_for_org(p_org_id uuid)
returns table (
  missing_members_count bigint
)
language plpgsql
security definer
set search_path = tongs, public
as $$
begin
  if p_org_id is null then
    raise exception 'org_id is required'
      using errcode = '22023';
  end if;

  perform tongs.assert_org_role(p_org_id, 'member');

  return query
  select count(distinct tm.user_id)::bigint as missing_members_count
  from tongs.teams t
  join tongs.team_members tm
    on tm.team_id = t.id
  left join tongs.org_members om
    on om.org_id = t.org_id
   and om.user_id = tm.user_id
  where t.org_id = p_org_id
    and om.user_id is null;
end;
$$;

create or replace function tongs.repair_org_members_from_teams(p_org_id uuid)
returns table (
  repaired_members_count integer
)
language plpgsql
security definer
set search_path = tongs, public
as $$
declare
  v_inserted integer;
begin
  if p_org_id is null then
    raise exception 'org_id is required'
      using errcode = '22023';
  end if;

  perform tongs.assert_org_role(p_org_id, 'admin');

  v_inserted := tongs._insert_missing_org_members_from_teams(p_org_id);

  return query
  select coalesce(v_inserted, 0);
end;
$$;

-- Phase 0 immediate repair for existing rows.
select tongs._insert_missing_org_members_from_teams(null);

revoke all on function tongs._insert_missing_org_members_from_teams(uuid) from public;
revoke all on function tongs.ensure_org_member_for_team_member() from public;
revoke all on function tongs.count_missing_org_members_for_org(uuid) from public;
revoke all on function tongs.repair_org_members_from_teams(uuid) from public;

grant execute on function tongs._insert_missing_org_members_from_teams(uuid) to service_role;
grant execute on function tongs.count_missing_org_members_for_org(uuid) to authenticated;
grant execute on function tongs.count_missing_org_members_for_org(uuid) to service_role;
grant execute on function tongs.repair_org_members_from_teams(uuid) to authenticated;
grant execute on function tongs.repair_org_members_from_teams(uuid) to service_role;

commit;
