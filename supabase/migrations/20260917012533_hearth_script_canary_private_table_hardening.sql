-- Cover new immutable-ledger foreign keys and make the intentional client
-- denial explicit to the database advisor. Service-role RPC access is unchanged.
begin;

create index openai_text_failure_realized_loss_corrections_actor_idx
  on tongs.openai_text_failure_realized_loss_corrections(actor_id);
create index hearth_script_generation_proposals_workspace_idx
  on tongs.hearth_script_generation_proposals(workspace_id);
create index hearth_script_generation_proposals_workpiece_idx
  on tongs.hearth_script_generation_proposals(workpiece_id);

create policy openai_text_failure_realized_loss_corrections_no_client_access
  on tongs.openai_text_failure_realized_loss_corrections
  for all to anon,authenticated using(false) with check(false);
create policy hearth_script_generation_proposals_no_client_access
  on tongs.hearth_script_generation_proposals
  for all to anon,authenticated using(false) with check(false);

comment on policy openai_text_failure_realized_loss_corrections_no_client_access
  on tongs.openai_text_failure_realized_loss_corrections is
  'Explicit client denial; trusted correction and reconciliation functions remain service-role only.';
comment on policy hearth_script_generation_proposals_no_client_access
  on tongs.hearth_script_generation_proposals is
  'Explicit client denial; proposals are created and recovered only through service-role persistence RPCs.';

commit;

