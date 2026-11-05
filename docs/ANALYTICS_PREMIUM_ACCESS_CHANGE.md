# Analytics Premium navigation and entitlement compatibility

- The Student sidebar now shows Analytics only when the account has an active Premium entitlement.
- Existing Student navigation entries and Community/Create Project routes are unchanged.
- Subscription status matching now tolerates legacy lowercase ACTIVE/CANCELLED values in both browser display logic and Edge Function enforcement.
- Subscription lookup errors are logged and do not silently replace a previously displayed tier with Free.

No database migration is required for these code changes. Existing subscription rows and PayPal credentials are preserved.

## Important verification

The updated frontend and Edge Function need deployment before the change appears in the hosted app. The current environment did not have a complete Vite installation, and dependency installation timed out, so a production build could not be verified here. After deployment, if Premium still does not unlock, inspect the signed-in user's `subscriptions` rows (`plan_key`, `status`, `access_until`) and verify that `plan_key` is `premium_monthly` or `premium_yearly` and status is ACTIVE (or CANCELLED with a future access_until). Do not create a second payment to troubleshoot this.
