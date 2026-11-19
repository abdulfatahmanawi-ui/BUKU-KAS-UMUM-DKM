-- ============================================================
-- PEMBARUAN PROFIL MASJID + LOGO + KOP LAPORAN PDF
-- Untuk project Supabase Kas DKM Masjid Jami Al-Ikhlas
-- Aman: tidak mengubah atau menghapus tabel/transaksi yang ada.
-- Jalankan sekali di Supabase > SQL Editor > New Query.
-- ============================================================

create table if not exists public.mosque_profile (
  id smallint primary key default 1 check (id = 1),
  name text not null default 'Masjid Jami Al-Ikhlas',
  address text not null default 'Dusun Pokek RW 004',
  village text not null default 'Desa Kawunganten',
  district text not null default 'Kecamatan Cikaum',
  regency text not null default 'Kabupaten Subang',
  phone text not null default '',
  email text not null default '',
  description text not null default 'Informasi ini disediakan untuk membantu jamaah memantau pengelolaan kas masjid. Data transaksi dikelola oleh pengurus yang berwenang.',
  logo_url text,
  logo_path text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.mosque_profile (id, name, address, village, district, regency, description)
values (
  1, 'Masjid Jami Al-Ikhlas', 'Dusun Pokek RW 004', 'Desa Kawunganten',
  'Kecamatan Cikaum', 'Kabupaten Subang',
  'Informasi ini disediakan untuk membantu jamaah memantau pengelolaan kas masjid. Data transaksi dikelola oleh pengurus yang berwenang.'
)
on conflict (id) do nothing;

create or replace function public.set_mosque_profile_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_mosque_profile_updated_at on public.mosque_profile;
create trigger trg_mosque_profile_updated_at
before update on public.mosque_profile
for each row execute function public.set_mosque_profile_updated_at();

alter table public.mosque_profile enable row level security;

drop policy if exists dkm_public_read_mosque_profile on public.mosque_profile;
create policy dkm_public_read_mosque_profile
on public.mosque_profile for select to anon, authenticated using (true);

drop policy if exists dkm_admin_insert_mosque_profile on public.mosque_profile;
create policy dkm_admin_insert_mosque_profile
on public.mosque_profile for insert to authenticated
with check (exists (
  select 1 from public.admin_users
  where admin_users.user_id = (select auth.uid())
));

drop policy if exists dkm_admin_update_mosque_profile on public.mosque_profile;
create policy dkm_admin_update_mosque_profile
on public.mosque_profile for update to authenticated
using (exists (
  select 1 from public.admin_users
  where admin_users.user_id = (select auth.uid())
))
with check (exists (
  select 1 from public.admin_users
  where admin_users.user_id = (select auth.uid())
));

grant select on public.mosque_profile to anon, authenticated;
grant insert, update on public.mosque_profile to authenticated;

-- Bucket publik untuk gambar identitas masjid. Maksimal 2 MB.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('mosque-assets', 'mosque-assets', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
set public = true,
    file_size_limit = 2097152,
    allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp'];

drop policy if exists dkm_public_read_mosque_assets on storage.objects;
create policy dkm_public_read_mosque_assets
on storage.objects for select to anon, authenticated
using (bucket_id = 'mosque-assets');

drop policy if exists dkm_admin_upload_mosque_assets on storage.objects;
create policy dkm_admin_upload_mosque_assets
on storage.objects for insert to authenticated
with check (
  bucket_id = 'mosque-assets'
  and exists (select 1 from public.admin_users where admin_users.user_id = (select auth.uid()))
);

drop policy if exists dkm_admin_update_mosque_assets on storage.objects;
create policy dkm_admin_update_mosque_assets
on storage.objects for update to authenticated
using (
  bucket_id = 'mosque-assets'
  and exists (select 1 from public.admin_users where admin_users.user_id = (select auth.uid()))
)
with check (
  bucket_id = 'mosque-assets'
  and exists (select 1 from public.admin_users where admin_users.user_id = (select auth.uid()))
);

drop policy if exists dkm_admin_delete_mosque_assets on storage.objects;
create policy dkm_admin_delete_mosque_assets
on storage.objects for delete to authenticated
using (
  bucket_id = 'mosque-assets'
  and exists (select 1 from public.admin_users where admin_users.user_id = (select auth.uid()))
);

-- SELESAI. Transaksi, tabel transactions, dan akun admin tidak diubah.
