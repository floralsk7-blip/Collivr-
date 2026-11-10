# COLLIVRA event-first workflow

## Accounts

- `student`: creates a student profile, discovers events, registers, submits work, views results and downloads certificates.
- `organiser`: creates an organiser profile, selects `institution` (College / University) or `organisation` (Company / Organisation) as a profile category, and directly owns the events they create.

The profile category is descriptive only. It does not create a workspace, team, staff membership or separate login.

## Event lifecycle

1. An organiser creates a draft event at `/events`.
2. The organiser chooses Standard ($9), Advanced ($19) or Complex ($39) Event Pass complexity.
3. PayPal order creation and capture are performed by Supabase Edge Functions. The server verifies the capture before the event is marked paid.
4. The organiser publishes the paid event. The `publish-event` Edge Function checks direct ownership and verified payment.
5. Students register only while the published event's registration window is open.
6. The organiser manages participants on `/events/:id`, including removal and CSV export.
7. The organiser configures stages and activities in the event workflow, opens/closes stages, reviews submissions, scores and records advancement decisions.
8. After results are published, the organiser can issue participation certificates. Participants view and print their certificates at `/certificates/:id`.

## Billing

`/pricing` is the single Billing & Plans route. Students see Free and Premium ($2.99/month or $24.99/year). Event Organisers see the unified organiser subscription ($19/month or $190/year), Enterprise quote option, and one-time Event Pass pricing. Event Pass is separate from subscriptions and remains required for each event before publishing.

Legacy organisation tables and old subscription plan keys are retained for migration/data compatibility. New event ownership and event-management authorization no longer depend on workspace membership.

## Database migration

Apply migrations in timestamp order, including:

- `20261108000000_unified_organiser_accounts_billing.sql`
- `20261109000000_direct_event_ownership_no_workspaces.sql`

The last migration changes the event authorization helpers and RLS policies to direct `events.organizer_id` ownership, makes `organization_id` optional, adds `student_profiles.organiser_category`, and allows an event creator to remove participants. It intentionally does not drop historical organization tables or records.

## Verification

Run `npm test` for the automated unit/static checks. A production `npm run build` and live Supabase/PayPal end-to-end test are still required before deployment.
