-- Migrasi kategori transaksi terpisah untuk Kas DKM
-- Jalankan sekali melalui Supabase Dashboard > SQL Editor.

create table if not exists public.transaction_categories (
  id uuid primary key default gen_random_uuid(),
  category_type text not null check (category_type in ('in', 'out')),
  name text not null check (char_length(trim(name)) between 1 and 80),
  created_at timestamptz not null default now(),
  unique (category_type, name)
);

create index if not exists transaction_categories_type_idx
  on public.transaction_categories (category_type, name);

insert into public.transaction_categories (category_type, name)
values
  ('in', 'Infak'),
  ('in', 'Sedekah'),
  ('in', 'Donasi Jamaah'),
  ('in', 'Wakaf'),
  ('in', 'Sumbangan'),
  ('in', 'Lainnya'),
  ('out', 'Operasional'),
  ('out', 'Listrik dan Air'),
  ('out', 'Kebersihan'),
  ('out', 'Pembangunan'),
  ('out', 'Kegiatan Masjid'),
  ('out', 'Perlengkapan'),
  ('out', 'Lainnya')
on conflict (category_type, name) do nothing;

alter table public.transaction_categories enable row level security;

drop policy if exists "categories_public_read" on public.transaction_categories;
create policy "categories_public_read"
on public.transaction_categories for select to anon, authenticated
using (true);

drop policy if exists "categories_admin_insert" on public.transaction_categories;
create policy "categories_admin_insert"
on public.transaction_categories for insert to authenticated
with check (
  exists (
    select 1 from public.admin_users
    where user_id = (select auth.uid())
  )
);

drop policy if exists "categories_admin_delete" on public.transaction_categories;
create policy "categories_admin_delete"
on public.transaction_categories for delete to authenticated
using (
  exists (
    select 1 from public.admin_users
    where user_id = (select auth.uid())
  )
);

grant select on public.transaction_categories to anon, authenticated;
grant insert, delete on public.transaction_categories to authenticated;
