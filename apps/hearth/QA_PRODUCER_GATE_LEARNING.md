# Hearth Producer Gate + Learning QA

## Preconditions
- Logged in user with a valid `auth.uid()`.
- Latest migrations applied (includes `tongs.hearth_creator_profiles` and `tongs.hearth_interaction_events`).
- Hearth running with `/api/hearth/chat` middleware enabled.

## Gate Behavior
1. Open a project with an active Episode context.
2. Send: `I want to do a podcast about Roman history`.
3. Expect:
   - Assistant asks 2-3 producer questions.
   - No immediate full script/outline write.
   - Middleware response includes `gate: "clarify"`.

4. Send: `Give me an outline about Roman history`.
5. Expect:
   - Assistant generates outline immediately.
   - No clarify gate questions first.

6. Send: `Draft now, no questions. Write the script.` 
7. Expect:
   - Assistant drafts immediately.
   - No clarify gate questions first.

## Event Logging
1. Send a normal message.
2. Expect `chat_sent` event recorded.
3. Trigger gate response.
4. Expect `gate_questions_shown` event recorded.
5. Reply to gate questions.
6. Expect `gate_answers_provided` event recorded.
7. Apply proposed ops.
8. Expect `proposal_applied` event recorded.
9. Discard proposal.
10. Expect `proposal_discarded` event recorded.

## Learning Persistence
1. Trigger `Draft now, no questions` 3-5 times.
2. Confirm `clarify_first_bias` trends downward in `tongs.hearth_creator_profiles`.
3. Trigger `proposal_discarded` repeatedly.
4. Confirm `clarify_first_bias` trends upward.
5. Reload app and reopen project.
6. Confirm behavior persists (profile-backed, not session-only).

## Minimal SQL Checks
```sql
select *
from tongs.hearth_creator_profiles
where user_id = auth.uid();

select event_type, created_at, payload
from tongs.hearth_interaction_events
where user_id = auth.uid()
order by created_at desc
limit 50;
```
