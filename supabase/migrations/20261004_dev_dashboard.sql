-- Developer dashboard — read only.
--
-- Nothing here touches the live token path (call_next, call_previous,
-- get_public_queue, ensure_my_desk are all untouched), so a clinic pressing
-- "Next" during an OP cannot be affected by any of it.
--
-- Two objects:
--   app_admins  — who may see the dashboard. RLS is on with NO policies, so the
--                 table is invisible to every client; only SECURITY DEFINER code
--                 below can read it.
--   dev_stats() — one read-only function. It refuses anyone whose signed-in
--                 email is not in app_admins, so the gate lives in the database,
--                 not in React where anyone could bypass it.

create table if not exists public.app_admins (
  email      text primary key,
  note       text,
  created_at timestamptz not null default now()
);

alter table public.app_admins enable row level security;
-- deliberately no policies

insert into public.app_admins (email, note)
values ('iamthanseeha@gmail.com', 'owner')
on conflict (email) do nothing;


create or replace function public.dev_stats()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  caller text := lower(coalesce(nullif(auth.jwt() ->> 'email', ''), ''));
  out    jsonb;
begin
  if caller = '' or not exists (
       select 1 from public.app_admins a where lower(a.email) = caller
     ) then
    raise exception 'Not authorised.' using errcode = '42501';
  end if;

  with base as (
    select
      u.id,
      u.email,
      u.created_at                                   as signed_up,
      u.email_confirmed_at,
      u.last_sign_in_at,
      q.queue_title,
      q.slug,
      q.queue_position,
      q.last_call_at,
      us.remaining_tokens,
      coalesce((
        select sum(p.tokens_added) from public.payments p
        where p.admin_id = u.id and p.status in ('paid', 'success')
      ), 0)                                          as tokens_bought,
      coalesce((
        select sum(p.amount) from public.payments p
        where p.admin_id = u.id and p.status in ('paid', 'success')
      ), 0)                                          as rupees_paid
    from auth.users u
    left join public.queue_details q on q.admin_id = u.id
    left join public.usage        us on us.admin_id = u.id
  ),
  tagged as (
    select
      b.*,
      -- every desk starts with 1,500 free calls; anything bought adds to that
      greatest(0, 1500 + b.tokens_bought - coalesce(b.remaining_tokens, 1500)) as calls_used,
      case
        when b.email_confirmed_at is null                          then 'unconfirmed'
        when b.last_call_at is null                                then 'never_called'
        when b.last_call_at > now() - interval  '7 days'           then 'active'
        when b.last_call_at > now() - interval '30 days'           then 'slipping'
        else                                                            'dormant'
      end as state
    from base b
  )
  select jsonb_build_object(
    'generated_at', now(),
    'totals', (
      select jsonb_build_object(
        'signups',        count(*),
        'unconfirmed',    count(*) filter (where state = 'unconfirmed'),
        'never_called',   count(*) filter (where state = 'never_called'),
        'active',         count(*) filter (where state = 'active'),
        'slipping',       count(*) filter (where state = 'slipping'),
        'dormant',        count(*) filter (where state = 'dormant'),
        'desks',          count(*) filter (where slug is not null),
        'unnamed_desks',  count(*) filter (where slug like 'desk-%'),
        'paying',         count(*) filter (where rupees_paid > 0),
        'calls_total',    coalesce(sum(calls_used), 0),
        'rupees_total',   coalesce(sum(rupees_paid), 0),
        'signups_7d',     count(*) filter (where signed_up > now() - interval  '7 days'),
        'signups_30d',    count(*) filter (where signed_up > now() - interval '30 days')
      ) from tagged
    ),
    'clinics', (
      select coalesce(jsonb_agg(row_to_json(t) order by
               case t.state when 'active' then 1 when 'slipping' then 2
                            when 'dormant' then 3 when 'never_called' then 4 else 5 end,
               t.last_call_at desc nulls last), '[]'::jsonb)
      from (
        select email, signed_up, (email_confirmed_at is not null) as confirmed,
               last_sign_in_at, queue_title, slug, queue_position, last_call_at,
               remaining_tokens, calls_used, rupees_paid, state
        from tagged
      ) t
    )
  ) into out;

  return out;
end;
$$;

revoke all on function public.dev_stats() from public, anon;
grant execute on function public.dev_stats() to authenticated;

comment on function public.dev_stats() is
  'Read-only owner dashboard. Refuses callers whose email is not in app_admins.';
