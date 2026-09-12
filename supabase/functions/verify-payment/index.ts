// POST { razorpay_order_id, razorpay_payment_id, razorpay_signature }
// Called by the browser right after checkout. Verifies the signature with the secret key,
// double-checks the payment with Razorpay, then credits the pack exactly once.
// (The webhook does the same thing, so a closed browser tab never loses a payment.)
import {
  adminClient, corsHeaders, env, hmacSha256Hex, json, razorpayAuthHeader, requireUser, safeEqual,
} from '../_shared/razorpay.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405);

  try {
    const user = await requireUser(req);
    if (!user) return json({ ok: false, error: 'NOT_AUTHENTICATED' }, 401);

    const body = await req.json().catch(() => ({}));
    const orderId = String(body.razorpay_order_id ?? '');
    const paymentId = String(body.razorpay_payment_id ?? '');
    const signature = String(body.razorpay_signature ?? '');
    if (!orderId || !paymentId || !signature) return json({ ok: false, error: 'BAD_REQUEST' }, 400);

    // 1. Signature = HMAC_SHA256(order_id + "|" + payment_id, key_secret)
    const expected = await hmacSha256Hex(env('RAZORPAY_KEY_SECRET'), `${orderId}|${paymentId}`);
    if (!safeEqual(expected, signature)) return json({ ok: false, error: 'BAD_SIGNATURE' }, 400);

    // 2. The order must belong to this host
    const db = adminClient();
    const { data: row } = await db
      .from('payments')
      .select('admin_id, amount')
      .eq('order_id', orderId)
      .maybeSingle();
    if (!row || row.admin_id !== user.id) return json({ ok: false, error: 'ORDER_NOT_FOUND' }, 404);

    // 3. Ask Razorpay what actually happened to the payment
    const payRes = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`, {
      headers: { Authorization: razorpayAuthHeader() },
    });
    const payment = await payRes.json();
    if (!payRes.ok || payment.order_id !== orderId || !['captured', 'authorized'].includes(payment.status)) {
      console.error('payment not usable', payment?.status, payment?.order_id);
      return json({ ok: false, error: 'PAYMENT_NOT_CAPTURED' }, 409);
    }

    // 4. Credit (idempotent – safe if the webhook got there first)
    const { data: credit, error } = await db.rpc('credit_payment', {
      p_order_id: orderId,
      p_payment_id: paymentId,
      p_amount_paise: payment.amount,
    });
    if (error) {
      console.error('credit_payment failed', error);
      return json({ ok: false, error: 'CREDIT_FAILED' }, 500);
    }

    return json({ ok: true, credited: credit.credited, remaining_tokens: credit.remaining_tokens });
  } catch (err) {
    console.error('verify-payment error', err);
    return json({ ok: false, error: 'SERVER_ERROR' }, 500);
  }
});
