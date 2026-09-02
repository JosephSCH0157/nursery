begin;

-- The family authorities append both a new opportunity revision and a new plan
-- revision when provenance is attached. Those identifiers are authority-managed,
-- not editorial content. Keep the invariant strict over every other field.
do $$
declare
  definition text;
  old_keys text := 'ARRAY[''id'',''revision'',''previous_revision_id'',''previous_revision'',''source_status'',''source_revision_id'',''source_revision'',''workpiece_source_link_revision_id'',''workpiece_source_link_revision'',''content_hash'',''immutable_revision_hash'',''created_at'',''created_by'']';
  new_keys text := 'ARRAY[''id'',''revision'',''previous_revision_id'',''previous_revision'',''source_plan_revision_id'',''source_plan_revision'',''source_status'',''source_id'',''source_revision_id'',''source_revision'',''workpiece_source_link_id'',''workpiece_source_link_revision_id'',''workpiece_source_link_revision'',''content_hash'',''immutable_revision_hash'',''created_at'',''created_by'']';
begin
  definition := pg_get_functiondef(
    'tongs.commit_chat_source_reconciliation(uuid,uuid,bigint,text,jsonb,jsonb,text,text,uuid)'::regprocedure
  );
  if position(old_keys in definition) = 0 then
    raise exception 'chat reconciliation invariant definition was not recognized';
  end if;
  execute replace(definition, old_keys, new_keys);
end
$$;

comment on function tongs.commit_chat_source_reconciliation(uuid,uuid,bigint,text,jsonb,jsonb,text,text,uuid)
is 'Atomically promotes verified Hearth chat URLs; invariant compares all editorial fields while allowing only revision, plan, and Source authority identifiers to advance.';

commit;
