# COLLIVRA: build the right team, not just a full one

COLLIVRA matches students to projects on skills first, forms balanced teams, and explains every recommendation. Event organisers use it to turn a whole batch of students into balanced hackathon teams. Plans and event passes are paid with PayPal, and Gemini adds AI judgement where meaning matters. Built for the **PayPal AI Hackathon 2026**.

**New to the project? Open `START_HERE.md`** (step-by-step setup) and `docs/DEPLOYMENT_CHECKLIST.md` (every migration and function, in order).

## Features

**Students**
- Profiles, projects, connections, messaging, and a team workspace (tasks, milestones, chat)
- **Skill-first matching:** a student appears in a project's matches only if they have at least one genuine required skill. Scores are computed in backend code: skills 65, role 15, interest 10, availability 5, collaboration 3, experience 2. Skill coverage is weighted by how important each skill is to the project (critical 3, high 2, medium 1.5, normal 1).
- **Semantic skill understanding:** a built-in vocabulary resolves aliases (ML = Machine Learning, JS = JavaScript, Postgres = PostgreSQL) without any AI call and separates equivalent skills from related ones (TensorFlow only earns partial credit for Machine Learning). Gemini judges only wording the vocabulary does not know, and every answer is validated against the real profiles before it is used.
- **AI project analysis (Gemini):** roles, skill gaps and sustainability notes
- **AI team suggestions:** the optimizer picks the strongest team; Gemini explains why it works
- **Premium:** AI team risk analysis, what-if simulator, analytics, AI-matched mentors
- Results are cached, and if a user's monthly AI actions run out or Gemini is unavailable the app says so rather than faking results

**Event organisers**
- Create events, collect registrations, and form balanced teams for the whole batch
- Multi-stage workflows with submissions, judging, automatic or manual advancement, results and certificates
- One-time **Event Pass** per event, paid with PayPal
- Event analytics (organiser subscription)

**Payments and invoices (PayPal)**
- Subscriptions and Event Passes paid through PayPal, verified on the server before anything unlocks
- **Invoices and payment history** for students and organisers: a PDF invoice for every verified successful payment, downloadable at any time. Event Pass invoices are created when a payment is captured; subscription invoices are built from the transactions PayPal itself reports. Only completed payments get an invoice, and each payment gets exactly one.

## Plans

| Plan | Price (sandbox, USD) | Includes |
|---|---|---|
| Free for Students | 0 | Profile, basic team matching, workspace, 15 AI actions a month |
| Premium for Students | 2.99 / month or 24.99 / year | 150 AI actions a month, risk analysis, what-if, analytics, mentorship |
| Event Pass | 9 / 19 / 39 per event | One-time payment sized to the event's workflow: Standard (up to 3 stages), Advanced (up to 10 stages, team submissions, automatic advancement), Complex (unlimited stages, weighted judging) |
| Enterprise | Custom | Quote request |

Event Organiser subscription plans also exist in Plans & Billing for organisers who want event analytics and unlimited use, but they are not advertised on the introduction page; organisers can simply buy an Event Pass per event.

Prices and limits live in `supabase/functions/_shared/plans.ts` (server) with display copies in `src/lib/plans.js` and `pricing.js`. `npm run test:plans` fails if they ever disagree.

## How PayPal is used

- **Subscriptions API:** the server fetches the subscription from PayPal and unlocks a plan only if the plan id, the account (`custom_id`) and the ACTIVE status all match. Cancelling keeps access until the paid period ends.
- **Orders API:** the Event Pass checkout. The server sets the price, captures the payment, and checks amount, currency and event before the event counts as paid.
- **Webhooks:** captures, refunds and cancellations are verified with PayPal's signature before they change anything.
- **Transactions:** subscription invoices are generated from PayPal's own transaction list, never from numbers COLLIVRA makes up.
- Everything runs against the PayPal **sandbox**. No real money moves.

## How AI is used

Gemini judges meaning; backend code decides numbers. For matching it rates how important each required skill is, which skills each project role needs, and whether unfamiliar skill or interest wording is relevant. It never sees student ids and never writes scores or notes. Everything it returns is checked against the exact strings that were sent, and the final scores, ranking and explanations are computed from verified profile data.

## Architecture

React 19 + Vite + Tailwind in the browser, Supabase (auth, Postgres with row level security, realtime), and Edge Functions:

| Function | Purpose |
|---|---|
| `analyze-project`, `analyze-mentor-requirements` | Gemini project and mentor-need analysis |
| `match-students` | Skill-first matching: Gemini semantics, validated, deterministic scoring, cached |
| `suggest-team` | Best team plus AI explanation; risk analysis and what-if (Premium) |
| `form-event-teams`, `publish-event` | Event team formation and publishing |
| `paypal-create-order`, `paypal-capture-order`, `paypal-webhook` | Event Pass checkout and PayPal event handling |
| `subscription-manage` | Activate, sync and cancel subscriptions; returns the authoritative plan |
| `invoice-manage` | Imports completed PayPal subscription payments as invoices |
| `analytics-summary`, `mentorship-manage` | Analytics and mentorship |

Subscriptions, payments, invoices and usage can only be written by the server. A database trigger stops anyone marking an event paid from the browser.

## Security

- Payments, invoices, subscriptions, webhook events and mentor payments use ownership policies.
- Migration `20261122000000_team_collaboration_rls.sql` limits team chat, tasks and milestones to a team's members and the project owner, restricts who can add team members, and stops signed-out visitors reading profiles. Verify it with `supabase/tests/team_rls_verification.sql`.
- Secrets live only in `supabase/functions.env` (git-ignored) and Supabase secrets; the browser holds only the public anon key and the PayPal client id.

## Commands

```
npm run dev              start the app (auto-detects Local Mock Mode if .env is missing)
npm test                 optimizer, matching, plans, payments, invoices, subscriptions, RLS checks, import check
npm run check:setup      verify your .env files without printing secrets
npm run setup:plans      create the PayPal sandbox plans
npm run build            production build
```
On Windows PowerShell use `npm.cmd` and `npx.cmd`. See [`docs/LOCAL_DEV_MODE.md`](docs/LOCAL_DEV_MODE.md) for running without a live Supabase project.

## Licence

MIT. See [`LICENSE`](LICENSE).