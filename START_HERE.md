# COLLIVRA v2: start here (Windows, from scratch)

This guide takes you from the ZIP to a working demo. Do the steps in order. If a step shows an error, stop and fix it before moving on.

## What this version contains

- **COLLIVRA is a student collaboration platform.** Students discover people and projects, connect with peers, start projects and participate in events. Events are one part of the platform, not its entire purpose.
- **Two account types only:** Student and Event Organiser. The account type is chosen during signup and is not selected again during profile setup.
- **Event Organisers own events directly.** No workspace, staff invitation or workspace setup is required. Organisers create events, manage participants and configure event workflows.
- **Billing:** Student Premium ($2.99/month or $24.99/year), Event Organiser ($19/month or $190/year), Enterprise (custom), and separate one-time Event Passes ($9/$19/$39 per event).
- **Payments are verified server-side.** The browser does not decide whether a subscription or Event Pass is paid.

### Current offers

| Offer | Price | Notes |
|---|---:|---|
| Student Free | $0 | Discover people/projects, create a profile and join events |
| Student Premium | $2.99/month or $24.99/year | Advanced AI, analytics and mentorship |
| Event Organiser | $19/month or $190/year | Organiser subscription; Event Pass is separate |
| Enterprise | Custom | Contract-based |
| Event Pass | $9 / $19 / $39 per event | One-time payment based on event workflow complexity |

## Step 1. Tools

Install **Node.js 22.18 or newer** (nodejs.org, the LTS button) and **VS Code**. You need free accounts at **Supabase**, **PayPal Developer** (developer.paypal.com) and **Google AI Studio** (aistudio.google.com).

## Step 2. Open the project

1. Right-click the ZIP, choose **Extract All**.
2. Open VS Code, **File, Open Folder**, and choose the extracted `COLLIVRA` folder.
3. Open the terminal in VS Code (**Terminal, New Terminal**). On Windows, type `npm.cmd` and `npx.cmd` (with the `.cmd`) in every command below. This avoids a PowerShell security message.

```
npm.cmd install
npm.cmd test
```
`npm.cmd test` should print six lines starting with `ok` and `58 files checked, 0 problem(s)`.

## Step 3. Database (Supabase)

Open your Supabase project, then **SQL Editor**. For each file below: open the file **in VS Code**, click inside it, press **Ctrl+A** then **Ctrl+C**, go to a **new empty query tab** in Supabase, press **Ctrl+V**, and click **Run**. Paste the file's contents, never its file name.

**If your Supabase project already has the COLLIVRA tables** (from the earlier version), run only these, one at a time, in this order (skip any you already ran):
1. `supabase/migrations/20261101000000_profile_fields_and_rls.sql` (skip it if you already ran it)
2. `supabase/migrations/20261102000000_event_pass.sql` (skip it if you already ran it)
3. `supabase/migrations/20261104000000_billing.sql` (if you already ran an earlier copy of this file, run it again: it is safe, and it adds the new `ai_results` table)

4. `supabase/migrations/20261105000000_mentorship.sql`
5. `supabase/migrations/20261106000000_collivra_workspaces_event_workflows.sql` (legacy schema support)
6. `supabase/migrations/20261107000000_workspace_event_payment_rules.sql` (legacy schema support)
7. `supabase/migrations/20261108000000_unified_organiser_accounts_billing.sql`
8. `supabase/migrations/20261109000000_direct_event_ownership_no_workspaces.sql`
9. `supabase/migrations/20261110000000_event_pass_entitlements_and_real_advancement.sql` (enforces Event Pass feature limits and adds score-threshold/top-N automatic advancement plus Complex weighted judging)

**If the project is new and empty**, run `supabase/schema.sql` first, then all applicable migrations above in timestamp order. Do not re-run migrations that have already been applied.

Each file ends with a success message. If one fails, send me the exact error and do not run the next file.

Also in Supabase, **Authentication, Providers, Email**: switch **Confirm email** off for the demo, so new accounts can sign in at once.

## Step 4. PayPal Sandbox (fake money)

1. Go to **developer.paypal.com** and sign in with your real PayPal login. Make sure the **Sandbox** toggle is on.
2. **Testing Tools, Sandbox Accounts:** you will see a **Business** account (seller) and a **Personal** account (buyer). Open the buyer's **View/Edit Account** to see its email and password, and make sure it has a balance.
3. **Apps & Credentials, Sandbox:** open the **Default Application** (or create one). Copy the **Client ID** and **Secret**.

Two sites, two logins: developer.paypal.com uses your **real** login. **www.sandbox.paypal.com** uses the **generated sandbox** accounts.

## Step 5. Gemini key

At aistudio.google.com/apikey create a key and copy it.

## Step 6. Fill in the two config files

In the VS Code terminal:
```
copy .env.example .env
copy supabase\functions.env.example supabase\functions.env
```
Open both and fill them in.

**`.env`** (public values):
- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`: Supabase, Project Settings, API. Use the **anon / publishable** key. Never the service_role key.
- `VITE_PAYPAL_CLIENT_ID`: the sandbox Client ID.

**`supabase/functions.env`** (secrets, never share or upload):
- `GEMINI_API_KEY`
- `PAYPAL_CLIENT_ID` (the **same** Client ID) and `PAYPAL_CLIENT_SECRET`
- leave `PAYPAL_ENV=sandbox`

## Step 7. Create the subscription plans in PayPal

```
npm.cmd run setup:plans
```
This creates the three plans in your PayPal sandbox and writes their ids into `supabase/functions.env`. It is safe to run again; it will not create duplicates.

Then check everything:
```
npm.cmd run check:setup
```
Fix every `FAIL` before continuing.

## Step 8. Deploy the server functions

```
npx.cmd supabase login
npx.cmd supabase link --project-ref YOUR_PROJECT_REF
npx.cmd supabase secrets set --env-file supabase/functions.env
npx.cmd supabase functions deploy analyze-project match-students suggest-team form-event-teams paypal-create-order paypal-capture-order subscription-manage analytics-summary mentorship-manage
```
`YOUR_PROJECT_REF` is the code in your Supabase URL (`https://YOUR_PROJECT_REF.supabase.co`). If it asks about Docker, add `--use-api` to the deploy line.

