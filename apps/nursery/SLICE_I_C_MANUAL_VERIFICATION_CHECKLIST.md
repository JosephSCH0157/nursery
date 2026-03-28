# Slice I-C Manual Verification Checklist

Use this to verify real policy operability after Slice I (no SQL/dev override path).

## Run Metadata

- Date:
- Tester:
- Workspace ID:
- Org ID:
- Admin user:
- Test member user:

## Preconditions

- [ ] App is running (`pnpm dev`) and you can access `Settings > Organization`.
- [ ] You have one Org `owner` or `admin` account and one non-admin member account.
- [ ] Hearth, Hammer, and Quench are reachable in the same workspace.
- [ ] Start from known org policy:
  - `default_mode = ORG_FIRST_PERSONAL_FALLBACK`
  - `shared_org_ai_enabled = true`
  - `member_byo_allowed = true`
- [ ] Test member override starts as:
  - `mode_override = INHERIT`
  - `allow_heavy_tasks = true`

## Case 1: Org Default = ORG_ONLY

1. Sign in as admin.
2. Go to `Settings > Organization > AI Policy > Org Defaults`.
3. Set `Default AI Mode` to `Org Only`.
4. Click `Save Org Policy`.
5. In same workspace, run one governed path in each tool:
   - Hearth chat
   - Hammer transcript prep or cleanup
   - Quench metadata assist

Expected:

- Eligible context uses org-backed lane behavior.
- Requests are allowed where org path is valid.
- No silent continuation on deny.

Result:

- [ ] PASS
- [ ] FAIL
- Notes:

## Case 2: Org Default = PERSONAL_ONLY

1. As admin, set `Default AI Mode` to `Personal Only`.
2. Save.
3. Repeat governed checks in Hearth, Hammer, Quench.

Expected:

- Org lane is not used as effective mode.
- Behavior follows personal-only requirements.

Result:

- [ ] PASS
- [ ] FAIL
- Notes:

## Case 3: Org Default = AI_DISABLED

1. As admin, set `Default AI Mode` to `AI Disabled`.
2. Save.
3. Retry governed paths in Hearth, Hammer, Quench.

Expected:

- All three tools block governed actions appropriately.
- Block messaging is explicit and consistent with reason mapping.

Result:

- [ ] PASS
- [ ] FAIL
- Notes:

## Case 4: Toggle `member_byo_allowed`

1. As admin, keep a mode where BYO relevance can be observed.
2. Set `Personal BYO allowed` to `false`, save, test governed actions for test member.
3. Set `Personal BYO allowed` back to `true`, save, retest same actions.

Expected:

- Behavior flips as policy changes (soft-deny vs hard-deny/allow depending on context).
- Changes apply immediately after save.

Result:

- [ ] PASS
- [ ] FAIL
- Notes:

## Case 5: Member Override `mode_override = ORG_ONLY`

1. As admin, select the test member in `Members`.
2. In `AI Policy > Member Override`, set `Mode Override` to `Org Only`.
3. Save.
4. Test member runs governed paths in Hearth/Hammer/Quench.

Expected:

- Member behavior reflects `ORG_ONLY` immediately, overriding org default.

Result:

- [ ] PASS
- [ ] FAIL
- Notes:

## Case 6: Member Override `mode_override = PERSONAL_ONLY`

1. As admin, set test member `Mode Override` to `Personal Only`.
2. Save.
3. Test member reruns governed paths.

Expected:

- Member behavior reflects personal-only policy immediately.

Result:

- [ ] PASS
- [ ] FAIL
- Notes:

## Case 7: Member Override `allow_heavy_tasks = false`

1. As admin, keep test member selected.
2. Disable `Allow heavy tasks`.
3. Save.
4. Test heavy governed paths:
   - Hearth STT
   - Hammer transcript prep
   - Hammer cleanup assist

Expected:

- Heavy-task paths block where expected by resolver.
- Non-heavy paths may still follow mode/default policy.

Result:

- [ ] PASS
- [ ] FAIL
- Notes:

## Case 8: Role Visibility

1. Sign in as org admin/owner; open `Settings > Organization`.
2. Confirm org + member policy controls are editable.
3. Sign in as non-admin org member; open same screen.

Expected:

- Admin/owner sees editable controls and save actions.
- Non-admin sees read-only guidance only (no policy edit path).

Result:

- [ ] PASS
- [ ] FAIL
- Notes:

## Case 9: Save Persistence and Reload

1. As admin, change org default + member override values.
2. Save each section.
3. Reload browser/app page.
4. Re-open `Settings > Organization`.
5. Re-test one governed action each in Hearth, Hammer, Quench.

Expected:

- Saved values persist after reload.
- Runtime behavior matches saved policy (not stale UI state).

Result:

- [ ] PASS
- [ ] FAIL
- Notes:

## Final Sign-off

- [ ] All required cases passed
- [ ] Failures logged with repro steps
- [ ] Policy restored to desired baseline after test
