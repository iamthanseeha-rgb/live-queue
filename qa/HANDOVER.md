# LiveQueue – fixes, what's live, and what you need to do

Date: 12 Sep 2026 · Companion to the QA report (`qa/LiveQueue-QA-Report.html`)

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

### 5. Tell me when step 4 passes – then I run Step B

`supabase/migrations/20260912_step_b_lock_down.sql` is the one that actually **takes away**
the browser's power:

- hosts can no longer write their own balance, status or token number (only name and link);
- anonymous visitors can no longer list every clinic on the platform;
- name/link limits are enforced by the database as well as the form.

It must run **after** the new website is live, because the current one still writes
directly to those tables. I can apply it for you in one step.

### 6. Two Supabase settings to switch on yourself

Authentication → Sign In / Providers → Email:
- Minimum password length: **8** (the new form already asks for 8)
- **Leaked password protection**: on

## Still open

- **Duplicate desks.** 3 of your 4 accounts have 2 desk rows each, from the old
  double-creation bug (`dr-adam` + `counter-2`, `dradam` + `e2`, `desk-6250` + `desk-6102`).
  New accounts can't do this any more. I did not delete anything, because in each pair the
  *second* desk has the higher token count, so I can't tell which one you actually use.
  Tell me which to keep and I'll clean them up.
- **Razorpay key**: check whether the live site currently uses a test key.
- **iPhone sound and Android TV**: needs a real device check.

## How this was tested

- 39 database tests against a copy of your exact schema on a local Postgres
  (concurrency, refunds, permissions per role, payment idempotency) – all pass.
- 38 browser tests (Playwright) against the new frontend wired to a simulated backend,
  covering every bug in the QA report – all pass.