Do not deploy or rely on the retired workspace-members workflow. Keep any legacy deployed functions until you have confirmed no other active client calls them.

## Step 9. Run it

```
npm.cmd run dev
```
Open http://localhost:5173.

## Step 10. Test the main flows

1. Create one Student account and one Event Organiser account. Confirm each account lands in the correct experience.
2. Complete profile setup. Confirm it does not ask for account type a second time.
3. As a Student, discover people and projects, start a project, and browse events.
4. As an Event Organiser, create an event draft, configure its details, complete the Event Pass checkout in PayPal Sandbox, and publish it.
5. As a Student, register for the published event and check the participant-facing event status.
6. As the Event Organiser, verify participant management and event-stage/submission/judging/results/certificate flows that are enabled in the event.
7. Test Student Premium and Event Organiser subscriptions using separate sandbox buyer accounts. Confirm cancellation retains access through the paid period.
8. Test forgot-password from a different device using the deployed URL and the configured Supabase redirect allow-list.

## Step 11. Optional: a live link for the judges

1. Create a public GitHub repo and upload the project. `.env` and `supabase/functions.env` are git-ignored, but check that they are not in the upload.
2. Import the repo in **Vercel** and add the three `VITE_` values from `.env`.
3. In Supabase, **Authentication, URL Configuration**, add your Vercel URL.

## Step 12. Submit (confirm the deadline on Devpost)

The deadline I found was **12 November 2026 (13 November, 1:30 AM IST)**. Aim to submit on 11 November.

- [ ] All teammates registered on Devpost; rules read (team size, pre-existing project).
- [ ] Public GitHub repo with the README.
- [ ] Demo link or clear run instructions.
- [ ] Demo video of about 3 minutes (outline in `HACKATHON_SUBMISSION.md`).
- [ ] Description saying where PayPal and AI are each essential.
- [ ] Deck updated (see the last section of `HACKATHON_SUBMISSION.md`).

Suggested schedule: 3 to 5 Nov setup and first tests, 6 to 8 Nov fixes and demo data, 9 Nov record the video, 10 Nov write the description, 11 Nov submit.

## If something goes wrong

| Symptom | Likely cause |
|---|---|
| Supabase says `syntax error at or near "supabase"` | You pasted the file **name**. Paste the file's **contents**. |
| `check:setup` says the client ids differ | Frontend and server use different PayPal apps. Use the same one in both files. |
| Pricing page says "This plan is not set up yet" | Run `npm.cmd run setup:plans`, then the `secrets set` command, then redeploy `subscription-manage`. |
| PayPal button never appears | `VITE_PAYPAL_CLIENT_ID` is empty. Restart `npm.cmd run dev` after editing `.env`. |
| "Could not reach the server" | The functions are not deployed (Step 8), or the project ref is wrong. |
| A result says it used the built-in rules | The user's monthly AI actions are used up, or Gemini is busy, or the key or model name is wrong (`GEMINI_MODEL`). The page still works. |
| Subscription stays "processing" | PayPal sometimes takes a minute. Refresh the pricing page. |
| Payments fail for no reason | Negative Testing is on for the Business account in the PayPal dashboard, or `PAYPAL_MOCK_CAPTURE_ERROR` is set. |
| Profile "Finish" button fails | Run migration `20261101000000` and restart `npm.cmd run dev`. |
| 401 from a function | Sign out and sign in again. |

## Honest status

- **Tested here:** the team optimizer, matching and risk logic, plan and price rules, the PayPal verification checks (including tampered responses), the plan setup script (against a fake PayPal), and that every import resolves.
- **Not run here:** the pages in a browser, the Supabase functions, and the real PayPal and Gemini calls. The Gemini prompts and their answer checks are tested with sample answers, not the live API, and anything unexpected falls back to the built-in rules. The first real run can need small fixes. The PayPal **Subscriptions** calls are the most likely place; the Event Pass checkout is the simpler fallback.
- Event Pass entitlements and manual/automatic advancement are documented in `docs/EVENT_PASS_IMPLEMENTATION.md`. Entitlements are enforced by migration `20261110000000`: Standard supports up to 3 stages and manual judging; Advanced supports up to 10 stages, team submissions and automatic score-threshold/top-N advancement; Complex adds unlimited stages and weighted judging rubrics. Apply this migration before testing these controls.
- Older tables (tasks, milestones, team chat) still use permissive access rules. Tighten them before any public launch.
- Your **Security & Privacy** slide: sign-in (Supabase Auth), encryption (Supabase encrypts data in transit and at rest) and role-based access (row level security plus plan checks) are real. **User-controlled visibility** and a **consent flow** are not built yet: profiles are visible to all signed-in users. Either build them or soften those two lines before presenting.


## Current account and event ownership migrations

Apply `20261108000000_unified_organiser_accounts_billing.sql` and then `20261109000000_direct_event_ownership_no_workspaces.sql` after earlier migrations. The latter makes event ownership direct to the organiser account and removes the workspace requirement from event creation and access. Existing workspace and historical billing rows are retained for compatibility; the current UI does not require workspace setup.

Set `VITE_APP_URL` to the deployed COLLIVRA origin in Vercel so password-reset emails open the deployed `/reset-password` route on another device. Add that URL to Supabase Auth Redirect URLs.
