begin;
create or replace function tongs.thumbnail_title_revision_identity(p_recipe jsonb) returns uuid
language sql immutable set search_path=pg_catalog,tongs as $$
 with h as(select encode(extensions.digest(convert_to(jsonb_build_object('title_id',p_recipe->'title_id','title_revision',p_recipe->'title_revision','title_text',p_recipe->'title_text')::text,'UTF8'),'sha256'),'hex') v)
 select (substr(v,1,8)||'-'||substr(v,9,4)||'-5'||substr(v,14,3)||'-a'||substr(v,18,3)||'-'||substr(v,21,12))::uuid from h $$;
create or replace function tongs.verify_thumbnail_candidate_identity() returns trigger language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare a tongs.assets%rowtype; r jsonb;
begin select * into a from tongs.assets where id=new.composite_asset_id and workspace_id=new.workspace_id and workpiece_id=new.workpiece_id;
 if a.id is null then raise exception 'candidate composite authority is unavailable' using errcode='22023'; end if; r:=a.metadata_json->'recipe_snapshot';
 if r is null or r->>'id'<>new.recipe_id::text or (r->>'revision')::int<>new.recipe_revision or a.metadata_json->>'recipe_snapshot_hash'<>new.recipe_hash or r->>'concept_revision_id'<>new.concept_revision_id::text or tongs.thumbnail_title_revision_identity(r)<>new.title_revision_id or (r->>'title_revision')::int<>new.title_revision then raise exception 'candidate recipe, title, or concept identity mismatch' using errcode='22023'; end if; return new; end $$;
create trigger trg_thumbnail_candidate_identity before insert on tongs.thumbnail_candidate_revisions for each row execute function tongs.verify_thumbnail_candidate_identity();
revoke all on function tongs.thumbnail_title_revision_identity(jsonb),tongs.verify_thumbnail_candidate_identity() from public,anon;
grant execute on function tongs.thumbnail_title_revision_identity(jsonb) to authenticated,service_role;
grant execute on function tongs.verify_thumbnail_candidate_identity() to service_role;
commit;
