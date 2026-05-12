-- Run this once in the Supabase SQL Editor (Dashboard → SQL Editor → New query).
--
-- It creates a single key/value table that mirrors the localStorage keys the
-- app uses:
--   key = 'padel_ideas'          value = JSON array of {text, id}
--   key = 'w_YYYY-MM-DD'         value = JSON object of week slot ideas (mon_0, tue_1, ...)
--   key = 'sc_YYYY-MM-DD_N'      value = script text for that slot
--
-- The anon (public) key is used directly from the browser, so RLS is enabled
-- with a wide-open policy: this is intentional — it's a private 2-person tool
-- and the table holds no sensitive data. If you ever need to lock it down,
-- replace the policy below.

create table if not exists content_plan (
  key text primary key,
  value text not null,
  updated_at timestamptz default now()
);

alter table content_plan enable row level security;

drop policy if exists "public read write" on content_plan;
create policy "public read write" on content_plan
  for all using (true) with check (true);
