# LiveQueue – fixes, what's live, and what you need to do

Date: 12 Sep 2026 · Companion to the QA report (`qa/LiveQueue-QA-Report.html`)

## Status

- **Step A applied** (server-side calling + payment functions).
- **New frontend deployed** to livequeue.co.in (commit `d65b6ef`).
- **Step B applied** – the browser can no longer write balances, account status or
  token numbers, and anonymous visitors can no longer list every clinic. Verified live:
  balance write blocked · token-number write blocked · name/link still editable ·
  empty name rejected · anon cannot list clinics · public display lookup works.
- **Database emptied** at your request (0 users). A fresh sign-up was smoke-tested end
  to end and then removed: admin row + 1,500 calls + desk created correctly.
- **Step C applied** – "Previous" refunds a call only within 2 minutes of making it, and
  at most 3 in a row. Winding the day's number back to 0 in the evening refunds nothing
  (verified live: 0 of 20 recovered), so nobody can recycle the same calls the next day.
- Dead leftovers dropped: `handle_new_admin_signup`, `process_queue_increment`,
  `handle_queue_token_decrement` (all orphaned, referencing columns that no longer exist).
  `handle_new_user` (the sign-up trigger) now has a pinned `search_path` and is off the API.

**Left to do: the Razorpay secrets (step 1) and webhook (step 2) below, plus the two
auth settings in step 6. Recharge will fail until those are in place.**

## Already done for you (on Supabase, live now)

Step A of the database work is applied to project `live-queue` (fieeaulnwxkunaaeecwa).
It only **adds** things, so your current website kept working the whole time.

- `ensure_my_desk()`, `call_next()`, `call_previous()`, `reset_queue()` – calling and
  charging now happen inside one database transaction, so two devices can't overwrite
  each other and the browser can't decide the balance.
- `get_public_queue(slug)` – the public screen reads one desk by its link instead of
  reading the whole table.
- `credit_payment()` – only the payment functions (service key) may credit tokens; it is
  idempotent, so the browser and the webhook can both call it without double-crediting.
- `token_packs` table – pack prices now live on the server (₹99 / ₹249 / ₹699).
- `payments` table extended into a real order ledger (`pack_id`, `paid_at`, unique
  `order_id` and `payment_id`, status `created → paid`).
- `queue_details` gained `public_key` (used as the realtime channel name, so nobody can
  guess it) and `refundable_calls` (so "Previous" can refund only calls you paid for).
- `slug_history` + trigger – if you change your link, the old one redirects instead of
  breaking printed posters.
- Realtime broadcast trigger – every change is pushed to TVs, phones and your other
  devices on channel `queue:<public_key>`.
- **Removed** the old `tr_decrement_usage` trigger: it deducted a token on top of the
  new server-side charge, which would have billed twice per call.

Three Edge Functions are deployed: `create-order`, `verify-payment` (JWT required) and
`razorpay-webhook` (JWT off, signature-checked).

## What you need to do

### 1. Add the Razorpay secrets (Supabase → Project Settings → Edge Functions → Secrets)

| Name | Value |
| --- | --- |
| `RAZORPAY_KEY_ID` | your `rzp_test_…` key id (switch to `rzp_live_…` when going live) |
| `RAZORPAY_KEY_SECRET` | the matching key secret |
| `RAZORPAY_WEBHOOK_SECRET` | any strong phrase you also paste into Razorpay in step 2 |

Don't put the secret key in Vercel or in `.env.local` – only Supabase needs it.

### 2. Add the webhook in the Razorpay dashboard (Settings → Webhooks)

- URL: `https://fieeaulnwxkunaaeecwa.supabase.co/functions/v1/razorpay-webhook`
- Secret: the same `RAZORPAY_WEBHOOK_SECRET`
- Events: `payment.captured` and `order.paid`

This is what makes a payment safe even if the customer closes the browser.

### 3. Review the code changes in VS Code and push

Changed: `src/App.jsx`, `src/index.css`, `src/main.jsx`, `src/LandingPage.jsx`,
`index.html`, `vercel.json`. New: `src/ErrorBoundary.jsx`, `src/lib/*`,
`supabase/migrations/*`, `supabase/functions/*`.

```bash
npm run dev        # check locally first
npm run build
git add -A && git commit -m "Server-side calling and payments, self-healing display, fixes from QA report"
git push           # Vercel deploys from here
```

`VITE_RAZORPAY_KEY_ID` is no longer needed by the frontend (the key now comes from
`create-order`), but leaving it in Vercel does no harm.

### 4. Test on the live site (test mode)

1. Sign in, tap **+1 Next Token** – the number moves and the balance drops by exactly 1.
2. Open the public link on your phone, lock the phone, call 3 tokens, unlock – the phone
   catches up on its own, and shows "Reconnecting…" while it can't reach the server.
3. Open the dashboard on two devices – both show the same number.
4. Recharge with a Razorpay **test** card. In the Razorpay dashboard the payment should
   show as **captured** (not "authorized"), and the tokens appear in your balance.
5. In Supabase → Table editor → `payments`, the row should say `status = paid`.

### 5. Step B – done

`supabase/migrations/20260912_step_b_lock_down.sql` was applied after your deploy went
live. Nothing left for you here.

### 6. Two Supabase settings to switch on yourself

Authentication → Sign In / Providers → Email:
- Minimum password length: **8** (the new form already asks for 8)
- **Leaked password protection**: on

## Still open

- **Razorpay**: secrets + webhook still to be added; then run one test-mode payment.
- **Duplicate desks**: gone with the data wipe, and the new sign-up path can't recreate them.
- **iPhone sound and Android TV**: needs a real device check.

## How this was tested

- 39 database tests against a copy of your exact schema on a local Postgres
  (concurrency, refunds, permissions per role, payment idempotency) – all pass.
- 38 browser tests (Playwright) against the new frontend wired to a simulated backend,
  covering every bug in the QA report – all pass.
