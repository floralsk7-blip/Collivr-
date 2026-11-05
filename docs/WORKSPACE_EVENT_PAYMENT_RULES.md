# Workspace and Event Pass rules (migration 20261107000000)

This update removes workspace verification as a gate to event management. An Institution or Organisation account can create one workspace and invite/manage its staff. The workspace owner/admin/event manager can create event drafts without paying a recurring organiser subscription.

## Event lifecycle

1. An authorised workspace manager creates an event draft and selects Standard ($9), Advanced ($19), or Complex ($39).
2. The event creator pays the one-time Event Pass using PayPal.
3. The server captures and verifies the PayPal payment. Only then is the event marked `paid`.
4. The event creator publishes the paid event. Only `published` events accept registrations.
5. Students can register and participate. The event creator and active workspace members cannot register as participants.

Student Premium and Institution/Organisation subscriptions remain separate from Event Pass payments. They do not waive the per-event payment requirement.

## Apply the update

From the project root, with the correct Supabase project linked:

```powershell
npx.cmd supabase db push
npx.cmd supabase functions deploy paypal-create-order
npx.cmd supabase functions deploy paypal-capture-order
npx.cmd supabase functions deploy publish-event
npx.cmd supabase functions deploy form-event-teams
```

Keep your existing `supabase/functions.env` and PayPal Sandbox IDs private. If you extract this ZIP into a new folder, copy your own local environment file into that folder; it is intentionally not included in the ZIP.

## Important testing boundary

The repository tests can check local pricing, imports, optimiser, analytics and payment-verification helpers. They cannot prove that a particular Supabase project has applied this migration or that PayPal Sandbox checkout/webhooks work. Test the full checkout with Sandbox buyer credentials after deployment.
