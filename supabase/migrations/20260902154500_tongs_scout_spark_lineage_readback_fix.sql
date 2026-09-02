begin;

update tongs.barstock_sparks s
set linked_workpiece_id='140a9410-6170-434f-885f-ac6aaf6a8fcd'::uuid,
    status='forged',
    updated_at=now()
where s.workspace_id='494c2ae5-9037-4208-b898-fab4898ab430'::uuid
  and s.linked_workpiece_id in (
    select e.id
    from tongs.episodes e
    where e.workspace_id=s.workspace_id
      and e.id<>'140a9410-6170-434f-885f-ac6aaf6a8fcd'::uuid
      and e.archived_at is not null
      and lower(btrim(e.label))=lower('Seminole County approaching one full year with SCOUT')
  )
  and exists (
    select 1 from tongs.episodes canonical
    where canonical.id='140a9410-6170-434f-885f-ac6aaf6a8fcd'::uuid
      and canonical.workspace_id=s.workspace_id
      and canonical.archived_at is null
  );

commit;
