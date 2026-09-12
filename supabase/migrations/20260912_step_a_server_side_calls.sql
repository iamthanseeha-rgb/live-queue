-- ════════════════════════════════════════════════════════════════════════
-- LiveQueue · STEP A — safe to run while the CURRENT website is still live.
-- Adds server-side calling + payment functions. Removes nothing the old site uses.
-- (Written against the live schema: admin/usage/queue_details/payments.)
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. Price list on the server (the browser can no longer decide the price) ──
create table if not exists public.token_packs (
  id          text primary key,
  name        text not null,
  tokens      integer not null check (tokens > 0),
  price_paise integer not null check (price_paise >= 100),
  tag         text,
  sort        integer not null default 0,
  active      boolean not null default true
);

insert into public.token_packs (id, name, tokens, price_paise, tag, sort) values
  ('pack_500',  'Starter',  500,  9900,  null,         1),
  ('pack_1500', 'Standard', 1500, 24900, 'Popular',    2),
  ('pack_5000', 'Pro',      5000, 69900, 'Best Value', 3)
on conflict (id) do nothing;

-- ── 2. Payments ledger: reuse the existing table, make it an order ledger ──
alter table public.payments add column if not exists pack_id text;
alter table public.payments add column if not exists paid_at timestamptz;
alter table public.payments alter column payment_id drop not null;
alter table public.payments alter column status set default 'created';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'payments_order_id_key') then
    alter table public.payments add constraint payments_order_id_key unique (order_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'payments_payment_id_key') then
    alter table public.payments add constraint payments_payment_id_key unique (payment_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'payments_status_check') then
    alter table public.payments add constraint payments_status_check
      check (status in ('created', 'paid', 'failed', 'success'));
  end if;
end $$;
create index if not exists payments_admin_id_idx on public.payments(admin_id);

-- ── 3. queue_details: unguessable realtime key + refundable-call counter ──
alter table public.queue_details add column if not exists public_key uuid not null default gen_random_uuid();
create unique index if not exists queue_details_public_key_key on public.queue_details(public_key);
-- how many recent calls may still be undone with "Previous" for a refund
alter table public.queue_details add column if not exists refundable_calls integer not null default 0;

-- ── 4. Old links keep working after a host renames their desk ──
create table if not exists public.slug_history (
  slug       text primary key,
  queue_id   bigint not null references public.queue_details(queue_id) on delete cascade,
  changed_at timestamptz not null default now()
);
alter table public.slug_history enable row level security;   -- no policies = nobody but the functions

-- ── 5. Create a host's rows once, race-safe (replaces the browser inserts) ──
create or replace function public.ensure_my_desk()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  q   public.queue_details;
  bal integer;
  st  text;
  new_slug text;
  tries int := 0;
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;

  -- two tabs or devices signing in at the same time must not create two desks
  perform pg_advisory_xact_lock(hashtextextended('livequeue:desk:' || uid::text, 0));

  insert into public.admin (admin_id, email, name)
  select u.id, u.email, coalesce(u.raw_user_meta_data ->> 'name', split_part(u.email, '@', 1))
    from auth.users u where u.id = uid
  on conflict (admin_id) do nothing;

  insert into public.usage (admin_id, remaining_tokens) values (uid, 1500)
  on conflict (admin_id) do nothing;

  select * into q from public.queue_details where admin_id = uid order by queue_id limit 1;

  if not found then
    loop
      new_slug := 'desk-' || substr(md5(gen_random_uuid()::text), 1, 6);
      begin
        insert into public.queue_details (admin_id, queue_title, queue_subtitle, slug, queue_position)
        values (uid, 'Counter 1', 'Consultation Desk', new_slug, 0)
        returning * into q;
        exit;
      exception when unique_violation then
        tries := tries + 1;
        if tries >= 8 then raise; end if;
      end;
    end loop;
  end if;

  select remaining_tokens into bal from public.usage where admin_id = uid;
  select status into st from public.admin where admin_id = uid;

  return jsonb_build_object('queue', to_jsonb(q), 'remaining_tokens', bal, 'status', st);
end;
$$;

