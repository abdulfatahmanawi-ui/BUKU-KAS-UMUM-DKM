-- Skema untuk instalasi baru yang menggunakan struktur database
-- yang sama dengan project Supabase Masjid Jami Al-Ikhlas.
create extension if not exists pgcrypto;

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  description text not null,
  category text not null,
  fund text not null default 'DKM' check (fund in ('DKM','PEMBANGUNAN','PHBI')),
  kind text not null check (kind in ('in', 'out')),
  amount bigint not null check (amount > 0),
  created_at timestamptz not null default now()
);

create index if not exists transactions_date_idx
  on public.transactions (date desc);

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Nama penyetor/penerima disimpan terpisah agar tidak ikut terbaca oleh pengunjung publik.
create table if not exists public.transaction_receipt_details (
  transaction_id uuid primary key references public.transactions(id) on delete cascade,
  party_name text not null default '' check (char_length(party_name) <= 160),
  created_at timestamptz not null default now()
);

alter table public.transactions enable row level security;
alter table public.admin_users enable row level security;
alter table public.transaction_receipt_details enable row level security;

create policy "dkm_public_read_transactions"
on public.transactions for select to anon, authenticated using (true);

create policy "dkm_admin_insert_transactions"
on public.transactions for insert to authenticated
with check (exists (select 1 from public.admin_users where user_id = (select auth.uid())));

create policy "dkm_admin_update_transactions"
on public.transactions for update to authenticated
using (exists (select 1 from public.admin_users where user_id = (select auth.uid())))
with check (exists (select 1 from public.admin_users where user_id = (select auth.uid())));

create policy "dkm_admin_delete_transactions"
on public.transactions for delete to authenticated
using (exists (select 1 from public.admin_users where user_id = (select auth.uid())));

create policy "dkm_admin_read_own_record"
on public.admin_users for select to authenticated
using (user_id = (select auth.uid()));

create policy "dkm_admin_read_receipt_details"
on public.transaction_receipt_details for select to authenticated
using (exists (select 1 from public.admin_users where user_id = (select auth.uid())));

create policy "dkm_admin_insert_receipt_details"
on public.transaction_receipt_details for insert to authenticated
with check (exists (select 1 from public.admin_users where user_id = (select auth.uid())));

create policy "dkm_admin_update_receipt_details"
on public.transaction_receipt_details for update to authenticated
using (exists (select 1 from public.admin_users where user_id = (select auth.uid())))
with check (exists (select 1 from public.admin_users where user_id = (select auth.uid())));

create policy "dkm_admin_delete_receipt_details"
on public.transaction_receipt_details for delete to authenticated
using (exists (select 1 from public.admin_users where user_id = (select auth.uid())));

revoke all on public.transaction_receipt_details from anon;
grant select, insert, update, delete on public.transaction_receipt_details to authenticated;
grant select on public.transactions to anon, authenticated;
grant insert, update, delete on public.transactions to authenticated;
grant select on public.admin_users to authenticated;
