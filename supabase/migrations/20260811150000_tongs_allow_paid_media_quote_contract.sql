begin;

alter table tongs.ai_credit_quotes
  drop constraint ai_credit_quotes_contract_version_check;

alter table tongs.ai_credit_quotes
  add constraint ai_credit_quotes_contract_version_check
  check (pricing_contract_version in (
    'scalar_v1',
    'compound_v2',
    'forge.paid-media.quote.v1'
  )) not valid;

alter table tongs.ai_credit_quotes
  validate constraint ai_credit_quotes_contract_version_check;

commit;
