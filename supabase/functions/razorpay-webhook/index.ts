// Razorpay → this URL on "payment.captured" and "order.paid".
// Deploy with JWT verification OFF (Razorpay can't send a Supabase login);
// authenticity comes from the X-Razorpay-Signature HMAC instead.
import { adminClient, env, hmacSha256Hex, safeEqual } from '../_shared/razorpay.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });

  const raw = await req.text(); // must be the exact raw body for the signature
  const signature = req.headers.get('X-Razorpay-Signature') ?? '';
  const expected = await hmacSha256Hex(env('RAZORPAY_WEBHOOK_SECRET'), raw);
  if (!safeEqual(expected, signature)) return new Response('bad signature', { status: 400 });

  let event: any;
  try {
    event = JSON.parse(raw);
  } catch {
    return new Response('bad json', { status: 400 });
  }

  const payment = event?.payload?.payment?.entity;
  if (!['payment.captured', 'order.paid'].includes(event?.event) || !payment?.order_id) {
    return new Response('ignored', { status: 200 });
  }

  const { data, error } = await adminClient().rpc('credit_payment', {
    p_order_id: payment.order_id,
    p_payment_id: payment.id,
    p_amount_paise: payment.amount,
  });

  if (error) {
    // ORDER_NOT_FOUND = a payment for something other than LiveQueue tokens – acknowledge it.
    if (String(error.message).includes('ORDER_NOT_FOUND')) return new Response('unknown order', { status: 200 });
    if (String(error.message).includes('AMOUNT_MISMATCH')) {
      console.error('AMOUNT_MISMATCH – not credited, check manually', payment.order_id, payment.amount);
      return new Response('amount mismatch', { status: 200 }); // retrying would never succeed
    }
    console.error('webhook credit failed', error);
    return new Response('retry', { status: 500 }); // Razorpay retries on non-2xx
  }

  console.log('webhook credited', payment.order_id, data?.credited ? 'new' : 'already paid');
  return new Response('ok', { status: 200 });
});
