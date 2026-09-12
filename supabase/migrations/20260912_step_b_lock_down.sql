-- ════════════════════════════════════════════════════════════════════════
-- LiveQueue · STEP B — run ONLY after the new website is live on Vercel.
-- Removes the browser's ability to write balances / status / token numbers,
-- and stops anonymous visitors from listing every clinic.
-- ════════════════════════════════════════════════════════════════════════

-- 1. Replace whatever policies exist today with a minimal, explicit set.
do $$
declare r record;
begin
  for r in
    select policyname, tablename from pg_policies
     where schemaname = 'public' and tablename in ('admin', 'usage', 'queue_details')
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

alter table public.admin         enable row level security;
alter table public.usage         enable row level security;
alter table public.queue_details enable row level security;

create policy admin_read_own on public.admin
  for select to authenticated using (admin_id = auth.uid());

create policy usage_read_own on public.usage
  for select to authenticated using (admin_id = auth.uid());

create policy queue_read_own on public.queue_details
  for select to authenticated using (admin_id = auth.uid());

create policy queue_edit_own on public.queue_details
  for update to authenticated
  using (admin_id = auth.uid())
  with check (admin_id = auth.uid());

-- 2. Balances, status and token numbers change only through the server functions.
revoke insert, update, delete, truncate on public.admin, public.usage from anon, authenticated;
revoke insert, update, delete, truncate on public.queue_details from anon, authenticated;
grant update (queue_title, queue_subtitle, slug) on public.queue_details to authenticated;

-- 3. Anonymous visitors use get_public_queue(slug) instead of reading the table.
revoke select on public.admin, public.usage, public.queue_details from anon;

-- 4. Validate what hosts can type (existing rows already comply – checked 12 Sep 2026).
alter table public.queue_details
  add constraint queue_title_length check (char_length(btrim(queue_title)) between 1 and 60),
  add constraint queue_subtitle_length check (queue_subtitle is null or char_length(queue_subtitle) <= 80),
  add constraint queue_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 40);
