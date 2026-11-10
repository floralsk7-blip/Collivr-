# Getting Started with COLLIVRA

COLLIVRA is an AI-powered project matching and event team formation platform built for the **PayPal AI Hackathon 2026**.

It combines:
- **Skill-First Matching & Alternative Team Comparison** for student projects
- **Professor & Industry Mentor Recommendations**
- **Event-First Organiser Platform** with multi-stage workflows and Event Passes
- **PayPal Integration** (Subscriptions API, Orders API, Webhooks, Verified Invoices)
- **Supabase Backend** (PostgreSQL with Row Level Security, Auth, Deno Edge Functions)

---

## 1. Quick Start (Local Development)

### Prerequisites
- Node.js 22.18+ (tested on Windows, macOS, Linux)
- npm 10+

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Configure Environment
Copy the example environment configuration:
```bash
cp .env.example .env
```
For local offline exploration, COLLIVRA includes an automatic **Local Mock Mode** if live Supabase keys are not configured.

### Step 3: Start the Application
```bash
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 2. Running Automated Tests

Run the full verification suite (optimizer, enhancements, matching, plans, payments, invoices, subscriptions, imports):
```bash
npm test
```

Individual test suites:
- `npm run test:optimizer` — Deterministic team optimizer & alternative team generation
- `npm run test:enhancements` — Alternative team comparison, organiser analytics, profile privacy
- `npm run test:insights` — Risk analysis, what-if simulator, student scoring
- `npm run test:plans` — Plan catalog, prices, and entitlements parity
- `npm run test:payments` — PayPal order & subscription verification logic
- `npm run test:invoices` — PDF invoice generation from verified payments
- `npm run check:imports` — Static import analysis across the entire `src/` codebase

---

## 3. Connecting Live Services

### Supabase Setup
1. Create a Supabase project at [supabase.com](https://supabase.com).
2. Configure `.env`:
   ```env
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
   VITE_PAYPAL_CLIENT_ID=your-paypal-sandbox-client-id
   ```
3. Apply database migrations in timestamp order using the Supabase CLI:
   ```bash
   npx supabase db push
   ```
4. Deploy Supabase Edge Functions:
   ```bash
   npx supabase functions deploy suggest-team
   npx supabase functions deploy match-students
   npx supabase functions deploy analyze-project
   npx supabase functions deploy analyze-mentor-requirements
   npx supabase functions deploy analytics-summary
   npx supabase functions deploy form-event-teams
   npx supabase functions deploy paypal-create-order
   npx supabase functions deploy paypal-capture-order
   npx supabase functions deploy paypal-webhook
   npx supabase functions deploy subscription-manage
   npx supabase functions deploy invoice-manage
   ```
5. Set Edge Function secrets in `supabase/functions.env`:
   - `GEMINI_API_KEY`
   - `PAYPAL_CLIENT_ID`
   - `PAYPAL_CLIENT_SECRET`
   - `PAYPAL_WEBHOOK_ID`
   - `PAYPAL_PLAN_PREMIUM_MONTHLY`
   - `PAYPAL_PLAN_PREMIUM_YEARLY`

### PayPal Sandbox Setup
1. Create a Developer Sandbox account at [developer.paypal.com](https://developer.paypal.com).
2. Set up sandbox plans using the helper script:
   ```bash
   node scripts/create-paypal-plans.mjs
   ```
3. Full setup guide: [`PAYPAL_SETUP.md`](PAYPAL_SETUP.md).

---

## 4. Key Workflows to Explore

### Student Workflow
1. Sign up as a **Student** at `/login`.
2. Complete profile skills and interests at `/profile`.
3. Create a project at `/create-project` (e.g., Domain: `AI/ML`, Required Skills: `Python, React, UI/UX`).
4. On `/team/:projectId/recommend`, view **Alternative Team Comparison** (Team A, Team B, Team C) with real compatibility scores, dynamic badges, breakdown charts, and assigned roles.
5. Inspect **Recommended Mentors** (College Professors & Industry Experts) matched to your project requirements.
6. Select your preferred alternative and click **Confirm & Form Team** to create the workspace.
7. Upgrade to **Student Premium** ($2.99/mo or $24.99/yr) at `/pricing` using PayPal Sandbox to unlock Team Insights and Student Analytics.

### Event Organiser Workflow
1. Sign up as an **Event Organiser** at `/login`.
2. Access the Organiser Dashboard at `/events`.
3. Create event drafts for free at `/events`.
4. Purchase an **Event Pass** (Standard $9, Advanced $19, Complex $39) via PayPal Sandbox checkout.
5. Publish the event; students register directly.
6. Run one-click **Balanced Team Formation** for the whole batch.
7. Access **Event Analytics** directly at `/analytics` without requiring Student Premium.
8. View and download PDF invoices for all transactions at `/invoices`.

---

## 5. Documentation Directory

- [`README.md`](README.md) — Comprehensive architectural overview, feature documentation, and technical reference
- [`HACKATHON_SUBMISSION.md`](HACKATHON_SUBMISSION.md) — Dedicated submission document for PayPal AI Hackathon judges
- [`PAYPAL_SETUP.md`](PAYPAL_SETUP.md) — Detailed PayPal Sandbox configuration and webhook instructions
- [`docs/ORGANISER_ACCESS_AND_ANALYTICS.md`](docs/ORGANISER_ACCESS_AND_ANALYTICS.md) — Organiser entitlements, analytics architecture, and profile separation
- [`docs/EVENT_FIRST_WORKFLOW.md`](docs/EVENT_FIRST_WORKFLOW.md) — Direct event ownership and multi-stage lifecycle
- [`docs/EVENT_PASS_IMPLEMENTATION.md`](docs/EVENT_PASS_IMPLEMENTATION.md) — Event Pass tiers and PayPal order capture
- [`docs/LOCAL_DEV_MODE.md`](docs/LOCAL_DEV_MODE.md) — Offline mock mode guide
