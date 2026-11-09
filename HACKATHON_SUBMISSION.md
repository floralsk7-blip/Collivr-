# PayPal AI Hackathon 2026: COLLIVRA submission notes

Theme: **Build What's Next with PayPal and AI.**

## One-line pitch
COLLIVRA forms the right project team by matching students on the skills a project actually needs, explains every recommendation, and runs on a PayPal-powered business model: student subscriptions and one-time Event Passes for the organisers who form teams for whole hackathons.

## Problem
Student teams are formed by friendship or first reply, so skills overlap, gaps appear and availability clashes. Colleges and clubs running hackathons have no scalable way to balance dozens of teams. Existing matching shows everyone a vague percentage, so nobody can trust it.

## Solution
Describe a project and COLLIVRA identifies the roles needed, shows only students who have at least one genuine required skill, ranks them with a transparent score and explains each match: what they cover, what is related, what is missing. Organisers can form balanced teams for an entire event in one step.

## What makes the matching different
- **Skills are the gateway.** A student with zero matching skills never appears, however available, interested or experienced. No default or floor scores.
- **Transparent weights:** skills 65, role 15, interest 10, availability 5, collaboration 3, experience 2. Skill coverage is weighted by how critical each skill is to the project.
- **Understands meaning, not just text:** ML = Machine Learning, JS = JavaScript. Related skills (TensorFlow for Machine Learning) earn partial credit only; Java is never mistaken for JavaScript.
- **AI judges, code decides.** Gemini rates skill importance and relevance of unfamiliar wording. It never sees student ids and never writes a score. Every answer is validated against the real profiles, and the final numbers are computed by tested backend code.

## How PayPal is used (specific)
- **Subscriptions API:** Premium for Students (2.99/month or 24.99/year). The server fetches the subscription from PayPal and unlocks the plan only if the plan id, the account and the ACTIVE status all match. Cancelling keeps access to the end of the paid period.
- **Orders API:** the one-time Event Pass (9 / 19 / 39 by event complexity). The server sets the price, captures, and checks amount, currency and event before the event counts as paid.
- **Webhooks:** signature-verified captures, refunds and cancellations.
- **Invoices from PayPal data:** every verified successful payment gets a PDF invoice. Event Pass invoices come from captured payments; subscription invoices are built from the transactions PayPal reports. Failed, pending and unverified payments never produce one, and each payment gets exactly one.
- Sandbox only. No real money moves.

## How PayPal and AI fit together
Payment status is what unlocks AI: a verified PayPal subscription lifts the monthly AI allowance from 15 to 150 and opens risk analysis, what-if simulation, analytics and mentor matching; a verified Event Pass opens AI-assisted team formation for an event. The server, not the browser, decides what has been paid for.

## Business model (built)
| Offer | What it delivers | Payment |
|---|---|---|
| Free for Students | Profile, basic matching, workspace, 15 AI actions a month | none |
| Premium for Students | 150 AI actions, risk analysis, what-if, analytics, mentorship | PayPal Subscriptions |
| Event Pass | Team formation and workflow for one event | PayPal Orders, one time |
| Enterprise | Custom | quote request |

Event Organiser subscription plans exist in Plans & Billing but are deliberately not on the introduction page; organisers pay per event.

## Safety by design
- Money moves one way (customer to COLLIVRA). There are no payouts.
- Subscriptions, payments, invoices and usage can only be written by the server.
- Invoices are readable only by their owner (row level security) and cannot be edited.
- Team chat, tasks and milestones are limited to a team's members and the project owner (`20261122000000_team_collaboration_rls.sql`).
- Verification logic is unit-tested with tampered PayPal responses (wrong plan, wrong user, underpayment, wrong currency, pending status).

## Demo video outline (under 3 minutes; keep it tight)
1. Problem (15s): teams formed by friendship; unclear match scores.
2. Student creates a project; AI analysis; matches appear only for students with a real skill match, each with matched, related and missing skills (45s).
3. Free account meets the Premium notice; subscribe with a PayPal sandbox buyer; Premium unlocks analytics and AI tools (35s).
4. Organiser creates an event, pays the Event Pass in PayPal sandbox, students join, balanced teams form with explanations (45s).
5. Invoices page: view and download a PDF invoice for the payment (15s).
6. How it works (15s): PayPal verification on the server, AI judging with validated output, what's next (10s).

## Judging criteria map
- **Technical Implementation:** server-side PayPal verification, signature-checked webhooks, deterministic and unit-tested scoring, validated AI output, row level security, caching and quota handling. `npm test` runs the whole suite.
- **Design:** one consistent design system across landing, pricing, dashboards, match cards and invoices.
- **Potential Impact:** any student team, club, college or hackathon; organisers save hours of manual team balancing.
- **Innovation:** skill-gated explainable matching and event-scale balanced team formation, with AI constrained to judging meaning.
- **Presentation:** demo video plus this write-up and the README.
