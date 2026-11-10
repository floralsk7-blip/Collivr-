# Event Organiser Access, Analytics & Profile Privacy

COLLIVRA maintains two distinct account models: **Student accounts** and **Event Organiser accounts**.

## 1. Organiser Features & Analytics (No Student Premium Required)

Event Organisers access all organizer features directly without purchasing or holding a Student Premium subscription:
- **Organiser Analytics:** Accessible from the main sidebar at `/analytics`. Provides live database metrics:
  - Total events created, published, and draft counts
  - Total participant registrations across all owned events
  - Total teams formed and average team compatibility score
  - Participant registration trends over the last 6 weeks
  - Per-event skill demand breakdown (% of participants possessing required skills)
  - Academic branch and department representation
- **Data Scoping:** An organiser can only see analytics for events they directly own (`organizer_id = auth.uid()`). One organiser cannot access another organiser's analytics.
- **Student Privacy:** Students cannot access organiser event analytics.

## 2. Student Premium Independence

- Student accounts continue to require Student Premium ($2.99/month or $24.99/year) for student project analytics, team risk analysis, what-if simulation, and mentorship booking.
- Free students receive existing free features with an upgrade notice on `/analytics`.
- The backend authorization in `analytics-summary` is role-aware: it checks `account_type` to grant event analytics to organisers while preserving subscription checks for students.

## 3. Profile Separation

- Event Organiser profiles are private and cannot be opened or viewed by Student accounts.
- Direct URL navigation by a student to `/profile/:organiserId` displays a restricted profile notice.
- Organisers are excluded from student discovery queries (`/find-people`, `/dashboard`).
- Public event discovery remains completely functional: students can view, search, and register for published events created by organisers.
- Organisers can view and edit their own profile at `/profile`.
