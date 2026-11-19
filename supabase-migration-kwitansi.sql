-- ============================================================
-- MIGRASI FITUR KWITANSI KAS DKM MASJID JAMI AL-IKHLAS
-- Jalankan sekali di Supabase > SQL Editor > New Query.
-- Aman: tidak menghapus atau mengubah transaksi yang sudah ada.
-- ============================================================

-- Data nama penyetor/penerima disimpan pada tabel terpisah.
-- Dengan demikian nama pihak kwitansi tidak ikut terbaca di halaman publik.
create table if not exists public.transaction_receipt_details (
  transaction_id uuid primary key references public.transactions(id) on delete cascade,
  party_name text not null default '' check (char_length(party_name) <= 160),
  created_at timestamptz not null default now()
);

alter table public.transaction_receipt_details enable row level security;

drop policy if exists dkm_admin_read_receipt_details on public.transaction_receipt_details;
create policy dkm_admin_read_receipt_details
on public.transaction_receipt_details for select to authenticated
using (exists (select 1 from public.admin_users where user_id = (select auth.uid())));

drop policy if exists dkm_admin_insert_receipt_details on public.transaction_receipt_details;
create policy dkm_admin_insert_receipt_details
on public.transaction_receipt_details for insert to authenticated
with check (exists (select 1 from public.admin_users where user_id = (select auth.uid())));

drop policy if exists dkm_admin_update_receipt_details on public.transaction_receipt_details;
create policy dkm_admin_update_receipt_details
on public.transaction_receipt_details for update to authenticated
using (exists (select 1 from public.admin_users where user_id = (select auth.uid())))
with check (exists (select 1 from public.admin_users where user_id = (select auth.uid())));

drop policy if exists dkm_admin_delete_receipt_details on public.transaction_receipt_details;
create policy dkm_admin_delete_receipt_details
on public.transaction_receipt_details for delete to authenticated
using (exists (select 1 from public.admin_users where user_id = (select auth.uid())));

revoke all on table public.transaction_receipt_details from anon;
grant select, insert, update, delete on table public.transaction_receipt_details to authenticated;

-- SELESAI. Tidak ada baris pada public.transactions yang dihapus atau diubah.
