-- ════════════════════════════════════════════════════════════════════════
-- LiveQueue · STEP C — closes the "undo the whole day" loophole.
-- Applied to production on 12 Sep 2026.
-- Verified live: a day of 20 calls wound back to token 0 in the evening refunded
-- 0 of 20, while an immediate mis-tap undo still refunds 1.
-- ════════════════════════════════════════════════════════════════════════

-- Undo refunds only within a short window after the call, and at most 3 in a row.
-- Winding the day's number back to 0 in the evening refunds nothing.
alter table public.queue_details add column if not exists last_call_at timestamptz;

create or replace function public.call_next(p_queue_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); q public.queue_details; bal integer;
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if exists (select 1 from public.admin where admin_id = uid and status = 'Block') then raise exception 'ACCOUNT_BLOCKED'; end if;

  update public.usage set remaining_tokens = remaining_tokens - 1, updated_at = now()
   where admin_id = uid and remaining_tokens > 0 returning remaining_tokens into bal;
  if not found then raise exception 'QUOTA_EXHAUSTED'; end if;

  update public.queue_details
     set queue_position = queue_position + 1,
         refundable_calls = case
           when last_call_at is null or last_call_at < now() - interval '2 minutes' then 1
           else least(refundable_calls + 1, 3)
         end,
         last_call_at = now(),
         updated_at = now()
   where queue_id = p_queue_id and admin_id = uid returning * into q;
  if not found then raise exception 'QUEUE_NOT_FOUND'; end if;

  return jsonb_build_object('queue', to_jsonb(q), 'remaining_tokens', bal);
end; $$;

create or replace function public.call_previous(p_queue_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); q public.queue_details; bal integer; refunded boolean := false;
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if exists (select 1 from public.admin where admin_id = uid and status = 'Block') then raise exception 'ACCOUNT_BLOCKED'; end if;

  select * into q from public.queue_details where queue_id = p_queue_id and admin_id = uid for update;
  if not found then raise exception 'QUEUE_NOT_FOUND'; end if;

  if q.queue_position > 0 then
    -- a call is refundable only if it was just made (mis-tap), never hours later
    if q.refundable_calls > 0 and q.last_call_at is not null and q.last_call_at > now() - interval '2 minutes' then
      update public.usage set remaining_tokens = remaining_tokens + 1, updated_at = now() where admin_id = uid;
      refunded := true;
    end if;
    update public.queue_details
       set queue_position = q.queue_position - 1,
           refundable_calls = case when refunded then greatest(q.refundable_calls - 1, 0) else 0 end,
           updated_at = now()
     where queue_id = q.queue_id returning * into q;
  end if;

  select remaining_tokens into bal from public.usage where admin_id = uid;
  return jsonb_build_object('queue', to_jsonb(q), 'remaining_tokens', bal, 'refunded', refunded);
end; $$;
