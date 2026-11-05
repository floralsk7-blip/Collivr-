# COLLIVRA PayPal subscription setup (Sandbox)

The setup script creates six recurring plans in PayPal Sandbox and writes the returned Plan IDs to `supabase/functions.env`.

## Plan catalogue

| Account | Billing | Price (USD) | Environment variable |
|---|---:|---:|---|
| Student Premium | Monthly | $2.99 | `PAYPAL_PLAN_PREMIUM_MONTHLY` |
| Student Premium | Yearly | $24.99 | `PAYPAL_PLAN_PREMIUM_YEARLY` |
| Institution | Monthly | $19.00 | `PAYPAL_PLAN_INSTITUTION_MONTHLY` |
| Institution | Yearly | $190.00 | `PAYPAL_PLAN_INSTITUTION_YEARLY` |
| Organisation | Monthly | $29.00 | `PAYPAL_PLAN_ORGANISATION_MONTHLY` |
| Organisation | Yearly | $290.00 | `PAYPAL_PLAN_ORGANISATION_YEARLY` |

`PAYPAL_PLAN_PREMIUM_YEARLY_V2` is written as a compatibility alias to the Student yearly plan. `PAYPAL_PLAN_COLLEGE_YEARLY` is a compatibility alias to the Institution yearly plan. They do not create extra PayPal plans.

## Setup on Windows PowerShell

1. In PayPal Developer Dashboard, create or select a **Sandbox** REST app.
2. Copy its Sandbox Client ID and Secret into `supabase/functions.env` (copy `supabase/functions.env.example` first if needed). Do not share the secret or commit this file.
3. Keep `PAYPAL_ENV=sandbox` and `EVENT_PASS_CURRENCY=USD`.
4. From the COLLIVRA project root, run:

   ```powershell
   npm.cmd install
   npm.cmd run setup:plans
   ```

5. The script creates the product/plans and writes their real IDs to `supabase/functions.env`. It saves each ID immediately, so an interrupted run does not lose IDs already returned by PayPal.
6. Set the Edge Function secrets and deploy the function:

   ```powershell
   npx.cmd supabase secrets set --env-file supabase/functions.env
   npx.cmd supabase functions deploy subscription-manage
   ```

7. Ensure the frontend `.env` uses the **Sandbox Client ID from the same PayPal app** and `VITE_PAYPAL_ENV=sandbox`, then run the app and test with a Sandbox Personal buyer account.

## Re-running

The script keeps any already-populated plan IDs and creates only missing plans. Use `npm.cmd run setup:plans -- --force` only when you intentionally want replacement plans; existing subscriptions continue to refer to their original PayPal plan IDs.

## Live payments

This script deliberately refuses to run unless `PAYPAL_ENV=sandbox`. Create the corresponding plans separately in PayPal Live after Sandbox checkout has been verified, then configure Live credentials and Live Plan IDs as production Supabase secrets. Never use Sandbox Plan IDs in Live or vice versa.
