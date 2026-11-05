# PayPal AI Hackathon: submission notes (draft)

## One-line pitch
COLLIVRA forms the right project team by matching students on skills, experience and availability, explains every recommendation, and runs on a PayPal-powered business model: student subscriptions, college plans and per-event passes.

## Problem
Student teams are formed by friendship or first reply, so skills overlap, gaps appear and availability clashes. Colleges running hackathons have no scalable way to balance dozens of teams.

## Solution
Describe a project and COLLIVRA identifies the roles you need, ranks every student with a reason, and picks the strongest team. Colleges and organizers can form balanced teams for a whole event at once.

## Business model (built, with PayPal Sandbox)
The five offers on the Business Model slide, all in the app:

| Offer | Badge | What it delivers | Payment |
|---|---|---|---|
| Free for Students | Free | Profile, basic team matching, workspace, 15 AI actions a month | none |
| Premium for Students | Premium | Advanced AI (150 actions, risk analysis, what-if), analytics, mentorship | PayPal Subscriptions: 4.99 / month, 39.99 / year |
| College / University | Subscription | Premium plus event team formation with no per-event fee, event analytics | PayPal Subscriptions: 299 / year |
| Hackathon Partnerships | Per event | Team formation plan sized to the event: 9 / 19 / 39 | PayPal Orders |
| Organizations / Startups | Custom | Quote request | form |

## How PayPal is used (be specific)
- **Subscriptions API** for Premium and College: the server verifies plan id, account and ACTIVE status with PayPal before unlocking anything. Cancelling keeps access until the paid period ends.
- **Orders API** for the Event Pass: the server sets the price, captures, and checks amount, currency and event.
- Plan limits are enforced on the server (monthly AI actions: 15 Free, 150 Premium and College; Premium-only AI risk and what-if tools).
- Verification logic is unit-tested with tampered PayPal responses (wrong plan, wrong user, underpayment, wrong currency, pending status).

## How AI is used
- **Gemini analyses each project:** roles, skill gaps, sustainability notes.
- **AI-assisted matching:** a transparent rules engine scores every student, then Gemini reviews the best candidates, adjusts the scores and writes a reason for each. AI and rules are blended so one odd answer cannot dominate.
- **AI team suggestions:** the optimizer chooses the team; Gemini explains why it works and writes coaching notes.
- **AI risk analysis and what-if simulator** for Premium users.
- **Quota-safe by design:** results are cached, each user has a monthly AI allowance, and if it runs out or Gemini is busy the screen falls back to the built-in rules and says so. The product never breaks.

## Safety by design
- Money moves one way (customer to COLLIVRA). There are no payouts.
- The browser never decides what is paid. Subscriptions, payments and usage tables are server-write-only.
- A PayPal subscription can only unlock the account it was created for.
- Sandbox only: no real money in the demo.

## Demo video outline (about 3 minutes)
1. Problem (20s): unbalanced teams.
2. New project, AI analysis, matches with reasons, suggested team (50s).
3. Free account hits the Premium notice on risk analysis (15s).
4. Subscribe to Premium with a PayPal sandbox buyer; risk analysis, what-if, analytics and mentors unlock (50s).
5. Create an event, students join, pay the Event Pass, teams form with explanations (40s).
6. Seller view in the PayPal sandbox showing the payments (15s). Roadmap (10s).

## Deck check
- **Business Model slide:** now accurate. Premium's "Advanced AI, analytics, mentorship" are all built. Add the real prices to the badges if you like (4.99 / 39.99 / 299 / 9-39).
- **Security & Privacy slide:** Secure Authentication, Data Encryption (platform level) and Role-Based Access (row level security and plan checks) are real. **User-Controlled Visibility** and **Privacy by Design (consent)** are not built. Either build a profile visibility setting and a consent screen, or soften those two lines.
- **"Why this team?" slide:** event teams use skills 35, interest 20, availability 15, experience 15, diversity 15; project matching uses skills 55, experience 20, interest 15, availability 10. Show one set, or label both.
- **Add a PayPal flow slide:** subscribe, the server verifies with PayPal, the plan unlocks.
- Label the Team Composer sample names as "example".

## Judging checklist
- Technical implementation: server-side verification, row level security, tested scoring and payment checks.
- Design: new consistent design system, landing page, pricing page.
- Impact: any student team, club, college or hackathon.
- Innovation: explainable team optimization plus event-scale team formation.
- Presentation: demo video plus this write-up.
