begin;

drop trigger if exists on_auth_user_created_account_bootstrap on auth.users;
drop trigger if exists on_auth_user_created_default_plan on auth.users;
drop trigger if exists trg_auto_assign_trial_plan on auth.users;
drop trigger if exists trg_start_trial_on_first_login on auth.users;

commit;
