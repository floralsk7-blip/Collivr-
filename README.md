# COLLIVRA: build the right team, not just a full one

COLLIVRA matches students to projects on skills, experience, interest and availability, ranks team combinations, and explains every recommendation. Built for the **PayPal AI Hackathon**.

**New to the project? Open `START_HERE.md`.** It is a complete, step-by-step Windows guide.

## Features

- Profiles, projects, connections, messaging and a team workspace (tasks, milestones, chat)
- **AI project analysis (Gemini):** roles, skill gaps and sustainability notes
- **AI-assisted matching:** a rules engine scores every student (skills 55, experience fit 20, interest 15, availability 10), then Gemini reviews the best candidates, adjusts the scores and explains each match
- **AI team suggestions:** the optimizer picks the strongest team; Gemini explains why it works and writes coaching notes
- **AI team risk analysis and what-if simulator** (Premium)
- **Analytics** (Premium): task, milestone and team progress, weekly activity and AI usage; College plans also get event analytics (skill gaps and branch mix)
- **Mentorship** (Premium): anyone can become a mentor; Premium students find AI-matched mentors, send requests, and chat once accepted
- Results are cached, and if a user's monthly AI actions run out or Gemini is busy, the same screen works with the built-in rules
- **Events:** balanced teams for a whole batch, paid with a one-time Event Pass (or included in the College plan)
- **Plans paid with PayPal:** Premium for Students and College / University subscriptions, per-event Hackathon Partnerships, and a custom quote request for Organizations / Startups

## Plans

| Plan | Price (sandbox, USD) | Includes |
|---|---|---|
| Free for Students | 0 | Profile, basic team matching, workspace, 15 AI actions a month (then built-in rules) |
| Premium for Students | 4.99 / month or 39.99 / year | Advanced AI (150 actions a month, risk analysis, what-if), analytics, mentorship |
| College / University | 299 / year | Premium features, team formation for your events with no per-event fee, event analytics |
| Hackathon Partnerships | 9 / 19 / 39 per event | Team formation for up to 30 / 100 / 100+ students |
| Organizations / Startups | Custom | Quote request form |

Prices and limits live in `supabase/functions/_shared/plans.ts` and `pricing.ts`, with display copies in `src/lib/plans.js` and `pricing.js`. `npm run test:plans` fails if the two ever disagree.

## How PayPal is used

- **Subscriptions API:** the PayPal button creates a subscription for a plan. The server then fetches it from PayPal and unlocks the plan only if the plan id, the account (`custom_id`) and the ACTIVE status all match.
- **Orders API:** the Event Pass checkout. The server sets the price from the event size, captures the payment, and checks amount, currency and event before the event counts as paid.
- Cancelling keeps access until the end of the paid period. Renewals and cancellations made at PayPal are synced when the pricing page opens.
- Everything uses the PayPal **sandbox**. No real money moves.

## Architecture

React 19 + Vite + Tailwind (browser) talks to Supabase (auth, Postgres with row level security, realtime) and to these edge functions:

| Function | Purpose |
|---|---|
| `analyze-project` | Gemini project analysis (one AI action), rules fallback |
| `match-students` | Rules ranking refined and explained by Gemini, cached |
| `suggest-team` | Best team plus AI explanation; AI what-if and risk analysis (Premium) |
| `form-event-teams` | Event team formation, gated by Event Pass or College plan |
| `paypal-create-order`, `paypal-capture-order` | Event Pass checkout |
| `subscription-manage` | Activate, sync and cancel subscriptions |
| `analytics-summary` | Premium analytics (College: plus event analytics) |
| `mentorship-manage` | Mentor list, AI matching, requests and replies |

Subscriptions, payments and usage tables can only be written by the server. A database trigger stops anyone marking an event paid from the browser.

## Commands

```
npm run dev              start the app (auto-detects Local Mock Mode if .env is missing)
npm test                 optimizer, matching, plans, payment checks, import check
npm run check:setup      verify your .env files without printing secrets
npm run setup:plans      create the PayPal sandbox plans
npm run build            production build
```
On Windows PowerShell use `npm.cmd` and `npx.cmd`.

For details on running without a live Supabase project, see [`docs/LOCAL_DEV_MODE.md`](docs/LOCAL_DEV_MODE.md).

## Known gaps

Hackathon prototype. Tasks, milestones and team chat still use permissive row level security rules. See `START_HERE.md`, "Honest status".
