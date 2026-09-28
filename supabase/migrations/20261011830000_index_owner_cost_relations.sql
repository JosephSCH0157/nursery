-- Slice 1A: index only the nullable owner-cost foreign-key relationships that
-- lacked leading-key coverage after the accounting-authority migration.
begin;

create index owner_cost_operations_budget_idx
  on tongs.owner_cost_operations(owner_operating_budget_id)
  where owner_operating_budget_id is not null;

create index owner_cost_valuations_prior_idx
  on tongs.owner_cost_valuations(prior_valuation_id)
  where prior_valuation_id is not null;

create index owner_cost_links_workspace_idx
  on tongs.owner_cost_operation_links(workspace_id)
  where workspace_id is not null;

create index owner_cost_links_workpiece_idx
  on tongs.owner_cost_operation_links(workpiece_id)
  where workpiece_id is not null;

create index owner_cost_links_session_idx
  on tongs.owner_cost_operation_links(recording_session_id)
  where recording_session_id is not null;

create index owner_cost_links_authority_idx
  on tongs.owner_cost_operation_links(recording_capture_authority_id)
  where recording_capture_authority_id is not null;

create index owner_cost_links_execution_idx
  on tongs.owner_cost_operation_links(anvil_capture_execution_id)
  where anvil_capture_execution_id is not null;

create index owner_cost_links_completion_idx
  on tongs.owner_cost_operation_links(anvil_recording_completion_id)
  where anvil_recording_completion_id is not null;

commit;
