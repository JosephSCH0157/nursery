begin;

do $$
declare proposal tongs.owner_hearth_research_activation_proposals%rowtype;
begin
 select * into proposal from tongs.owner_hearth_research_activation_proposals where proposal_code='owner-hearth-research-v1';
 if proposal.maximum_owner_authorization_micros<>21526788
   or proposal.canary_execution_micros<>136456
   or proposal.creator_session_execution_micros<>21306560
   or proposal.storage_and_recovery_micros<>83772
   or proposal.aggregate_risk_micros<>33
   or proposal.proposed_shared_aggregate_ceiling_micros<>32366821
   or proposal.existing_shared_exposure_micros<>10840000 then
  raise exception 'owner research proposal arithmetic changed';
 end if;
 if exists(select 1 from tongs.owner_hearth_research_authorizations) then
  raise exception 'research migration must not activate an owner authorization';
 end if;
 if exists(select 1 from tongs.owner_hearth_research_proposal_events where event_type='approved') then
  raise exception 'research migration must not record approval';
 end if;
 if not pg_has_role('service_role','USAGE') then raise exception 'service role missing'; end if;
 if has_function_privilege('authenticated','tongs.quote_owner_hearth_research_operation(uuid,uuid,uuid,text,jsonb,text,timestamptz)','EXECUTE') then
  raise exception 'client may not invoke research quote authority directly';
 end if;
end $$;

rollback;