-- ── 6. Calling: charge and advance in ONE transaction ──
create or replace function public.call_next(p_queue_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  q   public.queue_details;
  bal integer;
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if exists (select 1 from public.admin where admin_id = uid and status = 'Block') then
    raise exception 'ACCOUNT_BLOCKED';
  end if;

  update public.usage
     set remaining_tokens = remaining_tokens - 1, updated_at = now()
   where admin_id = uid and remaining_tokens > 0
  returning remaining_tokens into bal;
  if not found then raise exception 'QUOTA_EXHAUSTED'; end if;

  update public.queue_details
     set queue_position = queue_position + 1,
         refundable_calls = refundable_calls + 1,
         updated_at = now()
   where queue_id = p_queue_id and admin_id = uid
  returning * into q;
  if not found then raise exception 'QUEUE_NOT_FOUND'; end if;  -- rolls the charge back too

  return jsonb_build_object('queue', to_jsonb(q), 'remaining_tokens', bal);
end;
$$;

-- Previous = undo one call: number goes back and the call is refunded, but only for
-- calls that were actually paid for (refundable_calls), so no one can mint free calls.
create or replace function public.call_previous(p_queue_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  q   public.queue_details;
  bal integer;
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if exists (select 1 from public.admin where admin_id = uid and status = 'Block') then
    raise exception 'ACCOUNT_BLOCKED';
  end if;

  select * into q from public.queue_details
   where queue_id = p_queue_id and admin_id = uid for update;
  if not found then raise exception 'QUEUE_NOT_FOUND'; end if;

  if q.queue_position > 0 then
    if q.refundable_calls > 0 then
      update public.usage set remaining_tokens = remaining_tokens + 1, updated_at = now() where admin_id = uid;
    end if;
    update public.queue_details
       set queue_position = q.queue_position - 1,
           refundable_calls = greatest(q.refundable_calls - 1, 0),
           updated_at = now()
     where queue_id = q.queue_id
    returning * into q;
  end if;

  select remaining_tokens into bal from public.usage where admin_id = uid;
  return jsonb_build_object('queue', to_jsonb(q), 'remaining_tokens', bal);
end;
$$;

create or replace function public.reset_queue(p_queue_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  q   public.queue_details;
  bal integer;
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  update public.queue_details
     set queue_position = 0, refundable_calls = 0, updated_at = now()
   where queue_id = p_queue_id and admin_id = uid
  returning * into q;
  if not found then raise exception 'QUEUE_NOT_FOUND'; end if;
  select remaining_tokens into bal from public.usage where admin_id = uid;
  return jsonb_build_object('queue', to_jsonb(q), 'remaining_tokens', bal);
end;
$$;

-- ── 7. Public display reads ONE desk by its link (no table-wide access) ──
create or replace function public.get_public_queue(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare r record;
begin
  select queue_id, public_key, queue_title, queue_subtitle, slug, queue_position, updated_at
    into r from public.queue_details where slug = lower(p_slug);

  if not found then
    select qd.queue_id, qd.public_key, qd.queue_title, qd.queue_subtitle, qd.slug, qd.queue_position, qd.updated_at
      into r
      from public.slug_history h join public.queue_details qd on qd.queue_id = h.queue_id
     where h.slug = lower(p_slug);
    if not found then return null; end if;
  end if;

  return to_jsonb(r);
end;
$$;

-- ── 8. Remember old slugs when a host renames the desk ──
create or replace function public.track_slug_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.slug is distinct from old.slug then
    delete from public.slug_history where slug = new.slug;
    insert into public.slug_history (slug, queue_id) values (old.slug, old.queue_id)
      on conflict (slug) do update set queue_id = excluded.queue_id, changed_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists queue_details_track_slug on public.queue_details;
create trigger queue_details_track_slug
  before update of slug on public.queue_details
  for each row execute function public.track_slug_change();

-- ── 9. Push changes to TVs, phones and the host's other devices ──
create or replace function public.broadcast_queue_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- a realtime hiccup must never block calling the next patient
  begin
    perform realtime.send(
      jsonb_build_object(
        'queue_id', new.queue_id,
        'queue_title', new.queue_title,
        'queue_subtitle', new.queue_subtitle,
        'slug', new.slug,
        'queue_position', new.queue_position,
        'updated_at', new.updated_at
      ),
      'queue_update',
      'queue:' || new.public_key::text,
      false   -- public channel: only people who have the link know the key
    );
  exception when others then
    raise warning 'broadcast_queue_change failed: %', sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists queue_details_broadcast on public.queue_details;
create trigger queue_details_broadcast
  after update on public.queue_details
  for each row execute function public.broadcast_queue_change();

-- ── 10. Crediting a payment — only the Edge Functions (service key) may call this ──
create or replace function public.credit_payment(p_order_id text, p_payment_id text, p_amount_paise integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  p   public.payments;
  bal integer;
begin
  select * into p from public.payments where order_id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if p.amount <> p_amount_paise then raise exception 'AMOUNT_MISMATCH'; end if;

  if p.status = 'paid' then
    select remaining_tokens into bal from public.usage where admin_id = p.admin_id;
    return jsonb_build_object('credited', false, 'already_paid', true, 'remaining_tokens', bal);
  end if;

  update public.payments
     set status = 'paid', payment_id = p_payment_id, paid_at = now()
   where id = p.id;

  update public.usage
     set remaining_tokens = remaining_tokens + p.tokens_added, updated_at = now()
   where admin_id = p.admin_id
  returning remaining_tokens into bal;

  return jsonb_build_object('credited', true, 'remaining_tokens', bal, 'tokens', p.tokens_added);
end;
$$;

-- ── 11. Who may call what ──
revoke all on function public.credit_payment(text, text, integer) from public, anon, authenticated;
grant execute on function public.credit_payment(text, text, integer) to service_role;

revoke all on function public.ensure_my_desk() from public, anon;
revoke all on function public.call_next(bigint) from public, anon;
revoke all on function public.call_previous(bigint) from public, anon;
revoke all on function public.reset_queue(bigint) from public, anon;
grant execute on function public.ensure_my_desk() to authenticated;
grant execute on function public.call_next(bigint) to authenticated;
grant execute on function public.call_previous(bigint) to authenticated;
grant execute on function public.reset_queue(bigint) to authenticated;
grant execute on function public.get_public_queue(text) to anon, authenticated;

revoke all on function public.track_slug_change() from public, anon, authenticated;
revoke all on function public.broadcast_queue_change() from public, anon, authenticated;

alter table public.token_packs enable row level security;
drop policy if exists token_packs_public_read on public.token_packs;
create policy token_packs_public_read on public.token_packs
  for select to anon, authenticated using (active);
revoke insert, update, delete on public.token_packs from anon, authenticated;

-- payments: hosts may read their own (policy already exists), never write
revoke insert, update, delete on public.payments from anon, authenticated;
revoke all on public.slug_history from anon, authenticated;

-- ── 12. Retire the old token trigger: call_next() now charges inside its own
-- transaction, so leaving this in place would charge twice per call.
drop trigger if exists tr_decrement_usage on public.queue_details;
-- (function handle_queue_token_decrement() is kept, unused, in case you want to inspect it)
