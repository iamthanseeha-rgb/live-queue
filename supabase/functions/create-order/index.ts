// POST { pack_id }  →  { order_id, amount, currency, key_id }
// Creates a Razorpay order for a pack whose price comes from the database, and records it.
import { adminClient, corsHeaders, env, json, razorpayAuthHeader, requireUser } from '../_shared/razorpay.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);

  try {
    const user = await requireUser(req);
    if (!user) return json({ error: 'NOT_AUTHENTICATED' }, 401);

    const { pack_id } = await req.json().catch(() => ({}));
    if (typeof pack_id !== 'string') return json({ error: 'PACK_NOT_FOUND' }, 400);

    const db = adminClient();
    const { data: pack, error: packError } = await db
      .from('token_packs')
      .select('id, name, tokens, price_paise, active')
      .eq('id', pack_id)
      .maybeSingle();
    if (packError || !pack || !pack.active) return json({ error: 'PACK_NOT_FOUND' }, 400);

    const { data: admin } = await db.from('admin').select('status').eq('admin_id', user.id).maybeSingle();
    if (admin?.status === 'Block') return json({ error: 'ACCOUNT_BLOCKED' }, 403);

    const rzpRes = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { Authorization: razorpayAuthHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: pack.price_paise,
        currency: 'INR',
        receipt: `lq_${user.id.slice(0, 8)}_${Date.now()}`,
        notes: { admin_id: user.id, pack_id: pack.id, tokens: String(pack.tokens) },
      }),
    });
    const order = await rzpRes.json();
    if (!rzpRes.ok || !order?.id) {
      console.error('Razorpay order failed', rzpRes.status, order);
      return json({ error: 'ORDER_FAILED' }, 502);
    }

    const { error: insertError } = await db.from('payments').insert({
      admin_id: user.id,
      pack_id: pack.id,
      tokens_added: pack.tokens,
      amount: pack.price_paise,   // stored in paise
      order_id: order.id,
      status: 'created',
    });
    if (insertError) {
      console.error('payments insert failed', insertError);
      return json({ error: 'ORDER_FAILED' }, 500);
    }

    return json({ order_id: order.id, amount: order.amount, currency: order.currency, key_id: env('RAZORPAY_KEY_ID') });
  } catch (err) {
    console.error('create-order error', err);
    return json({ error: 'SERVER_ERROR' }, 500);
  }
});
