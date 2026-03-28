# Slice I-C Quick Smoke

Purpose: daily 2-minute sanity check for governed AI policy behavior.

## Preconditions

- Admin account can edit `Settings > Organization`.
- Test member exists for member override case.
- Hearth and at least one heavy-task path (Hearth STT or Hammer transcript prep) are reachable.

## 1) Org Allow (Baseline)

1. Set org default mode to `ORG_ONLY`.
2. Save org policy.
3. Run Hearth chat.

Expected:

- Allowed via org lane behavior.

Result:

- [ ] PASS
- [ ] FAIL
- Notes:

## 2) Personal Allow

1. Set org default mode to `PERSONAL_ONLY`.
2. Save org policy.
3. Run Hearth chat.

Expected:

- Allowed via personal lane behavior.

Result:

- [ ] PASS
- [ ] FAIL
- Notes:

## 3) Hard Deny

1. Set org default mode to `AI_DISABLED`.
2. Save org policy.
3. Run Hearth chat.

Expected:

- Blocked with hard-deny behavior/message.

Result:

- [ ] PASS
- [ ] FAIL
- Notes:

## 4) Soft Deny (Recoverable)

1. Set org default mode to `ORG_FIRST_PERSONAL_FALLBACK`.
2. Ensure personal AI is not configured (or simulate not configured state).
3. Run governed chat/STT path.

Expected:

- Soft-deny with recoverable guidance.

Result:

- [ ] PASS
- [ ] FAIL
- Notes:

## 5) Heavy Task Restriction

1. Select test member in `Settings > Organization`.
2. Set member override `allow_heavy_tasks = false`.
3. Save member override.
4. Run heavy-task path (`Hearth STT` or `Hammer transcript prep`).

Expected:

- Blocked due to heavy-task restriction.

Result:

- [ ] PASS
- [ ] FAIL
- Notes:

## Smoke Gate

SMOKE_GATE: `PASS` / `FAIL`

Notes:

