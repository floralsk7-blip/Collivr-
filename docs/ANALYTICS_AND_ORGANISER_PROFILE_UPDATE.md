# Analytics and organiser profile update

## Analytics
- Analytics remains Premium-only. The Student sidebar exposes its route when the existing subscription resolver returns `premium`.
- The analytics page continues to use the existing `analytics-summary` Edge Function and server-side entitlement enforcement.
- Existing subscription rows and PayPal credentials are not modified by this update. If Premium still does not unlock, inspect the signed-in user's subscription row and plan_key/status/access_until; do not purchase again to troubleshoot.

## Organiser profile
- Added organiser profile fields to the setup form: organiser type (company, college/university, NGO, community, individual), designation, official email, phone, website, location, logo URL and about.
- Individual organisers may leave organisation name blank.
- Organiser profile display is separate from the student profile layout.
- Account type is stored as `organisation`, matching the existing account_type constraint in the workspace migration. Existing `institution`/`organisation` accounts are treated as organiser accounts in navigation.

## Database
Apply `supabase/migrations/20261111000000_organiser_profile_details.sql` once in the existing Supabase project. It is additive and does not alter payment/subscription tables. It adds nullable organiser profile fields and defaults verification to pending.

## Verification limitation
A production build was not completed in this environment because Vite is not installed in the available node_modules. Run `npm.cmd install` and `npm.cmd run build` on Windows before deploying. Test using a non-production copy or preview first.
