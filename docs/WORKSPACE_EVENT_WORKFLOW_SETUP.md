# COLLIVRA V3 — workspace and event workflow setup

This release extends the existing V3 project. It does not replace the PayPal SDK, PayPal Orders flow, PayPal Subscriptions flow, capture verification, or pricing tiers.

## Account and entitlement rules

- `student`: Student Free by default; can buy `premium_monthly` or `premium_yearly`. Students can discover events, register, submit work and receive certificates. They cannot create or manage events.
- `institution`: can create a verified institution workspace. The workspace owner can buy `college_yearly`. The existing verified PayPal subscription row activates the institution entitlement. Active owner/admin/event-manager members inherit College features.
- `organisation`: can create a verified organisation workspace and request the Custom plan. A platform admin must approve the verification and activate the contract entitlement with an expiry date.
- Event Pass: existing one-time PayPal Orders flow and existing $9 / $19 / $39 participant tiers remain unchanged. Verified workspaces can create private drafts. Without an included College/custom contract entitlement, they must complete the Event Pass before the event becomes public and before AI team formation.

Account type selection is not verification. A new institution/organisation workspace begins `pending` and cannot create events until the platform admin approves it. Existing users can set up a workspace from `/workspace/setup`.

## Apply the database migration

Apply the existing migrations first, then run:

`supabase/migrations/20261106000000_collivra_workspaces_event_workflows.sql`

Run it in the Supabase SQL Editor or through the project's normal migration workflow. It is additive and creates:

- workspace, membership and verification records
- server-controlled subscription/contract entitlement fields
- event stages, activities, submissions, evaluations and advancement records
- event notifications and certificates
- private `event-submissions` storage bucket
- private draft/public publishing rules
- stage/registration scheduling function

Do not run this migration before the existing profile, Event Pass and billing migrations.

## Deploy Edge Functions

Deploy the changed/new functions after applying the migration:

- `workspace-admin` (new)
- `workspace-members` (new)
- `publish-event` (new)
- `subscription-manage` (adds account-type restrictions around the existing plans; PayPal API calls and verification logic are unchanged)
- `form-event-teams`
- `analytics-summary`
- `analyze-project`
- `match-students`
- `mentorship-manage`
- `suggest-team`
- `paypal-create-order` (redeploy so its shared entitlement imports match the deployed shared code)

Keep the existing PayPal secrets and PayPal plan IDs exactly as configured. Do not rotate or replace PayPal configuration as part of this feature rollout.

## Admin setup

Add this Supabase Edge Function secret:

`COLLIVRA_ADMIN_EMAILS=admin1@example.com,admin2@example.com`

Use only trusted platform administrator email addresses. Then open `/admin/workspaces` while signed in as an allowlisted admin.

The admin page can:
1. approve/reject institution and organisation verification requests;
2. activate an organisation Custom contract only after verification, an agreed contract expiry and an included-event volume limit.

Workspace owners/admins can use `/workspace/members` to assign Event Manager, Admin or Judge roles to existing COLLIVRA accounts. Event Managers/Admins must have the matching institution/organisation account type. Judges can review submissions and submit scores/feedback; only workspace managers control stages, final manual advancement and certificates.

Custom organisation access is not enabled by submitting the quote form alone.

## Stage and deadline automation

The migration creates `public.process_event_stage_schedule()`. It opens stages at `starts_at`, closes them at `deadline_at`, and sends one-time deadline reminders (within 24 hours) to registered participants. It also sends registration-closing reminders.

To make this run automatically, enable `pg_cron` in Supabase and schedule the function once per minute. Example SQL (check your Supabase project's extension schema/permissions before running):

```sql
create extension if not exists pg_cron with schema extensions;

select cron.schedule(
  'collivra-event-stage-scheduler',
  '* * * * *',
  'select public.process_event_stage_schedule();'
);
```

Without this scheduled job, manual stage open/close controls still work, but scheduled stage transitions and deadline reminders will not run automatically.

## Local setup and validation

The ZIP intentionally excludes `.env`, `supabase/functions.env`, Supabase `.temp` project metadata, and `node_modules`. Copy your own local environment configuration into the project; never share real credentials.

On Windows PowerShell, from the `COLLIVRA` project folder:

```powershell
npm.cmd install
npm.cmd run build
npm.cmd test
```

For the frontend, configure the existing public Vite Supabase URL/anon key and PayPal client ID/environment values in your local `.env` according to `src/lib/supabaseClient.js` and the current PayPal components. Keep PayPal client secrets and service-role keys server-side only.

## PayPal deployment origin

The existing subscription checkout now reads an exact origin allowlist from `APP_ALLOWED_ORIGINS` (default remains `http://localhost:5173`). Before testing subscriptions on Vercel/production, set this Supabase Edge Function secret to include your exact production domain, for example:

`APP_ALLOWED_ORIGINS=http://localhost:5173,https://your-project.vercel.app`

Add your custom domain too if you use one. Do not use a wildcard. This changes only the allowed frontend origin; the PayPal SDK, Orders API, Subscriptions API, capture and verification logic remain unchanged. Do not switch to live PayPal until sandbox checkout, activation, cancellation and entitlement tests pass on the deployed domain.

## Validation performed on this working copy

- JavaScript/JSX syntax parse: passed.
- Supabase Edge Function TypeScript syntax parse: passed.
- Import checker: passed (64 files, 0 problems).
- Existing unit tests: optimizer, insights, AI fallback/quota, analytics, plan parity, and payment verification all passed.
- A full Vite production build could not be run in this Linux validation container because the uploaded `node_modules` contains Windows-only native optional packages (Rollup/esbuild). Run the build on your Windows machine after `npm.cmd install`.
- The migration and Edge Functions still need to be applied/deployed to your Supabase project and tested against your live schema. This archive alone cannot apply those remote changes.
