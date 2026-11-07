# Collivra Smart Mentor Matching: Staging & Production Deployment Playbook

This playbook documents the exact procedure for deploying the **Collivra Smart Mentor Matching** ecosystem (Sub-phases 1–8 and Staging Hardening Fixes) to live Supabase and PayPal infrastructure.

---

## 1. Prerequisites & Required Secrets

Ensure you have access to:
1. **Supabase CLI:** Authenticated with your Supabase organization (`supabase login`).
2. **Supabase Project:** Linked project ref (`supabase link --project-ref <your-project-id>`).
3. **PayPal Developer Account:** Sandbox or Live credentials for REST Apps and Webhooks.

### Edge Function Secrets
Set the following secrets on your Supabase project (never expose these in client frontend files or `.env.local`):

```bash
# Link your project first
supabase link --project-ref <project-id>

# Configure PayPal REST Credentials & Webhook Listener
supabase secrets set PAYPAL_CLIENT_ID="<your-paypal-client-id>"
supabase secrets set PAYPAL_CLIENT_SECRET="<your-paypal-client-secret>"
supabase secrets set PAYPAL_WEBHOOK_ID="<your-registered-webhook-id>"
supabase secrets set PAYPAL_ENV="sandbox" # Change to "live" in production

# Supabase internal keys are set automatically by the platform,
# but ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are available.
```

---

## 2. Database Migration Execution Plan

The migrations are designed to run sequentially without conflicts. Each migration uses idempotent syntax (`CREATE TABLE IF NOT EXISTS`, `DROP POLICY IF EXISTS`, `ADD COLUMN IF NOT EXISTS`).

### Migration Sequence:
1. `20261112000000_project_mentor_preference.sql`
   - Adds `mentor_preference` enum column to `projects`.
2. `20261113000000_ai_analysis_mentor_requirements.sql`
   - Adds `mentor_analysis` and `mentor_recommended_type` columns to `projects`.
3. `20261114000000_mentor_profiles.sql`
   - Creates `mentor_profiles`, `mentor_expertise`, `mentor_availability`, `mentor_qualifications`, `mentor_portfolio`, and `mentor_verification_documents`.
   - Creates the `protect_mentor_verification_status` security trigger.
4. `20261115000000_mentor_ratings_and_discovery.sql`
   - Creates the indexed discovery view `v_mentor_discovery` and rating columns.
5. `20261116000000_mentor_packages_and_subscriptions.sql`
   - Creates `mentor_packages`, `mentor_subscriptions`, and `mentor_subscription_history`.
6. `20261117000000_mentor_bookings_and_payments.sql`
   - Creates `mentor_bookings` and `mentor_payment_transactions`.
7. `20261118000000_mentor_workspace_and_collaboration.sql`
   - Creates `mentor_workspace_notes`, `mentorship_milestones`, and `mentor_reviews`.
8. `20261119000000_paypal_webhook_and_rls_hardening.sql`
   - Creates `paypal_webhook_events` idempotency table.
   - Enforces student insert-only restrictions on `mentor_payment_transactions`.
   - Attaches `tr_validate_mentor_booking_update` trigger on `mentor_bookings`.

### Deployment Command:
```bash
# Push all pending migrations to the linked remote database
supabase db push
```

---

## 3. Edge Functions Deployment

Deploy the required Supabase Edge Functions:

```bash
# 1. Mentor Requirement Analysis Function
supabase functions deploy analyze-mentor-requirements

# 2. PayPal Webhook Listener Function
supabase functions deploy paypal-webhook --no-verify-jwt
```
> **Important:** The `paypal-webhook` function must be deployed with `--no-verify-jwt` because PayPal calls this endpoint anonymously. Verification is performed cryptographically via PayPal's RSA signature headers.

---

## 4. PayPal Webhook Registration in Developer Dashboard

1. Log in to [PayPal Developer Dashboard](https://developer.paypal.com/).
2. Navigate to **Apps & Credentials** > Select your App.
3. Scroll to **Webhooks** and click **Add Webhook**.
4. Set **Webhook URL** to your live Supabase Edge Function URL:
   `https://<project-ref>.supabase.co/functions/v1/paypal-webhook`
5. Subscribe to the following events:
   - `Payment capture completed` (`PAYMENT.CAPTURE.COMPLETED`)
   - `Payment capture refunded` (`PAYMENT.CAPTURE.REFUNDED`)
   - `Payment capture denied` (`PAYMENT.CAPTURE.DENIED`)
   - `Checkout order approved` (`CHECKOUT.ORDER.APPROVED`)
   - `Billing subscription cancelled` (`BILLING.SUBSCRIPTION.CANCELLED`)
   - `Billing subscription suspended` (`BILLING.SUBSCRIPTION.SUSPENDED`)
6. Copy the generated **Webhook ID** and set it in your Supabase secrets:
   ```bash
   supabase secrets set PAYPAL_WEBHOOK_ID="<webhook-id>"
   ```

---

## 5. Frontend Client Configuration (.env.local)

For staging/production frontend hosting (e.g. Vercel, Netlify):

```env
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-public-anon-key>
VITE_PAYPAL_CLIENT_ID=<your-public-paypal-client-id>
VITE_PAYPAL_ENV=sandbox # or live
VITE_EVENT_PASS_CURRENCY=USD
```

---

## 6. Staging Smoke Test & Verification Checklist

Once deployed to your staging environment, run through this verification checklist:

### Test 1: Project Creation & Preference Selection
1. Navigate to `/create-project`.
2. Fill in project details and team requirements.
3. Advance through AI Analysis.
4. Verify Mentor Preference step loads with 4 options. Select "College Professor".
5. Publish project and verify badge appears on `/project/:id`.

### Test 2: Mentor Discovery & Profile
1. Navigate to `/mentors`.
2. Verify verified mentors appear with badges, categories, and rates.
3. Visit `/mentor/profile` and verify package editing and availability scheduling.

### Test 3: Session Booking & PayPal Sandbox Payment
1. From a project detail page, select a mentor and click "Book Session →".
2. Select an active package and preferred date/time.
3. Complete checkout via PayPal Sandbox popup.
4. Verify booking transitions to `awaiting_acceptance`.
5. Verify webhook logs in Supabase dashboard for `paypal-webhook`:
   `Status: 200 OK`, event recorded in `paypal_webhook_events`.

### Test 4: Mentor Acceptance & Workspace
1. Sign in as the designated mentor.
2. Open `/mentor/dashboard`.
3. Click "Accept" on the pending booking request.
4. Verify booking status advances to `confirmed`.
5. Open the project mentorship workspace, create a pinned workspace note, and create a milestone.

### Test 5: Cancellation & Refund Pipeline
1. Cancel a confirmed booking from the student hub `/student/mentorships`.
2. Confirm status transitions to `cancelled` -> `refund_pending`.
3. Process refund and confirm status reaches terminal `refunded`.

---

## 7. Rollback Safety & Disaster Recovery

If an issue occurs during staging deployment:
- **Database Rollback:** All migrations use `IF NOT EXISTS` and isolated tables that do not alter core user auth or project schemas destructively. Dropping the added tables returns the schema to its pre-mentor state without affecting existing platform users.
- **Frontend Fallback:** The codebase maintains automatic fallback to Local Development Mode whenever credentials are removed or invalid, ensuring the application never enters an unrecoverable blank screen.

