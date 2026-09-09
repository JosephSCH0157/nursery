-- Canonical Hearth artifacts retain bounded evidence, not copied source bodies.
begin;
create function tongs.hearth_research_artifact_json_is_bounded(p_artifact jsonb)
returns boolean language plpgsql immutable set search_path=pg_catalog,tongs as $function$
declare v_source jsonb;v_evidence jsonb;
begin
  if octet_length(p_artifact::text)>524288
    or jsonb_typeof(p_artifact#>'{result,sources}') is distinct from 'array'
    or jsonb_typeof(coalesce(p_artifact#>'{result,evidence}','[]'::jsonb))<>'array'
    or jsonb_typeof(coalesce(p_artifact#>'{result,creatorClaims}','[]'::jsonb))<>'array'
    or jsonb_typeof(coalesce(p_artifact#>'{result,artifact,findings}','[]'::jsonb))<>'array'
    or jsonb_array_length(p_artifact#>'{result,sources}')>48
    or jsonb_array_length(coalesce(p_artifact#>'{result,evidence}','[]'::jsonb))>96
    or jsonb_array_length(coalesce(p_artifact#>'{result,creatorClaims}','[]'::jsonb))>96
    or jsonb_array_length(coalesce(p_artifact#>'{result,artifact,findings}','[]'::jsonb))>96 then return false;
  end if;
  for v_source in select value from jsonb_array_elements(p_artifact#>'{result,sources}') loop
    if length(coalesce(v_source->>'extractedText',''))>0 or length(coalesce(v_source->>'transcript',''))>0
      or (v_source->'transcriptSegments' is not null and v_source->'transcriptSegments'<>'null'::jsonb)
      or length(coalesce(v_source->>'snippet',''))>4096 then return false;end if;
  end loop;
  for v_evidence in select value from jsonb_array_elements(coalesce(p_artifact#>'{result,evidence}','[]'::jsonb)) loop
    if length(coalesce(v_evidence->>'excerpt',''))>8192 then return false;end if;
  end loop;
  return true;
exception when others then return false;
end;$function$;
alter table tongs.hearth_research_artifact_revisions
  add constraint hearth_research_artifact_payload_bounded check(tongs.hearth_research_artifact_json_is_bounded(artifact_json));
alter table tongs.hearth_editorial_preflight_reports
  add constraint hearth_preflight_report_payload_bounded check(octet_length(report_json::text)<=262144 and jsonb_array_length(report_json->'findings')<=256);
revoke all on function tongs.hearth_research_artifact_json_is_bounded(jsonb) from public,anon,authenticated;
grant execute on function tongs.hearth_research_artifact_json_is_bounded(jsonb) to service_role;
commit;
