COLLIVRA profile save fix
========================

What changed
- The profile Finish button now validates required fields and shows Supabase errors instead of failing silently.
- The profile save payload is aligned to the profile schema.
- Added supabase/migrations/20261101000000_profile_fields_and_rls.sql for profile fields used by the app (branch, skills_detailed, project_interests, open_to_collaborate) and repeat-safe RLS policies.

IMPORTANT: Apply the SQL migration to the same Supabase project used by your local .env before testing the profile wizard:
1. Supabase Dashboard -> SQL Editor -> New query.
2. Open the file supabase/migrations/20261101000000_profile_fields_and_rls.sql in this ZIP and copy its contents into the query.
3. Click Run. If Supabase returns an error, stop and share the exact message.
4. Restart the Vite server (Ctrl+C in terminal, then npm.cmd run dev), refresh http://localhost:5173/profile and try Finish again.

Security note
- Keep your real .env local and do not commit it. Only use the Supabase publishable/anon key in VITE_SUPABASE_ANON_KEY; never put a service_role/secret key in frontend code.
- This archive does not include your real .env or node_modules.

This is the first reliability fix, not a claim that every feature in the prototype has been fully audited or production-hardened. The remaining project should be tested feature-by-feature against the Supabase schema, Storage buckets, and Edge Functions before public launch.
