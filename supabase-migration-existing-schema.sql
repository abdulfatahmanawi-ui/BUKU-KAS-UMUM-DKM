-- =========================================================
-- MIGRASI AMAN UNTUK TABEL TRANSACTIONS YANG SUDAH ADA
-- Struktur saat ini: id, date, description, category, kind,
-- amount, created_at. Tidak menghapus atau membuat ulang transaksi.
-- Jalankan di Supabase SQL Editor.
-- =========================================================

-- 1. Daftar administrator.
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.transactions enable row level security;
alter table public.admin_users enable row level security;


-- 2. Pastikan nilai jenis transaksi yang digunakan aplikasi konsisten.
-- Baris lama dengan kind='in' tetap dipertahankan sebagai pemasukan.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.transactions'::regclass
      and conname = 'transactions_kind_dkm_check'
  ) then
    alter table public.transactions
      add constraint transactions_kind_dkm_check
      check (kind in ('in', 'out'));
  end if;
end $$;

-- 3. Hak baca publik.
drop policy if exists "dkm_public_read_transactions" on public.transactions;
create policy "dkm_public_read_transactions"
on public.transactions
for select
to anon, authenticated
using (true);

-- 4. Hak tulis hanya untuk user yang terdaftar sebagai administrator.
drop policy if exists "dkm_admin_insert_transactions" on public.transactions;
create policy "dkm_admin_insert_transactions"
on public.transactions
for insert
to authenticated
with check (
  exists (
    select 1 from public.admin_users
    where admin_users.user_id = (select auth.uid())
  )
);

drop policy if exists "dkm_admin_update_transactions" on public.transactions;
create policy "dkm_admin_update_transactions"
on public.transactions
for update
to authenticated
using (
  exists (
    select 1 from public.admin_users
    where admin_users.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.admin_users
    where admin_users.user_id = (select auth.uid())
  )
);

drop policy if exists "dkm_admin_delete_transactions" on public.transactions;
create policy "dkm_admin_delete_transactions"
on public.transactions
for delete
to authenticated
using (
  exists (
    select 1 from public.admin_users
    where admin_users.user_id = (select auth.uid())
  )
);

drop policy if exists "dkm_admin_read_own_record" on public.admin_users;
create policy "dkm_admin_read_own_record"
on public.admin_users
for select
to authenticated
using (user_id = (select auth.uid()));

grant select on public.transactions to anon, authenticated;
grant insert, update, delete on public.transactions to authenticated;
grant select on public.admin_users to authenticated;

-- 5. Setelah membuat akun di Authentication > Users,
-- ganti email lalu jalankan query ini untuk memberikan akses admin:
--
-- insert into public.admin_users (user_id)
-- select id from auth.users where email = 'EMAIL_ADMIN_ANDA'
-- on conflict (user_id) do nothing;

-- PENTING:
-- Jika tabel transactions sudah memiliki policy lama yang memberi akses
-- tulis kepada anon/public, periksa dan hapus policy lama tersebut.
-- Policy PostgreSQL bersifat permisif (OR), sehingga policy lama yang
-- terlalu terbuka tetap dapat memberi akses meskipun policy DKM sudah aman.
-- Jangan pernah menaruh service_role/secret key pada frontend.
