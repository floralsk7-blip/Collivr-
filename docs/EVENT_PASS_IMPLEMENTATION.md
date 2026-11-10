# COLLIVRA Event Pass entitlements and advancement

## Implemented entitlements

| Capability | Standard ($9) | Advanced ($19) | Complex ($39) |
|---|---:|---:|---:|
| Event stages | Up to 3 | Up to 10 | Unlimited |
| Individual forms, quizzes, file and link submissions | Yes | Yes | Yes |
| Team submissions | No | Yes | Yes |
| Manual judging and organiser decisions | Yes | Yes | Yes |
| Automatic score-threshold advancement | No | Yes | Yes |
| Automatic top-N advancement | No | Yes | Yes |
| Weighted judging rubric | No | No | Yes |

These are enforced in the browser for usability and again in Postgres triggers/functions so a client cannot unlock a paid capability by changing frontend state.

## Manual advancement

1. Create a stage with Manual advancement.
2. Organiser reviews each submission and records a score, feedback and Advance / Hold / Reject decision.
3. Advance/Reject decisions are written to `event_stage_advancements` for the next stage.
4. For team submissions, the decision applies to every member of the submitting team.

## Automatic advancement

1. Requires Advanced or Complex Event Pass.
2. When creating the stage, select either:
   - Score threshold: advance every participant/team whose average evaluation score meets the configured threshold (0–100).
   - Top-N: advance the N highest-scoring participants/teams.
3. Organiser closes the stage after evaluation is complete.
4. Organiser clicks **Run automatic advancement**. The `finalize_event_stage_advancement` database function computes averages, ranks the candidates, writes both advanced and not-advanced decisions, and unlocks the next stage for qualifiers.
5. Publish results after the automatic advancement has been run.

Automatic advancement is deliberately a close-and-finalize operation, not an immediate per-review action. This ensures Top-N is calculated against the complete scored field rather than changing as each judge saves a review.

## Complex weighted judging rubric

When creating a Complex stage, an organiser may enter a JSON array such as:

```json
[
  {"label":"Technical quality","weight":60},
  {"label":"Presentation","weight":40}
]
```

Weights must be positive and total exactly 100. Judges enter a 0–100 score for each criterion. A Postgres trigger computes and stores the weighted overall score; the browser does not submit a trusted overall score.

## Database deployment

Apply this migration after `20261109000000_direct_event_ownership_no_workspaces.sql`:

`supabase/migrations/20261110000000_event_pass_entitlements_and_real_advancement.sql`

It is additive and does not delete existing events, participants, submissions, evaluations or payment records. Legacy Standard events with automatic stages are converted to manual mode because automatic advancement is now an Advanced/Complex entitlement. Legacy automatic stages receive default threshold/top-N values where missing.

## Test checklist

- Standard: create 3 stages; fourth stage is rejected. Automatic advancement and team-submission creation are rejected.
- Advanced: create up to 10 stages; team submissions work; create automatic threshold and top-N stages; score submissions, close stage, run advancement and verify only qualifying users/whole teams can access the next stage.
- Complex: create more than 10 stages; configure a 60/40 rubric; save criterion scores and verify the database-calculated weighted score; test both automatic rules.
- Manual: verify Advance/Hold/Reject remains organiser-controlled and team decisions apply to all team members.
- Payment: verify Event Pass checkout still uses $9/$19/$39 for Standard/Advanced/Complex and only verified payment unlocks publishing.
